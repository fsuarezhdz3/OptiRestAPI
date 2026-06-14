const mysql = require('mysql2');
require('dotenv').config();

// Verificar que las variables de entorno existen
console.log('🔍 Variables de entorno:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PORT:', process.env.DB_PORT);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Exportar el pool con promesas directamente
const db = pool.promise();

// Probar conexión
db.getConnection()
    .then(connection => {
        console.log('✅ Conexión a BD establecida correctamente');
        connection.release();
    })
    .catch(err => {
        console.error('🔴 Error de conexión a la BD:', err.message);
    });

// Exportar el objeto db que tiene el método query
module.exports = db;