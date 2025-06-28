/**
 * Language-Adaptive AI Response Handler
 * 
 * Ensures that AI responses are generated in the appropriate language
 * immediately after a language switch is detected. This handler coordinates
 * between language detection, LLM generation, and TTS to provide seamless
 * multilingual conversations.
 */

const realTimeLanguageSwitcher = require('./realTimeLanguageSwitcher');
const multilingualSpeechProcessor = require('./multilingualSpeechProcessor');
const openAiFmService = require('./openAiFmService');
const openaiService = require('./openaiService');
const geminiService = require('./geminiService');
const { EventEmitter } = require('events');

class LanguageAdaptiveResponseHandler extends EventEmitter {
  constructor() {
    super();
    this.activeResponses = new Map();
    this.responseQueue = new Map();
    this.languageSwitchListeners = new Map();
  }

  /**
   * Initialize response handling for a call
   * @param {string} callId - Call identifier
   * @param {Object} callConfig - Call configuration
   */
  initializeCall(callId, callConfig = {}) {
    this.activeResponses.set(callId, {
      callId,
      currentLanguage: callConfig.language || 'en-US',
      llmProvider: callConfig.llmProvider || 'openai',
      conversationHistory: [],
      systemPrompt: callConfig.prompt || '',
      script: callConfig.script || '',
      isGenerating: false,
      lastResponse: null,
      pendingInterruption: false
    });

    // Listen for language switches for this call
    this.setupLanguageSwitchListener(callId);

    console.log(`[LanguageAdaptiveResponseHandler] Initialized for call ${callId} with language ${callConfig.language || 'en-US'}`);
  }

  /**
   * Set up language switch listener for a specific call
   * @param {string} callId - Call identifier
   */
  setupLanguageSwitchListener(callId) {
    const listener = (switchEvent) => {
      if (switchEvent.callId === callId) {
        this.handleLanguageSwitch(callId, switchEvent);
      }
    };

    realTimeLanguageSwitcher.on('languageSwitched', listener);
    this.languageSwitchListeners.set(callId, listener);
  }

  /**
   * Handle a language switch event
   * @param {string} callId - Call identifier
   * @param {Object} switchEvent - Language switch event data
   */
  async handleLanguageSwitch(callId, switchEvent) {
    const responseState = this.activeResponses.get(callId);
    if (!responseState) return;

    console.log(`[LanguageAdaptiveResponseHandler] Handling language switch for call ${callId}: ${switchEvent.from} → ${switchEvent.to}`);

    // Update current language
    responseState.currentLanguage = switchEvent.to;

    // If we're currently generating a response, mark it for interruption
    if (responseState.isGenerating) {
      responseState.pendingInterruption = true;
      console.log(`[LanguageAdaptiveResponseHandler] Marking current response generation for interruption`);
    }

    // Clear any queued responses that are now in the wrong language
    this.clearStaleResponses(callId, switchEvent.to);

    // Emit language adaptation event
    this.emit('languageAdapted', {
      callId,
      newLanguage: switchEvent.to,
      previousLanguage: switchEvent.from,
      confidence: switchEvent.context?.confidence
    });
  }

  /**
   * Generate AI response with real-time language adaptation
   * @param {string} callId - Call identifier
   * @param {string} userInput - User's input text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated response
   */
  async generateAdaptiveResponse(callId, userInput, options = {}) {
    const responseState = this.activeResponses.get(callId);
    if (!responseState) {
      throw new Error(`No response state found for call ${callId}`);
    }

    // Check current language from language switcher
    const currentLanguage = realTimeLanguageSwitcher.getCurrentLanguage(callId);
    
    // Update our state if language has changed
    if (currentLanguage !== responseState.currentLanguage) {
      console.log(`[LanguageAdaptiveResponseHandler] Language updated for call ${callId}: ${responseState.currentLanguage} → ${currentLanguage}`);
      responseState.currentLanguage = currentLanguage;
    }

    // Mark as generating
    responseState.isGenerating = true;
    responseState.pendingInterruption = false;

    try {
      console.log(`[LanguageAdaptiveResponseHandler] Generating response for call ${callId} in ${currentLanguage}`);

      // Add user input to conversation history
      responseState.conversationHistory.push({
        role: 'user',
        content: userInput,
        timestamp: Date.now(),
        language: currentLanguage
      });

      // Generate language-appropriate system prompt
      const adaptedSystemPrompt = await this.generateLanguageAdaptedPrompt(
        responseState.systemPrompt,
        currentLanguage,
        responseState.conversationHistory
      );

      // Generate response using the configured LLM provider
      const responseText = await this.generateLLMResponse(
        responseState.llmProvider,
        adaptedSystemPrompt,
        responseState.conversationHistory,
        currentLanguage,
        callId,
        options
      );

      // Check if we were interrupted during generation
      if (responseState.pendingInterruption) {
        console.log(`[LanguageAdaptiveResponseHandler] Response generation was interrupted for call ${callId}`);
        
        // Get the updated language
        const updatedLanguage = realTimeLanguageSwitcher.getCurrentLanguage(callId);
        
        // If language changed, regenerate the response
        if (updatedLanguage !== currentLanguage) {
          console.log(`[LanguageAdaptiveResponseHandler] Regenerating response in new language: ${updatedLanguage}`);
          
          // Update the prompt for the new language
          const newSystemPrompt = await this.generateLanguageAdaptedPrompt(
            responseState.systemPrompt,
            updatedLanguage,
            responseState.conversationHistory
          );

          // Regenerate response in the new language
          const newResponseText = await this.generateLLMResponse(
            responseState.llmProvider,
            newSystemPrompt,
            responseState.conversationHistory,
            updatedLanguage,
            callId,
            options
          );

          return await this.finalizeResponse(callId, newResponseText, updatedLanguage);
        }
      }

      return await this.finalizeResponse(callId, responseText, currentLanguage);

    } catch (error) {
      console.error(`[LanguageAdaptiveResponseHandler] Error generating adaptive response for call ${callId}:`, error);
      
      // Generate fallback response in current language
      const fallbackResponse = await this.generateFallbackResponse(currentLanguage);
      return await this.finalizeResponse(callId, fallbackResponse, currentLanguage);
      
    } finally {
      responseState.isGenerating = false;
    }
  }

