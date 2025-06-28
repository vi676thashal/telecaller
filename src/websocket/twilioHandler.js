// Import the new real-time WebSocket handler
const twilioWebSocketHandler = require('../services/twilioWebSocketHandler');

/**
 * Twilio WebSocket Handler Wrapper
 * This file maintains compatibility with the existing app.js structure
 * while using the new real-time streaming implementation
 */
class TwilioWebSocketHandler {
  constructor(wss, callController) {
    this.wss = wss;
    this.callController = callController;
    this.setupWebSocket();
  }
  setupWebSocket() {
    console.log('[TwilioHandler] Setting up real-time Twilio WebSocket handler for /ws/twilio');
    
    // Use the new real-time WebSocket handler
    twilioWebSocketHandler.initialize(this.wss);
  }
}

module.exports = TwilioWebSocketHandler;
