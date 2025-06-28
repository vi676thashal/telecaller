const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Routes for dashboard data
router.get('/metrics', dashboardController.getMetrics);
router.get('/call-statistics', dashboardController.getCallStatistics);
router.get('/conversion-rate', dashboardController.getConversionRate);

module.exports = router;
