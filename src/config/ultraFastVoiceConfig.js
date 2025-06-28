/**
 * Ultra-Fast Voice Response Configuration
 * 
 * Optimized settings for lightning-fast AI voice responses with accurate
 * language detection and seamless switching between Hindi, English, and Hinglish.
 */

module.exports = {
  // Voice Activity Detection (VAD) - Ultra-responsive settings
  voiceActivity: {
    // Silence detection thresholds (milliseconds)
    silenceThreshold: 350,        // Detect silence after 350ms (very fast)
    minSpeechDuration: 250,       // Minimum speech duration to process
    maxSilenceDuration: 600,      // Maximum silence before response trigger
    
    // Audio processing
    sampleRate: 16000,            // 16kHz for optimal balance of quality/speed
    frameSize: 160,               // 10ms frames for real-time processing
    energyThreshold: 0.01,        // Voice energy threshold
    
    // Advanced VAD settings
    adaptiveThreshold: true,      // Adapt to user's voice level
    noiseReduction: true,         // Enable noise reduction
    echoCancellation: true        // Enable echo cancellation
  },

  // Language Detection - Ultra-fast and accurate
  languageDetection: {
    // Speed optimization
    fastModeEnabled: true,        // Enable ultra-fast detection
    maxDetectionTime: 100,        // Maximum 100ms for detection
    
    // Confidence thresholds
    immediateSwitch: 0.90,        // Immediate switch threshold
    delayedSwitch: 0.75,          // Delayed switch threshold  
    minimumConfidence: 0.60,      // Minimum confidence to consider
    
    // Language-specific settings
    enableHinglish: true,         // Enable Hinglish detection
    hinglishThreshold: 0.70,      // Threshold for mixed language
    contextWindow: 3,             // Number of previous utterances for context
    
    // Switching behavior
    rapidSwitchingMode: true,     // Allow rapid language switching
    switchCooldown: 1000,         // Minimum 1 second between switches
    interruptionSwitching: true   // Allow switching during AI speech
  },

  // Speech-to-Text (STT) - Optimized for speed
  speechToText: {
    // Provider settings
    primaryProvider: 'google',    // Google Speech for speed
    fallbackProvider: 'whisper', // Whisper for accuracy fallback
    
    // Speed optimizations
    streamingEnabled: true,       // Enable streaming STT
    interimResults: true,         // Process interim results
    maxChunkSize: 4096,          // Optimal chunk size for streaming
    
    // Quality settings
    enhancedModels: {
      'en-US': 'latest_long',     // Enhanced English model
      'hi-IN': 'latest_long',     // Enhanced Hindi model
      'mixed': 'latest_long'      // Use enhanced for Hinglish
    },
    
    // Timeout settings
    requestTimeout: 3000,         // 3 second timeout
    streamTimeout: 5000,          // 5 second stream timeout
    retryAttempts: 2              // Number of retry attempts
  },

  // Text-to-Speech (TTS) - Ultra-fast generation
  textToSpeech: {
    // Provider priority (fastest first)
    providerPriority: [
      'openai_fm',               // Fastest provider
      'elevenlabs',             // High quality fallback
      'rime'                    // Additional fallback
    ],
    
    // Speed settings
    fastModeEnabled: true,        // Enable fast generation mode
    maxGenerationTime: 800,       // Maximum 800ms for TTS
    streamingTTS: true,           // Enable streaming TTS
    
    // Voice selection for optimal speed
    optimizedVoices: {
      'en-US': 'alloy',          // Fast English voice
      'hi-IN': 'nova',           // Good Hindi pronunciation
      'mixed': 'alloy'           // Use English voice for Hinglish
    },
    
    // Quality vs Speed balance
    qualityLevel: 'balanced',     // balanced, fast, or high
    compressionLevel: 'medium',   // low, medium, high
    
    // Caching for speed
    enableCaching: true,          // Cache common responses
    cacheSize: 100,              // Number of cached items
    cacheExpiry: 3600000         // 1 hour cache expiry
  },

  // LLM Response Generation - Optimized for conversation
  responseGeneration: {
    // Provider settings
    primaryProvider: 'openai',    // OpenAI for consistency
    fallbackProvider: 'gemini',   // Gemini for fallback
    
    // Speed optimizations
    maxResponseTime: 1500,        // Maximum 1.5 seconds for response
    streamingEnabled: true,       // Enable streaming responses
    maxTokens: 150,              // Shorter responses for speed
    
    // Quality settings
    temperature: 0.7,            // Balanced creativity
    topP: 0.9,                   // Nucleus sampling
    frequencyPenalty: 0.1,       // Slight repetition penalty
    
    // Language-specific prompts
    languageAdaptivePrompts: true, // Adapt prompts to detected language
    contextWindowSize: 4,         // Keep last 4 exchanges for context
    
    // Speculative execution
    enableSpeculativeExecution: true, // Start generating before detection complete
    speculativeConfidence: 0.7    // Confidence threshold for speculative execution
  },

  // Audio Streaming - Real-time optimizations
  audioStreaming: {
    // Format settings
    audioFormat: 'mp3',          // MP3 for web compatibility
    bitRate: 128,                // 128kbps for good quality/size balance
    sampleRate: 22050,           // 22kHz for TTS output
    
    // Streaming settings
    chunkSize: 4096,             // 4KB chunks for smooth streaming
    bufferSize: 8192,            // 8KB buffer
    maxBufferTime: 500,          // Maximum 500ms buffering
    
    // Network optimizations
    enableCompression: true,      // Enable audio compression
    adaptiveBitRate: true,       // Adapt bitrate based on connection
    preloadNext: true            // Preload next audio chunk
  },

  // Performance Monitoring
  monitoring: {
    // Response time targets (milliseconds)
    targets: {
      totalResponseTime: 2000,    // Total response time target
      languageDetection: 100,     // Language detection target
      sttProcessing: 500,         // STT processing target
      llmGeneration: 1000,        // LLM generation target
      ttsGeneration: 800,         // TTS generation target
      audioDelivery: 200          // Audio delivery target
    },
    
    // Monitoring settings
    enableMetrics: true,          // Enable performance metrics
    logSlowRequests: true,        // Log requests exceeding targets
    alertThreshold: 3000,         // Alert if response > 3 seconds
    
    // Optimization
    autoOptimize: true,           // Auto-adjust settings based on performance
    optimizationInterval: 300000  // Optimize every 5 minutes
  },

  // Network and Infrastructure
  infrastructure: {
    // CDN settings
    enableCDN: true,              // Use CDN for audio delivery
    cdnRegions: ['us-east', 'asia-south'], // Optimal regions
    
    // Caching
    enableCaching: true,          // Enable response caching
    cacheStrategy: 'aggressive',  // Aggressive caching for speed
    
    // Load balancing
    enableLoadBalancing: true,    // Distribute load across providers
    healthCheckInterval: 30000,   // Check provider health every 30s
    
    // Retry logic
    maxRetries: 2,               // Maximum retry attempts
    retryDelay: 100,             // 100ms between retries
    exponentialBackoff: false     // Linear retry for speed
  },

  // Regional Optimizations
  regional: {
    // India-specific optimizations
    india: {
      preferredSTTProvider: 'google',    // Google has good Hindi support
      preferredTTSProvider: 'openai_fm', // OpenAI FM for multilingual
      networkOptimization: 'asia-south', // Use Asia South region
      enableLocalCaching: true           // Enable local caching
    },
    
    // US-specific optimizations  
    us: {
      preferredSTTProvider: 'whisper',   // Whisper for accuracy
      preferredTTSProvider: 'elevenlabs', // ElevenLabs for quality
      networkOptimization: 'us-east',    // Use US East region
      enableEdgeCaching: true            // Enable edge caching
    }
  },

  // Experimental Features
  experimental: {
    // Predictive features
    enablePredictiveProcessing: true,  // Predict next user intent
    enableContextAwareness: true,      // Use call context for optimization
    enableAdaptiveLearning: true,      // Learn from user patterns
    
    // Advanced optimizations
    enableParallelProcessing: true,    // Process multiple stages in parallel
    enableSpeculativeExecution: true, // Start processing before confirmation
    enableSmartCaching: true          // Intelligent caching based on patterns
  }
};
