const WebSocket = require('ws');
const voiceProviderService = require('./voiceProviderService');
const openaiService = require('./openaiService');
const { bidirectionalStreamingService } = require('./bidirectionalStreamingService');
const { interruptionHandler } = require('./interruption-handler');
const { creditCardSalesAnalytics } = require('./creditCardSalesAnalytics');
const { logger } = require('../utils/logger');
const fastConversationOptimizer = require('./fastConversationOptimizer'); // OPTIMIZED: Add fast conversation optimizer
const enhancedUltraFastConversationService = require('./enhancedUltraFastConversationService'); // Enhanced Google STT optimization

/**
 * Twilio WebSocket Handler for Real-Time Audio Streaming
 * Handles bidirectional audio streaming between Twilio and AI services
 * Enhanced for credit card sales with real-time interruption handling
 */
class TwilioWebSocketHandler {  constructor() {
    this.activeCalls = new Map(); // Store active call states
    this.audioBuffers = new Map(); // Store incoming audio buffers
    this.callDetails = new Map(); // Store call details including card types
    
    // OPTIMIZED: Initialize fast conversation optimizer
    this.setupFastConversationOptimization();
  }

  /**
   * Setup fast conversation optimization
   */
  setupFastConversationOptimization() {
    // Listen for fast processing triggers
    fastConversationOptimizer.on('fastProcessingTriggered', async (data) => {
      console.log('[TwilioWebSocket] Fast processing triggered for call:', data.callId);
      
      // Get the call state and process audio immediately
      const callState = this.activeCalls.get(data.callId);
      if (callState && callState.ws) {
        await this.processAccumulatedAudio(callState.ws, true); // Fast processing mode
      }
    });
  }/**
   * Initialize WebSocket server for Twilio streaming
   * @param {WebSocket.Server} wss - WebSocket server instance
   */
  initialize(wss) {
    // Add server-level error handling
    wss.on('error', (error) => {
      console.error('[TwilioWebSocket] WebSocket Server Error:', error);
    });

    wss.on('connection', (ws, req) => {
      console.log('[TwilioWebSocket] New Twilio WebSocket connection established');
      console.log('[TwilioWebSocket] Connection details:', {
        url: req.url,
        headers: req.headers,
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      });
      
      ws.streamType = 'bidirectional'; // Single stream handles both directions
        // Enable keep-alive ping/pong to maintain connection
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // DO NOT send immediate confirmation - wait for Twilio to initiate
      // Twilio will send 'connected' and 'start' events to us first
      
      ws.on('message', async (message) => {
        try {
          await this.handleMessage(ws, message);        } catch (error) {
          console.error('[TwilioWebSocket] Error handling message:', error);
          // Don't send error responses back to Twilio unless specifically required
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[TwilioWebSocket] Twilio WebSocket connection closed - Code: ${code}, Reason: ${reason}`);
        this.cleanup(ws);
      });

      ws.on('error', (error) => {
        console.error('[TwilioWebSocket] WebSocket connection error:', error);
        this.cleanup(ws);
      });

      // Set up ping/pong for connection health
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Ping all connections every 30 seconds to keep them alive
    const interval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('[TwilioWebSocket] Terminating dead connection');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('[TwilioWebSocket] Twilio WebSocket handler initialized for bidirectional streaming');
  }

  /**
   * Handle incoming WebSocket messages from Twilio
   */
  async handleMessage(ws, message) {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.event) {
        case 'connected':
          await this.handleConnected(ws, data);
          break;
          
        case 'start':
          await this.handleStart(ws, data);
          break;
          
        case 'media':
          await this.handleMedia(ws, data);
          break;
          
        case 'stop':
          await this.handleStop(ws, data);
          break;
          
        default:
          console.log('[TwilioWebSocket] Unknown event:', data.event);
      }
    } catch (error) {
      console.error('[TwilioWebSocket] Error parsing message:', error);
    }
  }

  /**
   * Handle WebSocket connection established
   */
  async handleConnected(ws, data) {
    console.log('[TwilioWebSocket] Connected event received:', data);
    ws.callState = {
      streamSid: null,
      callSid: null,
      callId: null,
      conversationHistory: [],
      isGreetingPlayed: false,
      audioBuffer: Buffer.alloc(0)
    };
  }  /**
   * Handle streaming start event
   */  async handleStart(ws, data) {
    console.log('[TwilioWebSocket] Start event received:', data);
    
    const { streamSid, callSid, customParameters } = data.start;
    
    // Extract call parameters with all provider selections
    const callId = customParameters?.callId;
    const script = customParameters?.script || 'Hello! How can I assist you today?';    
    const prompt = customParameters?.prompt || 'You are a helpful AI assistant.';
    const language = customParameters?.language || 'en-US';
    const ttsProvider = customParameters?.ttsProvider || 'chatgpt'; // TTS provider selection
    const sttProvider = customParameters?.sttProvider || 'deepgram'; // STT provider selection
    const llmProvider = customParameters?.llmProvider || 'openai'; // LLM provider selection
    const selectedVoice = customParameters?.selectedVoice || ''; // Selected voice ID
    
    console.log('[TwilioWebSocket] Call setup with providers:', {
      tts: ttsProvider,
      stt: sttProvider,
      llm: llmProvider,
      voice: selectedVoice,
      language
    });
    
    // Update call state with all selections
    ws.callState = {
      ...ws.callState,
      streamSid,
      callSid,
      callId,
      script,
      prompt,
      language,
      ttsProvider,
      sttProvider,
      llmProvider,
      selectedVoice,
      streamType: 'bidirectional',
      startTime: new Date()
    };    
    
    // ✅ START STRICT WORKFLOW: Initialize workflow engine for this call
    try {
      const workflowEngine = require('./workflowEngine');
      const dynamicBankService = require('./dynamicBankService');
      
      // Detect bank and agent from prompt/script
      const bankConfig = dynamicBankService.parseBankFromPrompt(prompt || script);
      console.log(`[TwilioWebSocket] Detected bank: ${bankConfig.bank}, Agent: ${bankConfig.agent}`);
      
      // Get or create workflow for this bank
      const workflowResult = await dynamicBankService.getOrCreateWorkflow(bankConfig.bank, bankConfig.agent);
      console.log(`[TwilioWebSocket] Using workflow ID: ${workflowResult.workflow._id}`);
      
      // Start the workflow flow for this call
      const initialData = {
        variables: workflowResult.config,
        language: language.includes('hi') ? 'hindi' : 'english'
      };
      
      const workflowResponse = await workflowEngine.startCallFlow(callId, workflowResult.workflow._id, initialData);
      console.log(`[TwilioWebSocket] Workflow started for call ${callId}:`, workflowResponse.stepType);
      
      // Store workflow ID in call state
      ws.callState.workflowId = workflowResult.workflow._id;
      ws.callState.currentStep = workflowResponse.stepType;
      
      // Use workflow greeting instead of generic script
      if (workflowResponse.content) {
        ws.callState.script = workflowResponse.content;
      }
      
    } catch (error) {
      console.error('[TwilioWebSocket] Error starting workflow:', error);
      // Fallback to original script if workflow fails
    }
    
    // Store the connection in the active calls map
    this.activeCalls.set(callId, {
      ws: ws,
      ...ws.callState
    });
    
    // OPTIMIZED: Initialize fast conversation optimizer for this call
    fastConversationOptimizer.initializeCall(callId);
    
    console.log(`[TwilioWebSocket] Bidirectional stream started for call: ${callId}, streamSid: ${streamSid}`);
    
    // OPTIMIZED: Reduced greeting delay for faster conversation start
    setTimeout(async () => {
      if (ws.readyState === ws.OPEN && ws.callState) {
        await this.sendGreeting(ws, script);
      }
    }, 500); // OPTIMIZED: Reduced from 1000ms to 500ms
  }  /**
   * Handle incoming audio media with fast conversation optimization
   */
  async handleMedia(ws, data) {
    if (!ws.callState) return;
    
    const { media } = data;
    const audioPayload = Buffer.from(media.payload, 'base64');
    const callId = ws.callState.callId;
    
    // OPTIMIZED: Use fast conversation optimizer for real-time processing
    if (callId) {
      // Process audio chunk for silence detection
      fastConversationOptimizer.processAudioChunk(callId, audioPayload);
      
      // Accumulate audio in buffer
      let audioBuffer = this.audioBuffers.get(callId) || [];
      audioBuffer.push(audioPayload);
      this.audioBuffers.set(callId, audioBuffer);
    }
    
    // LEGACY: Keep original buffer for fallback
    ws.callState.audioBuffer = Buffer.concat([ws.callState.audioBuffer || Buffer.alloc(0), audioPayload]);
    
    // OPTIMIZED: Process audio with faster threshold for real-time conversation
    const sampleRate = 8000; // Twilio uses 8kHz
    const fastProcessingThreshold = sampleRate * 0.5; // OPTIMIZED: 0.5 seconds instead of 1 second
    
    if (ws.callState.audioBuffer.length >= fastProcessingThreshold) {
      await this.processAccumulatedAudio(ws, false); // Normal processing, optimizer handles fast detection
    }
  }
  /**
   * Handle streaming stop event
   */
  async handleStop(ws, data) {
    console.log('[TwilioWebSocket] Stop event received:', data);
    
    if (ws.callState?.callId) {
      // OPTIMIZED: Cleanup fast conversation optimizer
      fastConversationOptimizer.cleanup(ws.callState.callId);
      this.activeCalls.delete(ws.callState.callId);
      this.audioBuffers.delete(ws.callState.callId);
    }
    
    this.cleanup(ws);
  }/**
   * Send greeting message using real-time TTS
   */
  async sendGreeting(ws, greetingText) {
    try {
      console.log(`[TwilioWebSocket] Sending greeting: "${greetingText}"`);
      
      // Generate audio using real-time TTS
      const audioStream = await this.generateRealTimeAudio(greetingText, ws.callState);
      
      if (audioStream) {
        await this.streamAudioToTwilio(ws, audioStream);
        ws.callState.isGreetingPlayed = true;
      } else {
        console.error('[TwilioWebSocket] Failed to generate greeting audio');
      }
    } catch (error) {
      console.error('[TwilioWebSocket] Error sending greeting:', error);
    }
  }/**
   * Process accumulated audio chunk for speech recognition
   */
  async processAudioChunk(ws) {
    try {
      const audioBuffer = ws.callState.audioBuffer;
      ws.callState.audioBuffer = Buffer.alloc(0); // Reset buffer
        // Convert audio to text using speech recognition with the selected provider
      const transcription = await this.speechToText(audioBuffer, ws);
      if (transcription && transcription.trim().length > 0) {
        console.log(`[TwilioWebSocket] Transcription: "${transcription}"`);
        
        // Add to conversation history
        ws.callState.conversationHistory.push({
          role: 'user',
          content: transcription,
          timestamp: new Date()
        });
        
        // ✅ STRICT WORKFLOW FIX: Use workflow engine instead of direct AI calls
        const workflowEngine = require('./workflowEngine');
        const workflowResponse = await workflowEngine.processCustomerResponse(
          ws.callState.callId,
          transcription
        );
        
        if (workflowResponse && workflowResponse.content) {
          // Convert workflow response to audio and stream back
          const audioStream = await this.generateRealTimeAudio(workflowResponse.content, ws.callState);
          if (audioStream) {
            await this.streamAudioToTwilio(ws, audioStream);
          }
          
          // Check if call is completed
          if (workflowResponse.completed || workflowResponse.callEnded) {
            console.log(`[TwilioWebSocket] Call ${ws.callState.callId} completed via workflow`);
            ws.close();
          }
        }
      }
    } catch (error) {
      console.error('[TwilioWebSocket] Error processing audio chunk:', error);
    }
  }  /**
   * Convert speech to text using the selected STT provider
   */  async speechToText(audioBuffer, ws) {
    try {
      // Check if we have enough audio data (minimum 0.5 seconds)
      if (audioBuffer.length < 4000) { // 8kHz * 0.5s = 4000 bytes
        return null;
      }
      
      // Get the selected STT provider from the call state
      const provider = ws.callState?.sttProvider || 'deepgram';
      const language = ws.callState?.language || 'en-US';
      const callId = ws.callState?.callId || 'unknown';
      
      // Import the speech-to-text service
      const { speechToTextService } = require('./speechToText');
      const voiceActivityDetectionService = require('./vadServiceAdapter');
      
      console.log(`[TwilioWebSocket] Processing audio with ${provider} STT provider`);
      
      let transcription;
      
      // Convert mulaw audio to PCM format if needed
      // Note: In a production environment, you'd convert from 8kHz mulaw to 16kHz PCM here
        if (provider === 'google') {
        // Use Enhanced Google Speech service for ultra-fast transcription
        const enhancedGoogleSpeechService = require('./enhancedGoogleSpeechService');
        
        console.log(`[TwilioWebSocket] Using Enhanced Google STT for ultra-fast transcription`);
        
        // Process with Enhanced Google Speech API with optimized settings
        transcription = await enhancedGoogleSpeechService.transcribe(audioBuffer, {
          languageCode: language,
          encoding: 'MULAW',
          sampleRateHertz: 8000,
          alternativeLanguages: language === 'en-US' ? ['hi-IN'] : ['en-US'],
          enableContextualBoosting: true
        });} else if (provider === 'deepgram') {
        // Use Deepgram service
        const deepgramService = require('./deepgramService');
        
        // Process with Deepgram API
        const result = await deepgramService.processAudioChunk(callId, audioBuffer);
        transcription = result?.text || '';
      } else {
        // Use OpenAI Whisper API as fallback
        const openaiService = require('./openaiService');
        
        // Store in temporary file for Whisper API
        const fs = require('fs');
        const path = require('path');
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `twilio_${callId}_${Date.now()}.wav`);
        fs.writeFileSync(tempFile, audioBuffer);        
        // Use Whisper API
        const result = await openaiService.transcribeAudio(tempFile);
        transcription = result?.text || '';
        
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) { /* Ignore cleanup errors */ }
      }
      
      // Log which provider was used
      if (transcription && transcription.length > 0) {
        console.log(`[TwilioWebSocket] Transcription using ${provider}: "${transcription}"`);
      }
      
      return transcription;
    } catch (error) {
      console.error('[TwilioWebSocket] Speech-to-text error:', error);
      
      // Try fallback provider on error
      try {
        const { speechToTextService } = require('./speechToText');
        console.log('[TwilioWebSocket] Trying fallback STT provider (deepgram)');
        return await speechToTextService.transcribe(audioBuffer, {
          provider: 'deepgram',
          language: ws.callState?.language || 'en-US'
        });
      } catch (fallbackError) {
        console.error('[TwilioWebSocket] Fallback STT also failed:', fallbackError.message);
        return null;
      }
    }
  }  /**
   * Generate AI response using conversation context and selected LLM provider
   * OPTIMIZED: Added support for optimization parameters for faster conversation flow
   */
  async generateAIResponse(callState, userInput, optimizedParams = null) {
    try {
      // Add user input to conversation
      const conversationHistory = [
        {
          role: 'system',
          content: this.buildOptimizedSystemPrompt(callState, optimizedParams)
        },
        ...callState.conversationHistory
      ];
      
      // Get the selected LLM provider
      const llmProvider = callState.llmProvider || 'openai';
      console.log(`[TwilioWebSocket] Generating AI response using ${llmProvider} provider`, {
        optimized: !!optimizedParams,
        maxTokens: optimizedParams?.maxTokens || 'default'
      });
      
      let response;
      
      if (llmProvider === 'gemini') {
        // Use Gemini for response generation
        const geminiService = require('./geminiService');
        response = await geminiService.generateResponse(
          conversationHistory,
          callState.script || '',
          callState.prompt || '',
          callState.language || 'en-US',
          callState.callId,
          false, // isIntro
          optimizedParams // Pass optimization parameters
        );
      } else {
        // Default to OpenAI for response generation with optimization
        const openaiService = require('./openaiService');
        response = await openaiService.generateResponse(
          conversationHistory,
          callState.script || '',
          callState.prompt || '',
          callState.language || 'en-US',
          callState.callId,
          false, // isIntro
          optimizedParams // Pass optimization parameters
        );
      }
      
      // Add AI response to conversation history
      const responseText = response.text || response.content || response;
      callState.conversationHistory.push({
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      });
      
      return responseText;
    } catch (error) {
      console.error('[TwilioWebSocket] Error generating AI response:', error);
      return "I apologize, but I'm having trouble processing your request right now.";
    }
  }

  /**
   * Build optimized system prompt for faster conversation flow
   */
  buildOptimizedSystemPrompt(callState, optimizedParams) {
    const basePrompt = callState.prompt || 'You are a helpful AI assistant.';
    
    if (!optimizedParams) return basePrompt;
    
    const optimizedInstructions = `
    
CONVERSATION OPTIMIZATION ACTIVE:
- Keep responses under ${Math.max(60, optimizedParams.maxTokens * 0.6)} words for natural conversation flow
- Respond quickly and naturally, like in a real phone conversation
- Use short, punchy sentences that are easy to understand
- Avoid long explanations unless specifically asked
- Match the conversational pace of a professional phone call
- Ask brief, engaging follow-up questions to maintain flow`;    return basePrompt + optimizedInstructions;
  }

  /**
   * Generate real-time audio from text using selected TTS provider
   */
  async generateRealTimeAudio(text, callState) {
    try {
      const ttsProvider = callState.ttsProvider || 'chatgpt';
      const language = callState.language || 'en-US';
      const selectedVoice = callState.selectedVoice || '';
      
      console.log(`[TwilioWebSocket] Generating real-time audio with ${ttsProvider} TTS provider: "${text.substring(0, 50)}..."`);
      
      // Map frontend TTS provider values to backend voice provider values
      let voiceProvider;
      switch(ttsProvider) {
        case 'chatgpt':
          voiceProvider = 'openai_fm';
          break;
        case 'elevenlabs':
          voiceProvider = 'elevenlabs';
          break;
        case 'rime':
          voiceProvider = 'rime';
          break;
        default:
          voiceProvider = 'openai_fm';
      }
      
      // Use voice provider service to generate streaming audio
      const audioStream = await voiceProviderService.generateStreamingAudio(
        text,
        voiceProvider,
        language,
        {
          format: 'mulaw', // Twilio format
          sampleRate: 8000,
          streaming: true,
          voice: selectedVoice // Pass the selected voice ID
        }
      );
      
      return audioStream;
    } catch (error) {
      console.error('[TwilioWebSocket] Error generating real-time audio:', error);
      return null;
    }
  }

  /**
   * Stream audio data to Twilio WebSocket
   */
  async streamAudioToTwilio(ws, audioStream) {
    try {
      if (!audioStream) {
        console.error('[TwilioWebSocket] No audio stream provided');
        return;
      }
      
      console.log('[TwilioWebSocket] Streaming audio to Twilio...');
      
      // If audioStream is a buffer, send it directly
      if (Buffer.isBuffer(audioStream)) {
        const base64Audio = audioStream.toString('base64');
        
        const mediaMessage = {
          event: 'media',  // FIXED: Use 'event' instead of 'action' for messages TO Twilio
          streamSid: ws.callState.streamSid,
          media: {
            payload: base64Audio,
            track: "outbound",  // Required for Twilio to correctly handle the media
            chunk: String(Date.now()),
            timestamp: String(Date.now())
          }
        };
        
        ws.send(JSON.stringify(mediaMessage));      } else if (audioStream && typeof audioStream.on === 'function') {
        // If it's a stream, handle chunks
        audioStream.on('data', (chunk) => {
          const base64Audio = chunk.toString('base64');
            const mediaMessage = {
            event: 'media',  // FIXED: Use 'event' instead of 'action' for messages TO Twilio
            streamSid: ws.callState.streamSid,
            media: {
              payload: base64Audio,
              track: "outbound",  // Required for Twilio to correctly handle the media
              chunk: String(Date.now()),
              timestamp: String(Date.now())
            }
          };
          
          ws.send(JSON.stringify(mediaMessage));
        });
        
        audioStream.on('end', () => {
          console.log('[TwilioWebSocket] Audio stream ended');
        });
        
        audioStream.on('error', (error) => {
          console.error('[TwilioWebSocket] Audio stream error:', error);
        });
      }    } catch (error) {
      console.error('[TwilioWebSocket] Error streaming audio to Twilio:', error);
    }
  }

  /**
   * Cleanup resources for a WebSocket connection
   */
  cleanup(ws) {
    if (ws.callState?.callId) {
      this.activeCalls.delete(ws.callState.callId);
      console.log(`[TwilioWebSocket] Cleaned up call: ${ws.callState.callId}`);
    }
  }

  /**
   * Get active call by ID
   */
  getActiveCall(callId) {
    return this.activeCalls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.keys());
  } /**
   * Process accumulated audio with optimization for conversation speed
   */
  async processAccumulatedAudio(ws, fastMode = false) {
    try {
      const callId = ws.callId;
      if (!callId) return;

      const audioBuffer = this.audioBuffers.get(callId);
      if (!audioBuffer || audioBuffer.length === 0) return;

      // Get optimized parameters from fast conversation optimizer
      const optimizedParams = fastConversationOptimizer.getOptimizedParameters(callId);
      
      console.log(`[TwilioWebSocket] Processing audio with optimized parameters:`, {
        callId,
        fastMode,
        silenceThreshold: optimizedParams.silenceThreshold,
        audioChunks: audioBuffer.length
      });

      // Combine audio chunks
      const combinedAudio = Buffer.concat(audioBuffer);
      
      // Clear buffer immediately for next processing cycle
      this.audioBuffers.set(callId, []);

      // Fast speech-to-text processing
      const transcription = await this.speechToText(combinedAudio, ws);
      
      if (transcription && transcription.trim()) {
        console.log(`[TwilioWebSocket] Transcription (${fastMode ? 'FAST' : 'NORMAL'}):`, transcription);
        
        // Get call state
        const callState = this.activeCalls.get(callId);
        if (!callState) return;

        // ✅ STRICT WORKFLOW FIX: Use workflow engine instead of direct AI calls
        const workflowEngine = require('./workflowEngine');
        const workflowResponse = await workflowEngine.processCustomerResponse(
          callId,
          transcription
        );
        
        if (workflowResponse && workflowResponse.content) {
          // Generate and stream workflow response
          await this.generateAndStreamResponse(ws, workflowResponse.content, callState, optimizedParams);
          
          // Check if call is completed
          if (workflowResponse.completed || workflowResponse.callEnded) {
            console.log(`[TwilioWebSocket] Call ${callId} completed via workflow`);
            ws.close();
          }
        }
        
        // Mark processing as complete and get metrics
        const metrics = fastConversationOptimizer.completeProcessing(callId);
        console.log(`[TwilioWebSocket] Processing complete:`, metrics);
      }

    } catch (error) {
      console.error('[TwilioWebSocket] Error in optimized audio processing:', error);
      fastConversationOptimizer.completeProcessing(ws.callId); // Mark as complete even on error
    }
  }

  /**
   * Generate and stream AI response with optimization
   */
  async generateAndStreamResponse(ws, responseText, callState, optimizedParams) {
    try {
      console.log(`[TwilioWebSocket] Generating optimized audio response:`, {
        callId: ws.callId,
        responseLength: responseText.length,
        maxTokens: optimizedParams.maxTokens
      });

      // Generate audio with optimized settings
      const audioStream = await this.generateRealTimeAudio(responseText, {
        ...callState,
        optimized: true,
        chunkSize: optimizedParams.chunkSize
      });

      if (audioStream) {
        // Stream audio to Twilio with optimized chunk size
        await this.streamAudioToTwilio(ws, audioStream, optimizedParams);
      }

    } catch (error) {
      console.error('[TwilioWebSocket] Error generating optimized response:', error);
    }
  }

}

module.exports = new TwilioWebSocketHandler();