  /**
   * Generate language-adapted system prompt
   * @param {string} basePrompt - Base system prompt
   * @param {string} language - Target language
   * @param {Array} conversationHistory - Recent conversation history
   * @returns {Promise<string>} Adapted prompt
   */
  async generateLanguageAdaptedPrompt(basePrompt, language, conversationHistory) {
    let adaptedPrompt = basePrompt;

    // Add language-specific instructions
    switch (language) {
      case 'hi-IN':
        adaptedPrompt += '\n\nIMPORTANT: Respond in Hindi using Devanagari script. Use respectful language with appropriate honorifics (आप, जी, etc.).';
        break;
      
      case 'mixed':
        adaptedPrompt += '\n\nIMPORTANT: Respond in a natural mix of Hindi and English (Hinglish) as commonly spoken in India. Use English for technical terms and Hindi for emotional expressions.';
        break;
      
      case 'en-US':
      default:
        adaptedPrompt += '\n\nIMPORTANT: Respond in clear, natural English.';
        break;
    }

    // Add context from recent conversation
    if (conversationHistory.length > 0) {
      const recentContext = conversationHistory.slice(-3);
      adaptedPrompt += '\n\nRecent conversation context:\n';
      recentContext.forEach((msg, index) => {
        adaptedPrompt += `${msg.role}: ${msg.content}\n`;
      });
    }

    return adaptedPrompt;
  }

  /**
   * Generate response using the specified LLM provider
   * @param {string} provider - LLM provider (openai, gemini)
   * @param {string} systemPrompt - System prompt
   * @param {Array} conversationHistory - Conversation history
   * @param {string} language - Target language
   * @param {string} callId - Call identifier
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Generated response text
   */
  async generateLLMResponse(provider, systemPrompt, conversationHistory, language, callId, options = {}) {
    const historyForLLM = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    try {
      let response;

      switch (provider) {
        case 'gemini':
          response = await geminiService.generateResponse(
            historyForLLM,
            '', // script
            systemPrompt,
            language,
            callId,
            false, // isIntro
            options
          );
          break;

        case 'openai':
        default:
          response = await openaiService.generateResponse(
            historyForLLM,
            '', // script
            systemPrompt,
            language,
            callId,
            false, // isIntro
            options
          );
          break;
      }

      return response.text || response.content || response;

    } catch (error) {
      console.error(`[LanguageAdaptiveResponseHandler] Error with ${provider} provider:`, error);
      
      // Fallback to OpenAI if other provider fails
      if (provider !== 'openai') {
        console.log(`[LanguageAdaptiveResponseHandler] Falling back to OpenAI for call ${callId}`);
        const fallbackResponse = await openaiService.generateResponse(
          historyForLLM,
          '',
          systemPrompt,
          language,
          callId,
          false
        );
        return fallbackResponse.text || fallbackResponse.content || fallbackResponse;
      }

      throw error;
    }
  }

