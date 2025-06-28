/**
 * Ultra-Responsive Conversation Service
 * 
 * This service provides the most optimized, accurate, and fast conversation experience
 * with real-time language switching, preemptive processing, and adaptive learning.
 */

const multilingualSpeechProcessor = require('./multilingualSpeechProcessor');
const realTimeLanguageSwitcher = require('./realTimeLanguageSwitcher');
const enhancedGoogleSpeechService = require('./enhancedGoogleSpeechService');
const openAiFmService = require('./openAiFmService');
const voiceProviderService = require('./voiceProviderService');
const analyticsService = require('./analyticsService');
const { logger } = require('../utils/logger');
const { EventEmitter } = require('events');

// Ultra-responsive configuration for maximum performance
const ULTRA_CONFIG = {
  // Aggressive silence detection for instant response
  SILENCE_THRESHOLD_MS: parseInt(process.env.SILENCE_DETECTION_THRESHOLD) || 400,
  MIN_SPEECH_MS: parseInt(process.env.MIN_SPEECH_DURATION) || 300,
  MAX_SILENCE_MS: parseInt(process.env.MAX_SILENCE_DURATION) || 800,
  
  // Ultra-fast processing targets
  TARGET_TRANSCRIPTION_MS: parseInt(process.env.TARGET_TRANSCRIPTION_TIME) || 180,
  TARGET_TTS_MS: parseInt(process.env.TARGET_TTS_TIME) || 300,
  TARGET_RESPONSE_MS: parseInt(process.env.MAX_RESPONSE_DELAY) || 1200,
  
  // Advanced language switching
  LANGUAGE_SWITCH_CONFIDENCE: parseFloat(process.env.LANGUAGE_SWITCH_CONFIDENCE) || 0.8,
  IMMEDIATE_SWITCH_CONFIDENCE: parseFloat(process.env.IMMEDIATE_SWITCH_CONFIDENCE) || 0.9,
  HINGLISH_DETECTION: process.env.ENABLE_HINGLISH_DETECTION === 'true',
  
  // Preemptive processing
  ENABLE_PREEMPTIVE: process.env.ENABLE_PREEMPTIVE_PROCESSING === 'true',
  PREEMPTIVE_THRESHOLD: 0.7,
  
  // Adaptive learning
  ENABLE_ADAPTIVE: process.env.ENABLE_ADAPTIVE_LEARNING === 'true',
  LEARNING_WINDOW: 10, // Number of interactions to consider
  
  // Quality monitoring
  QUALITY_THRESHOLD: 0.85,
  AUTO_ADJUST: true
};

// Enhanced Hinglish detection patterns for ultra-accurate language switching
const ENHANCED_LANGUAGE_PATTERNS = {
  hinglish: {
    // Common Hinglish phrases and code-switching patterns
    patterns: [
      /\b(main|mujhe|aap|kya|hai|hum|tum|yeh|woh|kar|ho|the|and|is|me|you|my|your)\b/gi,
      /\b(chahiye|milega|please|thank you|sorry|excuse me|help|problem|issue)\b/gi,
      /\b(account|bank|credit card|loan|apply|form|submit|process|payment)\b/gi
    ],
    hindiWords: [
      'नमस्ते', 'धन्यवाद', 'माफ़', 'करिये', 'सकता', 'सकती', 'चाहिए', 'मिलेगा', 'होगा', 'करना',
      'बैंक', 'खाता', 'पैसा', 'रुपया', 'कार्ड', 'लोन', 'आवेदन', 'फॉर्म', 'भरना', 'जमा'
    ],
    englishWords: [
      'hello', 'hi', 'thank', 'sorry', 'please', 'help', 'problem', 'account', 'bank',
      'credit', 'card', 'loan', 'apply', 'form', 'submit', 'process', 'payment', 'money'
    ]
  },
  
  // Speed optimization - precompiled regex patterns
  fastDetection: {
    hindi: /[\u0900-\u097F]+/g,
    english: /\b[a-zA-Z]+\b/g,
    numbers: /\d+/g,
    punctuation: /[.,!?;:]/g
  }
};

// Ultra-fast greeting templates with regional variations
const OPTIMIZED_GREETINGS = {
  'en-US': {
    formal: ["Good day! How may I assist you?", "Hello! I'm here to help you today."],
    casual: ["Hi! What can I do for you?", "Hello there! How can I help?"],
    quick: ["Hi!", "Hello!", "Yes?"]
  },
  'hi-IN': {
    formal: ["नमस्ते! आज मैं आपकी कैसे सहायता कर सकता हूं?", "आपका स्वागत है! मैं आपकी कैसे मदद कर सकता हूं?"],
    casual: ["हैलो! मैं आपके लिए क्या कर सकता हूं?", "नमस्ते! कैसे हैं आप?"],
    quick: ["नमस्ते!", "हैलो!", "जी हाँ?"]
  },
  'mixed': {
    formal: ["Hello! आज मैं आपकी कैसे help कर सकता हूं?", "नमस्ते! How may I assist you today?"],
    casual: ["Hi! मैं आपके लिए क्या कर सकता हूं?", "Hello! आपको क्या चाहिए?"],
    quick: ["Hi!", "हैलो!", "जी?"]
  }
};

