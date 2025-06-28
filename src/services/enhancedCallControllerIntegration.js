/**
 * Enhanced Call Controller Integration
 * 
 * Integrates the real-time language switching capabilities with the existing
 * call controller to ensure seamless language adaptation during conversations.
 */

const realTimeLanguageSwitcher = require('./realTimeLanguageSwitcher');
const languageAdaptiveResponseHandler = require('./languageAdaptiveResponseHandler');
const audioStreamService = require('./audioStreamService');
const multilingualSpeechProcessor = require('./multilingualSpeechProcessor');

class EnhancedCallControllerIntegration {
  constructor() {
    this.activeCalls = new Map();
    this.enhancedFeatures = {
      realTimeLanguageSwitching: true,
      adaptiveResponseGeneration: true,
      interruptionHandling: true,
      languageAnalytics: true
    };
  }

  /**
   * Initialize enhanced language features for a call
   * @param {string} callId - Call identifier
   * @param {Object} callConfig - Call configuration
   */
  async initializeEnhancedCall(callId, callConfig = {}) {
    try {
      console.log(`[EnhancedCallController] Initializing enhanced features for call ${callId}`);

      // Store call configuration
      this.activeCalls.set(callId, {
        callId,
        initialLanguage: callConfig.language || 'en-US',
        llmProvider: callConfig.llmProvider || 'openai',
        voiceProvider: callConfig.voiceProvider || 'openai_fm',
        prompt: callConfig.prompt || '',
        script: callConfig.script || '',
        enableInterruptions: callConfig.enableInterruptions !== false,
        enableHindiEnglishSwitching: callConfig.enableHindiEnglishSwitching || false,
        startTime: Date.now(),
        languageStats: {
          switches: 0,
          languages: [callConfig.language || 'en-US']
        }
      });

      // Initialize language switching services
      if (this.enhancedFeatures.realTimeLanguageSwitching) {
        realTimeLanguageSwitcher.initializeCall(callId, callConfig.language || 'en-US');
      }

      if (this.enhancedFeatures.adaptiveResponseGeneration) {
        languageAdaptiveResponseHandler.initializeCall(callId, {
          language: callConfig.language || 'en-US',
          llmProvider: callConfig.llmProvider || 'openai',
          prompt: callConfig.prompt || '',
          script: callConfig.script || ''
        });
      }

      // Set up audio stream with enhanced features
      const stream = audioStreamService.getStream(callId) || audioStreamService.createStream(callId);
      
      // Listen for language switch events
      this.setupLanguageSwitchHandlers(callId);

      console.log(`[EnhancedCallController] Enhanced features initialized for call ${callId}`);
      return { success: true, callId };

    } catch (error) {
      console.error(`[EnhancedCallController] Error initializing enhanced call ${callId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set up language switch event handlers
   * @param {string} callId - Call identifier
   */
  setupLanguageSwitchHandlers(callId) {
    const callConfig = this.activeCalls.get(callId);
    if (!callConfig) return;

    // Listen for language switches
    realTimeLanguageSwitcher.on('languageSwitched', (event) => {
      if (event.callId === callId) {
        this.handleLanguageSwitch(callId, event);
      }
    });

    // Listen for adaptive response events
    languageAdaptiveResponseHandler.on('languageAdapted', (event) => {
      if (event.callId === callId) {
        this.handleLanguageAdaptation(callId, event);
      }
    });
  }

  /**
   * Handle language switch events
   * @param {string} callId - Call identifier
   * @param {Object} switchEvent - Language switch event
   */
  handleLanguageSwitch(callId, switchEvent) {
    const callConfig = this.activeCalls.get(callId);
    if (!callConfig) return;

    console.log(`[EnhancedCallController] Language switch detected for call ${callId}: ${switchEvent.from} → ${switchEvent.to}`);

    // Update call statistics
    callConfig.languageStats.switches++;
    if (!callConfig.languageStats.languages.includes(switchEvent.to)) {
      callConfig.languageStats.languages.push(switchEvent.to);
    }

    // Update call configuration
    callConfig.currentLanguage = switchEvent.to;
    callConfig.lastLanguageSwitch = Date.now();

    // Emit event for frontend updates
    this.emitCallUpdate(callId, {
      type: 'languageSwitch',
      language: switchEvent.to,
      previousLanguage: switchEvent.from,
      confidence: switchEvent.context?.confidence,
      isInterruption: switchEvent.context?.isInterruption
    });
  }

  /**
   * Handle language adaptation events
   * @param {string} callId - Call identifier
   * @param {Object} adaptationEvent - Language adaptation event
   */
  handleLanguageAdaptation(callId, adaptationEvent) {
    console.log(`[EnhancedCallController] Language adaptation for call ${callId}: ${adaptationEvent.newLanguage}`);

    // Update call state
    const callConfig = this.activeCalls.get(callId);
    if (callConfig) {
      callConfig.lastAdaptation = Date.now();
    }
  }

  /**
   * Process user transcription with enhanced language detection
   * @param {string} callId - Call identifier
   * @param {string} transcription - User's transcribed text
   * @param {boolean} isInterruption - Whether this is an interruption
   * @returns {Promise<Object>} Processing result
   */
  async processUserTranscription(callId, transcription, isInterruption = false) {
    try {
      console.log(`[EnhancedCallController] Processing transcription for call ${callId}: "${transcription.substring(0, 50)}..." (interruption: ${isInterruption})`);

      const callConfig = this.activeCalls.get(callId);
      if (!callConfig) {
        throw new Error(`Call ${callId} not found`);
      }

      // Process with real-time language switcher
      const languageResult = await realTimeLanguageSwitcher.processTranscription(
        callId,
        transcription,
        isInterruption
      );

      // If language switched or this is the first meaningful input, generate response
      const shouldGenerateResponse = languageResult.switched || transcription.trim().length > 0;

      if (shouldGenerateResponse) {
        // Generate language-adaptive response
        const response = await this.generateEnhancedResponse(callId, transcription, {
          languageSwitch: languageResult.switched,
          detectedLanguage: languageResult.language,
          confidence: languageResult.confidence,
          isInterruption
        });

        return {
          success: true,
          transcription,
          languageResult,
          response,
          callId
        };
      }

      return {
        success: true,
        transcription,
        languageResult,
        callId
      };

    } catch (error) {
      console.error(`[EnhancedCallController] Error processing transcription for call ${callId}:`, error);
      return {
        success: false,
        error: error.message,
        callId
      };
    }
  }

  /**
   * Generate enhanced AI response with language adaptation
   * @param {string} callId - Call identifier
   * @param {string} userInput - User's input
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Generated response
   */
  async generateEnhancedResponse(callId, userInput, context = {}) {
    try {
      const callConfig = this.activeCalls.get(callId);
      if (!callConfig) {
        throw new Error(`Call ${callId} not found`);
      }

      console.log(`[EnhancedCallController] Generating enhanced response for call ${callId} in language ${context.detectedLanguage || callConfig.currentLanguage}`);

      // Generate response using language-adaptive handler
      const response = await languageAdaptiveResponseHandler.generateAdaptiveResponse(
        callId,
        userInput,
        {
          prompt: callConfig.prompt,
          script: callConfig.script,
          llmProvider: callConfig.llmProvider,
          languageSwitch: context.languageSwitch,
          isInterruption: context.isInterruption,
          confidence: context.confidence
        }
      );

      // Stream the response if audio is available
      if (response.audio) {
        const stream = audioStreamService.getStream(callId);
        if (stream) {
          await stream.streamLanguageOptimizedResponse(response, {
            voiceProvider: callConfig.voiceProvider
          });
        }
      }

      // Update call statistics
      callConfig.responseCount = (callConfig.responseCount || 0) + 1;
      callConfig.lastResponse = Date.now();

      console.log(`[EnhancedCallController] Generated response for call ${callId}: "${response.text.substring(0, 50)}..."`);

      return response;

    } catch (error) {
      console.error(`[EnhancedCallController] Error generating enhanced response for call ${callId}:`, error);
      
      // Generate fallback response
      const currentLanguage = realTimeLanguageSwitcher.getCurrentLanguage(callId);
      return {
        text: this.getFallbackResponse(currentLanguage),
        language: currentLanguage,
        audio: null,
        error: error.message
      };
    }
  }

  /**
   * Handle user interruption with immediate language adaptation
   * @param {string} callId - Call identifier
   * @param {string} interruptionText - Text that caused interruption
   * @returns {Promise<Object>} Interruption handling result
   */
  async handleUserInterruption(callId, interruptionText) {
    try {
      console.log(`[EnhancedCallController] Handling interruption for call ${callId}: "${interruptionText.substring(0, 50)}..."`);

      // Process interruption with language switcher
      const interruptionResult = await realTimeLanguageSwitcher.handleUserInterruption(
        callId,
        interruptionText
      );

      // Stop current AI speech if necessary
      const stream = audioStreamService.getStream(callId);
      if (stream) {
        stream.interruptAiSpeech();
      }

      // Process as transcription with interruption flag
      const processingResult = await this.processUserTranscription(
        callId,
        interruptionText,
        true
      );

      return {
        success: true,
        interrupted: true,
        interruptionResult,
        processingResult,
        callId
      };

    } catch (error) {
      console.error(`[EnhancedCallController] Error handling interruption for call ${callId}:`, error);
      return {
        success: false,
        error: error.message,
        callId
      };
    }
  }

  /**
   * Get fallback response for a language
   * @param {string} language - Target language
   * @returns {string} Fallback response
   */
  getFallbackResponse(language) {
    const fallbacks = {
      'hi-IN': 'मैं समझ गया। आपकी और क्या सहायता कर सकता हूं?',
      'mixed': 'Main samajh gaya. Aur kya help kar sakta hun?',
      'en-US': 'I understand. How else can I help you?'
    };

    return fallbacks[language] || fallbacks['en-US'];
  }

  /**
   * Get call statistics and language analytics
   * @param {string} callId - Call identifier
   * @returns {Object} Call statistics
   */
  getCallStatistics(callId) {
    const callConfig = this.activeCalls.get(callId);
    if (!callConfig) return null;

    const languageStats = realTimeLanguageSwitcher.getLanguageStats(callId);
    const responseStats = languageAdaptiveResponseHandler.getCurrentState(callId);

    return {
      callId,
      duration: Date.now() - callConfig.startTime,
      initialLanguage: callConfig.initialLanguage,
      currentLanguage: callConfig.currentLanguage,
      totalResponses: callConfig.responseCount || 0,
      languageStats: {
        ...callConfig.languageStats,
        ...languageStats
      },
      responseStats,
      enhancedFeatures: this.enhancedFeatures
    };
  }

  /**
   * Emit call update event
   * @param {string} callId - Call identifier
   * @param {Object} update - Update data
   */
  emitCallUpdate(callId, update) {
    // This would emit to WebSocket clients or other listeners
    console.log(`[EnhancedCallController] Call update for ${callId}:`, update);
  }

  /**
   * Clean up enhanced features for a call
   * @param {string} callId - Call identifier
   */
  cleanup(callId) {
    try {
      console.log(`[EnhancedCallController] Cleaning up enhanced features for call ${callId}`);

      // Clean up language switching services
      realTimeLanguageSwitcher.cleanup(callId);
      languageAdaptiveResponseHandler.cleanup(callId);

      // Remove call configuration
      this.activeCalls.delete(callId);

      console.log(`[EnhancedCallController] Cleanup completed for call ${callId}`);

    } catch (error) {
      console.error(`[EnhancedCallController] Error during cleanup for call ${callId}:`, error);
    }
  }

  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getSystemStatistics() {
    return {
      activeCalls: this.activeCalls.size,
      enhancedFeatures: this.enhancedFeatures,
      languageSwitcher: realTimeLanguageSwitcher.getConfiguration(),
      responseHandler: languageAdaptiveResponseHandler.getStatistics()
    };
  }

  /**
   * Update enhanced features configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfiguration(newConfig) {
    Object.assign(this.enhancedFeatures, newConfig);
    console.log(`[EnhancedCallController] Updated configuration:`, this.enhancedFeatures);
  }
}

// Export as singleton
const enhancedCallControllerIntegration = new EnhancedCallControllerIntegration();
module.exports = enhancedCallControllerIntegration;
