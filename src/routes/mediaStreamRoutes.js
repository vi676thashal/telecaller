/**
 * Media Stream Routes
 *
 * Routes for handling media streaming and WebSocket connections
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { callCoordinator } = require('../services/CallCoordinator');

// Get media stream status
router.get('/status', (req, res) => {
  try {
    const activeStreams = callCoordinator.getActiveStreamCount();
    
    res.status(200).json({
      status: 'ok',
      activeStreams,
      wsServerRunning: true
    });
  } catch (error) {
    logger.error('Error getting media stream status', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
