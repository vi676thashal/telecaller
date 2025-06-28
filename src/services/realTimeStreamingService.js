/**
 * Real-Time Streaming Service
 * 
 * Enhanced WebSocket handler for low-latency audio streaming between different providers
 * and the frontend. Supports interruptions, dynamic provider switching, and
 * buffer management for optimal audio delivery similar to vapi.ai and ElevenLabs.
 */

const WebSocket = require('ws');
const { Readable, PassThrough } = require('stream');
const { logger } = require('../utils/logger');
const { interruptionHandler } = require('./interruption-handler');
const voiceActivityDetectionService = require('./vadServiceAdapter');

// Voice provider services
const openAiFmService = require('./openAiFmService');
const elevenlabsService = require('./elevenlabsService');

// Buffer size constants
const CHUNK_SIZE = 640;            // 40ms of audio at 8kHz
const DEFAULT_BUFFER_SIZE = 8192;  // Default buffer size
const MAX_BUFFER_SIZE = 65536;     // Max buffer size (64KB)

// Stream health monitoring
const MAX_RETRY_ATTEMPTS = 3;      // Max number of retries for failed streams
const PROVIDER_TIMEOUT_MS = 2000;  // Switch providers if no data for 2 seconds

/**
 * Audio streaming session
 * Manages a single streaming session for a call
 */
class StreamingSession {  constructor(callId, options = {}) {
    // Identifiers
    this.callId = callId;
    this.sessionId = `${callId}-${Date.now()}`;
    
    // Stream state
    this.active = true;
    this.streaming = false;
    this.connected = false;
    this.userSpeaking = false;
    this.aiSpeaking = false;
    
    // Configuration
    this.format = options.format || 'mulaw';     // Audio format
    this.sampleRate = options.sampleRate || 8000; // Sample rate
    this.language = options.language || 'en-US'; // Language
    this.enableInterruptions = options.enableInterruptions !== false;
    this.bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
    
    // Provider settings - include the STT provider
    this.ttsProvider = options.ttsProvider || 'openai_fm';
    this.sttProvider = options.sttProvider || 'deepgram';
    this.llmProvider = options.llmProvider || 'openai';
    this.voiceId = options.voiceId || null; // Store the voice ID
    
    // Provider management
    this.currentProvider = null;
    this.preferredProviders = options.preferredProviders || ['openai_realtime', 'elevenlabs_streaming', 'openai_fm'];
    this.providerFailures = new Map();
    this.providerLatencies = new Map();
    
    // WebSocket connections
    this.clientWs = null;
    this.providerWs = null;
    
    // Streaming buffers - for flow control and gap prevention
    this.inputBuffer = [];  // Buffer for incoming audio from client
    this.outputBuffer = []; // Buffer for outgoing audio to client
    this.bufferFullness = 0;
    this.lastOutputTime = 0;
    this.consecutiveErrors = 0;
    
    // Create datestamp
    this.createdAt = new Date();
    
    logger.info(`[RealTimeStreaming] Created session ${this.sessionId} for call ${this.callId}`);
  }
  
