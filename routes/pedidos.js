const express = require('express');
const db = require('../db');
const router = express.Router();

// Función para obtener el próximo número de orden para una mesa
async function getNextOrdenNummesa(nummesa) {
    // Si es para llevar (mesa 0), usar formato especial
    if (nummesa === 0) {
        const [rows] = await db.query(
            "SELECT MAX(CAST(SUBSTRING_INDEX(numorden, '-', -1) AS UNSIGNED)) as last_num FROM Pedidos WHERE nummesa = 0 AND numorden LIKE 'LL-%'"
        );
        const nextNum = (rows[0].last_num || 0) + 1;
        return `LL-${nextNum}`;
    }
    
    // Para mesas normales
    const [rows] = await db.query(
        "SELECT MAX(CAST(SUBSTRING_INDEX(numorden, '-', -1) AS UNSIGNED)) as last_num FROM Pedidos WHERE nummesa = ? AND estado < 2",
        [nummesa]
    );
    
    const nextNum = (rows[0].last_num || 0) + 1;
    return `${nummesa}-${nextNum}`;
}

// OBTENER ORDEN ACTIVA PARA UNA MESA

router.get('/pedidos/mesa/:nummesa/activa', async (req, res) => {
    try {
        const { nummesa } = req.params;
        
        const [rows] = await db.query(
            `SELECT * FROM Pedidos 
             WHERE nummesa = ? AND estado IN (0, 1)
             ORDER BY fechapedido DESC LIMIT 1`,
            [nummesa]
        );
        
        if (rows.length > 0) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?`,
                [rows[0].numorden]
            );
            
            res.json({ 
                success: true, 
                ordenActiva: rows[0],
                alimentos: alimentos
            });
        } else {
            res.json({ 
                success: true, 
                ordenActiva: null
            });
        }
    } catch (error) {
        console.error('Error al obtener orden activa:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER PEDIDOS ACTIVOS POR MESA
router.get('/pedidos/mesa/:nummesa/activos', async (req, res) => {
    try {
        const { nummesa } = req.params;
        
        const [rows] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos,
                    SUM(ap.costo) as subtotal
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             WHERE p.nummesa = ? AND p.estado IN (0, 1)
             GROUP BY p.numorden
             ORDER BY p.fechapedido ASC`,
            [nummesa]
        );
        
        // Obtener alimentos por cada pedido
        for (let pedido of rows) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?
                 ORDER BY ap.id ASC`,
                [pedido.numorden]
            );
            pedido.alimentos = alimentos;
        }
        
        res.json({ success: true, pedidos: rows });
    } catch (error) {
        console.error('Error al obtener pedidos activos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER TODOS LOS PEDIDOS DE UNA MESA
router.get('/pedidos/mesa/:nummesa/todos', async (req, res) => {
    try {
        const { nummesa } = req.params;
        
        const [rows] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos,
                    SUM(ap.costo) as subtotal
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             WHERE p.nummesa = ? AND p.estado IN (0, 1)
             GROUP BY p.numorden
             ORDER BY p.fechapedido ASC`,
            [nummesa]
        );
        
        for (let pedido of rows) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?
                 ORDER BY ap.id ASC`,
                [pedido.numorden]
            );
            pedido.alimentos = alimentos;
        }
        
        res.json({ success: true, pedidos: rows });
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER PEDIDOS PARA LLEVAR

router.get('/pedidos/para-llevar', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos,
                    SUM(ap.costo) as subtotal
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             WHERE p.nummesa = 0 AND p.estado IN (0, 1)
             GROUP BY p.numorden
             ORDER BY p.fechapedido ASC`,
            []
        );
        
        for (let pedido of rows) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?
                 ORDER BY ap.id ASC`,
                [pedido.numorden]
            );
            pedido.alimentos = alimentos;
        }
        
        res.json({ success: true, pedidos: rows });
    } catch (error) {
        console.error('Error al obtener pedidos para llevar:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// AGREGAR PRODUCTOS A UN PEDIDO
router.post('/pedidos/agregar', async (req, res) => {
    const { nummesa, metodopago, cuenta, paquetes, esParaLlevar, numordenExistente } = req.body;
    
    if (!cuenta) {
        return res.status(400).json({ 
            success: false, 
            message: 'ID de cuenta es requerido' 
        });
    }
    
    if (!paquetes || paquetes.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Se requiere al menos un paquete' 
        });
    }
    
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        let numorden = numordenExistente;
        let esNuevaOrden = false;
        
        if (!numorden) {
            const numeroMesa = esParaLlevar ? 0 : (nummesa || 0);
            const nuevoNumOrden = await getNextOrdenNummesa(numeroMesa);
            
            await connection.query(
                `INSERT INTO Pedidos 
                 (numorden, costo, nummesa, estado, fechapedido, metodopago, cuenta) 
                 VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
                [nuevoNumOrden, 0, numeroMesa, 0, metodopago || null, cuenta]
            );
            
            numorden = nuevoNumOrden;
            esNuevaOrden = true;
        }
        
        let costoAdicional = 0;
        
        for (const paquete of paquetes) {
            // Insertar platillo principal 
            if (paquete.principal) {
                await connection.query(
                    `INSERT INTO Alimentos_Pedidos 
                     (costo, estado, alimento, extras, comentarios, cuenta, numorden) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        paquete.principal.precio,
                        0,
                        paquete.principal.nombre,
                        paquete.extras ? paquete.extras.map(e => e.nombre).join(', ') : '',
                        paquete.comentarios || '',
                        cuenta,
                        numorden
                    ]
                );
                costoAdicional += paquete.principal.precio;
            }
            
            // Insertar guarniciones (pueden estar vacías)
            if (paquete.guarniciones && paquete.guarniciones.length > 0) {
                for (const guarnicion of paquete.guarniciones) {
                    await connection.query(
                        `INSERT INTO Alimentos_Pedidos 
                         (costo, estado, alimento, extras, comentarios, cuenta, numorden) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [0, 0, guarnicion.nombre, '', '', cuenta, numorden]
                    );
                }
            }
            
            // Insertar entradas (pueden estar vacías)
            if (paquete.entradas && paquete.entradas.length > 0) {
                for (const entrada of paquete.entradas) {
                    await connection.query(
                        `INSERT INTO Alimentos_Pedidos 
                         (costo, estado, alimento, extras, comentarios, cuenta, numorden) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [0, 0, entrada.nombre, '', '', cuenta, numorden]
                    );
                }
            }
            
            // Insertar extras (pueden estar vacíos)
            if (paquete.extras && paquete.extras.length > 0) {
                for (const extra of paquete.extras) {
                    await connection.query(
                        `INSERT INTO Alimentos_Pedidos 
                         (costo, estado, alimento, extras, comentarios, cuenta, numorden) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [extra.precio, 0, extra.nombre, '', '', cuenta, numorden]
                    );
                    costoAdicional += extra.precio;
                }
            }
        }
        
        await connection.query(
            'UPDATE Pedidos SET costo = costo + ? WHERE numorden = ?',
            [costoAdicional, numorden]
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: esNuevaOrden ? 'Pedido creado correctamente' : 'Productos agregados al pedido',
            numorden: numorden,
            costoAdicional: costoAdicional,
            esNuevaOrden: esNuevaOrden
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error al agregar pedido:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// ACTUALIZAR ESTADO DE UN PEDIDO
// ============================================
router.put('/pedidos/:numorden/estado', async (req, res) => {
    const { numorden } = req.params;
    const { estado } = req.body;
    
    try {
        await db.query(
            'UPDATE Pedidos SET estado = ? WHERE numorden = ?',
            [estado, numorden]
        );
        
        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ACTUALIZAR ESTADO DE UN ALIMENTO ESPECÍFICO
// ============================================
router.put('/pedidos/:numorden/alimento/:id/estado', async (req, res) => {
    const { numorden, id } = req.params;
    const { estado } = req.body;
    
    // Validar que el estado sea 0 o 1
    if (estado !== 0 && estado !== 1) {
        return res.status(400).json({ 
            success: false, 
            message: 'Estado inválido. Debe ser 0 (pendiente) o 1 (servido)' 
        });
    }
    
    try {
        // Verificar que el alimento existe en ese pedido
        const [alimentoRows] = await db.query(
            'SELECT * FROM Alimentos_Pedidos WHERE id = ? AND numorden = ?',
            [id, numorden]
        );
        
        if (alimentoRows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Alimento no encontrado en este pedido' 
            });
        }
        
        // Actualizar el estado del alimento
        await db.query(
            'UPDATE Alimentos_Pedidos SET estado = ? WHERE id = ? AND numorden = ?',
            [estado, id, numorden]
        );
        
        // Obtener todos los alimentos del pedido para verificar si todos están servidos
        const [todosAlimentos] = await db.query(
            'SELECT estado FROM Alimentos_Pedidos WHERE numorden = ?',
            [numorden]
        );
        
        // Verificar si todos los alimentos están servidos (estado = 1)
        const todosServidos = todosAlimentos.every(a => a.estado === 1);
        
        // Si todos están servidos, actualizar el estado del pedido a "completado" (estado 2)
        if (todosServidos) {
            await db.query(
                'UPDATE Pedidos SET estado = 2, fechacompletado = NOW() WHERE numorden = ?',
                [numorden]
            );
        } else {
            // Si no todos están servidos, asegurar que el pedido no esté completado
            await db.query(
                'UPDATE Pedidos SET estado = 1 WHERE numorden = ? AND estado = 2',
                [numorden]
            );
        }
        
        res.json({ 
            success: true, 
            message: estado === 1 ? 'Producto marcado como servido' : 'Producto regresado a pendiente',
            todosServidos: todosServidos
        });
        
    } catch (error) {
        console.error('Error al actualizar estado del alimento:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// COBRAR PEDIDO
// ============================================
router.put('/pedidos/:numorden/cobrar', async (req, res) => {
    const { numorden } = req.params;
    const { metodopago } = req.body;
    
    try {
        await db.query(
            'UPDATE Pedidos SET estado = 2, metodopago = ?, fechacompletado = NOW() WHERE numorden = ?',
            [metodopago, numorden]
        );
        
        res.json({ success: true, message: 'Pedido cobrado correctamente' });
    } catch (error) {
        console.error('Error al cobrar pedido:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// OBTENER CUENTA DE MESA
// ============================================
router.get('/mesas/:nummesa/cuenta', async (req, res) => {
    try {
        const { nummesa } = req.params;
        
        const [pedidos] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos,
                    SUM(ap.costo) as subtotal
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             WHERE p.nummesa = ? AND p.estado = 2
             GROUP BY p.numorden
             ORDER BY p.fechapedido ASC`,
            [nummesa]
        );
        
        for (let pedido of pedidos) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?
                 ORDER BY ap.id ASC`,
                [pedido.numorden]
            );
            pedido.alimentos = alimentos;
        }
        
        const totalGeneral = pedidos.reduce((sum, pedido) => sum + pedido.costo, 0);
        
        res.json({ 
            success: true, 
            pedidos: pedidos,
            total: totalGeneral
        });
    } catch (error) {
        console.error('Error al obtener cuenta de mesa:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ELIMINAR PEDIDO COMPLETO
// ============================================
router.delete('/pedidos/:numorden/completo', async (req, res) => {
    const { numorden } = req.params;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        await connection.query(
            'DELETE FROM Alimentos_Pedidos WHERE numorden = ?',
            [numorden]
        );
        
        await connection.query(
            'DELETE FROM Pedidos WHERE numorden = ?',
            [numorden]
        );
        
        await connection.commit();
        
        res.json({ success: true, message: 'Pedido eliminado' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar pedido:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// ELIMINAR UN ALIMENTO DEL PEDIDO
// ============================================
router.delete('/pedidos/:numorden/alimento/:id', async (req, res) => {
    const { numorden, id } = req.params;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Obtener el costo del alimento
        const [alimentoRows] = await connection.query(
            'SELECT costo FROM Alimentos_Pedidos WHERE id = ? AND numorden = ?',
            [id, numorden]
        );
        
        if (alimentoRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Alimento no encontrado' });
        }
        
        const costoAlimento = alimentoRows[0].costo;
        
        // Eliminar el alimento
        await connection.query(
            'DELETE FROM Alimentos_Pedidos WHERE id = ? AND numorden = ?',
            [id, numorden]
        );
        
        // Actualizar el costo total del pedido
        await connection.query(
            'UPDATE Pedidos SET costo = costo - ? WHERE numorden = ?',
            [costoAlimento, numorden]
        );
        
        // Verificar si el pedido quedó sin alimentos
        const [restantes] = await connection.query(
            'SELECT COUNT(*) as total FROM Alimentos_Pedidos WHERE numorden = ?',
            [numorden]
        );
        
        if (restantes[0].total === 0) {
            await connection.query(
                'DELETE FROM Pedidos WHERE numorden = ?',
                [numorden]
            );
        }
        
        await connection.commit();
        
        res.json({ success: true, message: 'Alimento eliminado' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar alimento:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// EDITAR COMENTARIOS DE UN ALIMENTO
// ============================================
router.put('/pedidos/:numorden/alimento/:id/comentarios', async (req, res) => {
    const { numorden, id } = req.params;
    const { comentarios } = req.body;
    
    try {
        await db.query(
            'UPDATE Alimentos_Pedidos SET comentarios = ? WHERE id = ? AND numorden = ?',
            [comentarios, id, numorden]
        );
        
        res.json({ success: true, message: 'Comentarios actualizados' });
    } catch (error) {
        console.error('Error al actualizar comentarios:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMINISTRACIÓN - OBTENER VENTAS POR PERIODO
// ============================================
router.get('/admin/ventas', async (req, res) => {
    try {
        const { periodo, fechaInicio, fechaFin } = req.query;
        let query = '';
        let params = [];

        switch(periodo) {
            case 'dia':
                query = `SELECT p.*, ap.alimento, ap.costo as precio_alimento, ap.extras, ap.comentarios, c.nombre as mesero
                         FROM Pedidos p
                         LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
                         LEFT JOIN Cuentas c ON p.cuenta = c.id
                         WHERE p.estado = 2 AND DATE(p.fechacompletado) = CURDATE()
                         ORDER BY p.fechacompletado DESC`;
                break;
            case 'semana':
                query = `SELECT p.*, ap.alimento, ap.costo as precio_alimento, ap.extras, ap.comentarios, c.nombre as mesero
                         FROM Pedidos p
                         LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
                         LEFT JOIN Cuentas c ON p.cuenta = c.id
                         WHERE p.estado = 2 AND YEARWEEK(p.fechacompletado) = YEARWEEK(CURDATE())
                         ORDER BY p.fechacompletado DESC`;
                break;
            case 'mes':
                query = `SELECT p.*, ap.alimento, ap.costo as precio_alimento, ap.extras, ap.comentarios, c.nombre as mesero
                         FROM Pedidos p
                         LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
                         LEFT JOIN Cuentas c ON p.cuenta = c.id
                         WHERE p.estado = 2 AND MONTH(p.fechacompletado) = MONTH(CURDATE()) AND YEAR(p.fechacompletado) = YEAR(CURDATE())
                         ORDER BY p.fechacompletado DESC`;
                break;
            case 'rango':
                if (!fechaInicio || !fechaFin) {
                    return res.status(400).json({ success: false, message: 'Fechas requeridas para rango' });
                }
                query = `SELECT p.*, ap.alimento, ap.costo as precio_alimento, ap.extras, ap.comentarios, c.nombre as mesero
                         FROM Pedidos p
                         LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
                         LEFT JOIN Cuentas c ON p.cuenta = c.id
                         WHERE p.estado = 2 AND DATE(p.fechacompletado) BETWEEN ? AND ?
                         ORDER BY p.fechacompletado DESC`;
                params = [fechaInicio, fechaFin];
                break;
            default:
                query = `SELECT p.*, ap.alimento, ap.costo as precio_alimento, ap.extras, ap.comentarios, c.nombre as mesero
                         FROM Pedidos p
                         LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
                         LEFT JOIN Cuentas c ON p.cuenta = c.id
                         WHERE p.estado = 2 AND DATE(p.fechacompletado) = CURDATE()
                         ORDER BY p.fechacompletado DESC`;
        }
        
        const [rows] = await db.query(query, params);
        
        // Agrupar por pedido
        const pedidosMap = new Map();
        for (const row of rows) {
            if (!pedidosMap.has(row.numorden)) {
                pedidosMap.set(row.numorden, {
                    numorden: row.numorden,
                    costo: row.costo,
                    nummesa: row.nummesa,
                    fechacompletado: row.fechacompletado,
                    metodopago: row.metodopago,
                    mesero: row.mesero,
                    alimentos: []
                });
            }
            if (row.alimento) {
                pedidosMap.get(row.numorden).alimentos.push({
                    alimento: row.alimento,
                    costo: row.precio_alimento,
                    extras: row.extras,
                    comentarios: row.comentarios
                });
            }
        }
        
        const pedidos = Array.from(pedidosMap.values());
        const totalVentas = pedidos.reduce((sum, p) => sum + p.costo, 0);
        
        res.json({ 
            success: true, 
            data: {
                pedidos: pedidos,
                total: totalVentas,
                cantidad: pedidos.length
            }
        });
        
    } catch (error) {
        console.error('Error al obtener ventas:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMINISTRACIÓN - OBTENER PEDIDOS PENDIENTES DE PAGO
// ============================================
router.get('/admin/pendientes-pago', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos,
                    SUM(ap.costo) as subtotal,
                    c.nombre as mesero
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             LEFT JOIN Cuentas c ON p.cuenta = c.id
             WHERE p.estado = 1
             GROUP BY p.numorden
             ORDER BY p.fechapedido ASC`,
            []
        );
        
        for (let pedido of rows) {
            const [alimentos] = await db.query(
                `SELECT ap.*, a.tipo
                 FROM Alimentos_Pedidos ap
                 LEFT JOIN Alimentos a ON ap.alimento = a.nombre
                 WHERE ap.numorden = ?
                 ORDER BY ap.id ASC`,
                [pedido.numorden]
            );
            pedido.alimentos = alimentos;
        }
        
        res.json({ success: true, pedidos: rows });
        
    } catch (error) {
        console.error('Error al obtener pedidos pendientes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMINISTRACIÓN - COBRAR PEDIDO
// ============================================
router.put('/admin/cobrar/:numorden', async (req, res) => {
    const { numorden } = req.params;
    const { metodopago } = req.body;
    
    try {
        await db.query(
            'UPDATE Pedidos SET estado = 2, metodopago = ?, fechacompletado = NOW() WHERE numorden = ?',
            [metodopago, numorden]
        );
        
        res.json({ success: true, message: 'Pedido cobrado correctamente' });
    } catch (error) {
        console.error('Error al cobrar pedido:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
