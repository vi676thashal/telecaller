/**
 * Call Coordinator Service
 * Central coordinator for managing real-time voice calls with Twilio
 * Handles bidirectional audio streaming, interruptions, and conversation flow
 * Enhanced for credit card sales scenarios with real-time interruption handling
 */

const WebSocket = require('ws');
const openaiService = require('./openaiService');
const elevenlabsService = require('./elevenlabsService');
const googleSpeechService = require('./googleSpeechService');
const deepgramService = require('./deepgramService');
const languageUtils = require('../utils/languageUtils');
const audioStreamService = require('./audioStreamService');
const { AudioStream } = require('./audioStreamService');
const voiceActivityDetectionService = require('./voiceActivityDetectionService');
const { interruptionHandler } = require('./interruption-handler');
// Create a fallback logger in case the imported one is undefined
let logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

try {
  const loggerModule = require('../utils/logger');
  if (loggerModule && loggerModule.logger) {
    logger = loggerModule.logger;
  }
} catch (err) {
  console.warn('Could not load logger module, using fallback logger');
}

const Call = require('../models/Call');
const Script = require('../models/Script');
const Prompt = require('../models/Prompt');

class CallCoordinator {
  constructor() {
    this.activeCalls = new Map(); // Map of active call sessions
    this.webSockets = new Map();  // Map of WebSocket connections by call ID
    this.audioStreams = new Map(); // Map of audio streams by call ID
    this.conversationStates = new Map(); // Map of conversation states by call ID
    this.transcriptionBuffer = new Map(); // Buffer for continuous transcription
    
    // Configure interruption handler for real-time interruptions with 2-second latency
    interruptionHandler.configure({
      latencyMs: 2000, // 2-second latency for interruption detection
      sensitivityLevel: 0.7 // Higher sensitivity for credit card sales scenarios
    });
  }
  /**
   * Initialize WebSocket server for Twilio media streams
   * @param {http.Server} server - HTTP server instance
   */  initWebSocketServer(server) {
    // Create WebSocket server on /ws/twilio path with protocol-compliant settings
    // These settings are critical to prevent WebSocket Protocol Error (31924)
    const wss = new WebSocket.Server({ 
      server,
      path: '/ws/twilio',
      perMessageDeflate: false,        // Disable compression which can cause frame issues
      skipUTF8Validation: true,        // Skip UTF-8 validation for binary audio data
      fragmentOutgoingMessages: false, // CRITICAL: Prevent frame fragmentation that causes Error 31924
      maxPayload: 65536                // Set appropriate payload size (64KB)
    });

    logger.info('Protocol-fixed WebSocket server initialized for Twilio media streams');// Setup connection handler
    wss.on('connection', (ws, req) => {
      try {
        logger.info(`WebSocket connection attempt from ${req.socket.remoteAddress}`);
        
        // For Twilio WebSocket connections, call parameters come in the initial message
        // We'll set up a temporary handler to get the connection info
        let callId = null;
        let isInitialized = false;
        
        // Set up WebSocket properties
        ws.isAlive = true;
          // Handle incoming WebSocket messages
        ws.on('message', async (message) => {
          try {
            if (!isInitialized) {
              // First message should contain connection info from Twilio
              const data = JSON.parse(message.toString());
              
              if (data.event === 'connected' && data.protocol) {
                // This is Twilio's initial connection message
                logger.info('Twilio WebSocket connection established');
                // Don't send confirmation yet - let _handleWebSocketMessage handle it
                isInitialized = true;
                await this._handleWebSocketMessage(ws, message);
                return;
              }
              
              if (data.event === 'start') {
                // Extract call ID from Twilio's start message or custom parameters
                callId = data.customParameters?.callId || 
                        data.start?.customParameters?.callId || 
                        data.start?.streamSid || 
                        'unknown';
                logger.info(`WebSocket stream started for call ${callId}`);
                
                // Store WebSocket connection
                ws.callId = callId;
                this.webSockets.set(callId, ws);
                
                // Create new audio stream if it doesn't exist
                if (!this.audioStreams.has(callId)) {
                  const audioStream = new AudioStream(callId);
                  this.audioStreams.set(callId, audioStream);
                  
                  // Set up audio stream event handlers
                  this._setupAudioStreamHandlers(audioStream, callId);
                }
                
                isInitialized = true;
                // Handle the start message
                await this._handleWebSocketMessage(ws, message);
                return;
              }
            }
            
            // Handle regular WebSocket messages
            if (callId) {
              await this._handleWebSocketMessage(ws, message);
            }
          } catch (error) {
            logger.error(`Error handling WebSocket message:`, error);
          }
        });
        // Set up ping/pong for connection health
        ws.on('pong', () => {
          ws.isAlive = true;
        });
        
        // Handle WebSocket close
        ws.on('close', () => {
          if (callId) {
            logger.info(`WebSocket closed for call ${callId}`);
            this._cleanupCall(callId);
          } else {
            logger.info('WebSocket closed before call ID was established');
          }
        });
          // Handle WebSocket errors
        ws.on('error', (error) => {
          if (callId) {
            logger.error(`WebSocket error for call ${callId}:`, error);
            this._cleanupCall(callId);
          } else {
            logger.error('WebSocket error before call ID was established:', error);
          }
        });
        
      } catch (error) {
        logger.error('Error handling WebSocket connection:', error);
        ws.close(1011, 'Server error');
      }
    });
    
    // Set up ping interval to keep connections alive
    const pingInterval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.warn(`Terminating dead WebSocket connection for call ${ws.callId}`);
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
    
    // Clean up interval on server close
    wss.on('close', () => {
      clearInterval(pingInterval);
    });
  }
    /**
   * Set up event handlers for audio stream
   * @param {AudioStream} audioStream - Audio stream instance
   * @param {string} callId - Call identifier
   */
  _setupAudioStreamHandlers(audioStream, callId) {
    // Handle language detection
    audioStream.on('languageDetected', (data) => {
      logger.info(`Language detected for call ${callId}: ${data.language}`);
      this._updateCallState(callId, { detectedLanguage: data.language });
      
      // Notify client of language change
      this._sendWebSocketMessage(callId, {
        type: 'languageUpdate',
        language: data.language
      });
    });
    
    // Handle speech detection with enhanced interruption handling
    audioStream.on('speechDetected', (data) => {
      logger.debug(`Speech detected for call ${callId}: ${data.speaking}`);
      
      // Update interruption handler with speaking status
      const interruptionDetected = interruptionHandler.processAudioSegment(
        callId,
        data,
        data.speaking
      );
      
      // Update AI speaking status in interruption handler
      interruptionHandler.updateAiSpeakingStatus(
        callId, 
        this._isAiSpeaking(callId)
      );
      
      if (data.speaking) {
        // User started speaking - handle interruption if AI is currently speaking
        if (this._isAiSpeaking(callId) && interruptionDetected) {
          this._handleUserInterruption(callId);
          
          // Update call analytics for interruption
          this._updateCallInterruptionAnalytics(callId);
        }
      }
    });
    
    // Handle transcription with credit card sales specific analysis
    audioStream.on('transcription', (data) => {
      logger.info(`Transcription for call ${callId}: ${data.text}`);
      
      // Add to transcription buffer
      this._addToTranscriptionBuffer(callId, {
        text: data.text,
        speaker: 'Customer',
        timestamp: Date.now()
      });
      
      // Notify client of transcription
      this._sendWebSocketMessage(callId, {
        type: 'transcription',
        text: data.text,
        speaker: 'Customer',
        language: data.language || 'en-US'
      });
      
      // Credit card sales specific analysis
      this._analyzeCreditCardSalesResponse(callId, data.text);
      
      // Check if user is speaking before processing message
      if (!interruptionHandler.shouldWaitBeforeSpeaking(callId)) {
        // Process customer message
        this._processCustomerMessage(callId, data.text, data.language || 'en-US');
      } else {
        // Mark AI as waiting to speak
        interruptionHandler.markWaitingToSpeak(callId);
        
        // Schedule retry after brief delay
        setTimeout(() => {
          if (interruptionHandler.shouldWaitBeforeSpeaking(callId)) {
            logger.debug(`Still waiting for customer to finish speaking on call ${callId}`);
          } else {
            logger.debug(`Customer finished speaking on call ${callId}, processing message`);
            this._processCustomerMessage(callId, data.text, data.language || 'en-US');
          }
        }, 1500); // 1.5 second delay
      }
    });
  }
  