  /**
   * Register client WebSocket connection
   * @param {WebSocket} ws - WebSocket connection from client
   */
  registerClientWebSocket(ws) {
    this.clientWs = ws;
    this.connected = true;
    
    logger.info(`[RealTimeStreaming] Client WebSocket registered for session ${this.sessionId}`);
    
    // Setup event handlers
    ws.on('message', (data) => this.handleClientMessage(data));
    
    ws.on('close', () => {
      logger.info(`[RealTimeStreaming] Client WebSocket closed for session ${this.sessionId}`);
      this.connected = false;
      this.stopStreaming();
    });
    
    ws.on('error', (error) => {
      logger.error(`[RealTimeStreaming] Client WebSocket error: ${error.message}`);
      this.handleError('client_socket_error', error.message);
    });
    
    // Send initial configuration
    this.sendToClient({
      type: 'connected',
      sessionId: this.sessionId,
      format: this.format,
      sampleRate: this.sampleRate,
      enableInterruptions: this.enableInterruptions,
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle incoming message from client
   * @param {Buffer|String} data - Message data
   */
  handleClientMessage(data) {
    // Handle binary data (audio input)
    if (Buffer.isBuffer(data)) {
      this.processIncomingAudio(data);
      return;
    }
    
    // Handle JSON control messages
    try {
      const message = JSON.parse(data.toString());
      this.processControlMessage(message);
    } catch (error) {
      logger.error(`[RealTimeStreaming] Error parsing client message: ${error.message}`);
    }
  }
  
  /**
   * Process incoming audio data from client
   * @param {Buffer} audioData - Raw audio data
   */
  processIncomingAudio(audioData) {
    // Update user speaking state based on audio activity
    const hasActivity = voiceActivityDetectionService.detectActivity(audioData);
    
    if (hasActivity !== this.userSpeaking) {
      this.userSpeaking = hasActivity;
      
      // If user started speaking and we're streaming, handle interruption
      if (hasActivity && this.streaming && this.enableInterruptions) {
        this.handleInterruption();
      }
    }
    
    // Add to input buffer
    this.inputBuffer.push(audioData);
    
    // Keep buffer from growing too large
    if (this.inputBuffer.length > 20) {  // More than ~1 second of audio
      this.inputBuffer.shift();
    }
  }
  
  /**
   * Process control message from client
   * @param {Object} message - Control message
   */
  processControlMessage(message) {
    switch (message.type) {
      case 'config':
        // Update configuration
        this.updateConfiguration(message);
        break;
        
      case 'stream_init':
        // Initialize streaming for a call
        this.startStreamingSession(message);
        break;
        
      case 'stream_start':
        // Start streaming
        this.startStreaming(message.text, message.options);
        break;
        
      case 'stream_stop':
        // Stop streaming
        this.stopStreaming();
        break;
        
      case 'interruption':
        // Handle interruption
        this.handleInterruption();
        break;
        
      case 'ping':
        // Respond to ping
        this.sendToClient({ type: 'pong', timestamp: Date.now() });
        break;
        
      default:
        logger.debug(`[RealTimeStreaming] Unknown message type: ${message.type}`);
    }
  }
  
  /**
   * Update session configuration
   * @param {Object} configMessage - Configuration message
   */
  updateConfiguration(configMessage) {
    if (configMessage.audio) {
      // Update audio settings
      if (configMessage.audio.format) this.format = configMessage.audio.format;
      if (configMessage.audio.sampleRate) this.sampleRate = configMessage.audio.sampleRate;
      if (configMessage.audio.bufferSize) this.bufferSize = configMessage.audio.bufferSize;
      if (configMessage.audio.preferredProviders) {
        this.preferredProviders = configMessage.audio.preferredProviders;
      }
      if (typeof configMessage.audio.interruptions === 'boolean') {
        this.enableInterruptions = configMessage.audio.interruptions;
      }
    }
    
    logger.info(`[RealTimeStreaming] Updated configuration for session ${this.sessionId}`);
    
    // Acknowledge configuration update
    this.sendToClient({
      type: 'config_updated',
      config: {
        format: this.format,
        sampleRate: this.sampleRate,
        enableInterruptions: this.enableInterruptions,
        bufferSize: this.bufferSize
      }
    });
  }
  
  /**
   * Start streaming session for a call
   * @param {Object} message - Stream initialization message
   */
  startStreamingSession(message) {
    const { callId, options = {} } = message;
    
    // Update settings
    if (options.language) this.language = options.language;
    if (options.format) this.format = options.format;
    if (options.sampleRate) this.sampleRate = options.sampleRate;
    if (options.enableInterruptions !== undefined) {
      this.enableInterruptions = options.enableInterruptions;
    }
    
    logger.info(`[RealTimeStreaming] Initializing stream for call ${callId} with language ${this.language}`);
    
    // Initialize interruption handler
    interruptionHandler.initializeCall(callId);
    
    // Confirm stream initialization
    this.sendToClient({
      type: 'stream_initialized',
      callId,
      sessionId: this.sessionId
    });
  }
    /**
   * Start streaming audio
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Streaming options
   */
  async startStreaming(text, options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return this.handleError('invalid_text', 'No valid text provided for streaming');
    }
    
    this.streaming = true;
    
    // Clear existing buffers
    this.outputBuffer = [];
    this.bufferFullness = 0;
    this.lastOutputTime = Date.now();
    this.consecutiveErrors = 0;
    
    // Use the session's TTS provider if not specified in options
    if (!options.ttsProvider && this.ttsProvider) {
      options.ttsProvider = this.ttsProvider;
      logger.info(`[RealTimeStreaming] Using session TTS provider: ${this.ttsProvider}`);
    }
    
    // Use the session's voice ID if not specified in options
    if (!options.voiceId && this.voiceId) {
      options.voiceId = this.voiceId;
      logger.info(`[RealTimeStreaming] Using session voice ID: ${this.voiceId}`);
    }
    
    // Send audio_start event to client
    this.sendToClient({
      type: 'audio_start',
      streamId: this.sessionId,
      provider: options.ttsProvider || options.provider || this.preferredProviders[0],
      format: this.format,
      timestamp: Date.now()
    });
    
    // Start streaming audio asynchronously
    this.streamAudioFromProvider(text, options)
      .catch(error => {
        logger.error(`[RealTimeStreaming] Error starting audio stream: ${error.message}`);
        this.handleError('stream_start_failed', error.message);
      });
  }
    /**
   * Stream audio from the optimal provider
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Provider-specific options
   */
  async streamAudioFromProvider(text, options = {}) {
    // Track providers we've tried in this request
    const triedProviders = new Set();
    
    // Use the selected TTS provider if specified in options
    let providersToTry = [...this.preferredProviders]; // Default order
    
    // If a specific TTS provider is provided in options, prioritize it
    if (options.ttsProvider) {
      // Map TTS provider name to streaming provider names
      const providerMapping = {
        'openai_fm': 'openai_fm',
        'openai': 'openai_fm',
        'chatgpt': 'openai_fm',
        'elevenlabs': 'elevenlabs_streaming',
        'rime': 'openai_fm' // Fallback to OpenAI FM for Rime since no direct streaming support
      };
      
      const mappedProvider = providerMapping[options.ttsProvider] || options.ttsProvider;
      logger.info(`[RealTimeStreaming] Using selected TTS provider: ${options.ttsProvider} (mapped to: ${mappedProvider})`);
      
      // Move the selected provider to the front of the array
      providersToTry = providersToTry.filter(p => p !== mappedProvider);
      providersToTry.unshift(mappedProvider);
    }
    
    // Try providers in order of preference (with selected provider first if specified)
    for (const provider of providersToTry) {
      // Skip if we've tried this provider already for this request
      if (triedProviders.has(provider)) continue;
      triedProviders.add(provider);
      
      // Skip if this provider has failed too many times
      if (this.providerFailures.get(provider) >= MAX_RETRY_ATTEMPTS) {
        logger.warn(`[RealTimeStreaming] Skipping provider ${provider} due to too many failures`);
        continue;
      }
      
      try {
        // Set current provider
        this.currentProvider = provider;
        
        // Start timer for latency measurement
        const startTime = Date.now();
        
        // Choose provider method based on provider type
        switch (provider) {
          case 'openai_realtime':
            await this.streamFromOpenAIRealtime(text, options);
            break;
            
          case 'openai_fm':
            await this.streamFromOpenAIFm(text, options);
            break;
            
          case 'elevenlabs_streaming':
            await this.streamFromElevenLabs(text, options);
            break;
            
          default:
            // Try next provider
            continue;
        }
        
        // Record latency on success
        const latencyMs = Date.now() - startTime;
        this.providerLatencies.set(provider, latencyMs);
        
        // Reset failures for this provider
        this.providerFailures.set(provider, 0);
        
        // Streaming has started successfully with this provider
        return;
        
      } catch (error) {
        // Increment failure count for this provider
        const failures = this.providerFailures.get(provider) || 0;
        this.providerFailures.set(provider, failures + 1);
        
        logger.error(`[RealTimeStreaming] Provider ${provider} error: ${error.message}`);
        
        // Try next provider
      }
    }
    
    // All providers failed
    this.handleError('all_providers_failed', 'All audio providers failed');
    this.streaming = false;
    
    // Send audio_end event to client
    this.sendToClient({
      type: 'audio_end',
      streamId: this.sessionId,
      error: true,
      timestamp: Date.now()
    });
  }
  
  /**
   * Stream audio from OpenAI Realtime API (lowest latency)
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Provider options
   */
  async streamFromOpenAIRealtime(text, options = {}) {
    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Connect to OpenAI Realtime API via WebSocket
        const ws = new WebSocket('wss://api.openai.com/v1/audio/speech', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        // Set timeout for connection
        const connectionTimeout = setTimeout(() => {
          reject(new Error('Connection to OpenAI Realtime API timed out'));
          ws.close();
        }, PROVIDER_TIMEOUT_MS);
        
        // Store provider WebSocket
        this.providerWs = ws;
        
        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          
          // Send speech request
          ws.send(JSON.stringify({
            model: "tts-1",
            voice: options.voice || "alloy",
            input: text,
            response_format: "pcm",
            speed: options.speed || 1.0
          }));
        });
        
        ws.on('message', (data) => {
          // Process incoming audio chunks
          if (Buffer.isBuffer(data)) {
            // Convert PCM to format needed (mulaw for Twilio)
            const processedChunk = this.processAudioForClient(data, 'pcm');
            
            // Add to output buffer
            this.addToOutputBuffer(processedChunk);
          } else {
            // Handle control messages
            try {
              const message = JSON.parse(data.toString());
              if (message.error) {
                reject(new Error(`OpenAI API error: ${message.error.message}`));
              }
            } catch (e) {
              // Ignore parse errors for binary frames
            }
          }
        });
        
        ws.on('close', () => {
          clearTimeout(connectionTimeout);
          
          // End of stream - resolve the promise if we got any audio data
          if (this.outputBuffer.length > 0) {
            resolve();
          } else {
            reject(new Error('OpenAI Realtime stream closed without sending audio'));
          }
          
          // Send audio_end event if still streaming
          if (this.streaming) {
            this.finishStreaming();
          }
        });
        
        ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          reject(error);
          ws.close();
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Stream audio from OpenAI TTS API
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Provider options
   */
  async streamFromOpenAIFm(text, options = {}) {
    try {
      logger.info(`[RealTimeStreaming] Using OpenAI TTS for session ${this.sessionId}`);
      
      // Use provided voice ID or select based on options
      const voiceId = options.voiceId || 
                     (options.voice || 
                      (this.language && this.language.startsWith('hi') ? 'nova' : 'alloy'));
      
      logger.info(`[RealTimeStreaming] OpenAI TTS using voice: ${voiceId}`);
      
      // Start the stream from OpenAI TTS
      const stream = await openAiFmService.createTtsStream(
        text, 
        voiceId, 
        options.format || 'mp3'
      );
      
      // Process the stream
      stream.on('data', (chunk) => {
        if (!this.streaming) return;
        
        // Process audio for client
        const processedChunk = this.processAudioForClient(chunk, 'mp3');
        
        // Add to output buffer
        this.addToOutputBuffer(processedChunk);
      });
      
      stream.on('end', () => {
        // Finish streaming when the stream ends
        this.finishStreaming();
      });
      
      stream.on('error', (error) => {
        logger.error(`[RealTimeStreaming] OpenAI TTS stream error: ${error.message}`);
        throw error;
      });
      
      // Return immediately after setting up the stream
      return Promise.resolve();
      
    } catch (error) {
      logger.error(`[RealTimeStreaming] OpenAI TTS error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Stream audio from ElevenLabs streaming API
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Provider options
   */
  async streamFromElevenLabs(text, options = {}) {
    try {
      logger.info(`[RealTimeStreaming] Using ElevenLabs streaming for session ${this.sessionId}`);
      
      // Use provided voice ID or default
      const voiceId = options.voiceId || process.env.ELEVENLABS_DEFAULT_VOICE;
      
      logger.info(`[RealTimeStreaming] ElevenLabs using voice: ${voiceId}`);
      
      // Start the stream from ElevenLabs
      const stream = await elevenlabsService.streamTTS(
        text, 
        voiceId,
        options.optimize_streaming_latency || 4  // Higher value = lower latency
      );
      
      // Process the stream
      stream.on('data', (chunk) => {
        if (!this.streaming) return;
        
        // Process audio for client
        const processedChunk = this.processAudioForClient(chunk, 'mp3');
        
        // Add to output buffer
        this.addToOutputBuffer(processedChunk);
      });
      
      stream.on('end', () => {
        // Finish streaming when the stream ends
        this.finishStreaming();
      });
      
      stream.on('error', (error) => {
        logger.error(`[RealTimeStreaming] ElevenLabs stream error: ${error.message}`);
        throw error;
      });
      
      // Return immediately after setting up the stream
      return Promise.resolve();
      
    } catch (error) {
      logger.error(`[RealTimeStreaming] ElevenLabs error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Process audio data for client delivery
   * @param {Buffer} audioData - Raw audio data
   * @param {string} sourceFormat - Source audio format
   * @returns {Buffer} Processed audio data
   */
  processAudioForClient(audioData, sourceFormat) {
    // For now, we're just passing the data through
    // In a real implementation, convert between formats as needed
    return audioData;
  }
  
  /**
   * Add audio chunk to output buffer and send to client
   * @param {Buffer} chunk - Audio chunk
   */
  addToOutputBuffer(chunk) {
    // Add to output buffer
    this.outputBuffer.push(chunk);
    this.bufferFullness += chunk.length;
    this.lastOutputTime = Date.now();
    
    // Send to client
    this.sendNextChunk();
  }
  
  /**
   * Send next audio chunk to client
   */
  sendNextChunk() {
    if (!this.clientWs || this.clientWs.readyState !== WebSocket.OPEN || this.outputBuffer.length === 0) {
      return;
    }
    
    // Get next chunk
    const chunk = this.outputBuffer.shift();
    if (!chunk) return;
    
    // Update buffer fullness
    this.bufferFullness -= chunk.length;
    
    // Send to client
    try {
      this.clientWs.send(chunk);
      this.aiSpeaking = true;
    } catch (error) {
      logger.error(`[RealTimeStreaming] Error sending chunk to client: ${error.message}`);
      this.consecutiveErrors++;
      
      // If too many consecutive errors, stop streaming
      if (this.consecutiveErrors > MAX_RETRY_ATTEMPTS) {
        this.stopStreaming();
        this.handleError('send_failed', 'Too many consecutive send failures');
      }
    }
    
    // If buffer has more chunks, schedule sending the next one
    // This creates a steady stream of audio chunks to the client
    if (this.outputBuffer.length > 0) {
      // Schedule next chunk with a small delay to avoid overwhelming the client
      setTimeout(() => this.sendNextChunk(), 15);
    }
  }
  
  /**
   * Finish streaming and send audio_end event
   */
  finishStreaming() {
    if (!this.streaming) return;
    
    this.streaming = false;
    this.aiSpeaking = false;
    
    // Send audio_end event to client
    this.sendToClient({
      type: 'audio_end',
      streamId: this.sessionId,
      provider: this.currentProvider,
      timestamp: Date.now()
    });
  }
  
  /**
   * Stop streaming audio
   */
  stopStreaming() {
    if (!this.streaming) return;
    
    // Close provider WebSocket if active
    if (this.providerWs && this.providerWs.readyState === WebSocket.OPEN) {
      this.providerWs.close();
      this.providerWs = null;
    }
    
    // Clear buffers
    this.outputBuffer = [];
    this.bufferFullness = 0;
    
    // Update state
    this.finishStreaming();
  }
  
  /**
   * Handle interruption (user barge-in)
   */
  handleInterruption() {
    if (!this.streaming || !this.enableInterruptions) return;
    
    logger.info(`[RealTimeStreaming] Handling interruption for session ${this.sessionId}`);
    
    // Stop current streaming
    this.stopStreaming();
    
    // Send interruption event to client
    this.sendToClient({
      type: 'interruption',
      timestamp: Date.now(),
      source: 'user'
    });
  }
  
  /**
   * Handle error
   * @param {string} code - Error code
   * @param {string} message - Error message
   */
  handleError(code, message) {
    logger.error(`[RealTimeStreaming] Error (${code}): ${message}`);
    
    // Send error to client
    this.sendToClient({
      type: 'error',
      code,
      message,
      timestamp: Date.now()
    });
    
    // Increment error count
    this.consecutiveErrors++;
  }
  
  /**
   * Send JSON message to client
   * @param {Object} message - Message to send
   * @returns {boolean} Success status
   */
  sendToClient(message) {
    if (!this.clientWs || this.clientWs.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      this.clientWs.send(JSON.stringify(message));
      this.consecutiveErrors = 0; // Reset error count on successful send
      return true;
    } catch (error) {
      logger.error(`[RealTimeStreaming] Error sending to client: ${error.message}`);
      this.consecutiveErrors++;
      return false;
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Stop streaming
    this.stopStreaming();
    
    // Close WebSocket connections
    if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.close();
    }
    
    this.active = false;
  }
  
  /**
   * Get session metrics
   * @returns {Object} Session metrics
   */
  getMetrics() {
    return {
      sessionId: this.sessionId,
      callId: this.callId,
      active: this.active,
      streaming: this.streaming,
      connected: this.connected,
      userSpeaking: this.userSpeaking,
      aiSpeaking: this.aiSpeaking,
      currentProvider: this.currentProvider,
      bufferSize: this.bufferFullness,
      outputQueueLength: this.outputBuffer.length,
      providerLatencies: Object.fromEntries(this.providerLatencies),
      createdAt: this.createdAt,
      format: this.format,
      sampleRate: this.sampleRate,
      language: this.language,
      ttsProvider: this.ttsProvider,
      sttProvider: this.sttProvider,
      llmProvider: this.llmProvider,
      voiceId: this.voiceId
    };
  }
}

/**
 * Real-Time Streaming Service
 * Main service class for managing streaming sessions
 */
class RealTimeStreamingService {
  constructor() {
    this.sessions = new Map();
    this.callSessionMap = new Map();
    
    // Start maintenance interval
    this.startMaintenanceInterval();
    
    logger.info('[RealTimeStreamingService] Initialized');
  }
  
  /**
   * Initialize WebSocket server
   * @param {WebSocket.Server} wss - WebSocket server
   */
  initializeWebSocketServer(wss) {
    if (!wss) {
      throw new Error('WebSocket.Server instance is required');
    }
    
    wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
    
    logger.info('[RealTimeStreamingService] WebSocket server initialized');
  }
  
  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {http.IncomingMessage} req - HTTP request
   */
  handleConnection(ws, req) {
    // Parse URL to extract connection info
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    
    // Handle different connection types based on URL path
    if (pathParts[1] === 'stream') {
      // Streaming connection
      const callId = pathParts[2];
      
      if (!callId) {
        logger.error('[RealTimeStreamingService] No call ID provided in streaming connection');
        ws.close(4000, 'No call ID provided');
        return;
      }
      
      // Create session
      const session = this.createSession(callId, {
        format: 'mulaw',  // Default format for Twilio
        sampleRate: 8000, // Default sample rate for Twilio
        language: 'en-US' // Default language
      });
      
      // Register WebSocket with session
      session.registerClientWebSocket(ws);
      
    } else {
      // Unknown connection type
      logger.error(`[RealTimeStreamingService] Unknown connection type: ${req.url}`);
      ws.close(4000, 'Unknown connection type');
    }
  }
    /**
   * Create a streaming session
   * @param {string} callId - Call identifier
   * @param {Object} options - Session options
   * @returns {StreamingSession} The created session
   */
  createSession(callId, options = {}) {
    // Check if a session already exists for this call
    if (this.callSessionMap.has(callId)) {
      const existingSessionId = this.callSessionMap.get(callId);
      const existingSession = this.sessions.get(existingSessionId);
      
      if (existingSession && existingSession.active) {
        logger.info(`[RealTimeStreamingService] Returning existing session ${existingSessionId} for call ${callId}`);
        return existingSession;
      }
    }
    
    // Get call configuration from real-time call service
    let callConfig = {};
    try {
      const realTimeCallService = require('./realTimeCallService');
      callConfig = realTimeCallService.getCallConfig(callId) || {};
      
      // Merge call configuration with options
      if (callConfig.config) {
        options.ttsProvider = callConfig.config.ttsProvider || options.ttsProvider;
        options.sttProvider = callConfig.config.sttProvider || options.sttProvider;
        options.llmProvider = callConfig.config.llmProvider || options.llmProvider;
        options.language = callConfig.language || options.language;
      }
      
      // Store voice ID from call config if available
      if (callConfig.voiceId) {
        options.voiceId = callConfig.voiceId;
        logger.info(`[RealTimeStreamingService] Using voice ID from call config: ${callConfig.voiceId}`);
      }
    } catch (error) {
      logger.error(`[RealTimeStreamingService] Error getting call config: ${error.message}`);
    }
    
    // Create new session
    const session = new StreamingSession(callId, options);
    
    // Store session
    this.sessions.set(session.sessionId, session);
    this.callSessionMap.set(callId, session.sessionId);
      // Register STT provider with voice activity detection service
    try {
      voiceActivityDetectionService.setSTTProvider(callId, session.sttProvider);
      logger.info(`[RealTimeStreamingService] Set STT provider for call ${callId} to ${session.sttProvider}`);
    } catch (error) {
      logger.error(`[RealTimeStreamingService] Error setting STT provider: ${error.message}`);
    }
    
    logger.info(`[RealTimeStreamingService] Created session ${session.sessionId} for call ${callId}`);
    
    return session;
  }
  
  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {StreamingSession|null} Session or null if not found
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
  
  /**
   * Get session for call
   * @param {string} callId - Call ID
   * @returns {StreamingSession|null} Session or null if not found
   */
  getSessionForCall(callId) {
    const sessionId = this.callSessionMap.get(callId);
    if (!sessionId) return null;
    
    return this.getSession(sessionId);
  }
  
  /**
   * Start streaming for a call
   * @param {string} callId - Call identifier
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Streaming options
   * @returns {Promise<Object>} Stream result
   */
  async startStreaming(callId, text, options = {}) {
    // Get session
    const session = this.getSessionForCall(callId);
    if (!session) {
      logger.error(`[RealTimeStreamingService] No session found for call ${callId}`);
      return { 
        success: false, 
        error: 'No active streaming session for call'
      };
    }
    
    try {
      // Start streaming with options
      await session.startStreaming(text, options);
      
      return {
        success: true,
        sessionId: session.sessionId,
        provider: session.currentProvider
      };
    } catch (error) {
      logger.error(`[RealTimeStreamingService] Error starting stream for call ${callId}: ${error.message}`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Stop streaming for a call
   * @param {string} callId - Call identifier
   * @returns {boolean} Success status
   */
  stopStreaming(callId) {
    // Get session
    const session = this.getSessionForCall(callId);
    if (!session) {
      logger.error(`[RealTimeStreamingService] No session found for call ${callId}`);
      return false;
    }
    
    // Stop streaming
    session.stopStreaming();
    
    return true;
  }
  
  /**
   * Clean up session
   * @param {string} sessionId - Session ID
   */
  cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Clean up session resources
    session.cleanup();
    
    // Remove call mapping
    if (this.callSessionMap.has(session.callId)) {
      this.callSessionMap.delete(session.callId);
    }
    
    // Remove session
    this.sessions.delete(sessionId);
    
    logger.info(`[RealTimeStreamingService] Cleaned up session ${sessionId}`);
  }
  
  /**
   * Clean up call
   * @param {string} callId - Call ID
   */
  cleanupCall(callId) {
    const sessionId = this.callSessionMap.get(callId);
    if (!sessionId) return;
    
    this.cleanupSession(sessionId);
  }
  
  /**
   * Start maintenance interval
   */
  startMaintenanceInterval() {
    // Run maintenance every 30 seconds
    setInterval(() => {
      this.performMaintenance();
    }, 30000);
  }
  
  /**
   * Perform maintenance tasks
   */
  performMaintenance() {
    const now = Date.now();
    
    // Check for stale sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      // Check if session is inactive or stale
      if (!session.active || 
          (session.lastOutputTime > 0 && now - session.lastOutputTime > 300000)) { // 5 minutes inactivity
        
        logger.info(`[RealTimeStreamingService] Cleaning up stale session ${sessionId}`);
        this.cleanupSession(sessionId);
      }
    }
  }
  
  /**
   * Get service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const metrics = {
      activeSessions: this.sessions.size,
      activeStreams: 0,
      sessions: []
    };
    
    // Collect session metrics
    for (const session of this.sessions.values()) {
      if (session.streaming) {
        metrics.activeStreams++;
      }
      
      metrics.sessions.push(session.getMetrics());
    }
    
    return metrics;
  }
}

// Create singleton instance
const realTimeStreamingService = new RealTimeStreamingService();

module.exports = realTimeStreamingService;
