// Helper function to wait for a file to be fully written
const waitForFileCompletion = async (filePath, timeout = 5000, interval = 500) => {
  return new Promise((resolve, reject) => {
    let lastSize = 0;
    let stableCount = 0;

    const checkInterval = setInterval(() => {
      try {
        const stats = fs.statSync(filePath);
        const currentSize = stats.size;

        if (currentSize === lastSize) {
          stableCount++;
          if (stableCount * interval >= timeout) {
            clearInterval(checkInterval);
            resolve();
          }
        } else {
          stableCount = 0;
          lastSize = currentSize;
        }
      } catch (error) {
        clearInterval(checkInterval);
        reject(error);
      }
    }, interval);
  });
};
const Call = require('../models/Call');
const Script = require('../models/Script');
const Prompt = require('../models/Prompt');
const Customer = require('../models/Customer');
const twilioService = require('../services/twilioService');
const elevenlabsService = require('../services/elevenlabsService');
const googleSpeechService = require('../services/googleSpeechService');
const voiceProviderService = require('../services/voiceProviderService');
const languageUtils = require('../utils/languageUtils');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const twilio = require('twilio');
const { VoiceResponse } = twilio.twiml;
const { v4: uuidv4 } = require('uuid');
const audioStreamService = require('../services/audioStreamService');
const axios = require('axios');
// Import logger for enhanced logging
const { logger } = require('../utils/logger');
// Import OpenAI service for ChatGPT integration
const openaiService = require('../services/openaiService');
// Import real-time call service for basic call management
const realTimeCallService = require('../services/realTimeCallService');
// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../storage/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
}).single('file');

// Simple in-memory cache for frequently used phrases
const audioCache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper function to determine TTS service - Returns database-compatible values
const getTTSService = async (language, useClonedVoice = false) => {
  try {
    console.log(`[getTTSService] Checking TTS service for language: ${language}`);
    
    // Check if this is a language where ChatGPT TTS excels (Hindi, mixed, etc)
    if (language.startsWith('hi') || language === 'mixed') {
      console.log('[getTTSService] Language best suited for ChatGPT TTS');
      return 'chatgpt_tts'; // Return database-compatible value
    }
    
    // For English and other languages, prefer ElevenLabs
    if (language.startsWith('en')) {
      console.log('[getTTSService] Using ElevenLabs for English');
      return 'elevenlabs';
    }
    
    // Default to ChatGPT TTS for other languages
    console.log('[getTTSService] Using ChatGPT TTS as default TTS service');
    return 'chatgpt_tts'; // Return database-compatible value
  } catch (error) {
    console.error('[getTTSService] Error determining TTS service:', error);
    // Default to ChatGPT TTS on error as it's more reliable
    return 'chatgpt_tts'; // Return database-compatible value
  }
};

// Helper function to validate audio URL accessibility
const validateAudioUrlAccessibility = async (audioUrl) => {
  try {
    console.log(`[AUDIO FIX] Validating accessibility of: ${audioUrl}`);
    
    // Check if it's a local URL
    if (audioUrl.includes('localhost') || audioUrl.includes('127.0.0.1')) {
      console.warn(`[AUDIO FIX] ⚠️ URL uses localhost, may not be accessible to Twilio`);
      return false;
    }
    
    // Check if ngrok URL is configured
    if (!process.env.NGROK_URL) {
      console.warn(`[AUDIO FIX] ⚠️ NGROK_URL not configured`);
      return false;
    }
    
    // Basic URL format validation
    if (!audioUrl.startsWith('http')) {
      console.warn(`[AUDIO FIX] ⚠️ Invalid URL format`);
      return false;
    }
    
    // Extract filename and check local file exists
    const audioFileName = audioUrl.split('/').pop();
    const audioFilePath = path.join(__dirname, '../storage/audio', audioFileName);
    
    if (!fs.existsSync(audioFilePath)) {
      console.warn(`[AUDIO FIX] ⚠️ Audio file does not exist locally`);
      return false;
    }
    
    console.log(`[AUDIO FIX] ✓ Audio URL validation passed`);
    return true;
  } catch (error) {
    console.error(`[AUDIO FIX] Error validating audio URL:`, error);
    return false;
  }
};

// Helper function to generate emergency fallback audio
const generateEmergencyFallbackAudio = async (text, callId) => {
  try {
    console.log(`[AUDIO FIX] Generating emergency fallback audio for call ${callId}`);
    
    const audioDir = path.join(__dirname, '../storage/audio');
    const fallbackDir = path.join(__dirname, '../storage/fallback');
    
    // Ensure directories exist
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    // Try to use existing fallback files first
    const fallbackFiles = [
      path.join(fallbackDir, 'greeting.mp3'),
      path.join(fallbackDir, 'silence_medium.mp3'),
      path.join(fallbackDir, 'silence_large.mp3'),
      path.join(__dirname, '../storage/audio/twilio_test.mp3')
    ];
    
    for (const fallbackFile of fallbackFiles) {
      if (fs.existsSync(fallbackFile)) {
        const stats = fs.statSync(fallbackFile);
        if (stats.size >= 10000) {
          // Copy to audio directory with unique name
          const fileName = `emergency_${callId}_${Date.now()}.mp3`;
          const targetPath = path.join(audioDir, fileName);
          fs.copyFileSync(fallbackFile, targetPath);
          
          const ngrokUrl = process.env.NGROK_URL || 'http://localhost:5002';
          const audioUrl = `${ngrokUrl}/audio/${fileName}`;
          
          console.log(`[AUDIO FIX] ✓ Using fallback file: ${fallbackFile} (${stats.size} bytes)`);
          return audioUrl;
        }
      }
    }
    
    // Generate emergency audio if no fallback files exist
    console.log(`[AUDIO FIX] No fallback files found, generating emergency audio`);
    
    // Create a large enough MP3 file for Twilio (20KB+)
    const frames = [
      Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // ID3v2 header
    ];
    
    // Add enough MP3 frames to make it 20KB+
    for (let i = 0; i < 1000; i++) {
      frames.push(Buffer.from([
        0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]));
    }
    
    const emergencyBuffer = Buffer.concat(frames);
    const fileName = `emergency_${callId}_${Date.now()}.mp3`;
    const filePath = path.join(audioDir, fileName);
    
    fs.writeFileSync(filePath, emergencyBuffer);
    
    // Create metadata file
    const metaFilePath = path.join(audioDir, `${fileName}.meta`);
    fs.writeFileSync(metaFilePath, JSON.stringify({
      contentType: 'audio/mpeg',
      created: new Date().toISOString(),
      size: emergencyBuffer.length,
      type: 'emergency_fallback'
    }));
    
    const ngrokUrl = process.env.NGROK_URL || 'http://localhost:5002';
    const audioUrl = `${ngrokUrl}/audio/${fileName}`;
    
    console.log(`[AUDIO FIX] ✓ Generated emergency audio: ${emergencyBuffer.length} bytes`);
    return audioUrl;
    
  } catch (error) {
    console.error(`[AUDIO FIX] ❌ Emergency fallback generation failed:`, error);
    // Return a basic URL as absolute last resort
    const ngrokUrl = process.env.NGROK_URL || 'http://localhost:5002';
    return `${ngrokUrl}/audio/silence_small.mp3`;
  }
};