  /**
   * Analyze customer response for credit card sales metrics
   * @param {string} callId - Call identifier
   * @param {string} text - Customer response text
   * @private
   */
  _analyzeCreditCardSalesResponse(callId, text) {
    try {
      const callState = this.activeCalls.get(callId);
      const conversationState = this.conversationStates.get(callId);
      if (!callState || !conversationState) return;
      
      const context = conversationState.context;
      const lowerText = text.toLowerCase();
      
      // Simple keyword analysis for interest level
      const interestKeywords = {
        high: ['interested', 'sounds good', 'tell me more', 'benefits', 'advantage', 'sign up', 'apply', 'get started'],
        medium: ['maybe', 'might be', 'consider', 'think about', 'how much', 'compare', 'feature', 'offer'],
        low: ['not interested', 'no thanks', 'too expensive', 'high fee', 'later', 'not now', 'already have']
      };
      
      // Objection keywords
      const objectionTypes = {
        fees: ['annual fee', 'yearly fee', 'how much is the fee', 'expensive fee'],
        interest: ['interest rate', 'apr', 'interest too high'],
        approval: ['will i qualify', 'credit score', 'get approved', 'qualify'],
        alternatives: ['other card', 'different option', 'better offer', 'compare']
      };
      
      // Check for interest level
      let foundInterestLevel = null;
      for (const [level, keywords] of Object.entries(interestKeywords)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
          foundInterestLevel = level;
          break;
        }
      }
      
      if (foundInterestLevel) {
        context.customerInterest = foundInterestLevel;
        if (foundInterestLevel === 'high') {
          context.leadQuality = 'hot';
        } else if (foundInterestLevel === 'medium') {
          context.leadQuality = 'warm';
        } else {
          context.leadQuality = 'cold';
        }
      }
      
      // Check for objections
      for (const [objectionType, keywords] of Object.entries(objectionTypes)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
          if (!context.objections.includes(objectionType)) {
            context.objections.push(objectionType);
          }
        }
      }
      
