const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');

// Simulation routes
router.post('/simulations', simulationController.saveSimulation);
router.get('/simulations', simulationController.getAllSimulations);
router.get('/simulations/:id', simulationController.getSimulationById);
router.delete('/simulations/:id', simulationController.deleteSimulation);

// Dashboard routes
router.get('/dashboard/stats', simulationController.getDashboardStats);

module.exports = router;
