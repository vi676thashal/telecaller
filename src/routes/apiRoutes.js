/**
 * API Routes
 *
 * Main API routes for the backend server
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Get configuration
router.get('/config', (req, res) => {
  res.status(200).json({
    server: {
      port: process.env.PORT || 5002,
      ngrokUrl: process.env.NGROK_URL || 'Not configured'
    },
    twilio: {
      voiceEndpoint: '/voice',
      statusEndpoint: '/call-status'
    }
  });
});

module.exports = router;