      // Check for application interest
      if (/apply|sign|start application|get card|proceed/i.test(lowerText)) {
        context.applicationInterest = true;
      }
      
      // Update call in database with sales metrics
      Call.findByIdAndUpdate(callId, {
        $set: {
          customerInterest: context.customerInterest || 'unknown',
          leadQuality: context.leadQuality || 'unknown',
          objections: context.objections,
          applicationStarted: context.applicationInterest === true
        }
      }).catch(err => {
        logger.error(`Error updating call sales metrics for call ${callId}:`, err);
      });
      
    } catch (error) {
      logger.error(`Error analyzing credit card sales response for call ${callId}:`, error);
    }
  }
  
  /**
   * Update call analytics for interruption
   * @param {string} callId - Call identifier
   * @private
   */
  _updateCallInterruptionAnalytics(callId) {
    try {
      const stats = interruptionHandler.getStatistics(callId);
      if (!stats) return;
      
      // Update call in database with interruption statistics
      Call.findByIdAndUpdate(callId, {
        $set: {
          interruptionCount: stats.interruptionCount
        },
        $push: {
          events: {
            type: 'interruption',
            timestamp: Date.now()
          }
        }
      }).catch(err => {
        logger.error(`Error updating call interruption analytics for ${callId}:`, err);
      });
      
    } catch (error) {
      logger.error(`Error updating call interruption analytics for ${callId}:`, error);
    }
  }
    /**
   * Handle incoming WebSocket message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer|String} message - Message data
   */
  async _handleWebSocketMessage(ws, message) {
    const callId = ws.callId;
    
    // Handle binary audio data
    if (Buffer.isBuffer(message)) {
      // Push to audio stream for processing
      const audioStream = this.audioStreams.get(callId);
      if (audioStream && audioStream.active) {
        audioStream.input.push(message);
      }
      return;
    }
    
    // Handle Twilio WebSocket messages
    try {
      const data = JSON.parse(message.toString());
      
      // Handle Twilio event-based messages
      switch (data.event) {        case 'connected':
          logger.info(`Twilio WebSocket connected for call ${callId}`);
          // Twilio doesn't expect a response to connected event
          break;
          
        case 'start':
          logger.info(`Media stream started for call ${callId}`, data.start);
          // Extract stream information
          ws.streamSid = data.start?.streamSid;
          ws.callSid = data.start?.callSid;
          
          // Don't send response to start event - just acknowledge internally
          logger.info(`Stream started - SID: ${ws.streamSid}, CallSID: ${ws.callSid}`);
          break;
          
        case 'media':
          // Handle incoming audio data from Twilio
          if (data.media?.payload) {
            const audioBuffer = Buffer.from(data.media.payload, 'base64');
            const audioStream = this.audioStreams.get(callId);
            if (audioStream && audioStream.active) {
              audioStream.input.push(audioBuffer);
            }
          }
          break;
          
        case 'mark':
          logger.info(`Mark event received for call ${callId}:`, data.mark);
          break;
          
        case 'stop':
          logger.info(`Media stream stopped for call ${callId}`);
          this._stopCallAudio(callId);
          break;
          
        default:
          // Handle custom control messages (non-Twilio)
          switch (data.type) {
            case 'init':
              await this.initializeCall(callId, data.config);
              break;
              
            case 'transferToHuman':
              this._transferToHuman(callId);
              break;
              
            default:
              logger.warn(`Unknown message for call ${callId}:`, data);
          }
      }
    } catch (error) {
      logger.error(`Error parsing message for call ${callId}:`, error);
    }
  }
    /**
   * Initialize a new call session
   * @param {string} callId - Call identifier
   * @param {Object} config - Call configuration
   */
  async initializeCall(callId, config) {
    try {
      logger.info(`Initializing call ${callId} with config:`, config);
      
      // Get script and prompt from database
      let scriptContent = "You are a credit card sales agent. Be polite and professional.";
      let promptContent = "You are a helpful AI assistant for credit card sales.";
      let scriptData = null;
      
      if (config.scriptId) {
        const script = await Script.findById(config.scriptId);
        if (script) {
          scriptContent = script.content;
          scriptData = script;
        }
      }
      
      if (config.promptId) {
        const prompt = await Prompt.findById(config.promptId);
        if (prompt) {
          promptContent = prompt.content;
        }
      }
      
      // Get call data if it exists
      const callData = await Call.findById(callId);
      const cardType = callData?.cardType || 'premium';
      
      // Create call state
      const callState = {
        id: callId,
        phoneNumber: config.phoneNumber,
        scriptContent,
        scriptData,
        promptContent,
        language: config.language || 'english',
        ttsProvider: config.ttsProvider || 'openai_fm',
        sttProvider: config.sttProvider || 'deepgram',
        llmProvider: config.llmProvider || 'openai',
        voiceId: config.voiceId || null,
        cardType,
        enableInterruptions: config.enableInterruptions !== false,
        recordCall: config.recordCall !== false,
        startTime: Date.now(),
        status: 'active'
      };
        // Store call state
      this.activeCalls.set(callId, callState);
      
      // Initialize conversation state with credit card sales specific context
      this.conversationStates.set(callId, {
        history: [],
        context: {
          topics: new Set(),
          customerPreferences: {},
          emotionalState: 'neutral',
          cardType,
          leadQuality: 'unknown',
          customerInterest: 'unknown',
          objections: []
        }
      });
      
      // Initialize VAD service with the STT provider
      try {
        const vadServiceAdapter = require('./vadServiceAdapter');
        vadServiceAdapter.setSTTProvider(callId, callState.sttProvider);
        logger.info(`Set STT provider for call ${callId} to ${callState.sttProvider}`);
      } catch (error) {
        logger.error(`Error setting STT provider for call ${callId}: ${error.message}`);
      }
      
      // Initialize interruption handler for this call
      interruptionHandler.initializeCall(callId);
      
      // Start the conversation with introduction
      await this._startConversation(callId);
      
      return true;
    } catch (error) {
      logger.error(`Error initializing call ${callId}:`, error);
      return false;
    }
  }
  
  /**
   * Start the conversation with an introduction
   * @param {string} callId - Call identifier
   */
  async _startConversation(callId) {
    try {
      const callState = this.activeCalls.get(callId);
      if (!callState) return;
      
      // Generate introduction based on script
      const introMessage = await this._generateAIResponse(callId, null, true);
      
      // Convert to speech and send to customer
      await this._speakAIResponse(callId, introMessage, callState.language);
    } catch (error) {
      logger.error(`Error starting conversation for call ${callId}:`, error);
    }
  }
  
  /**
   * Process customer message and generate response
   * @param {string} callId - Call identifier
   * @param {string} message - Customer message
   * @param {string} language - Detected language
   */
  async _processCustomerMessage(callId, message, language) {
    try {
      const callState = this.activeCalls.get(callId);
      if (!callState) return;
      
      // Update conversation history
      this._addToTranscriptionBuffer(callId, {
        text: message,
        speaker: 'Customer',
        timestamp: Date.now()
      });
      
      // Generate AI response
      const response = await this._generateAIResponse(callId, message);
      
      // Convert to speech and send to customer
      await this._speakAIResponse(callId, response, language);
    } catch (error) {
      logger.error(`Error processing customer message for call ${callId}:`, error);
    }
  }
  
  /**
   * Generate AI response based on conversation history
   * @param {string} callId - Call identifier
   * @param {string|null} lastCustomerMessage - Last customer message
   * @param {boolean} isIntro - Whether this is the introduction
   * @returns {string} AI response
   */
  async _generateAIResponse(callId, lastCustomerMessage, isIntro = false) {
    const callState = this.activeCalls.get(callId);
    const conversationState = this.conversationStates.get(callId);
    
    if (!callState || !conversationState) {
      return "I'm sorry, I'm having trouble with this call. Please try again later.";
    }
    
    try {
      // Get conversation history
      const history = this._getTranscriptionBuffer(callId);
        // Generate response based on LLM provider
      if (callState.llmProvider === 'gemini') {
        try {
          // Use Gemini API if available
          const geminiService = require('../services/geminiService');
          return await geminiService.generateResponse(
            history, 
            callState.scriptContent,
            callState.promptContent,
            callState.language,
            callId,
            isIntro
          );
        } catch (geminiError) {
          logger.error(`Error using Gemini API: ${geminiError.message}. Falling back to OpenAI.`);
          // Fall back to OpenAI if there's an error with Gemini
          return await openaiService.generateResponse(
            history,
            callState.scriptContent,
            callState.promptContent,
            callState.language,
            callId,
            isIntro
          );
        }
      } else {
        // Default to OpenAI (including when llmProvider is explicitly 'openai')
        return await openaiService.generateResponse(
          history,
          callState.scriptContent,
          callState.promptContent,
          callState.language,
          callId,
          isIntro
        );
      }
    } catch (error) {
      logger.error(`Error generating AI response for call ${callId}:`, error);
      return "I apologize for the technical difficulty. Let me get back to your question.";
    }
  }
  
  /**
   * Convert AI response to speech and send to customer
   * @param {string} callId - Call identifier
   * @param {string} text - Text to speak
   * @param {string} language - Language of text
   */
  async _speakAIResponse(callId, text, language) {
    try {
      const callState = this.activeCalls.get(callId);
      if (!callState) return;
      
      // Add to transcription buffer
      this._addToTranscriptionBuffer(callId, {
        text,
        speaker: 'Agent',
        timestamp: Date.now()
      });
      
      // Notify client of AI message
      this._sendWebSocketMessage(callId, {
        type: 'transcription',
        text,
        speaker: 'Agent',
        language
      });
      
      // Set AI as speaking
      this._updateCallState(callId, { aiSpeaking: true });
        // Generate audio based on TTS provider
      let audioStream;
      
      try {
        if (callState.ttsProvider === 'openai_fm' || callState.ttsProvider === 'chatgpt') {
          // Use OpenAI for TTS
          let openaiVoice = callState.voiceId || 'alloy';
          
          // If a voice wasn't explicitly selected, choose appropriate voice based on language
          if (!callState.voiceId) {
            openaiVoice = language.startsWith('hi') ? 'nova' : 
                          language.startsWith('es') ? 'alloy' : 'alloy';
          }
          
          audioStream = await openaiService.textToSpeechStream(text, openaiVoice);
          
        } else if (callState.ttsProvider === 'elevenlabs') {
          // Use ElevenLabs for TTS
          audioStream = await elevenlabsService.synthesizeSpeech(text, callState.voiceId);
          
        } else if (callState.ttsProvider === 'rime') {
          // Use Rime TTS
          const rimeTtsService = require('../services/rimeTtsService');
          audioStream = await rimeTtsService.synthesizeSpeech(text, callState.voiceId);
          
        } else {
          // Fallback to OpenAI if the specified provider isn't supported
          logger.warn(`Unsupported TTS provider ${callState.ttsProvider}, falling back to OpenAI FM`);
          const openaiVoice = language.startsWith('hi') ? 'nova' : 'alloy';
          audioStream = await openaiService.textToSpeechStream(text, openaiVoice);
        }
      } catch (ttsError) {
        // If the selected provider fails, fallback to OpenAI
        logger.error(`Error with TTS provider ${callState.ttsProvider}: ${ttsError.message}. Falling back to OpenAI FM.`);
        
        try {
          const openaiVoice = language.startsWith('hi') ? 'nova' : 'alloy';
          audioStream = await openaiService.textToSpeechStream(text, openaiVoice);
        } catch (fallbackError) {
          logger.error(`Fallback to OpenAI FM failed: ${fallbackError.message}`);
          throw new Error(`TTS generation failed with both ${callState.ttsProvider} and fallback: ${fallbackError.message}`);
        }
      }
        // Send audio to WebSocket
      const ws = this.webSockets.get(callId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        audioStream.on('data', (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            // Use the proper Twilio protocol function
            this._sendAudioToTwilio(callId, chunk);
          }
        });
        
        audioStream.on('end', () => {
          // Set AI as no longer speaking
          this._updateCallState(callId, { aiSpeaking: false });
        });
      }
    } catch (error) {
      logger.error(`Error speaking AI response for call ${callId}:`, error);
      this._updateCallState(callId, { aiSpeaking: false });
    }
  }
    /**
   * Handle user interruption during AI speech with 2-second latency
   * @param {string} callId - Call identifier
   */
  _handleUserInterruption(callId) {
    try {
      const callState = this.activeCalls.get(callId);
      if (!callState || !callState.enableInterruptions) return;
      
      logger.info(`User interrupted call ${callId} - handling with 2-second latency`);
      
      // Stop current AI speech
      this._stopCallAudio(callId);
      
      // Update call state
      this._updateCallState(callId, { 
        aiSpeaking: false,
        wasInterrupted: true,
        lastInterruptionTime: Date.now()
      });
      
      // For credit card sales, we need to be more responsive to interruptions
      if (callState.cardType) {
        logger.info(`Credit card sales call interrupted - analyzing customer engagement`);
        
        // Get conversation state to check topics and objections
        const conversationState = this.conversationStates.get(callId);
        if (conversationState) {
          // Increment interruption counter in context
          conversationState.context.interruptionCount = 
            (conversationState.context.interruptionCount || 0) + 1;
          
          // If customer has interrupted multiple times, they might be impatient
          if (conversationState.context.interruptionCount > 2) {
            conversationState.context.customerPatienceLevel = 'low';
          }
        }
      }
      
      // Notify client of interruption
      this._sendWebSocketMessage(callId, {
        type: 'interrupted',
        timestamp: Date.now(),
        cardType: callState.cardType
      });
    } catch (error) {
      logger.error(`Error handling user interruption for call ${callId}:`, error);
    }
  }
  
  /**
   * Stop all audio output for a call
   * @param {string} callId - Call identifier
   */
  _stopCallAudio(callId) {
    try {
      const audioStream = this.audioStreams.get(callId);
      if (audioStream) {
        audioStream.stopSpeaking();
      }
      
      this._updateCallState(callId, { aiSpeaking: false });
    } catch (error) {
      logger.error(`Error stopping call audio for call ${callId}:`, error);
    }
  }
    /**
   * Send message to client via WebSocket
   * @param {string} callId - Call identifier
   * @param {Object} message - Message to send
   */
  _sendWebSocketMessage(callId, message) {
    try {
      const ws = this.webSockets.get(callId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error(`Error sending WebSocket message for call ${callId}:`, error);
    }
  }
  /**
   * Send audio data to Twilio via WebSocket (using correct Twilio protocol)
   * @param {string} callId - Call identifier
   * @param {Buffer} audioBuffer - Audio data to send
   */
  _sendAudioToTwilio(callId, audioBuffer) {
    try {
      const ws = this.webSockets.get(callId);
      if (ws && ws.readyState === WebSocket.OPEN && ws.streamSid) {
        const message = {
          event: 'media',
          streamSid: ws.streamSid,
          media: {
            track: 'outbound',
            chunk: String(Date.now()),
            timestamp: String(Date.now()),
            payload: audioBuffer.toString('base64')
          }
        };
        ws.send(JSON.stringify(message));
        logger.debug(`Sent audio chunk to Twilio for call ${callId}`, {
          streamSid: ws.streamSid,
          payloadSize: audioBuffer.length
        });
      } else {
        logger.warn(`Cannot send audio to Twilio for call ${callId}`, {
          hasWebSocket: !!ws,
          wsState: ws?.readyState,
          hasStreamSid: !!ws?.streamSid
        });
      }
    } catch (error) {
      logger.error(`Error sending audio to Twilio for call ${callId}:`, error);
    }
  }
  
  /**
   * Add message to transcription buffer
   * @param {string} callId - Call identifier
   * @param {Object} message - Message object
   */
  _addToTranscriptionBuffer(callId, message) {
    let buffer = this.transcriptionBuffer.get(callId) || [];
    buffer.push(message);
    this.transcriptionBuffer.set(callId, buffer);
    
    // Update call in database
    this._updateCallInDatabase(callId);
  }
  
  /**
   * Get transcription buffer for call
   * @param {string} callId - Call identifier
   * @returns {Array} Transcription buffer
   */
  _getTranscriptionBuffer(callId) {
    return this.transcriptionBuffer.get(callId) || [];
  }
  
  /**
   * Check if AI is currently speaking
   * @param {string} callId - Call identifier
   * @returns {boolean} Whether AI is speaking
   */
  _isAiSpeaking(callId) {
    const callState = this.activeCalls.get(callId);
    return callState ? callState.aiSpeaking : false;
  }
  
  /**
   * Update call state
   * @param {string} callId - Call identifier
   * @param {Object} update - State update
   */
  _updateCallState(callId, update) {
    const callState = this.activeCalls.get(callId);
    if (callState) {
      Object.assign(callState, update);
    }
  }
  
  /**
   * Update call in database
   * @param {string} callId - Call identifier
   */
  async _updateCallInDatabase(callId) {
    try {
      const transcripts = this._getTranscriptionBuffer(callId);
      
      await Call.findByIdAndUpdate(callId, {
        $set: {
          transcript: transcripts,
          lastActivity: new Date()
        }
      });
    } catch (error) {
      logger.error(`Error updating call in database for call ${callId}:`, error);
    }
  }
  
  /**
   * Handle transfer to human agent
   * @param {string} callId - Call identifier
   */
  _transferToHuman(callId) {
    try {
      // This would integrate with your CRM or call center system
      logger.info(`Transfer to human requested for call ${callId}`);
      
      // For now, just notify client
      this._sendWebSocketMessage(callId, {
        type: 'transferToHuman'
      });
    } catch (error) {
      logger.error(`Error transferring to human for call ${callId}:`, error);
    }
  }
    /**
   * Clean up call resources
   * @param {string} callId - Call identifier
   */
  _cleanupCall(callId) {
    try {
      // Close and remove WebSocket
      const ws = this.webSockets.get(callId);
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
      this.webSockets.delete(callId);
      
      // Clean up audio stream
      const audioStream = this.audioStreams.get(callId);
      if (audioStream) {
        audioStream.destroy();
      }
      this.audioStreams.delete(callId);
      
      // Get conversation state for final analysis
      const callState = this.activeCalls.get(callId);
      const conversationState = this.conversationStates.get(callId);
      const transcripts = this._getTranscriptionBuffer(callId);
      
      // For credit card sales calls, summarize the outcome
      let outcome = 'completed';
      let leadQuality = 'unknown';
      let customerInterest = 'unknown';
      let applicationStarted = false;
      
      if (conversationState && conversationState.context) {
        leadQuality = conversationState.context.leadQuality || 'unknown';
        customerInterest = conversationState.context.customerInterest || 'unknown';
        applicationStarted = conversationState.context.applicationInterest === true;
        
        // Determine outcome based on context
        if (customerInterest === 'high' && applicationStarted) {
          outcome = 'application_started';
        } else if (customerInterest === 'high' || customerInterest === 'medium') {
          outcome = 'interested';
        } else if (customerInterest === 'low') {
          outcome = 'not_interested';
        }
      }
      
      // Calculate call duration
      const startTime = callState ? callState.startTime : Date.now() - 60000;
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000); // in seconds
      
      // Clean up interruption handler resources
      interruptionHandler.cleanupCall(callId);
      
      // Update call status in database to completed with final analytics
      Call.findByIdAndUpdate(callId, {
        $set: {
          status: 'completed',
          endTime: endTime,
          duration: duration,
          outcome: outcome,
          leadQuality: leadQuality,
          customerInterest: customerInterest,
          applicationStarted: applicationStarted,
          transcript: transcripts,
          conversationHistory: transcripts.map(item => ({
            speaker: item.speaker === 'Customer' ? 'Customer' : 'AI',
            text: item.text,
            timestamp: item.timestamp,
            language: item.language || 'english'
          }))
        }
      }).catch((error) => {
        logger.error(`Error updating call status for ${callId}:`, error);
      });
      
      // Clean up other resources
      this.activeCalls.delete(callId);
      this.conversationStates.delete(callId);
      this.transcriptionBuffer.delete(callId);
      
      logger.info(`Call ${callId} cleaned up successfully with outcome: ${outcome}`);
    } catch (error) {
      logger.error(`Error cleaning up call ${callId}:`, error);
    }
  }
}

// Create singleton instance
const callCoordinator = new CallCoordinator();
module.exports = {
  callCoordinator,
  /**
   * Start immediate audio response to prevent silent calls
   */
  async _startImmediateResponse(callId) {
    try {
      const callState = this.activeCalls.get(callId);
      if (!callState) {
        // Create basic call state
        await this.initializeCall(callId, {
          language: 'en-US',
          ttsProvider: 'openai_fm',
          sttProvider: 'deepgram',
          llmProvider: 'openai'
        });
      }
      
      // Generate and speak greeting immediately
      const greeting = await this._generateAIResponse(callId, null, true);
      await this._speakAIResponse(callId, greeting, 'en-US');
      
      logger.info(`Immediate audio response started for call ${callId}`);
      
    } catch (error) {
      logger.error(`Error starting immediate response for call ${callId}:`, error);
    }
  }
};