// Helper function to generate audio using appropriate TTS service
const generateAudioUrl = async (text, language, callId) => {
  try {
    // Fetch call record to get voice configuration
    let voiceProvider = 'elevenlabs'; // Default
    let voiceId = null;
    
    try {
      const Call = require('../models/Call');
      const call = await Call.findById(callId);
      
      if (call) {
        // Smart voice provider selection: if voiceId is specified, prefer voiceProvider
        if (call.voiceId && call.voiceProvider) {
          voiceProvider = call.voiceProvider;
          console.log(`[generateAudioUrl] Using voiceProvider due to specific voiceId: ${call.voiceProvider}`);
        } else {
          voiceProvider = call.ttsProvider || call.voiceProvider || 'elevenlabs';
          console.log(`[generateAudioUrl] Using ttsProvider as primary: ${call.ttsProvider}`);
        }
        
        voiceId = call.voiceId;
        
        console.log(`[generateAudioUrl] Voice config from call record:`, {
          callId,
          voiceProvider,
          voiceId,
          ttsProvider: call.ttsProvider,
          originalVoiceProvider: call.voiceProvider
        });
      }
    } catch (dbError) {
      console.warn(`[generateAudioUrl] Could not fetch call record, using defaults:`, dbError.message);
    }
    
    // Check if real-time streaming is enabled
    const enableStreaming = process.env.ENABLE_REAL_TIME_STREAMING === 'true';
    const latencyTarget = parseInt(process.env.STREAMING_LATENCY_TARGET) || 200;
    
    console.log(`[generateAudioUrl] Mode: ${enableStreaming ? 'STREAMING' : 'MP3'}, Target latency: ${latencyTarget}ms`);
    console.log(`[generateAudioUrl] Text: "${text.substring(0, 100)}..." for call ${callId}`);
    
    if (enableStreaming) {
      // REAL-TIME STREAMING MODE - Direct audio streaming for sub-200ms latency
      try {
        console.log(`[generateAudioUrl] Using real-time streaming for call ${callId}`);
        
        // Get or create audio stream for this call with voice configuration
        let audioStream = audioStreamService.getStream(callId);
        if (!audioStream) {
          audioStream = audioStreamService.createStream(callId, {
            voiceProvider: voiceProvider,
            voiceId: voiceId,
            language: language
          });
          console.log(`[generateAudioUrl] Created new audio stream for call ${callId}`, {
            voiceProvider,
            voiceId
          });
        } else {
          // Update existing stream with current voice configuration
          audioStream.setVoice(voiceId, voiceProvider);
          console.log(`[generateAudioUrl] Updated existing stream voice config`, {
            voiceProvider,
            voiceId
          });
        }
        
        // Start real-time synthesis and streaming
        const streamingResult = await audioStream.synthesizeAndStream(text, {
          language: language,
          latencyTarget: latencyTarget,
          chunkSize: parseInt(process.env.STREAMING_CHUNK_SIZE) || 1024,
          voiceProvider: voiceProvider,
          voiceId: voiceId
        });
        
        if (streamingResult && streamingResult.streamUrl) {
          console.log(`[generateAudioUrl] ✓ Real-time streaming initiated: ${streamingResult.streamUrl}`);
          return streamingResult.streamUrl;
        } else {
          console.warn(`[generateAudioUrl] ⚠️ Streaming failed, falling back to MP3 mode`);
          // Fall through to MP3 mode if streaming fails
        }
      } catch (streamingError) {
        console.error(`[generateAudioUrl] ❌ Streaming error:`, streamingError.message);
        // Fall through to MP3 mode if streaming fails
      }
    }
    
    // MP3 FILE GENERATION MODE (Legacy/Fallback)
    console.log(`[generateAudioUrl] Using MP3 file generation mode for call ${callId}`);
    
    // Use voice configuration fetched from call record (not call state)
    console.log(`[AUDIO FIX] Generating audio using provider: ${voiceProvider} for call ${callId}, voiceId: ${voiceId}`);
    console.log(`[AUDIO FIX] Text to synthesize: "${text.substring(0, 100)}..."`);
    
    // STEP 1: Ensure audio files are fully generated before responding
    const maxRetries = 3;
    let audioUrl = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[AUDIO FIX] Attempt ${attempt}/${maxRetries} to generate audio`);
      
      try {
        // Generate audio URL for Twilio using the voice provider service
        console.log(`[AUDIO FIX] Using voice provider service with provider: ${voiceProvider}, voiceId: ${voiceId}`);
        audioUrl = await voiceProviderService.generateTwilioAudioUrl(text, {
          provider: voiceProvider,
          language: language,
          callId: callId,
          voiceId: voiceId
        });
        
        if (audioUrl) {
          console.log(`[AUDIO FIX] Generated audio URL: ${audioUrl}`);
          
          // STEP 2: Verify minimum 10KB file size validation
          const audioFileName = audioUrl.split('/').pop();
          const audioFilePath = path.join(__dirname, '../storage/audio', audioFileName);
          
          // Wait for file to be fully written
          await waitForFileCompletion(audioFilePath);
          
          if (fs.existsSync(audioFilePath)) {
            const stats = fs.statSync(audioFilePath);
            console.log(`[AUDIO FIX] Audio file size: ${stats.size} bytes`);
            
            // STEP 3: Validate file size (minimum 10KB for Twilio)
            if (stats.size >= 10000) {
              console.log(`[AUDIO FIX] ✓ File size validation passed (${stats.size} bytes >= 10KB)`);
              
              // STEP 4: Test URL accessibility
              const isAccessible = await validateAudioUrlAccessibility(audioUrl);
              if (isAccessible) {
                console.log(`[AUDIO FIX] ✓ Audio URL accessibility validated`);
                return audioUrl;
              } else {
                console.warn(`[AUDIO FIX] ⚠️ Audio URL not accessible, retrying...`);
                continue;
              }
            } else {
              console.warn(`[AUDIO FIX] ⚠️ File too small (${stats.size} bytes < 10KB), retrying...`);
              continue;
            }
          } else {
            console.warn(`[AUDIO FIX] ⚠️ Audio file not found at ${audioFilePath}, retrying...`);
            continue;
          }
        }
      } catch (error) {
        console.error(`[AUDIO FIX] ❌ Attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          console.log(`[AUDIO FIX] All attempts failed, trying fallback provider`);
        }
      }
    }
    
    // STEP 5: Try fallback providers if primary failed
    if (!audioUrl) {
      console.log(`[AUDIO FIX] Primary provider failed, trying fallback providers`);
      
      const fallbackProviders = ['elevenlabs', 'openai_fm', 'clone_voice'].filter(p => p !== selectedVoiceProvider);
      
      for (const fallbackProvider of fallbackProviders) {
        console.log(`[AUDIO FIX] Trying fallback provider: ${fallbackProvider}`);
        
        try {
          audioUrl = await voiceProviderService.generateTwilioAudioUrl(text, {
            provider: fallbackProvider,
            language: language,
            callId: callId
          });
          
          if (audioUrl) {
            // Validate fallback audio too
            const audioFileName = audioUrl.split('/').pop();
            const audioFilePath = path.join(__dirname, '../storage/audio', audioFileName);
            
            await waitForFileCompletion(audioFilePath);
            
            if (fs.existsSync(audioFilePath)) {
              const stats = fs.statSync(audioFilePath);
              if (stats.size >= 10000) {
                console.log(`[AUDIO FIX] ✓ Fallback provider ${fallbackProvider} succeeded (${stats.size} bytes)`);
                return audioUrl;
              }
            }
          }
        } catch (fallbackError) {
          console.error(`[AUDIO FIX] Fallback provider ${fallbackProvider} failed:`, fallbackError.message);
        }
      }
    }
    
    // STEP 6: Robust fallback to pre-recorded valid audio
    console.warn(`[AUDIO FIX] All providers failed, using emergency fallback audio`);
    return await generateEmergencyFallbackAudio(text, callId);
      
    // STEP 6: Emergency fallback (should rarely be reached)
    console.warn(`[AUDIO FIX] All providers failed, using emergency fallback audio`);
    return await generateEmergencyFallbackAudio(text, callId);
      
  } catch (error) {
    console.error('[generateAudioUrl] Error generating audio:', error);
    
    // Final emergency fallback
    if (process.env.FALLBACK_TO_MP3 === 'true') {
      console.log('[generateAudioUrl] Attempting final MP3 fallback...');
      try {
        return await generateEmergencyFallbackAudio(text, callId);
      } catch (fallbackError) {
        console.error('[generateAudioUrl] Emergency fallback also failed:', fallbackError);
      }
    }
    
    return null;
  }
};

// Call cleanup and resource management
async function cleanupCall(callId) {
  try {
    console.log(`[CallController] Starting cleanup for call ${callId}`);
    
    // Update call status in database
    await Call.findByIdAndUpdate(callId, {
      status: 'completed',
      endTime: new Date()
    });

    // Close audio streams
    const audioStream = audioStreamService.getStream(callId);
    if (audioStream) {
      await audioStream.cleanup();
    }

    // Clear any cached audio
    if (audioCache.has(callId)) {
      audioCache.delete(callId);
    }

    console.log(`[CallController] Cleanup completed for call ${callId}`);
  } catch (error) {
    console.error(`[CallController] Error during cleanup for call ${callId}:`, error);
  }
}

// Enhanced error handling for calls
async function handleCallError(error, callId) {
  console.error(`[CallController] Error in call ${callId}:`, error);

  try {
    // Update call status
    await Call.findByIdAndUpdate(callId, {
      status: 'failed',
      endTime: new Date(),
      errorDetails: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
      }
    });

    // Attempt to send final message to user if possible
    const twilioResponse = new VoiceResponse();
    twilioResponse.say({
      voice: 'woman',
      language: 'en-US'
    }, 'I apologize, but we are experiencing technical difficulties. Please try your call again later.');
    
    return twilioResponse.toString();
  } catch (cleanupError) {
    console.error(`[CallController] Error during error handling for call ${callId}:`, cleanupError);
    throw error; // Re-throw original error after cleanup attempt
  } finally {
    // Always attempt to cleanup resources
    await cleanupCall(callId);
  }
}

// Retry mechanism for failed calls
async function retryOperation(operation, maxAttempts = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[CallController] Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}

// Controller for call management
class CallController {
  constructor() {
    console.log('[CallController] Constructor called - initializing...');
    
    // Initialize call state storage
    this.activeCallState = new Map();
    this.callStates = {}; // Backward compatibility
    
    console.log('[CallController] Call state storage initialized');
    
    // Initialize real-time call service for streaming (with fallback if not available)
    try {
      // Import the service directly to avoid constructor issues
      const RealTimeCallService = require('../services/realTimeCallService');
      
      // First check if it exports a default class
      if (RealTimeCallService.default && typeof RealTimeCallService.default === 'function') {
        this.realTimeService = new RealTimeCallService.default();
      }
      // Then check if it's a class itself
      else if (typeof RealTimeCallService === 'function') {
        this.realTimeService = new RealTimeCallService();
      }
      // If it's an exported instance or object with methods
      else {
        this.realTimeService = RealTimeCallService;
      }
      
      console.log('[CallController] Successfully initialized RealTimeCallService');
    } catch (error) {
      console.error('[CallController] Error initializing RealTimeCallService:', error);
      // Create a fallback service with empty methods
      this.realTimeService = {
        initializeCall: () => {
          console.log('[FallbackRealTimeService] Call initialization simulated');
          return Promise.resolve();
        },
        updateCallStatus: () => Promise.resolve(),
        cleanup: () => Promise.resolve(),
        addTranscript: () => Promise.resolve()
      };
    }
    
    // Initialize Twilio VoiceResponse for use throughout the class
    if (!VoiceResponse) {
      this.VoiceResponse = twilio.twiml.VoiceResponse;
    } else {
      this.VoiceResponse = VoiceResponse;
    }

    // Bind methods to this context to ensure proper 'this' binding in Express routes
    this.validateUpload = this.validateUpload.bind(this);
    this.resetCallState = this.resetCallState.bind(this);
    this.handleSpeechInput = this.handleSpeechInput.bind(this);
    this.handleIncomingVoice = this.handleIncomingVoice.bind(this);
    this.initiateCall = this.initiateCall.bind(this);
    this.uploadBulkCalls = this.uploadBulkCalls.bind(this);
    this.getActiveCalls = this.getActiveCalls.bind(this);
    this.getAllCalls = this.getAllCalls.bind(this);
    this.getCall = this.getCall.bind(this);
    this.handleCallStatus = this.handleCallStatus.bind(this);
    this.handleVoiceWebhook = this.handleVoiceWebhook.bind(this);
    this.handleRecordingWebhook = this.handleRecordingWebhook.bind(this);
    
    console.log('[CallController] Constructor completed successfully');
    console.log('[CallController] activeCallState type:', typeof this.activeCallState);
    console.log('[CallController] realTimeService type:', typeof this.realTimeService);
    console.log('[CallController] resetCallState type:', typeof this.resetCallState);
  }
  
