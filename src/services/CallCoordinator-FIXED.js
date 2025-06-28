const WebSocket = require('ws');
const openaiService = require('./openaiService');
const elevenlabsService = require('./elevenlabsService');
const googleSpeechService = require('./googleSpeechService');
const deepgramService = require('./deepgramService');
const { logger } = require('../utils/logger');

class CallCoordinator {
  constructor() {
    this.activeCalls = new Map();
    this.webSockets = new Map();
    this.audioStreams = new Map();
  }
  initWebSocketServer(server) {
    // CRITICAL: Configure WebSocket server to prevent Protocol Error 31924
    const wss = new WebSocket.Server({ 
      server,
      path: '/ws/media',  // Changed path to avoid conflict with main twilio WebSocket server
      perMessageDeflate: false,        // Disable compression
      skipUTF8Validation: true,        // Allow binary audio data
      fragmentOutgoingMessages: false, // CRITICAL: Prevent frame fragmentation
      maxPayload: 65536                // 64KB max payload
    });

    logger.info('Protocol-fixed WebSocket server initialized for Twilio media streams');

    wss.on('connection', async (ws, req) => {
      logger.info('New Twilio WebSocket connection established');
      
      // Setup connection state
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          switch (data.event) {
            case 'start':
              ws.streamSid = data.start.streamSid;
              ws.callSid = data.start.callSid;
              await this._handleStart(ws, data);
              break;
              
            case 'media':
              await this._handleMedia(ws, data);
              break;
              
            case 'mark':
              logger.info(`Received mark: ${data.mark?.name}`);
              break;
              
            case 'stop':
              logger.info(`Stream stopped for SID: ${ws.streamSid}`);
              this.cleanup(ws);
              break;
          }
        } catch (error) {
          logger.error('Error handling WebSocket message:', error);
        }
      });

      // Handle connection close
      ws.on('close', () => {
        logger.info('WebSocket connection closed');
        this.cleanup(ws);
      });
    });

    // Keep connections alive with ping-pong
    setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.info('Terminating inactive WebSocket connection');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  // Send audio to Twilio with correct protocol format
  async _sendAudioToTwilio(ws, audioBuffer) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    try {
      const message = {
        event: 'media',  // CORRECT: Use 'event' not 'action'
        streamSid: ws.streamSid,
        media: {
          payload: audioBuffer.toString('base64'),
          track: "outbound",            // Required field
          chunk: String(Date.now()),    // Required unique identifier
          timestamp: String(Date.now()) // Required timestamp
        }
      };
      
      ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending audio to Twilio:', error);
    }
  }

  async _handleStart(ws, data) {
    try {
      logger.info('Stream started');
      // Start immediate audio response to prevent silent calls
      const welcomeMessage = "Hello! This is AI voice assistant. How can I help you today?";
      const audioBuffer = await openaiService.textToSpeech(welcomeMessage);
      await this._sendAudioToTwilio(ws, audioBuffer);
    } catch (error) {
      logger.error('Error handling stream start:', error);
    }
  }

  async _handleMedia(ws, data) {
    try {
      // Get audio data from the media event
      const audioBuffer = Buffer.from(data.media.payload, 'base64');
      
      // Convert speech to text using Google (configured as default)
      const transcription = await googleSpeechService.transcribe(audioBuffer);
      
      if (transcription) {
        logger.info('Transcription:', transcription);
        
        // Generate AI response using OpenAI
        const response = await openaiService.generateResponse(transcription);
        
        // Convert response to speech
        const responseAudio = await openaiService.textToSpeech(response);
        
        // Send audio back to Twilio
        await this._sendAudioToTwilio(ws, responseAudio);
      }
    } catch (error) {
      logger.error('Error handling media:', error);
    }
  }

  cleanup(ws) {
    if (ws.streamSid) {
      this.activeCalls.delete(ws.streamSid);
      this.webSockets.delete(ws.streamSid);
      this.audioStreams.delete(ws.streamSid);
    }
  }
}

const callCoordinator = new CallCoordinator();
module.exports = { callCoordinator };
