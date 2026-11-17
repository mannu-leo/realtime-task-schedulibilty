const { pool, checkConnection, getDbStatus } = require('../config/db');

/**
 * Controller for Real-Time Simulation and Dashboard APIs
 */

// POST /api/simulations
// Save a complete simulation record, its periodic tasks, and execution results
exports.saveSimulation = async (req, res) => {
  const isConnected = await checkConnection();
  if (!isConnected) {
    const status = getDbStatus();
    return res.status(503).json({
      success: false,
      message: 'Database is currently offline. Please configure your MySQL credentials in .env and execute database/schema.sql.',
      dbStatus: status
    });
  }

  const {
    algorithm,
    cpu_utilization,
    schedulability_status,
    deadline_misses = 0,
    simulation_horizon = 20,
    tasks = [],
    results = []
  } = req.body;

  // Basic validation
  if (!algorithm || cpu_utilization === undefined || !schedulability_status) {
    return res.status(400).json({
      success: false,
      message: 'Missing required simulation fields (algorithm, cpu_utilization, schedulability_status).'
    });
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot save simulation without at least one configured task.'
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Insert into simulations table
    const [simInsertResult] = await connection.execute(
      `INSERT INTO simulations 
       (algorithm, cpu_utilization, schedulability_status, deadline_misses, simulation_horizon) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        algorithm,
        parseFloat(cpu_utilization).toFixed(2),
        schedulability_status,
        parseInt(deadline_misses, 10) || 0,
        parseInt(simulation_horizon, 10) || 20
      ]
    );

    const simulationId = simInsertResult.insertId;

    // 2. Insert tasks
    for (const t of tasks) {
      await connection.execute(
        `INSERT INTO tasks 
         (simulation_id, task_name, execution_time, period, deadline, arrival_time) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          simulationId,
          t.task_name || 'Task',
          parseInt(t.execution_time, 10) || 1,
          parseInt(t.period, 10) || 1,
          parseInt(t.deadline, 10) || t.period || 1,
          parseInt(t.arrival_time, 10) || 0
        ]
      );
    }

    // 3. Insert execution slices / results
    if (Array.isArray(results) && results.length > 0) {
      for (const r of results) {
        await connection.execute(
          `INSERT INTO simulation_results 
           (simulation_id, task_name, start_time, end_time, absolute_deadline, status) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            simulationId,
            r.task_name || 'Task',
            parseInt(r.start_time, 10) || 0,
            parseInt(r.end_time, 10) || 0,
            parseInt(r.absolute_deadline, 10) || 0,
            r.status || 'COMPLETED'
          ]
        );
      }
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Simulation saved successfully to MySQL.',
      simulationId
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[SimulationController] Save error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save simulation to MySQL database: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
};

// GET /api/simulations
// Retrieve all saved simulations with summary metadata
exports.getAllSimulations = async (req, res) => {
  const isConnected = await checkConnection();
  if (!isConnected) {
    return res.status(200).json({
      success: true,
      dbConnected: false,
      data: [],
      message: 'Database is offline. Start MySQL and run database/schema.sql to view persisted history.'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.simulation_id, s.algorithm, s.cpu_utilization, 
              s.schedulability_status, s.deadline_misses, s.simulation_horizon, 
              s.created_at,
              COUNT(DISTINCT t.task_id) as total_tasks
       FROM simulations s
       LEFT JOIN tasks t ON s.simulation_id = t.simulation_id
       GROUP BY s.simulation_id
       ORDER BY s.created_at DESC`
    );

    return res.json({
      success: true,
      dbConnected: true,
      data: rows
    });
  } catch (error) {
    console.error('[SimulationController] getAllSimulations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve simulations from database: ' + error.message
    });
  }
};