  /**
   * Validate CSV upload endpoint (no actual upload)
   * @route GET /api/calls/upload/validate
   * @access Public
   */
  validateUpload(req, res) {
    try {
      // This endpoint just confirms that the upload endpoint is available
      res.json({ 
        status: 'ok',
        message: 'CSV upload endpoint is available and configured correctly',
        supportedFormats: ['csv'],
        requiredColumns: ['name', 'phone', 'email']
      });
    } catch (error) {
      console.error('Error validating upload:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }

  /**
   * Reset the call state for error recovery
   * @param {string} callId - The ID of the call to reset
   * @param {boolean} preserveConnection - Whether to preserve the WebSocket connection
   * @returns {Object|null} The new call state or null if not found
   */
  resetCallState(callId, preserveConnection = false) {
    console.log(`[resetCallState] Resetting call state for call: ${callId}, preserveConnection: ${preserveConnection}`);
    
    // Check which data storage we're using (activeCallState Map or callStates object)
    let existingState = null;
    
    if (this.activeCallState && this.activeCallState instanceof Map) {
      existingState = this.activeCallState.get(callId);
      console.log(`[resetCallState] Found state in activeCallState Map: ${!!existingState}`);
    } 
    
    if (!existingState && this.callStates && typeof this.callStates === 'object') {
      existingState = this.callStates[callId];
      console.log(`[resetCallState] Found state in callStates object: ${!!existingState}`);
    }
    
    if (!existingState) {
      console.log(`[resetCallState] No existing call state found for call: ${callId}. Creating new state.`);
      existingState = {};
      
      // Initialize the state containers if they don't exist
      if (!this.activeCallState) {
        this.activeCallState = new Map();
      }
      if (!this.callStates) {
        this.callStates = {};
      }
    }
    
    // Create a clean state but preserve important connection information if needed
    const cleanState = {
      callId,
      status: 'connected',
      startTime: existingState.startTime || new Date(),
      twilioSid: existingState.twilioSid || null,
      mediaStream: existingState.mediaStream || null,
      lastActivity: Date.now(),
      useClonedVoice: false, // Using only ChatGPT, ElevenLabs, and standard services
      aiSpeaking: false,
      customerSpeaking: false,
      transcription: existingState.transcription || [],
      conversationHistory: existingState.conversationHistory || [],
      lastProcessedIndex: 0,
      isGreetingPlayed: existingState.isGreetingPlayed || false,
      callType: existingState.callType || 'inbound'
    };
    
    // Preserve WebSocket connection if requested
    if (preserveConnection && existingState.wsConnection) {
      cleanState.wsConnection = existingState.wsConnection;
      console.log(`[resetCallState] Preserved WebSocket connection for call: ${callId}`);
    }
    
    // Update both storage mechanisms to ensure compatibility
    if (this.activeCallState instanceof Map) {
      this.activeCallState.set(callId, cleanState);
    }
    if (typeof this.callStates === 'object') {
      this.callStates[callId] = cleanState;
    }
    
    console.log(`[resetCallState] Call state reset successfully for call: ${callId}`);
    
    return cleanState;
    const currentCallState = this.activeCallState.get(callId);
    if (!currentCallState) {
      console.log(`No active call state found for call: ${callId}`);
      return null;
    }
    
    // Create new call state with preserved connections if needed
    const newCallState = {
      callId: callId,
      twilioSid: currentCallState.twilioSid || null,
      status: currentCallState.status || 'reset',
      lastResponse: null,
      conversationHistory: currentCallState.conversationHistory || [],
      callData: currentCallState.callData || {},
      startTime: currentCallState.startTime || new Date(),
      endTime: null
    };
    
    // Preserve WebSocket connection if requested
    if (preserveConnection && currentCallState.wsConnection) {
      newCallState.wsConnection = currentCallState.wsConnection;
      console.log(`Preserved WebSocket connection for call: ${callId}`);
    }
    
    // Update the call state
    this.activeCallState.set(callId, newCallState);
    console.log(`Call state reset for call: ${callId}`);
    
    return newCallState;
  }

  // Method to end a call - defined outside of constructor as a proper class method
  async endCall(callId) {
    console.log(`Attempting to end call: ${callId}`);
    const callState = this.activeCallState.get(callId);
    
    if (callState && callState.twilioSid) {
      try {
        await twilioService.endCall(callState.twilioSid);
        console.log(`Twilio call termination requested for ${callState.twilioSid}`);
      } catch (error) {
        console.error(`Error requesting Twilio to end call ${callState.twilioSid}:`, error);
      }
    } else {
        console.warn(`No active call state or Twilio SID found for callId ${callId} to end.`);
    }

    // Clean up local state regardless of Twilio API success
    if (this.activeCallState.has(callId)) {
      if (callState && callState.mediaStream && callState.mediaStream.close) {
        try {
          await callState.mediaStream.close();
        } catch (streamError) {
          console.warn(`Error closing media stream during endCall for ${callId}:`, streamError);
        }
      }
      this.activeCallState.delete(callId);
      console.log(`Cleared active call state for ${callId}`);
    }
    
    // Update database status
    try {
        const callRecord = await Call.findById(callId);
        if (callRecord) {
            callRecord.status = 'completed';
            // Determine outcome based on actual call data
            callRecord.outcome = this.determineCallOutcome(callRecord);
            if (!callRecord.endTime) callRecord.endTime = new Date();
            // Calculate duration if not set
            if (!callRecord.duration && callRecord.startTime) {
              callRecord.duration = Math.floor((callRecord.endTime - callRecord.startTime) / 1000);
            }
            await callRecord.save();
            console.log(`Call ${callId} status updated to completed with outcome: ${callRecord.outcome}`);
        }
    } catch(dbError) {
        console.error(`Error updating call ${callId} in DB during endCall:`, dbError);
    }
  }

  // Initiate a single call - REAL-TIME STREAMING VERSION
  async initiateCall(req, res) {
    try {
      // Debug: Check if 'this' context is properly bound
      if (!this || !this.activeCallState) {
        console.error('[initiateCall] ERROR: this context is not properly bound or activeCallState is missing');
        console.error('[initiateCall] this:', typeof this);
        console.error('[initiateCall] this.activeCallState:', typeof this?.activeCallState);
        console.error('[initiateCall] this.realTimeService:', typeof this?.realTimeService);
        console.error('[initiateCall] this.resetCallState:', typeof this?.resetCallState);
        
        return res.status(500).json({
          message: 'Server error: CallController context is not properly initialized',
          error: 'CONTROLLER_CONTEXT_ERROR'
        });
      }

      const { 
        phoneNumber, 
        scriptId, 
        promptId, 
        voiceProvider, 
        ttsProvider, 
        sttProvider, 
        llmProvider, 
        language, 
        voice,
        voiceId, // Accept voiceId from frontend
        enableInterruptions,
        recordConversation
      } = req.body;
      
      // Handle both 'voice' and 'voiceId' parameter names for compatibility
      const selectedVoice = voice || voiceId;
      
      console.log('[initiateCall] Voice parameter debugging:', {
        voice: voice,
        voiceId: voiceId,
        selectedVoice: selectedVoice,
        requestBody: req.body
      });
      
      // Normalize language parameter
      let normalizedLanguage = language;
      if (language === 'english' || language === 'en') {
        normalizedLanguage = 'en-US';
      } else if (language === 'hindi' || language === 'hi') {
        normalizedLanguage = 'hi-IN';
      } else if (!language) {
        normalizedLanguage = 'en-US';
      }
      
      // Normalize voice provider and other provider parameters
      let normalizedVoiceProvider = voiceProvider || ttsProvider;
      let normalizedTtsProvider = ttsProvider || voiceProvider;
      let normalizedSttProvider = sttProvider;
      let normalizedLlmProvider = llmProvider;
      
      // Handle mappings for voice/TTS provider - Convert to database-compatible values
      if (normalizedVoiceProvider === 'chatgpt' || normalizedVoiceProvider === 'openai' || normalizedVoiceProvider === 'openai_fm') {
        normalizedVoiceProvider = 'chatgpt_tts'; // Convert to database enum value
      } else if (normalizedVoiceProvider === 'rime') {
        normalizedVoiceProvider = 'rime_tts'; // Convert to database enum value
      } else if (!normalizedVoiceProvider) {
        normalizedVoiceProvider = 'chatgpt_tts'; // Default to ChatGPT TTS
      }
      
      // Handle mappings for TTS provider - Convert to database-compatible values
      if (normalizedTtsProvider === 'chatgpt' || normalizedTtsProvider === 'openai' || normalizedTtsProvider === 'openai_fm') {
        normalizedTtsProvider = 'chatgpt_tts'; // Convert to database enum value
      } else if (normalizedTtsProvider === 'rime') {
        normalizedTtsProvider = 'rime_tts'; // Convert to database enum value
      } else if (!normalizedTtsProvider) {
        normalizedTtsProvider = 'chatgpt_tts'; // Default to ChatGPT TTS
      }
      
      // Handle mappings for STT provider - Convert to database-compatible values
      if (normalizedSttProvider === 'google') {
        normalizedSttProvider = 'google_stt'; // Convert to database enum value
      } else if (!normalizedSttProvider) {
        normalizedSttProvider = 'deepgram'; // Default to Deepgram
      }
      
      // Handle mappings for LLM provider - Already compatible with database
      if (!normalizedLlmProvider) {
        normalizedLlmProvider = 'openai'; // Default to OpenAI
      }
      
      console.log('[initiateCall] Initiating REAL-TIME call with:', { 
        phoneNumber, 
        scriptId, 
        promptId, 
        voiceProvider: normalizedVoiceProvider,
        ttsProvider: normalizedTtsProvider,
        sttProvider: normalizedSttProvider,
        llmProvider: normalizedLlmProvider,
        language: normalizedLanguage, 
        voice: selectedVoice, // Use selectedVoice (voice or voiceId)
        enableInterruptions: enableInterruptions !== false,
        recordConversation: recordConversation !== false
      });
      
      // Validate required fields
      if (!phoneNumber || !scriptId || !promptId) {
        console.log('[initiateCall] Missing required fields:', { phoneNumber, scriptId, promptId });
        return res.status(400).json({ 
          message: 'Missing required fields. Please provide phoneNumber, scriptId, and promptId',
          error: 'MISSING_FIELDS'
        });
      }

      // Clean phone number
      const cleanPhoneNumber = phoneNumber.trim().replace(/\s+/g, '');

      // Validate phone number format
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(cleanPhoneNumber)) {
        console.log('[initiateCall] Invalid phone number format:', cleanPhoneNumber);
        return res.status(400).json({ 
          message: 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)',
          error: 'INVALID_PHONE_NUMBER'
        });
      }
      
      // Check if customer exists with this phone number
      let customer = await Customer.findOne({ phoneNumber: cleanPhoneNumber });
      
      // If no customer exists, create one
      if (!customer) {
        console.log('[initiateCall] Creating new customer for phone number:', cleanPhoneNumber);
        customer = new Customer({
          name: 'Unknown',
          phoneNumber: cleanPhoneNumber,
          notes: 'Auto-created during call initiation'
        });
        await customer.save();
      }
      
      // Get script and prompt
      console.log('[initiateCall] Fetching script and prompt:', { scriptId, promptId });

      // Fetch script and prompt
      const [script, prompt] = await Promise.all([
        Script.findById(scriptId),
        Prompt.findById(promptId)
      ]);

      if (!script || !prompt) {
        console.log('[initiateCall] Script or prompt not found:', { scriptFound: !!script, promptFound: !!prompt });
        return res.status(404).json({
          message: !script ? 'Script not found' : 'Prompt not found',
          error: 'NOT_FOUND',
          scriptFound: !!script,
          promptFound: !!prompt
        });
      }

      // Create a new call record for real-time streaming
      const call = await Call.create({
        customerNumber: cleanPhoneNumber,
        scriptId: scriptId,
        promptId: promptId,
        script: script.content, // Store script content for real-time access
        prompt: prompt.content, // Store prompt content for real-time access
        startTime: new Date(),
        status: 'initiating',
        outcome: 'in-progress',
        voiceProvider: normalizedVoiceProvider, // Use normalized voice provider
        ttsProvider: normalizedTtsProvider, // Store TTS provider
        sttProvider: normalizedSttProvider, // Store STT provider
        llmProvider: normalizedLlmProvider, // Store LLM provider
        voiceId: selectedVoice || null, // Store selected voice ID
        language: normalizedLanguage, // Use normalized language
        streamingMode: 'real-time', // Flag to indicate this is a real-time streaming call
        enableInterruptions: enableInterruptions !== false,
        recordConversation: recordConversation !== false
      });

      const callId = call._id.toString();
      console.log(`[initiateCall] Created call record with ID: ${callId}`);
      console.log(`[initiateCall] Call voiceId stored as: ${call.voiceId}`);

      // Initialize real-time call service with streaming configuration
      try {
        // Check if realTimeService exists and has initializeCall method
        if (this.realTimeService && typeof this.realTimeService.initializeCall === 'function') {
          await this.realTimeService.initializeCall(callId, {
            phoneNumber: cleanPhoneNumber,
            script: script.content,
            prompt: prompt.content,
            language: normalizedLanguage, // Use normalized language
            voiceProvider: normalizedVoiceProvider, // Use normalized voice provider
            ttsProvider: normalizedTtsProvider, // Pass TTS provider
            sttProvider: normalizedSttProvider, // Pass STT provider
            llmProvider: normalizedLlmProvider, // Pass LLM provider
            voiceId: selectedVoice || null,
            campaignName: 'Outbound Call Campaign',
            enableInterruptions: enableInterruptions !== false,
            recordConversation: recordConversation !== false
          });
          
          console.log(`[initiateCall] Real-time service initialized for call: ${callId}`);
        } else {
          console.log(`[initiateCall] Real-time service not available, skipping initialization`);
        }
      } catch (realTimeError) {
        console.error('[initiateCall] Error initializing real-time service:', realTimeError);
        // Continue with call initiation - the service can handle this gracefully
      }

      // Initialize call state for streaming - ensure the method exists
      if (typeof this.resetCallState === 'function') {
        this.resetCallState(callId);
      } else {
        // Fallback if resetCallState doesn't exist
        console.log(`[initiateCall] resetCallState method not found, creating call state directly`);
        if (!this.activeCallState) {
          this.activeCallState = new Map();
        }
        this.activeCallState.set(callId, {
          callId,
          status: 'connected',
          startTime: new Date(),
          lastActivity: Date.now(),
          transcription: [],
          conversationHistory: []
        });
      }
      
      // Get the call state safely
      const initialCallState = this.activeCallState.get(callId) || {};
      
      // Configure call state for real-time streaming
      initialCallState.script = script.content;
      initialCallState.prompt = prompt.content;
      initialCallState.scriptId = scriptId;
      initialCallState.promptId = promptId;
      initialCallState.useClonedVoice = false; // Using only ChatGPT, ElevenLabs, and standard services
      initialCallState.voiceProvider = normalizedVoiceProvider; // Use normalized voice provider
      initialCallState.ttsProvider = normalizedTtsProvider; // Store TTS provider
      initialCallState.sttProvider = normalizedSttProvider; // Store STT provider
      initialCallState.llmProvider = normalizedLlmProvider; // Store LLM provider
      initialCallState.voiceId = voice || null;
      initialCallState.language = normalizedLanguage; // Use normalized language
      initialCallState.callType = 'outbound';
      initialCallState.streamingMode = 'real-time';
      initialCallState.enableInterruptions = enableInterruptions !== false;
      initialCallState.recordConversation = recordConversation !== false;
      initialCallState.twilioSid = null; // Will be set when Twilio call starts

      // Set customer information
      initialCallState.callData = {
        customerName: customer.name,
        customerPhoneNumber: customer.phoneNumber
      };

      // Make the call using Twilio service with real-time streaming configuration
      try {
        console.log(`[initiateCall] Making REAL-TIME outbound call to ${cleanPhoneNumber}`);
        
        // Check if Twilio credentials are available
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
        
        if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
          console.error('[initiateCall] Missing Twilio credentials:', {
            hasSid: !!twilioAccountSid,
            hasToken: !!twilioAuthToken,
            hasPhone: !!twilioPhoneNumber
          });
          return res.status(400).json({
            message: 'Missing Twilio credentials. Check your .env file.',
            error: 'TWILIO_AUTH_ERROR',
            details: `Missing: ${!twilioAccountSid ? 'ACCOUNT_SID ' : ''}${!twilioAuthToken ? 'AUTH_TOKEN ' : ''}${!twilioPhoneNumber ? 'PHONE_NUMBER' : ''}`
          });
        }
        
        // Check for NGROK_URL
        const ngrokUrl = process.env.NGROK_URL;
        if (!ngrokUrl) {
          console.error('[initiateCall] Missing NGROK_URL in environment variables');
          return res.status(400).json({
            message: 'Missing NGROK_URL configuration required for Twilio webhooks',
            error: 'MISSING_NGROK_URL'
          });
        }
        
        // Try to make the call
        const twilioResponse = await twilioService.makeCall(callId, cleanPhoneNumber, language || 'en-US');
        
        if (!twilioResponse || !twilioResponse.sid) {
          console.error('[initiateCall] Invalid response from Twilio API');
          return res.status(500).json({
            message: 'Invalid response from Twilio API',
            error: 'TWILIO_API_ERROR'
          });
        }
        
        // Update call record with Twilio SID
        await Call.findByIdAndUpdate(callId, { 
          twilioSid: twilioResponse.sid,
          status: 'connecting'
        });
        
        // Update call state with Twilio SID
        initialCallState.twilioSid = twilioResponse.sid;
        
        // Update real-time service with Twilio SID
        await this.realTimeService.updateCallStatus(callId, {
          status: 'connecting',
          twilioSid: twilioResponse.sid
        });
        
        console.log(`[initiateCall] Twilio call initiated successfully with SID: ${twilioResponse.sid}`);
        
        // Start real-time processing preparation
        this.initializeRealTimeProcessing(callId, twilioResponse.sid);
        
      } catch (twilioError) {
        console.error('[initiateCall] Error making Twilio call:', twilioError.message);
        console.error('[initiateCall] Error details:', twilioError);
        
        // Map common Twilio error codes to more user-friendly messages
        let errorType = 'TWILIO_API_ERROR';
        let errorMessage = twilioError.message || 'Error making outbound call';
        let errorDetails = '';
        
        // Check for specific Twilio error codes
        if (twilioError.code) {
          errorDetails = `Error code: ${twilioError.code}`;
          
          switch(twilioError.code) {
            case 20404:
              errorType = 'INVALID_PHONE_NUMBER';
              errorMessage = 'The destination phone number is invalid or not supported';
              break;
            case 20003:
              errorType = 'AUTHENTICATION_ERROR';
              errorMessage = 'Authentication error with phone system';
              break;
            case 21210:
              errorType = 'INVALID_FROM_NUMBER';
              errorMessage = 'The sender phone number is invalid or not configured properly';
              break;
            case 21612:
              errorType = 'GEO_PERMISSION_ERROR';
              errorMessage = 'The destination phone number is not allowed due to geographic restrictions';
              break;
            case 13224:
              errorType = 'WEBHOOK_ERROR';
              errorMessage = 'Invalid webhook URL configuration';
              break;
          }
        }
        
        // Return error response to client
        return res.status(400).json({
          message: errorMessage,
          error: errorType,
          details: errorDetails
        });
        
        // Update call status to failed
        await Call.findByIdAndUpdate(callId, { 
          status: 'failed',
          outcome: 'failed_to_connect'
        });
        
        // Clean up real-time service
        await this.realTimeService.cleanup(callId);
        
        return res.status(500).json({
          message: 'Failed to initiate Twilio call',
          error: twilioError.message,
          callId: callId
        });
      }
      
      console.log(`[initiateCall] REAL-TIME call initiated successfully with callId: ${callId}`);

      // Respond with success
      res.status(200).json({
        message: 'Real-time call initiated successfully',
        callId: callId,
        success: true,
        streamingMode: 'real-time'
      });
      
    } catch (error) {
      console.error('[initiateCall] Error initiating real-time call:', error);
      res.status(500).json({ 
        message: 'Failed to initiate real-time call', 
        error: error.message 
      });
    }
  }
  
