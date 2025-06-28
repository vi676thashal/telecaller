/**
 * ZERO LATENCY CONFIGURATION
 * Human-like conversation timing and response settings
 * 
 * These settings are optimized to create natural, human-like conversation flow
 * with minimal delays between customer speech and AI response.
 */

module.exports = {
  // CORE LATENCY TARGETS (Human-like timing)
  HUMAN_RESPONSE_TIME: {
    // Time to start generating response after user stops speaking
    RESPONSE_INITIATION: 50,      // 50ms - Natural human response time
    
    // Time to produce first audio chunk
    FIRST_AUDIO_CHUNK: 100,       // 100ms - Acceptable for natural flow
    
    // Maximum total response time to feel natural
    MAX_NATURAL_RESPONSE: 200,    // 200ms - Beyond this feels robotic
    
    // Emergency fallback response time
    EMERGENCY_RESPONSE: 500       // 500ms - Still acceptable but not ideal
  },
  
  // VOICE ACTIVITY DETECTION (Ultra-sensitive for instant response)
  VAD_SETTINGS: {
    // Audio level threshold for speech detection
    SPEECH_THRESHOLD: 0.01,       // Very sensitive to catch all speech
    
    // Silence duration to consider user finished speaking
    SILENCE_THRESHOLD: 200,       // 200ms - Natural pause detection
    
    // Grace period for natural speech pauses
    INTERRUPTION_GRACE: 150,      // Allow brief pauses without interruption
    
    // Sampling rate for voice detection
    SAMPLE_RATE: 8000,            // Standard phone quality
    
    // Buffer size for minimal delay
    BUFFER_SIZE: 512              // Small buffer for low latency
  },
  
  // AUDIO PROCESSING (Optimized for speed)
  AUDIO_PROCESSING: {
    // Chunk size for audio streaming
    CHUNK_SIZE: 256,              // Small chunks for fast delivery
    
    // Audio format for minimal processing
    FORMAT: 'wav',                // Simple format for fast processing
    
    // Bit rate optimized for speech and speed
    BIT_RATE: 16,                 // 16-bit for good quality with speed
    
    // Compression level (lower = faster)
    COMPRESSION: 'none',          // No compression for speed
    
    // Buffer count for streaming
    BUFFER_COUNT: 2               // Minimal buffering
  },
  
  // TEXT-TO-SPEECH (Fastest settings)
  TTS_SETTINGS: {
    // Primary voice provider (fastest)
    PRIMARY_PROVIDER: 'openai_fm',
    
    // Fallback providers in order of speed
    FALLBACK_PROVIDERS: ['elevenlabs', 'local_tts'],
    
    // Voice speed for natural conversation
    SPEECH_RATE: 1.1,             // Slightly faster than normal for responsiveness
    
    // Voice settings for minimal processing time
    VOICE_SETTINGS: {
      stability: 0.5,             // Lower stability for faster generation
      similarity: 0.8,            // Good similarity but prioritize speed
      style: 0.2,                 // Minimal style processing
      use_speaker_boost: false    // Disable for speed
    }
  },
  
  // SPEECH-TO-TEXT (Ultra-fast transcription)
  STT_SETTINGS: {
    // Primary transcription service
    PRIMARY_SERVICE: 'whisper_fast',
    
    // Model size optimized for speed vs accuracy
    MODEL_SIZE: 'base',           // Balance of speed and accuracy
    
    // Language detection (disable for speed if language is known)
    AUTO_DETECT_LANGUAGE: false,
    
    // Streaming transcription settings
    STREAMING_MODE: true,         // Enable real-time transcription
    
    // Chunk duration for transcription
    TRANSCRIPTION_CHUNK_MS: 250   // Process every 250ms
  },
  
  // CONVERSATION FLOW (Human-like timing patterns)
  CONVERSATION: {
    // Maximum silence before AI should speak
    MAX_SILENCE_MS: 3000,         // 3 seconds of silence
    
    // Natural interruption handling
    ALLOW_INTERRUPTIONS: true,
    
    // Time to wait before allowing interruption
    INTERRUPTION_DELAY: 100,      // 100ms grace period
    
    // Response caching for instant replies
    ENABLE_RESPONSE_CACHE: true,
    
    // Cache size for common responses
    CACHE_SIZE: 100,
    
    // Predictive response generation
    PREDICTIVE_RESPONSES: true
  },
  
  // PERFORMANCE MONITORING
  MONITORING: {
    // Log latency metrics frequency
    METRICS_INTERVAL: 1000,       // Every second
    
    // Performance alerts
    ALERT_THRESHOLDS: {
      SLOW_RESPONSE: 300,         // Alert if response > 300ms
      VERY_SLOW: 500,             // Critical alert if > 500ms
      TRANSCRIPTION_SLOW: 100,    // Alert if transcription > 100ms
      AUDIO_SLOW: 150             // Alert if first audio > 150ms
    },
    
    // Enable detailed performance logging
    DETAILED_LOGGING: true,
    
    // Real-time performance dashboard
    ENABLE_DASHBOARD: true
  },
  
  // QUALITY SETTINGS (Speed vs Quality balance)
  QUALITY: {
    // Prioritize speed over perfect quality
    SPEED_PRIORITY: true,
    
    // Acceptable quality degradation for speed
    MIN_AUDIO_QUALITY: 0.8,       // 80% quality acceptable for speed
    
    // Transcription accuracy vs speed
    MIN_TRANSCRIPTION_ACCURACY: 0.85, // 85% accuracy acceptable
    
    // Error recovery settings
    GRACEFUL_DEGRADATION: true,
    
    // Fallback to faster services when needed
    AUTO_FALLBACK: true
  },
  
  // DEVELOPMENT/DEBUG SETTINGS
  DEBUG: {
    // Enable detailed timing logs
    ENABLE_TIMING_LOGS: true,
    
    // Log all latency measurements
    LOG_ALL_METRICS: true,
    
    // Enable performance visualization
    VISUAL_PERFORMANCE: true,
    
    // Test mode settings
    TEST_MODE: false,
    
    // Simulate network delays for testing
    SIMULATE_DELAYS: false
  }
};