// GET /api/simulations/:id
// Retrieve complete simulation details including tasks and execution slices
exports.getSimulationById = async (req, res) => {
  const simulationId = parseInt(req.params.id, 10);
  if (isNaN(simulationId)) {
    return res.status(400).json({ success: false, message: 'Invalid simulation ID.' });
  }

  const isConnected = await checkConnection();
  if (!isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database is currently offline.'
    });
  }

  try {
    const [simulations] = await pool.execute(
      `SELECT * FROM simulations WHERE simulation_id = ?`,
      [simulationId]
    );

    if (simulations.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Simulation #${simulationId} not found.`
      });
    }

    const simulation = simulations[0];

    // Fetch tasks
    const [tasks] = await pool.execute(
      `SELECT task_id, task_name, execution_time, period, deadline, arrival_time 
       FROM tasks WHERE simulation_id = ? ORDER BY task_id ASC`,
      [simulationId]
    );

    // Fetch execution results
    const [results] = await pool.execute(
      `SELECT result_id, task_name, start_time, end_time, absolute_deadline, status 
       FROM simulation_results WHERE simulation_id = ? ORDER BY start_time ASC`,
      [simulationId]
    );

    return res.json({
      success: true,
      data: {
        ...simulation,
        tasks,
        results
      }
    });
  } catch (error) {
    console.error('[SimulationController] getSimulationById error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve simulation details: ' + error.message
    });
  }
};

// DELETE /api/simulations/:id
// Delete a simulation (cascading deletes will remove tasks and results)
exports.deleteSimulation = async (req, res) => {
  const simulationId = parseInt(req.params.id, 10);
  if (isNaN(simulationId)) {
    return res.status(400).json({ success: false, message: 'Invalid simulation ID.' });
  }

  const isConnected = await checkConnection();
  if (!isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database is currently offline.'
    });
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM simulations WHERE simulation_id = ?`,
      [simulationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `Simulation #${simulationId} not found.`
      });
    }

    return res.json({
      success: true,
      message: `Simulation #${simulationId} deleted successfully.`
    });
  } catch (error) {
    console.error('[SimulationController] deleteSimulation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete simulation: ' + error.message
    });
  }
};

// GET /api/dashboard/stats
// Return live aggregated dashboard statistics
exports.getDashboardStats = async (req, res) => {
  const isConnected = await checkConnection();
  if (!isConnected) {
    return res.json({
      success: true,
      dbConnected: false,
      totalSimulations: 0,
      totalTasksSimulated: 0,
      totalDeadlineMisses: 0,
      avgCpuUtilization: 0,
      recentSimulations: [],
      algorithmBreakdown: { RMS: 0, EDF: 0, FCFS: 0 },
      dbStatus: getDbStatus()
    });
  }

  try {
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) as total_simulations, 
              COALESCE(SUM(deadline_misses), 0) as total_deadline_misses,
              COALESCE(AVG(cpu_utilization), 0) as avg_utilization
       FROM simulations`
    );

    const [[taskCountRow]] = await pool.query(
      `SELECT COUNT(*) as total_tasks FROM tasks`
    );

    const [recent] = await pool.query(
      `SELECT simulation_id, algorithm, cpu_utilization, schedulability_status, deadline_misses, created_at 
       FROM simulations 
       ORDER BY created_at DESC 
       LIMIT 5`
    );

    const [algos] = await pool.query(
      `SELECT algorithm, COUNT(*) as count FROM simulations GROUP BY algorithm`
    );

    const breakdown = { RMS: 0, EDF: 0, FCFS: 0 };
    for (const a of algos) {
      if (breakdown[a.algorithm] !== undefined) {
        breakdown[a.algorithm] = a.count;
      }
    }

    return res.json({
      success: true,
      dbConnected: true,
      totalSimulations: countRow.total_simulations || 0,
      totalTasksSimulated: taskCountRow.total_tasks || 0,
      totalDeadlineMisses: parseInt(countRow.total_deadline_misses, 10) || 0,
      avgCpuUtilization: parseFloat(countRow.avg_utilization || 0).toFixed(1),
      recentSimulations: recent,
      algorithmBreakdown: breakdown,
      dbStatus: getDbStatus()
    });
  } catch (error) {
    console.error('[SimulationController] getDashboardStats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to query dashboard statistics: ' + error.message
    });
  }
};
