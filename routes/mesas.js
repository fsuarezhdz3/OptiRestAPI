const express = require('express');
const db = require('../db');
const router = express.Router();

// Obtener estado de todas las mesas
router.get('/mesas/estado', async (req, res) => {
    try {
        const [pedidosActivos] = await db.query(
            `SELECT nummesa, 
                    COUNT(*) as pedidos_activos,
                    GROUP_CONCAT(numorden) as ordenes
             FROM Pedidos 
             WHERE estado < 2 AND nummesa > 0
             GROUP BY nummesa`
        );
        
        const estadosMesas = {};
        for (let i = 1; i <= 11; i++) {
            const pedido = pedidosActivos.find(p => p.nummesa === i);
            estadosMesas[i] = {
                ocupada: !!pedido,
                pedidosActivos: pedido ? pedido.pedidos_activos : 0,
                ordenes: pedido ? pedido.ordenes : ''
            };
        }
        
        res.json({ success: true, mesas: estadosMesas });
    } catch (error) {
        console.error('Error al obtener estado de mesas:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Obtener cuenta de mesa (resumen para cobrar)
router.get('/mesas/:nummesa/cuenta', async (req, res) => {
    try {
        const { nummesa } = req.params;
        
        const [pedidos] = await db.query(
            `SELECT p.*, 
                    COUNT(ap.id) as total_platillos
             FROM Pedidos p
             LEFT JOIN Alimentos_Pedidos ap ON p.numorden = ap.numorden
             WHERE p.nummesa = ? AND p.estado = 2
             GROUP BY p.numorden`,
            [nummesa]
        );
        
        const total = pedidos.reduce((sum, p) => sum + p.costo, 0);
        
        res.json({ success: true, pedidos: pedidos, total: total });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;