const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { checkConnection, getDbStatus } = require('./config/db');
const simulationRoutes = require('./routes/simulationRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Routes
app.use('/api', simulationRoutes);

// Health check / DB ping endpoint
app.get('/api/health', async (req, res) => {
  const connected = await checkConnection();
  res.json({
    status: 'OK',
    serverTime: new Date().toISOString(),
    database: getDbStatus()
  });
});

// Single Page Application fallback: serve index.html for any unhandled GET route
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error: ' + err.message
  });
});

// Start listening
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(` REAL-TIME TASK SCHEDULABILITY ANALYSER & SIMULATOR `);
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` Serving frontend from: ${frontendPath}`);
  console.log(`====================================================`);

  // Check database connectivity
  const dbConnected = await checkConnection();
  if (dbConnected) {
    console.log(`[Database] MySQL connected successfully to '${process.env.DB_NAME || 'realtime_scheduler'}'.`);
  } else {
    console.warn(`[Database] Notice: MySQL is not yet connected.`);
    console.warn(`[Database] Run database/schema.sql and verify credentials in .env to enable MySQL persistence.`);
    console.warn(`[Database] Note: All algorithms, Gantt chart, and analyses remain 100% functional in memory!`);
  }
});
