/**
 * OpenAI Realtime Controller
 *
 * Handles realtime communication with OpenAI API
 */

const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { logger } = require('../utils/logger');

// OpenAI realtime status endpoint
router.get('/status', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'OpenAI FM realtime service is available'
  });
});

// Setup WebSocket server for OpenAI streaming
const setupWebSocketServer = (server) => {
  logger.info('Setting up WebSocket server for OpenAI realtime streaming');
  
  // Use a specific path to avoid conflicts with other WebSocket servers
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/openai',
    perMessageDeflate: false,
    skipUTF8Validation: true,
    fragmentOutgoingMessages: false,
    maxPayload: 65536
  });
  
  // Set up basic handlers
  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      // Handle incoming messages from clients
      try {
        const data = JSON.parse(message);
        logger.info('Received message on OpenAI WebSocket', { type: data.type });
      } catch (error) {
        logger.error('Error processing OpenAI WebSocket message', { error: error.message });
      }
    });
    
    // Send a welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to OpenAI realtime service'
    }));
  });
  
  return true;
};

module.exports = { router, setupWebSocketServer };
