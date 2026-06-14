const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Importar rutas
const authRoutes = require('./routes/auth');
const alimentosRoutes = require('./routes/alimentos');
const pedidosRoutes = require('./routes/pedidos');
const mesasRoutes = require('./routes/mesas');

// Usar rutas
app.use('/api', authRoutes);
app.use('/api', alimentosRoutes);
app.use('/api', pedidosRoutes);
app.use('/api', mesasRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API funcionando correctamente' });
});

// Manejador de errores 404
app.use((req, res) => {
    console.log('❌ Ruta no encontrada:', req.method, req.url);
    res.status(404).json({ 
        success: false, 
        message: `Ruta no encontrada: ${req.method} ${req.url}`
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API corriendo en http://localhost:${PORT}`);
    console.log(`📋 Endpoints disponibles:`);
    console.log(`   POST   /api/login`);
    console.log(`   GET    /api/alimentos/tipo/:tipo`);
    console.log(`   GET    /api/pedidos/mesa/:nummesa/activos`);
    console.log(`   GET    /api/pedidos/para-llevar`);
    console.log(`   POST   /api/pedidos/agregar`);
    console.log(`   PUT    /api/pedidos/:numorden/estado`);
    console.log(`   GET    /api/mesas/:nummesa/cuenta`);
});