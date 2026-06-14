const express = require('express');
const db = require('../db');  // Esto ahora es el pool con promesas
const router = express.Router();

// Endpoint de login
router.post('/login', async (req, res) => {
    const { nombre, contrasena } = req.body;

    console.log('📝 Intento de login:', { nombre, contrasena });

    if (!nombre || !contrasena) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre y contraseña son requeridos' 
        });
    }

    try {
        // Usar db.query directamente
        const [rows] = await db.query(
            'SELECT * FROM Cuentas WHERE nombre = ?', 
            [nombre]
        );

        console.log('📊 Usuarios encontrados:', rows.length);

        if (rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }

        const cuenta = rows[0];

        // Verificar si la cuenta está bloqueada
        if (cuenta.bloqueo === 1) {
            return res.status(403).json({ 
                success: false, 
                message: 'Cuenta bloqueada. Contacte al administrador' 
            });
        }

        // Verificar contraseña
        if (cuenta.contrasena !== contrasena) {
            const nuevosIntentos = cuenta.intentos + 1;
            let mensaje = `Contraseña incorrecta. Intentos restantes: ${15 - nuevosIntentos}`;

            if (nuevosIntentos >= 15) {
                await db.query(
                    'UPDATE Cuentas SET intentos = ?, bloqueo = 1 WHERE id = ?',
                    [nuevosIntentos, cuenta.id]
                );
                return res.status(403).json({ 
                    success: false, 
                    message: 'Cuenta bloqueada por 15 intentos fallidos' 
                });
            }

            await db.query(
                'UPDATE Cuentas SET intentos = ? WHERE id = ?',
                [nuevosIntentos, cuenta.id]
            );

            return res.status(401).json({ 
                success: false, 
                message: mensaje 
            });
        }

        // Login exitoso: resetear intentos
        await db.query(
            'UPDATE Cuentas SET intentos = 0 WHERE id = ?',
            [cuenta.id]
        );

        // Determinar rol según tipo
        let rol = '';
        switch(cuenta.tipo) {
            case 'A': rol = 'Administrador'; break;
            case 'C': rol = 'Cocina'; break;
            case 'B': rol = 'Barra'; break;
            case 'D': rol = 'Dueño'; break;
            case 'M': rol = 'Mesero'; break;
            default: rol = 'Desconocido';
        }

        console.log('✅ Login exitoso para:', cuenta.nombre);

        res.json({
            success: true,
            message: 'Login exitoso',
            usuario: {
                id: cuenta.id,
                nombre: cuenta.nombre,
                tipo: cuenta.tipo,
                rol: rol
            }
        });

    } catch (error) {
        console.error('🔴 Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

module.exports = router;