  /**
   * Finalize the response with TTS generation
   * @param {string} callId - Call identifier
   * @param {string} responseText - Response text
   * @param {string} language - Response language
   * @returns {Promise<Object>} Finalized response
   */
  async finalizeResponse(callId, responseText, language) {
    const responseState = this.activeResponses.get(callId);
    if (!responseState) {
      throw new Error(`No response state found for call ${callId}`);
    }

    try {
      // Add AI response to conversation history
      responseState.conversationHistory.push({
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        language: language
      });

      // Generate TTS audio with language-appropriate voice
      const audioBuffer = await this.generateLanguageAppropriateAudio(responseText, language);

      const finalResponse = {
        text: responseText,
        audio: audioBuffer,
        language: language,
        callId: callId,
        timestamp: Date.now(),
        confidence: 1.0
      };

      responseState.lastResponse = finalResponse;

      console.log(`[LanguageAdaptiveResponseHandler] Finalized response for call ${callId} in ${language}: "${responseText.substring(0, 50)}..."`);

      return finalResponse;

    } catch (error) {
      console.error(`[LanguageAdaptiveResponseHandler] Error finalizing response for call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Generate TTS audio with language-appropriate voice
   * @param {string} text - Text to synthesize
   * @param {string} language - Target language
   * @returns {Promise<Buffer>} Audio buffer
   */
  async generateLanguageAppropriateAudio(text, language) {
    try {
      // Get optimal voice for the language
      const voiceId = multilingualSpeechProcessor.getOptimalVoiceForLanguage(language);
      
      // Generate speech using OpenAI FM service with language-optimized settings
      const audioBuffer = await openAiFmService.generateSpeech(text, language, voiceId);
      
      return audioBuffer;

    } catch (error) {
      console.error(`[LanguageAdaptiveResponseHandler] Error generating TTS for language ${language}:`, error);
      
      // Fallback to default voice
      return await openAiFmService.generateSpeech(text, 'en-US', 'alloy');
    }
  }

  /**
   * Generate fallback response in the specified language
   * @param {string} language - Target language
   * @returns {Promise<string>} Fallback response
   */
  async generateFallbackResponse(language) {
    const fallbacks = {
      'hi-IN': 'मुझे खुशी है कि आप मुझसे बात कर रहे हैं। मैं आपकी कैसे सहायता कर सकता हूं?',
      'mixed': 'Main aapki help karne ke liye yahan hun. Aap mujhse kya puchna chahte hain?',
      'en-US': 'I understand. How can I help you today?'
    };

    return fallbacks[language] || fallbacks['en-US'];
  }

  /**
   * Clear responses that are no longer appropriate due to language change
   * @param {string} callId - Call identifier
   * @param {string} newLanguage - New language
   */
  clearStaleResponses(callId, newLanguage) {
    if (this.responseQueue.has(callId)) {
      const queue = this.responseQueue.get(callId);
      const validResponses = queue.filter(response => response.language === newLanguage);
      
      if (validResponses.length !== queue.length) {
        console.log(`[LanguageAdaptiveResponseHandler] Cleared ${queue.length - validResponses.length} stale responses for call ${callId}`);
        this.responseQueue.set(callId, validResponses);
      }
    }
  }

  /**
   * Get the current conversation state for a call
   * @param {string} callId - Call identifier
   * @returns {Object} Current state
   */
  getCurrentState(callId) {
    const responseState = this.activeResponses.get(callId);
    if (!responseState) return null;

    return {
      callId,
      currentLanguage: responseState.currentLanguage,
      conversationLength: responseState.conversationHistory.length,
      isGenerating: responseState.isGenerating,
      lastResponseTime: responseState.lastResponse?.timestamp,
      pendingInterruption: responseState.pendingInterruption
    };
  }

  /**
   * Update call configuration
   * @param {string} callId - Call identifier
   * @param {Object} updates - Configuration updates
   */
  updateCallConfig(callId, updates) {
    const responseState = this.activeResponses.get(callId);
    if (!responseState) return;

    Object.assign(responseState, updates);
    console.log(`[LanguageAdaptiveResponseHandler] Updated configuration for call ${callId}:`, updates);
  }

  /**
   * Clean up resources for a call
   * @param {string} callId - Call identifier
   */
  cleanup(callId) {
    // Remove language switch listener
    const listener = this.languageSwitchListeners.get(callId);
    if (listener) {
      realTimeLanguageSwitcher.removeListener('languageSwitched', listener);
      this.languageSwitchListeners.delete(callId);
    }

    // Clean up state
    this.activeResponses.delete(callId);
    this.responseQueue.delete(callId);

    console.log(`[LanguageAdaptiveResponseHandler] Cleaned up resources for call ${callId}`);
  }

  /**
   * Get statistics for monitoring
   * @returns {Object} Handler statistics
   */
  getStatistics() {
    return {
      activeCalls: this.activeResponses.size,
      queuedResponses: Array.from(this.responseQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
      activeListeners: this.languageSwitchListeners.size
    };
  }
}

// Export as singleton
const languageAdaptiveResponseHandler = new LanguageAdaptiveResponseHandler();
module.exports = languageAdaptiveResponseHandler;