  /**
   * Get all calls from database
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Array of all calls
   */
  async getAllCalls(req, res) {
    try {
      console.log(`[getAllCalls] Retrieving all calls`);
      
      // Get query parameters for pagination and filtering
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      
      // Build filter object
      const filter = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.fromDate) {
        filter.createdAt = { ...filter.createdAt, $gte: new Date(req.query.fromDate) };
      }
      if (req.query.toDate) {
        filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.toDate) };
      }

      // Get calls with pagination, including provider information
      const calls = await Call.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-audioData') // Exclude large audio data from list view
        .lean(); // Use lean for better performance

      // Get total count for pagination
      const totalCalls = await Call.countDocuments(filter);

      // If no pagination is requested (for frontend compatibility), return all calls
      if (!req.query.page && !req.query.limit) {
        const allCalls = await Call.find(filter)
          .sort({ createdAt: -1 })
          .select('-audioData')
          .lean();
        
        console.log(`[getAllCalls] Retrieved ${allCalls.length} calls from database`);
        return res.status(200).json(allCalls);
      }

      const response = {
        calls,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCalls / limit),
          totalCalls,
          hasNextPage: page < Math.ceil(totalCalls / limit),
          hasPrevPage: page > 1
        }
      };

      console.log(`[getAllCalls] Retrieved ${calls.length} calls (page ${page})`);
      res.status(200).json(response);
    } catch (error) {
      console.error(`[getAllCalls] Error retrieving calls:`, error);
      res.status(500).json({ 
        message: 'Error retrieving calls', 
        error: error.message 
      });
    }
  }

  /**
   * Upload and process bulk calls
   * @param {Object} req - Express request object with file upload
   * @param {Object} res - Express response object
   * @returns {Object} Upload result
   */
  async uploadBulkCalls(req, res) {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      
      try {
        // Get script, prompt, and voice provider from the request
        const { scriptId, promptId, voiceProvider } = req.body;
        
        if (!scriptId || !promptId) {
          return res.status(400).json({ 
            message: 'Missing required fields. Please provide scriptId and promptId',
            error: 'MISSING_FIELDS'
          });
        }
        
        // Example implementation: parse CSV and initiate calls
        const results = [];
        const filePath = req.file.path;
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', async () => {
            // Process each row for bulk calling
            const processedCalls = [];
            
            for (const row of results) {
              // Get phone number from the first column
              const phoneNumber = Object.values(row)[0];
              if (phoneNumber) {
                try {
                  // Initiate call with the specified voice provider
                  const callData = {
                    phoneNumber,
                    scriptId,
                    promptId,
                    voiceProvider: voiceProvider || 'clone_voice' // Use provided voice provider or default
                  };
                  
                  // Queue the call for processing (don't wait for each call to complete)
                  processedCalls.push(callData);
                } catch (callError) {
                  console.error('Error processing call for number:', phoneNumber, callError);
                }
              }
            }
            
            // Remove uploaded file after processing
            fs.unlinkSync(filePath);
            res.status(200).json({ 
              message: 'Bulk calls processed successfully', 
              count: results.length,
              callsQueued: processedCalls.length
            });
            
            // Process calls after sending response, to avoid timeout
            for (const callData of processedCalls) {
              try {
                await this.initiateCall({ body: callData }, { status: () => ({ json: () => {} }) });
              } catch (error) {
                console.error('Error initiating call in bulk process:', error);
              }
            }
          })
          .on('error', (csvErr) => {
            res.status(500).json({ message: 'Error processing CSV file', error: csvErr.message });
          });
      } catch (error) {
        res.status(500).json({ message: 'Error processing bulk calls', error: error.message });
      }
    });
  }

  /**
   * Handle Twilio voice webhook - REAL-TIME STREAMING VERSION
   * This method processes incoming voice webhooks from Twilio using WebSocket streaming
   */
  async handleVoiceWebhook(req, res) {
    const callId = req.params.id;
    const callSid = req.body.CallSid;
    const timerId = logger.startTimer('voice_webhook', { callId, callSid });
    
    try {
      logger.info('Real-time voice webhook received', { 
        callId,
        callSid,
        from: req.body.From,
        to: req.body.To,
        callStatus: req.body.CallStatus,
        direction: req.body.Direction,
        streamingMode: 'real-time'
      });
      
      // Use the real-time streaming version of handleIncomingVoice
      req.callId = callId;
      const twiml = await this.handleIncomingVoice(req);
      
      // Ensure proper content type is set for Twilio
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml.toString());
      
      const duration = logger.endTimer(timerId, { twimlLength: twiml.toString().length });
      logger.info('Real-time voice webhook processed successfully', {
        callId,
        duration: `${duration.toFixed(2)}ms`,
        twimlLength: twiml.toString().length,
        streamingEnabled: true
      });
      
    } catch (error) {
      const duration = logger.endTimer(timerId, { error: error.message });
      logger.error('Error in real-time voice webhook', { 
        callId,
        error: error.message,
        stack: error.stack,
        duration: `${duration.toFixed(2)}ms`
      });
      
      // Fallback TwiML in case of error
      const voiceResponse = new twilio.twiml.VoiceResponse();
      voiceResponse.say('We\'re sorry, but we encountered a technical issue. Please try again later.');
      
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(voiceResponse.toString());
    }
  }

  /**
   * Handle incoming voice webhook - REAL-TIME STREAMING VERSION
   * @param {Object} req - Express request object with callId parameter
   * @returns {Object} - TwiML response for Twilio with WebSocket streaming
   */
  async handleIncomingVoice(req) {
    const twilioCallSid = req.body.CallSid;
    const callId = req.callId || req.params.id || twilioCallSid;
    
    try {
      console.log(`[handleIncomingVoice] Processing REAL-TIME voice webhook for call: ${callId}`);
      
      let call = null;
      
      try {
        // For incoming webhooks, first try to find existing call by Twilio SID with timeout
        call = await Call.findOne({ twilioSid: twilioCallSid }).maxTimeMS(5000);
        
        // If no call found, this might be a new incoming call or outbound call lookup by ID
        if (!call && callId !== twilioCallSid) {
          call = await Call.findById(callId).maxTimeMS(5000);
        }
      } catch (dbError) {
        console.warn(`[handleIncomingVoice] Database query timeout/error: ${dbError.message}`);
        // Continue with call = null to create new call
      }
      
      // If still no call found, create a new call record for incoming call
      if (!call) {
        console.log(`[handleIncomingVoice] Creating new call record for incoming Twilio call: ${twilioCallSid}`);
        
        try {
          // Create new call record with default values (avoiding additional DB queries that might timeout)
          call = await Call.create({
            twilioSid: twilioCallSid,
            phoneNumber: req.body.From || 'Unknown',
            customerNumber: req.body.From || 'Unknown',
            script: 'Welcome to Secure Voice AI. How can I assist you today?',
            prompt: 'You are a helpful AI assistant. Be friendly, helpful, and concise in your responses.',
            startTime: new Date(),
            status: 'in-progress',
            callType: 'inbound',
            language: 'en-US',
            voiceProvider: 'openai_fm'
          });
          
          // Update callId to use the database ID
          callId = call._id.toString();
          console.log(`[handleIncomingVoice] Created new call record with ID: ${callId}`);
        } catch (createError) {
          console.error(`[handleIncomingVoice] Failed to create call record: ${createError.message}`);
          
          // Fallback: use a temporary call object for this session
          call = {
            _id: callId,
            twilioSid: twilioCallSid,
            phoneNumber: req.body.From || 'Unknown',
            script: 'Welcome to Secure Voice AI. How can I assist you today?',
            prompt: 'You are a helpful AI assistant. Be friendly, helpful, and concise in your responses.',
            language: 'en-US',
            voiceProvider: 'openai_fm'
          };
          console.log(`[handleIncomingVoice] Using temporary call object for session`);
        }
      }
      
      // Initialize call state for real-time processing
      if (!this.activeCallState.has(callId)) {
        this.activeCallState.set(callId, {
          callId,
          status: 'in-progress',
          isGreetingPlayed: true,
          conversationHistory: [],
          twilioSid: req.body.CallSid || call.twilioSid,
          startTime: new Date(),
          lastActivity: Date.now(),
          useRealTimeStreaming: true, // Flag for real-time mode
          script: call.script || 'Welcome to Secure Voice AI. How can I assist you today?',
          prompt: call.prompt || 'You are a helpful AI assistant.',
          language: call.language || 'en-US'
        });
      }
      
      // Generate TwiML response with REAL-TIME WebSocket streaming
      const voiceResponse = new this.VoiceResponse();
      
      console.log(`[handleIncomingVoice] Setting up REAL-TIME WebSocket streaming for call: ${callId}`);
      
      // Get WebSocket URL from environment
      const ngrokUrl = process.env.NGROK_URL;
      if (!ngrokUrl) {
        throw new Error('NGROK_URL not configured for real-time streaming');
      }
      
      // Construct proper WebSocket URL - FIXED for Error 31920
      let wsUrl;
      
      // Clean and validate the ngrok URL
      const cleanNgrokUrl = ngrokUrl.trim().replace(/\/$/, ''); // Remove trailing slash
      
      if (cleanNgrokUrl.startsWith('https://')) {
        wsUrl = cleanNgrokUrl.replace('https://', 'wss://') + '/ws/twilio';
      } else if (cleanNgrokUrl.startsWith('http://')) {
        wsUrl = cleanNgrokUrl.replace('http://', 'ws://') + '/ws/twilio';
      } else {
        // Assume it's just the domain without protocol
        wsUrl = `wss://${cleanNgrokUrl}/ws/twilio`;
      }
      
      // Validate WebSocket URL format
      try {
        new URL(wsUrl);
        console.log(`[handleIncomingVoice] ✅ Valid WebSocket URL constructed: ${wsUrl}`);
      } catch (urlError) {
        console.error(`[handleIncomingVoice] ❌ Invalid WebSocket URL: ${wsUrl}`);
        throw new Error(`Invalid WebSocket URL constructed: ${wsUrl}`);
      }
      
      console.log(`[handleIncomingVoice] Constructed WebSocket URL: ${wsUrl}`);
      
      // CRITICAL FIX for Error 31920 & 31941: Use proper Stream setup for bidirectional audio
      const connect = voiceResponse.connect();
      
      // Set up WebSocket stream with proper configuration for Twilio Media Streams
      // FIXED for Error 31941: Use "inbound_track" (NOT "both_tracks" which is invalid)
      const stream = connect.stream({
        url: wsUrl,
        track: "inbound_track" // FIXED: Use "inbound_track" for receiving caller audio
      });
      
      // Pass call configuration as custom parameters (with validation)
      const parameters = [
        { name: 'callId', value: callId },
        { name: 'language', value: call.language || 'en-US' },
        { name: 'script', value: (call.script || 'Welcome to Secure Voice AI. How can I assist you today?').substring(0, 500) },
        { name: 'prompt', value: (call.prompt || 'You are a helpful AI assistant.').substring(0, 500) }
      ];
      
      // Add voice provider configuration if available
      if (call.voiceProvider) {
        parameters.push({ name: 'voiceProvider', value: call.voiceProvider });
      }
      
      if (call.voiceId) {
        parameters.push({ name: 'voiceId', value: call.voiceId });
      }
      
      // Add all parameters to the stream
      parameters.forEach(param => {
        stream.parameter({
          name: param.name,
          value: param.value
        });
      });
      
      console.log(`[handleIncomingVoice] ✅ REAL-TIME TwiML Generated Successfully for call: ${callId}`);
      console.log(`[handleIncomingVoice] 🔧 WebSocket URL: ${wsUrl}`);
      console.log(`[handleIncomingVoice] 🎯 Error 31920 & 31941 Fixes Applied:`);
      console.log(`[handleIncomingVoice]    ✓ track: "inbound_track" (FIXED from "both_tracks")`);
      console.log(`[handleIncomingVoice]    ✓ Validated WebSocket URL format`);
      console.log(`[handleIncomingVoice]    ✓ Proper parameter validation and truncation`);
      console.log(`[handleIncomingVoice]    ✓ Enhanced error handling`);
      
      return voiceResponse;
    } catch (error) {
      console.error(`[handleIncomingVoice] Error in real-time mode: ${error.message}`);
      
      // Fallback to basic TwiML in case of error (without real-time streaming)
      const errorResponse = new this.VoiceResponse();
      errorResponse.say({ 
        voice: 'woman',
        language: 'en-US' 
      }, 'We encountered a technical issue. Please try again.');
      
      return errorResponse;
    }
  }

  /**
   * Handle Twilio recording webhook
   * This method processes recording webhooks from Twilio
   */
  async handleRecordingWebhook(req, res) {
    try {
      const recordingSid = req.body.RecordingSid;
      const callSid = req.body.CallSid;
      const recordingUrl = req.body.RecordingUrl;
      
      console.log(`Processing recording webhook for SID: ${recordingSid}, call SID: ${callSid}`);
      
      // Find the active call with this SID
      let callId = null;
      for (const [id, state] of this.activeCallState.entries()) {
        if (state.twilioSid === callSid) {
          callId = id;
          break;
        }
      }
      
      if (callId) {
        // Update call in database to include recording URL
        await Call.findByIdAndUpdate(callId, { 
          recordingUrl: recordingUrl,
          recordingSid: recordingSid
        });
        
        console.log(`Updated call ${callId} with recording information`);
      } else {
        console.warn(`No active call found for recording with SID: ${callSid}`);
      }
      
      res.status(200).json({ message: 'Recording processed successfully' });
    } catch (error) {
      console.error('Error handling recording webhook:', error);
      res.status(500).json({ message: 'Error processing recording webhook', error: error.message });
    }
  }
  
  /**
   * Handle call status updates
   * This method processes call status updates from the frontend or Twilio
   */
  async handleCallStatus(req, res) {
    try {
      // First, try to get callId from params for webhook calls
      let callId = req.params.id;
      let status = req.body.CallStatus;
      let callSid = req.body.CallSid;
      
      // If not a webhook call, use body parameters
      if (!status && req.body.status) {
        callId = req.body.callId;
        status = req.body.status;
        callSid = req.body.callSid;
      }
      
      // If we still don't have a callId, try to find it by callSid
      if (!callId && callSid) {
        // Try to find the call in our active calls map
        for (const [id, state] of this.activeCallState.entries()) {
          if (state.twilioSid === callSid) {
            callId = id;
            break;
          }
        }
        
        // If not found in active calls, try the database
        if (!callId) {
          const call = await Call.findOne({ twilioSid: callSid });
          if (call) {
            callId = call._id.toString();
          }
        }
      }
      
      if (!callId) {
        // If we can't determine the callId, just return success for webhook
        // This prevents Twilio from retrying and getting the same error
        if (req.body.CallSid) {
          return res.status(200).send();
        }
        return res.status(400).json({ message: 'Call ID is required' });
      }
      
      console.log(`Updating call status for call ID ${callId} to ${status}`);
      
      // Update call in database
      const updatedCall = await Call.findByIdAndUpdate(
        callId, 
        { 
          status: status, 
          twilioSid: callSid || undefined,
          ...(status === 'completed' ? { endTime: new Date() } : {}),
        },
        { new: true }
      );
      
      // If call not found in database but we have a callId, create a record
      let responseCall = updatedCall;
      if (!updatedCall && callId && status) {
        const newCall = new Call({
          _id: callId,
          status: status,
          twilioSid: callSid,
          startTime: new Date(),
          ...(status === 'completed' ? { endTime: new Date() } : {})
        });
        responseCall = await newCall.save();
      }
      
      // Update active call state if it exists
      if (this.activeCallState.has(callId)) {
        const callState = this.activeCallState.get(callId);
        callState.status = status;
        if (callSid) {
          callState.twilioSid = callSid;
        }
        if (status === 'completed') {
          callState.endTime = new Date();
        }
      }
      
      res.status(200).json({ 
        message: 'Call status updated successfully',
        call: updatedCall
      });
    } catch (error) {
      console.error('Error updating call status:', error);
      res.status(500).json({ message: 'Error updating call status', error: error.message });
    }
  }
  
  /**
   * Handle incoming calls
   * This method processes incoming calls from Twilio
   */
  async handleIncomingCall(req, res) {
    try {
      const { From: phoneNumber, CallSid: callSid } = req.body;
      console.log(`Handling incoming call from ${phoneNumber}, SID: ${callSid}`);
      
      // Get default script and prompt for incoming calls
      const defaultScript = await Script.findOne({ isDefault: true }) || 
                           await Script.findOne({});
      
      if (!defaultScript) {
        console.error('No script found for incoming call');
        return res.status(500).json({ message: 'No script found for incoming call' });
      }
      
      const defaultPrompt = await Prompt.findOne({ isDefault: true }) || 
                           await Prompt.findOne({});
      
      if (!defaultPrompt) {
        console.error('No prompt found for incoming call');
        return res.status(500).json({ message: 'No prompt found for incoming call' });
      }
      
      // Create a new call record
      const call = await Call.create({
        phoneNumber,
        script: defaultScript.content,
        prompt: defaultPrompt.content,
        startTime: new Date(),
        status: 'in-progress',
        useClonedVoice: false,
        callType: 'inbound'
      });
      
      // Initialize call state
      const callId = call._id.toString();
      this.resetCallState(callId);
      
      // Set call state
      const callState = this.activeCallState.get(callId);
      callState.script = defaultScript.content;
      callState.prompt = defaultPrompt.content;
      callState.useClonedVoice = false;
      callState.callType = 'inbound';
      callState.twilioSid = callSid;
      callState.status = 'in-progress';
      
      // Generate TwiML response
      const twiml = new VoiceResponse();
      twiml.say('Thank you for calling. Our AI assistant will be with you shortly.');
      
      // Return TwiML for Twilio to handle the call
      res.set('Content-Type', 'text/xml');
      res.send(twiml.toString());
      
      // Initialize real-time processing for this call
      await this.initializeRealTimeProcessing(callId, callSid);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      res.status(500).json({ message: 'Error handling incoming call' });
    }
  }

  /**
   * Initialize real-time processing for a call
   * This method sets up voice cloning and real-time processing for a call
   * @param {string} callId - The database ID of the call
   * @param {string} callSid - The Twilio SID of the call
   */
  async initializeRealTimeProcessing(callId, callSid) {
    try {
      console.log(`Initializing real-time processing for call ${callId} with SID ${callSid}`);
      
      // Get call state
      const callState = this.activeCallState.get(callId);
      if (!callState) {
        console.error(`No call state found for call ${callId}`);
        return;
      }
      
      // No voice cloning initialization needed - using only ChatGPT, ElevenLabs, and standard services
      callState.useClonedVoice = false;
      
      // Set up media stream for real-time audio processing with retries
      try {
        // Wait a bit to ensure any system resources are properly freed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            callState.mediaStream = await audioStreamService.createCallStream(callId);
            console.log(`Media stream created for call ${callId} on attempt ${attempt}`);
            break;
          } catch (streamError) {
            console.error(`Attempt ${attempt} to create media stream failed:`, streamError.message);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
              throw streamError; // Re-throw on last attempt
            }
          }
        }
      } catch (error) {
        console.error(`Failed to create media stream for call ${callId} after multiple attempts:`, error);
      }
      
      console.log(`Real-time processing initialized for call ${callId}`);
    } catch (error) {
      console.error(`Error initializing real-time processing for call ${callId}:`, error);
    }
  }

  /**
   * Handle AI response during a call - REAL-TIME STREAMING VERSION
   * This method processes AI responses and streams them directly without MP3 files
   */
  async handleAIResponse(req, res) {
    try {
      const { callId, response } = req.body;
      
      if (!callId || !response) {
        return res.status(400).json({ message: 'Call ID and response are required' });
      }
      
      const callState = this.activeCallState.get(callId);
      if (!callState) {
        return res.status(404).json({ message: 'Call not found or inactive' });
      }
      
      // Check if this is a real-time streaming call
      if (callState.streamingMode === 'real-time') {
        console.log(`[handleAIResponse] Processing real-time streaming response for call ${callId}`);
        
        // Update conversation history
        callState.conversationHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });
        
        try {
          // Use enhanced real-time streaming service
          const realTimeStreamingService = require('../services/realTimeStreamingService');
          
          console.log(`[handleAIResponse] Using enhanced real-time streaming for call ${callId}`);
          
          // Stream the AI response using the enhanced real-time streaming service
          const streamResult = await realTimeStreamingService.startStreaming(callId, response, {
            voiceProvider: callState.voiceProvider || 'openai_realtime',
            language: callState.language || 'en-US',
            voiceId: callState.voiceId,
            enableInterruptions: true, // Support for barge-in
            conversationHistory: callState.conversationHistory
          });
          
          if (streamResult.success) {
            console.log(`[handleAIResponse] Successfully initiated enhanced real-time streaming for call ${callId}`);
            
            // Return success without audio URL since we're streaming directly
            res.status(200).json({ 
              message: 'AI response streaming initiated', 
              streaming: true,
              success: true,
              text: response,
              language: callState.language || 'en-US',
              provider: streamResult.provider,
              sessionId: streamResult.sessionId
            });
          } else {
            throw new Error(streamResult.error || 'Enhanced streaming failed');
          }
          
        } catch (streamError) {
          console.error(`[handleAIResponse] Enhanced streaming error for call ${callId}:`, streamError);
          
          // Fallback to legacy audio stream service
          try {
            console.log(`[handleAIResponse] Falling back to legacy audio stream service for call ${callId}`);
            
            const stream = audioStreamService.getStream(callId);
            if (!stream) {
              console.log(`[handleAIResponse] Creating new audio stream for call ${callId}`);
              audioStreamService.createStream(callId);
            }
            
            // Stream using legacy service
            const streamResult = await audioStreamService.streamAiResponse(callId, response, {
              voiceProvider: callState.voiceProvider || 'elevenlabs',
              language: callState.language || 'en-US',
              conversationHistory: callState.conversationHistory,
              voiceId: callState.voiceId
            });
            
            if (streamResult.success) {
              res.status(200).json({ 
                message: 'AI response streaming initiated (legacy)', 
                streaming: true,
                success: true,
                text: streamResult.text || response,
                language: streamResult.language || callState.language
              });
              return;
            } else {
              throw new Error(streamResult.error || 'Legacy streaming failed');
            }
          } catch (legacyError) {
            console.error(`[handleAIResponse] Legacy streaming error for call ${callId}:`, legacyError);
            
            // Fallback to real-time audio service as last resort
            try {
              console.log(`[handleAIResponse] Falling back to real-time audio service for call ${callId}`);
              
              const audioStream = await realTimeAudioService.createRealTimeAudioStream(callId, response, {
                language: callState.language || 'en-US',
                voiceProvider: callState.voiceProvider || 'openai_fm',
                voiceId: callState.voiceId
              });
            
              // Update real-time call service
              await this.realTimeService.addTranscript(callId, {
                role: 'assistant',
                content: response,
                timestamp: new Date(),
                streaming: true              });
            
              res.status(200).json({ 
                message: 'AI response streaming via fallback service', 
                streaming: true,
                success: true,
                fallback: true,
                text: response
              });
            } catch (fallbackError) {
              console.error(`[handleAIResponse] Fallback streaming also failed for call ${callId}:`, fallbackError);
              throw fallbackError;
            }
          }
        }
        
      } else {
        // Legacy mode: Generate MP3 files for backward compatibility
        console.log(`[handleAIResponse] Using legacy MP3 generation for call ${callId}`);
        
        // Update conversation history
        callState.conversationHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });
        
        // Generate speech from text using legacy method
        const language = callState.language || 'en-US';
        try {
          const audioUrl = await generateAudioUrl(response, language, callId);
          
          if (!audioUrl) {
            console.error(`Failed to generate audio for call ${callId}`);
            return res.status(500).json({ message: 'Failed to generate audio' });
          }
          
          // Return the audio URL to the client
          res.status(200).json({ 
            message: 'AI response processed', 
            audioUrl,
            success: true,
            streaming: false,
            legacy: true
          });
        } catch (error) {
          console.error(`Error generating audio for call ${callId}:`, error);
          res.status(500).json({ message: 'Error generating audio', error: error.message });
        }
      }
      
    } catch (error) {
      console.error('[handleAIResponse] Error handling AI response:', error);
      res.status(500).json({ message: 'Error handling AI response', error: error.message });
    }
  }

  /**
   * Generate AI response using OpenAI API
   * @param {string} systemPrompt - The system prompt with context (not used directly, for backward compatibility)
   * @returns {string} - AI generated response
   */
  async generateOpenAIResponse(systemPrompt, callId) {
    try {
      const startTime = Date.now();
      console.log('[generateOpenAIResponse] Calling OpenAI API');
      
      // Get the call state to extract conversation context
      const callState = this.activeCallState.get(callId);
      if (!callState) {
        console.warn('[generateOpenAIResponse] No call state found, using fallback');
        return "I understand. How can I help you?";
      }
      
      // Use the existing openaiService with proper parameters
      const openaiService = require('../services/openaiService');
      
      const response = await openaiService.generateResponse(
        callState.conversationHistory || [],
        callState.script || '',
        callState.prompt || '',
        'english', // Default language
        callId
      );
      
      const responseTime = Date.now() - startTime;
      console.log(`[generateOpenAIResponse] OpenAI response received in ${responseTime}ms`);
      
      // Return the response text
      return response.text || response.content || 'I understand what you\'re saying.';
      
    } catch (error) {
      console.error('[generateOpenAIResponse] Error calling OpenAI:', error);
      
      // Return a fallback response to keep the conversation flowing
      const fallbackResponses = [
        "I understand. Can you tell me more?",
        "That's interesting. What else can I help you with?",
        "I see. Please continue.",
        "Thank you for sharing that with me.",
        "I appreciate you telling me that."
      ];
      
      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
  }

  /**
   * Get call details by ID
   * @param {Object} req - Express request object with call ID
   * @param {Object} res - Express response object
   * @returns {Object} Call data
   */
  async getCall(req, res) {
    try {
      const callId = req.params.id;
      
      if (!callId) {
        return res.status(400).json({ message: 'Call ID is required' });
      }

      // Find the call in database
      const call = await Call.findById(callId);
      
      if (!call) {
        return res.status(404).json({ message: 'Call not found' });
      }

      console.log(`[getCall] Call details retrieved for ID: ${callId}`);
      
      res.status(200).json(call);
    } catch (error) {
      console.error(`[getCall] Error retrieving call details:`, error);
      res.status(500).json({ message: 'Error retrieving call details', error: error.message });
    }
  }

  /**
   * Get all active calls
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Array} Array of active call IDs
   */
  async getActiveCalls(req, res) {
    try {
      const activeCalls = Array.from(this.activeCallState.keys()).map(callId => {
        const callState = this.activeCallState.get(callId);
        return {
          callId,
          status: callState.status,
          startTime: callState.startTime,
          twilioSid: callState.twilioSid,
          customerNumber: callState.customerNumber || callState.phoneNumber
        };
      });

      console.log(`[getActiveCalls] Retrieved ${activeCalls.length} active calls`);
      
      res.status(200).json(activeCalls);
    } catch (error) {
      console.error(`[getActiveCalls] Error retrieving active calls:`, error);
      res.status(500).json({ message: 'Error retrieving active calls', error: error.message });
    }
  }

  /**
   * Handle speech input from real-time audio streams
   * @param {Object} speechData - Speech data from the audio stream
   * @param {string} callId - The ID of the call
   */
  async handleSpeechInput(speechData, callId) {
    try {
           console.log(`[handleSpeechInput] Processing speech input for call ${callId}`);
      
      const callState = this.activeCallState.get(callId);
      if (!callState) {
        console.warn(`[handleSpeechInput] No call state found for call ${callId}`);
        return;
      }

      // Update conversation history with user input
      if (speechData.transcript && speechData.transcript.trim()) {
        callState.conversationHistory.push({
          role: 'user',
          content: speechData.transcript,
          timestamp: new Date()
        });

        console.log(`[handleSpeechInput] Added transcript to conversation: "${speechData.transcript}"`);
        
        // Update call state
        callState.lastActivity = Date.now();
        callState.customerSpeaking = false;
        
        // Notify WebSocket clients if available
        if (callState.wsConnection) {
          try {
            callState.wsConnection.send(JSON.stringify({
              type: 'transcript',
              transcript: speechData.transcript,
              speaker: 'user',
              timestamp: new Date()
            }));
          } catch (wsError) {
            console.warn(`Could not send WebSocket update: ${wsError.message}`);
          }
        }
      }

    } catch (error) {
      console.error(`[handleSpeechInput] Error processing speech input for call ${callId}:`, error);
    }
  }

  /**
   * Upload bulk calls from CSV file
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async uploadBulkCalls(req, res) {
    try {
      console.log(`[uploadBulkCalls] Processing bulk call upload`);
      
      // Use multer middleware explicitly here to handle the file upload
      upload(req, res, async (err) => {
        if (err) {
          console.error(`[uploadBulkCalls] Multer error:`, err);
          return res.status(400).json({ 
            message: err.message || 'Error uploading file'
          });
        }
        
        // Check if file was uploaded
        if (!req.file) {
          return res.status(400).json({ 
            message: 'No file uploaded. Please upload a CSV file.' 
          });
        }

        // Validate file type
        if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
          return res.status(400).json({ 
            message: 'Invalid file type. Please upload a CSV file.' 
          });
        }

        console.log(`[uploadBulkCalls] File uploaded: ${req.file.originalname}`);
        
        // Initialize results tracking
        const results = {
          totalRows: 0,
          successfulImports: 0,
          failedImports: 0,
          errors: [],
          phoneNumbers: []
        };
        
        try {
          // Retrieve needed data from request
          const scriptId = req.body.scriptId;
          const promptId = req.body.promptId;
          const ttsProvider = req.body.ttsProvider;
          const sttProvider = req.body.sttProvider;
          const llmProvider = req.body.llmProvider;
          const voiceId = req.body.voiceId;
          const language = req.body.language || 'english';
          
          // Validate required fields
          if (!scriptId || !promptId) {
            return res.status(400).json({
              message: 'Script ID and Prompt ID are required'
            });
          }
          
          // Process CSV file
          const rows = [];
          const filePath = req.file.path;
          
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
              // Get phone number from the first column (assuming first property in the row object)
              const phoneNumber = Object.values(row)[0];
              if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
                rows.push({
                  phoneNumber: phoneNumber.trim(),
                  ...row
                });
                results.phoneNumbers.push(phoneNumber.trim());
              }
            })
            .on('end', async () => {
              results.totalRows = rows.length;
              console.log(`[uploadBulkCalls] Processed ${rows.length} rows from CSV`);
              
              // For now, we'll just acknowledge the receipt of valid phone numbers
              // In a real implementation, calls would be scheduled
              results.successfulImports = rows.length;
              
              // Clean up - delete the temporary file
              fs.unlink(filePath, (err) => {
                if (err) console.error(`[uploadBulkCalls] Error deleting temp file:`, err);
              });
              
              // Return success response
              return res.status(200).json({
                message: `Successfully processed ${results.successfulImports} phone numbers for bulk calling`,
                processed: results.successfulImports,
                results
              });
            })
            .on('error', (csvError) => {
              console.error(`[uploadBulkCalls] CSV parsing error:`, csvError);
              return res.status(400).json({
                message: 'Error parsing CSV file',
                error: csvError.message
              });
            });
        } catch (processingError) {
          console.error(`[uploadBulkCalls] Error processing file:`, processingError);
          return res.status(500).json({
            message: 'Error processing uploaded file',
            error: processingError.message
          });
        }
      });
    } catch (error) {
      console.error(`[uploadBulkCalls] Error processing bulk upload:`, error);
      res.status(500).json({ 
        message: 'Error processing bulk upload', 
        error: error.message 
      });
    }
  }

  // Helper function to determine call outcomes based on actual call data and conversation history
  determineCallOutcome(call) {
    // If outcome is already set and not generic, keep it
    if (call.outcome && call.outcome !== 'in-progress' && call.outcome !== 'completed') {
      return call.outcome;
    }
    
    // Determine outcome based on call characteristics
    if (!call.endTime && !call.duration) {
      return 'failed'; // Call never connected
    }
    
    if (call.duration < 10) {
      return 'no_answer'; // Very short calls usually mean no answer
    }
    
    if (call.duration < 30) {
      return 'declined'; // Short calls often mean declined
    }
    
    // Check conversation history for clues about outcome
    if (call.conversationHistory && call.conversationHistory.length > 0) {
      const lastCustomerMessage = call.conversationHistory
        .filter(msg => msg.speaker === 'Customer')
        .pop();
      
      if (lastCustomerMessage) {
        const text = lastCustomerMessage.text.toLowerCase();
        
        // Look for positive indicators
        if (text.includes('interested') || text.includes('yes') || text.includes('sounds good')) {
          return 'interested';
        }
        
        // Look for callback requests
        if (text.includes('call back') || text.includes('later') || text.includes('tomorrow')) {
          return 'callback_scheduled';
        }
        
        // Look for negative indicators
        if (text.includes('not interested') || text.includes('no thanks') || text.includes('remove')) {
          return 'declined';
        }
        
        // Look for busy indicators
        if (text.includes('busy') || text.includes('driving') || text.includes('meeting')) {
          return 'busy';
        }
      }
      
      // If conversation was substantial (good length), consider it successful
      if (call.conversationHistory.length >= 6 && call.duration >= 60) {
        return 'successful';
      }
    }
    
    // Default for completed calls with reasonable duration
    if (call.duration >= 30) {
      return 'completed';
    }
    
    return 'in-progress'; // Still ongoing or unknown
  }

  // Handle voice webhook for specific call with script context
  async handleVoiceWebhook(req, res) {
    const callId = req.params.id;
    
    try {
      console.log(`[handleVoiceWebhook] Processing voice webhook for call: ${callId}`);
      
      // Fetch the call record to get script information
      const Call = require('../models/Call');
      const call = await Call.findById(callId);
      
      if (!call) {
        console.error(`[handleVoiceWebhook] Call not found: ${callId}`);
        return res.status(404).json({ error: 'Call not found' });
      }
      
      console.log(`[handleVoiceWebhook] Found call with script:`, {
        callId: callId,
        scriptId: call.scriptId,
        hasScriptContent: !!call.script
      });
      
      // Generate TwiML with WebSocket connection and call context
      const twiml = new (require('twilio')).twiml.VoiceResponse();
      
      // Construct WebSocket URL with callId as parameter
      const ngrokUrl = process.env.NGROK_URL;
      let wsUrl;
      
      if (ngrokUrl) {
        if (ngrokUrl.startsWith('https://')) {
          wsUrl = ngrokUrl.replace('https://', 'wss://') + '/ws/twilio';
        } else if (ngrokUrl.startsWith('http://')) {
          wsUrl = ngrokUrl.replace('http://', 'ws://') + '/ws/twilio';
        } else {
          wsUrl = 'wss://' + ngrokUrl + '/ws/twilio';
        }
      } else {
        wsUrl = `wss://${req.hostname}/ws/twilio`;
      }
      
      // Connect to WebSocket with custom parameters including callId
      const connect = twiml.connect();
      const stream = connect.stream({
        url: wsUrl,
        track: 'inbound_track'
      });
      
      // Add custom parameters to pass callId to WebSocket
      stream.parameter({
        name: 'callId',
        value: callId
      });
      
      // Add script ID if available
      if (call.scriptId) {
        stream.parameter({
          name: 'scriptId', 
          value: call.scriptId.toString()
        });
      }
      
      console.log(`[handleVoiceWebhook] Generated TwiML with callId: ${callId}`);
      
      res.type('text/xml');
      res.send(twiml.toString());
      
    } catch (error) {
      console.error(`[handleVoiceWebhook] Error processing webhook for call ${callId}:`, error);
      
      // Fallback TwiML
      const fallbackTwiml = new (require('twilio')).twiml.VoiceResponse();
      fallbackTwiml.say('We encountered an error processing your call. Please try again later.');
      
      res.type('text/xml');
      res.send(fallbackTwiml.toString());
    }
  }
}

module.exports = CallController;