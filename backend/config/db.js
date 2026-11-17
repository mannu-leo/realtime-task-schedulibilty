const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let pool = null;
let isConnected = false;
let lastError = null;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'realtime_scheduler',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

try {
  pool = mysql.createPool(dbConfig);
} catch (err) {
  lastError = err.message;
  console.warn('[Database] Failed to initialize MySQL pool:', err.message);
}

// Test connection on startup
async function checkConnection() {
  if (!pool) return false;
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    isConnected = true;
    lastError = null;
    return true;
  } catch (err) {
    isConnected = false;
    lastError = err.message;
    return false;
  }
}

function getDbStatus() {
  return {
    connected: isConnected,
    host: dbConfig.host,
    database: dbConfig.database,
    user: dbConfig.user,
    error: lastError
  };
}

module.exports = {
  pool,
  checkConnection,
  getDbStatus
};
