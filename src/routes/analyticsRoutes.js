const express = require('express');
const router = express.Router();
const streamingAnalyticsService = require('../services/streamingAnalyticsService');
const { logger } = require('../utils/logger');

// Get streaming analytics for a time period
router.get('/streaming', async (req, res) => {
  try {
    const { startTime, endTime, provider } = req.query;
    
    // Validate parameters
    if (!startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Missing parameters', 
        message: 'startTime and endTime are required' 
      });
    }
    
    // Parse dates
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format',
        message: 'startTime and endTime must be valid ISO dates'
      });
    }
    
    // Get metrics for period
    const metrics = await streamingAnalyticsService.getMetricsForPeriod(start, end, provider);
    
    res.json(metrics);
  } catch (error) {
    logger.error('[Analytics API] Error getting streaming metrics:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get current real-time metrics
router.get('/streaming/realtime', (req, res) => {
  try {
    const metrics = streamingAnalyticsService.getAggregatedMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('[Analytics API] Error getting real-time metrics:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get metrics for specific call
router.get('/streaming/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    if (!callId) {
      return res.status(400).json({ 
        error: 'Missing parameter', 
        message: 'callId is required' 
      });
    }
    
    // Get metrics for call from database
    const StreamingAnalytics = require('mongoose').model('StreamingAnalytics');
    const callMetrics = await StreamingAnalytics.find({ callId }).sort({ timestamp: -1 }).exec();
    
    if (!callMetrics || callMetrics.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: `No analytics found for call ${callId}`
      });
    }
    
    res.json(callMetrics);
  } catch (error) {
    logger.error('[Analytics API] Error getting call metrics:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
