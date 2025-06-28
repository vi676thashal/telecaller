const WebSocket = require('ws');
const audioStreamService = require('../services/audioStreamService');
const googleSpeechService = require('../services/googleSpeechService');
const openaiService = require('../services/openaiService');
const Call = require('../models/Call');

class MediaWebSocketHandler {
  constructor(wss, callController) {
    this.wss = wss;
    this.callController = callController;
    this.callStateManager = require('../services/callStateManager');
    this.setupWebSocket();
  }

  setupWebSocket() {
    console.log('[MediaHandler] WebSocket server starting on path /media');

    // Monitor active connections
    setInterval(() => {
      this.wss.clients.forEach(client => {
        if (client.isAlive === false) {
          console.log(`[MediaHandler] Terminating inactive client ${client.callId}`);
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  async handleConnection(ws, req) {
    try {
      const pathMatch = req.url.match(/\/media\/([^/]+)/);
      if (!pathMatch) {
        console.error('[MediaHandler] Invalid WebSocket URL path:', req.url);
        ws.close(1000, 'Invalid path');
        return;
      }

      const callId = pathMatch[1];
      ws.callId = callId;
      ws.isAlive = true;

      console.log(`[MediaHandler] New WebSocket connection for call ${callId}`);
      
      // Initialize or get call state
      const callState = this.callStateManager.initializeCall(callId);
      this.callStateManager.registerWebSocket(callId, ws);

      // Set up ping/pong
      ws.on('pong', () => {
        ws.isAlive = true;
        callState.lastActivity = Date.now();
      });

      // Set up error handling
      ws.on('error', (error) => {
        console.error(`[MediaHandler] WebSocket error for call ${callId}:`, error);
        this.handleError(ws, callId, error);
      });

      // Set up close handling
      ws.on('close', () => {
        console.log(`[MediaHandler] WebSocket closed for call ${callId}`);
        this.handleClose(ws, callId);
      });

      // Set up message handling
      ws.on('message', (data) => this.handleMessage(ws, callId, data));

      // Initial setup complete
      ws.send(JSON.stringify({ event: 'connected', callId }));

    } catch (error) {
      console.error('[MediaHandler] Error in connection handler:', error);
      ws.close(1011, 'Setup failed');
    }
  }

  async handleMessage(ws, callId, data) {
    const callState = this.callStateManager.getCallState(callId);
    if (!callState) {
      console.error(`[MediaHandler] No call state found for ${callId}`);
      return;
    }

    try {
      if (Buffer.isBuffer(data)) {
        // Handle audio data
        if (callState.audioStream?.active) {
          const success = callState.audioStream.push(data);
          if (!success) {
            console.warn(`[MediaHandler] Backpressure detected for ${callId}`);
            await new Promise(resolve => callState.audioStream.once('drain', resolve));
          }
        }
      } else {
        // Handle control messages
        const message = JSON.parse(data.toString());
        switch (message.event) {
          case 'ready':
            console.log(`[MediaHandler] Client ready for call ${callId}`);
            callState.status = 'ready';
            this.callStateManager.setMediaStreamReady(callId, true);
            break;
            
          case 'stream-start':
            console.log(`[MediaHandler] Stream started for call ${callId}`);
            callState.status = 'streaming';
            break;
            
          case 'stream-end':
            console.log(`[MediaHandler] Stream ended for call ${callId}`);
            callState.status = 'completed';
            break;
            
          default:
            console.log(`[MediaHandler] Received message for ${callId}:`, message);
        }
      }
      
      callState.lastActivity = Date.now();
      
    } catch (error) {
      console.error(`[MediaHandler] Error handling message for ${callId}:`, error);
      this.handleError(ws, callId, error);
    }
  }

  handleError(ws, callId, error) {
    console.error(`[MediaHandler] Error in call ${callId}:`, error);
    const callState = this.callStateManager.getCallState(callId);
    
    if (callState) {
      callState.status = 'error';
      if (callState.reconnectAttempts < callState.maxReconnectAttempts) {
        callState.reconnectAttempts++;
        console.log(`[MediaHandler] Attempting reconnection for ${callId} (attempt ${callState.reconnectAttempts})`);
        // Attempt reconnection
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'reconnect' }));
          }
        }, 1000);
      } else {
        console.log(`[MediaHandler] Max reconnection attempts reached for ${callId}`);
        ws.close(1011, 'Max reconnection attempts reached');
      }
    }
  }

  handleClose(ws, callId) {
    const callState = this.callStateManager.getCallState(callId);
    if (callState) {
      callState.status = 'closed';
      this.callStateManager.unregisterWebSocket(callId);
      
      // Only clear call state if the call is complete
      if (callState.status === 'completed' || callState.status === 'error') {
        this.callStateManager.clearCallState(callId, 'connection closed');
      }
    }
  }
}

module.exports = MediaWebSocketHandler;