class UltraResponsiveConversationService extends EventEmitter {
  constructor() {
    super();
    this.callStates = new Map();
    this.performanceMetrics = new Map();
    this.adaptiveLearning = new Map();
    this.preemptiveCache = new Map();
    
    // Initialize real-time language switcher
    this.languageSwitcher = new realTimeLanguageSwitcher();
    this.setupLanguageSwitcherEvents();
    
    // Performance monitoring
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize ultra-responsive conversation for a call
   * @param {string} callId - Call identifier
   * @param {Object} options - Configuration options
   */
  async initializeCall(callId, options = {}) {
    try {
      const callState = {
        callId,
        startTime: Date.now(),
        currentLanguage: options.initialLanguage || 'en-US',
        lastInteractionTime: Date.now(),
        responseHistory: [],
        qualityMetrics: {
          transcriptionAccuracy: 1.0,
          responseSpeed: 1.0,
          languageSwitchAccuracy: 1.0
        },
        adaptiveSettings: {
          silenceThreshold: ULTRA_CONFIG.SILENCE_THRESHOLD_MS,
          confidenceThreshold: ULTRA_CONFIG.LANGUAGE_SWITCH_CONFIDENCE,
          responseTarget: ULTRA_CONFIG.TARGET_RESPONSE_MS
        },
        preemptiveResponses: new Map(),
        isActive: true
      };

      this.callStates.set(callId, callState);
      this.performanceMetrics.set(callId, []);
      this.adaptiveLearning.set(callId, []);
      
      // Initialize language switcher for this call
      this.languageSwitcher.initializeCall(callId, callState.currentLanguage);
      
      logger.info(`[UltraResponsive] Initialized call ${callId} with ultra-responsive settings`);
      
      // Pre-generate common responses in both languages
      await this.preGenerateResponses(callId);
      
      this.emit('callInitialized', { callId, state: callState });
      
      return callState;
    } catch (error) {
      logger.error(`[UltraResponsive] Error initializing call ${callId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process incoming audio with ultra-fast transcription and response
   * @param {string} callId - Call identifier
   * @param {Buffer} audioBuffer - Incoming audio data
   * @param {Object} options - Processing options
   */
  async processAudioInput(callId, audioBuffer, options = {}) {
    const startTime = Date.now();
    const callState = this.callStates.get(callId);
    
    if (!callState || !callState.isActive) {
      return { error: 'Call not active or not found' };
    }

    try {
      // Ultra-fast transcription with language detection
      const transcriptionStart = Date.now();
      const transcriptionResult = await enhancedGoogleSpeechService.transcribeAudioStream(
        audioBuffer,
        callState.currentLanguage,
        {
          enableLanguageDetection: true,
          confidence: callState.adaptiveSettings.confidenceThreshold,
          realTime: true
        }
      );
      const transcriptionTime = Date.now() - transcriptionStart;

      if (!transcriptionResult || !transcriptionResult.text) {
        return { 
          success: false, 
          reason: 'No transcription result',
          processingTime: Date.now() - startTime
        };
      }

      // Real-time language detection and switching
      const languageResult = await this.processLanguageDetection(
        callId, 
        transcriptionResult.text,
        transcriptionResult.detectedLanguage || callState.currentLanguage,
        transcriptionResult.confidence || 0.8
      );

      // Update call state language if switched
      if (languageResult.switched) {
        callState.currentLanguage = languageResult.language;
        logger.info(`[UltraResponsive] Language switched to ${languageResult.language} for call ${callId}`);
      }

      // Generate ultra-fast AI response
      const responseResult = await this.generateUltraFastResponse(
        callId,
        transcriptionResult.text,
        callState.currentLanguage,
        {
          preemptive: ULTRA_CONFIG.ENABLE_PREEMPTIVE,
          adaptive: callState.adaptiveSettings
        }
      );

      // Record performance metrics
      const totalTime = Date.now() - startTime;
      this.recordPerformanceMetrics(callId, {
        transcriptionTime,
        responseTime: responseResult.processingTime || 0,
        totalTime,
        language: callState.currentLanguage,
        confidence: transcriptionResult.confidence,
        textLength: transcriptionResult.text.length
      });

      // Adaptive learning
      if (ULTRA_CONFIG.ENABLE_ADAPTIVE) {
        await this.updateAdaptiveLearning(callId, {
          transcriptionTime,
          totalTime,
          quality: transcriptionResult.confidence,
          language: callState.currentLanguage
        });
      }

      callState.lastInteractionTime = Date.now();

      return {
        success: true,
        transcription: transcriptionResult.text,
        language: callState.currentLanguage,
        languageSwitched: languageResult.switched,
        response: responseResult.text,
        audioUrl: responseResult.audioUrl,
        processingTime: totalTime,
        metrics: {
          transcriptionTime,
          responseTime: responseResult.processingTime,
          totalTime
        }
      };

    } catch (error) {
      logger.error(`[UltraResponsive] Error processing audio for call ${callId}: ${error.message}`);
      
      // Emergency fallback response
      const fallbackResponse = await this.generateEmergencyResponse(callId, callState.currentLanguage);
      
      return {
        success: false,
        error: error.message,
        fallbackResponse,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process real-time language detection and switching
   * @param {string} callId - Call identifier
   * @param {string} text - Transcribed text
   * @param {string} detectedLanguage - Detected language
   * @param {number} confidence - Detection confidence
   */
  async processLanguageDetection(callId, text, detectedLanguage, confidence) {
    try {
      // Enhanced language detection with Hinglish support
      let finalLanguage = detectedLanguage;
      let finalConfidence = confidence;

      // Check for Hinglish (code-switching) patterns
      if (ULTRA_CONFIG.HINGLISH_DETECTION) {
        const hinglishResult = await this.detectHinglish(text);
        if (hinglishResult.isHinglish && hinglishResult.confidence > 0.7) {
          finalLanguage = 'mixed';
          finalConfidence = hinglishResult.confidence;
        }
      }

      // Process with real-time language switcher
      const switchResult = await this.languageSwitcher.processTranscription(
        callId,
        text,
        false // Not an interruption
      );

      // Immediate switch for high confidence detections
      if (finalConfidence >= ULTRA_CONFIG.IMMEDIATE_SWITCH_CONFIDENCE) {
        const immediateSwitch = await this.languageSwitcher.performLanguageSwitch(
          callId,
          finalLanguage,
          {
            confidence: finalConfidence,
            source: 'ultra_responsive',
            immediate: true
          }
        );
        
        return {
          switched: immediateSwitch.switched,
          language: immediateSwitch.language || finalLanguage,
          confidence: finalConfidence,
          reason: 'immediate_high_confidence'
        };
      }

      return {
        switched: switchResult.switched,
        language: switchResult.language || finalLanguage,
        confidence: finalConfidence,
        reason: 'normal_detection'
      };

    } catch (error) {
      logger.error(`[UltraResponsive] Error in language detection for call ${callId}: ${error.message}`);
      return { switched: false, language: detectedLanguage, confidence };
    }
  }

  /**
   * Generate ultra-fast AI response
   * @param {string} callId - Call identifier
   * @param {string} userInput - User's input text
   * @param {string} language - Current conversation language
   * @param {Object} options - Generation options
   */
  async generateUltraFastResponse(callId, userInput, language, options = {}) {
    const startTime = Date.now();
    const callState = this.callStates.get(callId);

    try {
      // Check preemptive cache first
      if (options.preemptive && callState.preemptiveResponses.has(userInput.toLowerCase())) {
        const cachedResponse = callState.preemptiveResponses.get(userInput.toLowerCase());
        logger.info(`[UltraResponsive] Using preemptive response for call ${callId}`);
        
        return {
          text: cachedResponse.text,
          audioUrl: cachedResponse.audioUrl,
          processingTime: Date.now() - startTime,
          source: 'preemptive_cache'
        };
      }

      // Ultra-fast AI generation with language-specific prompts
      const systemPrompt = this.getLanguageSpecificPrompt(language);
      
      const aiResponse = await openAiFmService.generateResponse(
        userInput,
        {
          systemPrompt,
          language,
          maxTokens: 150, // Keep responses concise for speed
          temperature: 0.7,
          timeout: ULTRA_CONFIG.TARGET_RESPONSE_MS / 2 // Half the target for AI generation
        }
      );

      // Ultra-fast TTS generation
      const ttsStart = Date.now();
      const voiceOptions = {
        provider: 'openai_fm',
        language,
        voiceId: await this.getOptimalVoiceForLanguage(language),
        speed: 1.1, // Slightly faster for responsiveness
        quality: 'high'
      };

      const audioUrl = await voiceProviderService.generateTwilioAudioUrl(
        aiResponse,
        voiceOptions,
        language,
        callId
      );
      const ttsTime = Date.now() - ttsStart;

      const totalTime = Date.now() - startTime;

      // Cache successful responses for future preemptive use
      if (totalTime < ULTRA_CONFIG.TARGET_RESPONSE_MS && aiResponse.length < 200) {
        this.cachePreemptiveResponse(callId, userInput, aiResponse, audioUrl);
      }

      return {
        text: aiResponse,
        audioUrl,
        processingTime: totalTime,
        ttsTime,
        source: 'real_time_generation'
      };

    } catch (error) {
      logger.error(`[UltraResponsive] Error generating response for call ${callId}: ${error.message}`);
      
      // Ultra-fast fallback
      const fallbackText = this.getFallbackResponse(language);
      const fallbackAudio = await voiceProviderService.generateTwilioAudioUrl(
        fallbackText,
        { provider: 'openai_fm', language },
        language,
        callId
      );

      return {
        text: fallbackText,
        audioUrl: fallbackAudio,
        processingTime: Date.now() - startTime,
        source: 'fallback'
      };
    }
  }

  /**
   * Detect Hinglish (Hindi-English code-switching) patterns
   * @param {string} text - Text to analyze
   */
  async detectHinglish(text) {
    try {
      // Simple but effective Hinglish detection patterns
      const hinglishPatterns = [
        /\b(acha|theek|hai|kya|tum|aap|meri|teri|uski|uska|yeh|woh|kaise|kyun|kahan|kab)\b/gi,
        /\b(please|thank you|sorry|ok|okay|yes|no|hello|hi|bye)\b/gi,
        /(na|nahi|haan|ji|bhi|toh|aur|ya|ki|ke|ko|me|se|pe)\b/gi
      ];

      let hinglishScore = 0;
      let totalWords = text.split(/\s+/).length;

      for (const pattern of hinglishPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          hinglishScore += matches.length;
        }
      }

      const confidence = Math.min(hinglishScore / totalWords, 1.0);
      const isHinglish = confidence > 0.3 && hinglishScore >= 2;

      return {
        isHinglish,
        confidence,
        score: hinglishScore,
        totalWords
      };
    } catch (error) {
      logger.error(`[UltraResponsive] Error detecting Hinglish: ${error.message}`);
      return { isHinglish: false, confidence: 0 };
    }
  }

  /**
   * Pre-generate common responses in multiple languages
   * @param {string} callId - Call identifier
   */
  async preGenerateResponses(callId) {
    if (!ULTRA_CONFIG.ENABLE_PREEMPTIVE) return;

    const callState = this.callStates.get(callId);
    if (!callState) return;

    try {
      const commonInputs = [
        'hello', 'hi', 'yes', 'no', 'thank you', 'ok', 'okay',
        'what', 'how', 'when', 'where', 'why',
        'interested', 'not interested', 'tell me more',
        'namaste', 'haan', 'nahi', 'theek hai', 'acha'
      ];

      for (const input of commonInputs) {
        try {
          const response = await this.generateQuickResponse(input, callState.currentLanguage);
          const audioUrl = await voiceProviderService.generateTwilioAudioUrl(
            response,
            { provider: 'openai_fm', language: callState.currentLanguage },
            callState.currentLanguage,
            callId
          );

          callState.preemptiveResponses.set(input.toLowerCase(), {
            text: response,
            audioUrl,
            timestamp: Date.now()
          });
        } catch (error) {
          logger.warn(`[UltraResponsive] Error pre-generating response for "${input}": ${error.message}`);
        }
      }

      logger.info(`[UltraResponsive] Pre-generated ${callState.preemptiveResponses.size} responses for call ${callId}`);
    } catch (error) {
      logger.error(`[UltraResponsive] Error in pre-generation for call ${callId}: ${error.message}`);
    }
  }

  /**
   * Generate quick response for common inputs
   * @param {string} input - User input
   * @param {string} language - Response language
   */
  async generateQuickResponse(input, language) {
    const responses = {
      'en-US': {
        'hello': 'Hello! How can I help you today?',
        'hi': 'Hi there! What can I do for you?',
        'yes': 'Great! Let me help you with that.',
        'no': 'No problem. Is there anything else I can help you with?',
        'thank you': 'You\'re welcome! Anything else I can assist with?',
        'ok': 'Perfect! What would you like to know?',
        'okay': 'Alright! How can I help you further?'
      },
      'hi-IN': {
        'namaste': 'नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूँ?',
        'haan': 'बहुत अच्छा! मैं आपकी इसमें मदद करता हूँ।',
        'nahi': 'कोई बात नहीं। क्या कुछ और है जिसमें मैं आपकी मदद कर सकूँ?',
        'theek hai': 'बिल्कुल ठीक! आप क्या जानना चाहते हैं?',
        'acha': 'अच्छा! और कैसे मदद कर सकता हूँ?'
      },
      'mixed': {
        'hello': 'Hello! Aaj main aapki kaise help kar sakta hun?',
        'hi': 'Hi! Kya main aapki koi madad kar sakta hun?',
        'yes': 'Great! Main aapki isme help karunga.',
        'ok': 'Perfect! Aap kya jaanna chahte hain?'
      }
    };

    const langResponses = responses[language] || responses['en-US'];
    return langResponses[input.toLowerCase()] || `I understand. How can I help you with that?`;
  }

  /**
   * Get language-specific system prompt
   * @param {string} language - Language code
   */
  getLanguageSpecificPrompt(language) {
    const prompts = {
      'en-US': 'You are a helpful, friendly, and professional AI assistant. Respond naturally and conversationally in English. Keep responses concise but warm.',
      'hi-IN': 'आप एक सहायक, मित्रवत और पेशेवर AI सहायक हैं। हिंदी में स्वाभाविक और बातचीत के तरीके से जवाब दें। जवाब संक्षिप्त लेकिन गर्मजोशी भरे रखें।',
      'mixed': 'You are a helpful AI assistant who can naturally switch between Hindi and English (Hinglish). Respond in the same language mix as the user. Keep responses natural, warm and conversational.'
    };

    return prompts[language] || prompts['en-US'];
  }

  /**
   * Get optimal voice for language
   * @param {string} language - Language code
   */
  async getOptimalVoiceForLanguage(language) {
    const voiceMap = {
      'hi-IN': 'nova',
      'en-US': 'alloy',
      'mixed': 'nova',
      'en-IN': 'nova'
    };

    return voiceMap[language] || 'alloy';
  }

  /**
   * Record performance metrics for adaptive optimization
   * @param {string} callId - Call identifier
   * @param {Object} metrics - Performance metrics
   */
  recordPerformanceMetrics(callId, metrics) {
    const callMetrics = this.performanceMetrics.get(callId) || [];
    
    callMetrics.push({
      timestamp: Date.now(),
      ...metrics
    });

    // Keep only last 50 metrics
    if (callMetrics.length > 50) {
      callMetrics.shift();
    }

    this.performanceMetrics.set(callId, callMetrics);

    // Emit performance update
    this.emit('performanceUpdate', { callId, metrics });
  }

  /**
   * Update adaptive learning based on performance
   * @param {string} callId - Call identifier
   * @param {Object} data - Learning data
   */
  async updateAdaptiveLearning(callId, data) {
    const callState = this.callStates.get(callId);
    if (!callState) return;

    const learningData = this.adaptiveLearning.get(callId) || [];
    learningData.push({
      timestamp: Date.now(),
      ...data
    });

    // Keep learning window
    if (learningData.length > ULTRA_CONFIG.LEARNING_WINDOW) {
      learningData.shift();
    }

    this.adaptiveLearning.set(callId, learningData);

    // Auto-adjust settings if enabled
    if (ULTRA_CONFIG.AUTO_ADJUST && learningData.length >= 5) {
      await this.autoAdjustSettings(callId, learningData);
    }
  }

  /**
   * Auto-adjust settings based on performance
   * @param {string} callId - Call identifier
   * @param {Array} learningData - Historical performance data
   */
  async autoAdjustSettings(callId, learningData) {
    const callState = this.callStates.get(callId);
    if (!callState) return;

    try {
      // Calculate averages
      const avgTranscriptionTime = learningData.reduce((sum, d) => sum + d.transcriptionTime, 0) / learningData.length;
      const avgTotalTime = learningData.reduce((sum, d) => sum + d.totalTime, 0) / learningData.length;
      const avgQuality = learningData.reduce((sum, d) => sum + d.quality, 0) / learningData.length;

      // Adjust silence threshold based on performance
      if (avgTranscriptionTime > ULTRA_CONFIG.TARGET_TRANSCRIPTION_MS * 1.5) {
        callState.adaptiveSettings.silenceThreshold = Math.max(
          callState.adaptiveSettings.silenceThreshold - 50,
          200
        );
        logger.info(`[UltraResponsive] Reduced silence threshold to ${callState.adaptiveSettings.silenceThreshold}ms for call ${callId}`);
      } else if (avgQuality < ULTRA_CONFIG.QUALITY_THRESHOLD) {
        callState.adaptiveSettings.silenceThreshold = Math.min(
          callState.adaptiveSettings.silenceThreshold + 50,
          800
        );
        logger.info(`[UltraResponsive] Increased silence threshold to ${callState.adaptiveSettings.silenceThreshold}ms for call ${callId}`);
      }

      // Adjust confidence threshold based on accuracy
      if (avgQuality > 0.9) {
        callState.adaptiveSettings.confidenceThreshold = Math.max(
          callState.adaptiveSettings.confidenceThreshold - 0.05,
          0.6
        );
      } else if (avgQuality < 0.7) {
        callState.adaptiveSettings.confidenceThreshold = Math.min(
          callState.adaptiveSettings.confidenceThreshold + 0.05,
          0.95
        );
      }

    } catch (error) {
      logger.error(`[UltraResponsive] Error in auto-adjustment for call ${callId}: ${error.message}`);
    }
  }

  /**
   * Setup language switcher event handlers
   */
  setupLanguageSwitcherEvents() {
    this.languageSwitcher.on('languageSwitch', (event) => {
      const { callId, oldLanguage, newLanguage, confidence } = event;
      logger.info(`[UltraResponsive] Language switched for call ${callId}: ${oldLanguage} -> ${newLanguage} (${confidence})`);
      
      const callState = this.callStates.get(callId);
      if (callState) {
        callState.currentLanguage = newLanguage;
        
        // Clear preemptive cache and regenerate for new language
        callState.preemptiveResponses.clear();
        this.preGenerateResponses(callId);
      }

      this.emit('languageChanged', event);
    });
  }

  /**
   * Cache preemptive response
   * @param {string} callId - Call identifier
   * @param {string} input - User input
   * @param {string} response - AI response
   * @param {string} audioUrl - Audio URL
   */
  cachePreemptiveResponse(callId, input, response, audioUrl) {
    const callState = this.callStates.get(callId);
    if (!callState) return;

    callState.preemptiveResponses.set(input.toLowerCase(), {
      text: response,
      audioUrl,
      timestamp: Date.now()
    });

    // Limit cache size
    if (callState.preemptiveResponses.size > 50) {
      const oldest = Math.min(...Array.from(callState.preemptiveResponses.values()).map(r => r.timestamp));
      for (const [key, value] of callState.preemptiveResponses) {
        if (value.timestamp === oldest) {
          callState.preemptiveResponses.delete(key);
          break;
        }
      }
    }
  }

  /**
   * Generate emergency response
   * @param {string} callId - Call identifier
   * @param {string} language - Response language
   */
  async generateEmergencyResponse(callId, language) {
    const emergencyResponses = {
      'en-US': 'I apologize for the technical difficulty. Please hold on for a moment.',
      'hi-IN': 'तकनीकी समस्या के लिए मैं माफी चाहता हूँ। कृपया एक क्षण रुकें।',
      'mixed': 'Sorry, technical problem hai. Please thoda wait kariye.'
    };

    const text = emergencyResponses[language] || emergencyResponses['en-US'];
    
    try {
      const audioUrl = await voiceProviderService.generateTwilioAudioUrl(
        text,
        { provider: 'openai_fm', language },
        language,
        callId
      );
      
      return { text, audioUrl };
    } catch (error) {
      return { text, audioUrl: null };
    }
  }

  /**
   * Get fallback response
   * @param {string} language - Response language
   */
  getFallbackResponse(language) {
    const fallbacks = {
      'en-US': 'I understand. Could you please repeat that?',
      'hi-IN': 'मैं समझ गया। क्या आप कृपया दोहरा सकते हैं?',
      'mixed': 'I understand. Aap please repeat kar sakte hain?'
    };

    return fallbacks[language] || fallbacks['en-US'];
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      try {
        for (const [callId, metrics] of this.performanceMetrics) {
          if (metrics.length > 0) {
            const recent = metrics.slice(-10);
            const avgTime = recent.reduce((sum, m) => sum + m.totalTime, 0) / recent.length;
            
            if (avgTime > ULTRA_CONFIG.TARGET_RESPONSE_MS * 1.5) {
              logger.warn(`[UltraResponsive] Call ${callId} performance degraded: ${avgTime}ms average`);
              this.emit('performanceAlert', { callId, avgTime, target: ULTRA_CONFIG.TARGET_RESPONSE_MS });
            }
          }
        }
      } catch (error) {
        logger.error(`[UltraResponsive] Error in performance monitoring: ${error.message}`);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Get call performance summary
   * @param {string} callId - Call identifier
   */
  getCallPerformanceSummary(callId) {
    const metrics = this.performanceMetrics.get(callId) || [];
    const learningData = this.adaptiveLearning.get(callId) || [];
    const callState = this.callStates.get(callId);

    if (metrics.length === 0) {
      return { error: 'No performance data available' };
    }

    const avgTranscriptionTime = metrics.reduce((sum, m) => sum + m.transcriptionTime, 0) / metrics.length;
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const avgTotalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0) / metrics.length;
    const avgConfidence = metrics.reduce((sum, m) => sum + m.confidence, 0) / metrics.length;

    return {
      callId,
      totalInteractions: metrics.length,
      averageMetrics: {
        transcriptionTime: Math.round(avgTranscriptionTime),
        responseTime: Math.round(avgResponseTime),
        totalTime: Math.round(avgTotalTime),
        confidence: Math.round(avgConfidence * 100) / 100
      },
      targets: {
        transcriptionTarget: ULTRA_CONFIG.TARGET_TRANSCRIPTION_MS,
        responseTarget: ULTRA_CONFIG.TARGET_RESPONSE_MS,
        totalTarget: ULTRA_CONFIG.TARGET_RESPONSE_MS
      },
      performance: {
        transcriptionEfficiency: Math.round((ULTRA_CONFIG.TARGET_TRANSCRIPTION_MS / avgTranscriptionTime) * 100),
        responseEfficiency: Math.round((ULTRA_CONFIG.TARGET_RESPONSE_MS / avgTotalTime) * 100)
      },
      currentLanguage: callState?.currentLanguage,
      adaptiveSettings: callState?.adaptiveSettings,
      preemptiveCacheSize: callState?.preemptiveResponses?.size || 0
    };
  }

  /**
   * End call and cleanup
   * @param {string} callId - Call identifier
   */
  async endCall(callId) {
    try {
      const callState = this.callStates.get(callId);
      if (callState) {
        callState.isActive = false;
        
        // Generate final summary
        const summary = this.getCallPerformanceSummary(callId);
        logger.info(`[UltraResponsive] Call ${callId} ended. Performance summary:`, summary);
        
        // Cleanup
        this.callStates.delete(callId);
        this.performanceMetrics.delete(callId);
        this.adaptiveLearning.delete(callId);
        
        this.emit('callEnded', { callId, summary });
      }
    } catch (error) {
      logger.error(`[UltraResponsive] Error ending call ${callId}: ${error.message}`);
    }
  }

  /**
   * Ultra-fast language detection with enhanced Hinglish support
   * @param {string} text - Input text to analyze
   * @param {Object} context - Additional context for detection
   */
  async detectLanguageUltraFast(text, context = {}) {
    const startTime = Date.now();
    
    try {
      // Stage 1: Instant regex-based detection (< 5ms)
      const quickResult = this.performQuickLanguageDetection(text);
      
      // Stage 2: Enhanced pattern matching for Hinglish (< 15ms)
      const enhancedResult = this.performEnhancedHinglishDetection(text);
      
      // Stage 3: Confidence-based decision
      let finalResult = quickResult;
      
      if (enhancedResult.confidence > quickResult.confidence + 0.1) {
        finalResult = enhancedResult;
      }
      
      // Stage 4: Context-aware adjustment
      if (context.previousLanguage && context.callHistory) {
        finalResult = this.adjustDetectionWithContext(finalResult, context);
      }
      
      const detectionTime = Date.now() - startTime;
      
      // Log performance for optimization
      this.logDetectionPerformance(text, finalResult, detectionTime);
      
      logger.info(`[UltraResponsive] Language detected: ${finalResult.language} (${finalResult.confidence.toFixed(2)}) in ${detectionTime}ms`);
      
      return {
        ...finalResult,
        detectionTime,
        method: 'ultraFast'
      };
      
    } catch (error) {
      logger.error(`[UltraResponsive] Language detection failed: ${error.message}`);
      
      // Fallback to basic detection
      return {
        language: context.previousLanguage || 'en-US',
        confidence: 0.6,
        detectionTime: Date.now() - startTime,
        method: 'fallback'
      };
    }
  }

  /**
   * Perform instant regex-based language detection
   */
  performQuickLanguageDetection(text) {
    const cleanText = text.toLowerCase().trim();
    const words = cleanText.split(/\s+/);
    const totalWords = words.length;
    
    if (totalWords === 0) {
      return { language: 'en-US', confidence: 0.5 };
    }
    
    // Count different script types
    const hindiMatches = (text.match(ENHANCED_LANGUAGE_PATTERNS.fastDetection.hindi) || []).length;
    const englishMatches = (text.match(ENHANCED_LANGUAGE_PATTERNS.fastDetection.english) || []).length;
    
    const hindiRatio = hindiMatches / totalWords;
    const englishRatio = englishMatches / totalWords;
    
    // Determine language based on script ratios
    if (hindiRatio > 0.7) {
      return { language: 'hi-IN', confidence: Math.min(0.95, 0.7 + hindiRatio * 0.25) };
    } else if (englishRatio > 0.7) {
      return { language: 'en-US', confidence: Math.min(0.95, 0.7 + englishRatio * 0.25) };
    } else if (hindiRatio > 0.2 && englishRatio > 0.2) {
      return { language: 'mixed', confidence: 0.8 };
    } else if (englishRatio > hindiRatio) {
      return { language: 'en-US', confidence: 0.7 };
    } else {
      return { language: 'hi-IN', confidence: 0.7 };
    }
  }

  /**
   * Enhanced Hinglish detection with pattern matching
   */
  performEnhancedHinglishDetection(text) {
    const cleanText = text.toLowerCase();
    
    // Check for Hinglish patterns
    let hinglishScore = 0;
    let totalPatterns = 0;
    
    for (const pattern of ENHANCED_LANGUAGE_PATTERNS.hinglish.patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        hinglishScore += matches.length;
        totalPatterns++;
      }
    }
    
    // Check for mixed vocabulary
    const hindiWordCount = ENHANCED_LANGUAGE_PATTERNS.hinglish.hindiWords
      .filter(word => cleanText.includes(word)).length;
    const englishWordCount = ENHANCED_LANGUAGE_PATTERNS.hinglish.englishWords
      .filter(word => cleanText.includes(word)).length;
    
    const mixedVocabScore = hindiWordCount > 0 && englishWordCount > 0 ? 1 : 0;
    
    // Calculate final Hinglish confidence
    const words = text.split(/\s+/).length;
    const hinglishConfidence = Math.min(0.95, 
      (hinglishScore * 0.3 + mixedVocabScore * 0.4 + totalPatterns * 0.3) / Math.max(words * 0.1, 1)
    );
    
    if (hinglishConfidence > 0.6) {
      return { language: 'mixed', confidence: hinglishConfidence };
    }
    
    // Fallback to script-based detection
    return this.performQuickLanguageDetection(text);
  }

  /**
   * Adjust detection based on conversation context
   */
  adjustDetectionWithContext(result, context) {
    const { previousLanguage, callHistory = [] } = context;
    
    // If we have conversation history, check for language consistency
    if (callHistory.length > 0) {
      const recentLanguages = callHistory.slice(-3).map(entry => entry.language);
      const languageFrequency = {};
      
      recentLanguages.forEach(lang => {
        languageFrequency[lang] = (languageFrequency[lang] || 0) + 1;
      });
      
      const dominantLanguage = Object.keys(languageFrequency)
        .reduce((a, b) => languageFrequency[a] > languageFrequency[b] ? a : b);
      
      // Boost confidence if detected language matches recent pattern
      if (result.language === dominantLanguage) {
        result.confidence = Math.min(0.95, result.confidence + 0.1);
      }
      
      // Handle rapid switching detection
      if (result.language !== previousLanguage && result.confidence < 0.8) {
        const switchFrequency = callHistory.slice(-5)
          .filter((entry, index, arr) => 
            index > 0 && entry.language !== arr[index - 1].language
          ).length;
        
        // If user switches languages frequently, be more permissive
        if (switchFrequency > 2) {
          result.confidence = Math.min(0.9, result.confidence + 0.15);
        }
      }
    }
    
    return result;
  }

  /**
   * Process user speech with ultra-fast response pipeline
   */
  async processUserSpeechUltraFast(callId, audioData, transcriptText) {
    const startTime = Date.now();
    const callState = this.callStates.get(callId);
    
    if (!callState) {
      logger.error(`[UltraResponsive] Call state not found for ${callId}`);
      return null;
    }
    
    try {
      // Parallel processing for maximum speed
      const [languageResult, responseGeneration] = await Promise.allSettled([
        // Language detection
        this.detectLanguageUltraFast(transcriptText, {
          previousLanguage: callState.currentLanguage,
          callHistory: callState.conversationHistory
        }),
        
        // Start response generation immediately (speculative execution)
        this.generateSpeculativeResponse(transcriptText, callState.currentLanguage)
      ]);
      
      const detectedLanguage = languageResult.status === 'fulfilled' 
        ? languageResult.value 
        : { language: callState.currentLanguage, confidence: 0.6 };
      
      // Check if language switching is needed
      const languageChanged = detectedLanguage.language !== callState.currentLanguage;
      const shouldSwitch = languageChanged && 
        detectedLanguage.confidence >= ULTRA_CONFIG.LANGUAGE_SWITCH_CONFIDENCE;
      
      if (shouldSwitch) {
        logger.info(`[UltraResponsive] Language switch detected: ${callState.currentLanguage} → ${detectedLanguage.language}`);
        
        // Update call state immediately
        callState.currentLanguage = detectedLanguage.language;
        callState.lastLanguageSwitch = Date.now();
        
        // Notify language switcher
        this.languageSwitcher.handleLanguageSwitch(callId, {
          from: callState.currentLanguage,
          to: detectedLanguage.language,
          confidence: detectedLanguage.confidence,
          isImmediate: detectedLanguage.confidence >= ULTRA_CONFIG.IMMEDIATE_SWITCH_CONFIDENCE
        });
        
        // Generate new response in correct language
        const correctedResponse = await this.generateFastResponse(
          transcriptText, 
          detectedLanguage.language,
          { callId, priority: 'high' }
        );
        
        const totalTime = Date.now() - startTime;
        
        this.emit('ultraFastResponse', {
          callId,
          response: correctedResponse,
          languageSwitch: {
            from: callState.currentLanguage,
            to: detectedLanguage.language,
            confidence: detectedLanguage.confidence
          },
          totalTime,
          userText: transcriptText
        });
        
        return correctedResponse;
        
      } else {
        // Use speculative response if language didn't change
        const speculativeResponse = responseGeneration.status === 'fulfilled' 
          ? responseGeneration.value 
          : null;
        
        if (speculativeResponse && !languageChanged) {
          const totalTime = Date.now() - startTime;
          
          this.emit('ultraFastResponse', {
            callId,
            response: speculativeResponse,
            totalTime,
            userText: transcriptText,
            speculative: true
          });
          
          return speculativeResponse;
        } else {
          // Generate fresh response
          return await this.generateFastResponse(
            transcriptText, 
            callState.currentLanguage,
            { callId }
          );
        }
      }
      
    } catch (error) {
      logger.error(`[UltraResponsive] Ultra-fast processing failed for ${callId}: ${error.message}`);
      
      // Emergency fallback response
      return await this.generateEmergencyResponse(callId, callState.currentLanguage);
    }
  }
}

module.exports = new UltraResponsiveConversationService();
