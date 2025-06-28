/**
 * Real-Time Language Switcher
 * 
 * Optimizes the AI voice conversation system to dynamically switch languages 
 * in real-time during conversations. If the AI is speaking in English and the 
 * user interrupts in Hindi (or vice versa), the AI immediately switches to 
 * respond in the user's language.
 */

const multilingualSpeechProcessor = require('./multilingualSpeechProcessor');
const openAiFmService = require('./openAiFmService');
const analyticsService = require('./analyticsService');
const { EventEmitter } = require('events');

class RealTimeLanguageSwitcher extends EventEmitter {
  constructor() {
    super();
    this.activeCallLanguageStates = new Map();
    this.languageConfidenceThresholds = {
      immediate: 0.9,    // Switch immediately with very high confidence
      delayed: 0.75,     // Switch after confirmation with good confidence
      minimum: 0.6       // Minimum confidence to consider switching
    };
    this.interruptionTimeouts = new Map();
  }

  /**
   * Initialize language tracking for a call
   * @param {string} callId - Call identifier
   * @param {string} initialLanguage - Initial conversation language
   */
  initializeCall(callId, initialLanguage = 'en-US') {
    this.activeCallLanguageStates.set(callId, {
      currentLanguage: initialLanguage,
      lastDetectedLanguage: initialLanguage,
      lastSwitchTime: Date.now(),
      switchHistory: [],
      pendingSwitch: null,
      consecutiveDetections: { [initialLanguage]: 1 },
      interruptionActive: false
    });

    console.log(`[RealTimeLanguageSwitcher] Initialized language tracking for call ${callId} with ${initialLanguage}`);
  }

  /**
   * Process incoming transcribed text and handle immediate language switching
   * @param {string} callId - Call identifier
   * @param {string} text - Transcribed text
   * @param {boolean} isInterruption - Whether this is a user interruption
   * @returns {Promise<Object>} Language switch result
   */
  async processTranscription(callId, text, isInterruption = false) {
    const state = this.activeCallLanguageStates.get(callId);
    if (!state) {
      console.warn(`[RealTimeLanguageSwitcher] No state found for call ${callId}`);
      return { switched: false, language: 'en-US' };
    }

    try {
      // Detect language from the transcription
      const detectionResult = await multilingualSpeechProcessor.detectLanguage(text);
      const detectedLanguage = detectionResult.language;
      const confidence = detectionResult.confidence;

      console.log(`[RealTimeLanguageSwitcher] Call ${callId}: Detected "${detectedLanguage}" (${confidence}) in: "${text.substring(0, 50)}..."`);

      // Track consecutive detections for stability
      if (!state.consecutiveDetections[detectedLanguage]) {
        state.consecutiveDetections[detectedLanguage] = 0;
      }
      state.consecutiveDetections[detectedLanguage]++;

      // Reset other language counters if this is a clear detection
      if (confidence > this.languageConfidenceThresholds.immediate) {
        Object.keys(state.consecutiveDetections).forEach(lang => {
          if (lang !== detectedLanguage) {
            state.consecutiveDetections[lang] = 0;
          }
        });
      }

      // Determine if we should switch languages immediately
      const shouldSwitch = this.shouldSwitchLanguageImmediate(
        state,
        detectedLanguage,
        confidence,
        isInterruption
      );

      if (shouldSwitch) {
        return await this.performLanguageSwitch(callId, detectedLanguage, {
          confidence,
          isInterruption,
          source: 'transcription',
          text: text.substring(0, 100)
        });
      }

      return { 
        switched: false, 
        language: state.currentLanguage,
        detectedLanguage,
        confidence
      };

    } catch (error) {
      console.error(`[RealTimeLanguageSwitcher] Error processing transcription for call ${callId}:`, error);
      return { switched: false, language: state.currentLanguage };
    }
  }

  /**
   * Determine if language should be switched immediately
   * @param {Object} state - Call language state
   * @param {string} detectedLanguage - Newly detected language
   * @param {number} confidence - Detection confidence
   * @param {boolean} isInterruption - Whether this is an interruption
   * @returns {boolean} Whether to switch immediately
   */
  shouldSwitchLanguageImmediate(state, detectedLanguage, confidence, isInterruption) {
    // Don't switch if it's the same language
    if (detectedLanguage === state.currentLanguage) {
      return false;
    }

    // Immediate switch criteria:
    
    // 1. Very high confidence detection
    if (confidence >= this.languageConfidenceThresholds.immediate) {
      console.log(`[RealTimeLanguageSwitcher] Immediate switch: High confidence (${confidence})`);
      return true;
    }

    // 2. User interruption with good confidence
    if (isInterruption && confidence >= this.languageConfidenceThresholds.delayed) {
      console.log(`[RealTimeLanguageSwitcher] Immediate switch: Interruption with good confidence (${confidence})`);
      return true;
    }

    // 3. Consecutive detections of the same language
    const consecutiveCount = state.consecutiveDetections[detectedLanguage] || 0;
    if (consecutiveCount >= 2 && confidence >= this.languageConfidenceThresholds.delayed) {
      console.log(`[RealTimeLanguageSwitcher] Immediate switch: Consecutive detections (${consecutiveCount})`);
      return true;
    }

    // 4. Special case for English-Hindi-Mixed patterns
    if (this.isNaturalLanguageMixPattern(state.currentLanguage, detectedLanguage)) {
      console.log(`[RealTimeLanguageSwitcher] Immediate switch: Natural mix pattern`);
      return true;
    }

    return false;
  }

  /**
   * Check if this is a natural language mixing pattern
   * @param {string} currentLang - Current language
   * @param {string} detectedLang - Detected language
   * @returns {boolean} Whether this is a natural pattern
   */
  isNaturalLanguageMixPattern(currentLang, detectedLang) {
    const patterns = [
      // English to Hindi/Mixed
      { from: 'en-US', to: 'hi-IN' },
      { from: 'en-US', to: 'mixed' },
      // Hindi to English/Mixed
      { from: 'hi-IN', to: 'en-US' },
      { from: 'hi-IN', to: 'mixed' },
      // Mixed to specific languages
      { from: 'mixed', to: 'en-US' },
      { from: 'mixed', to: 'hi-IN' }
    ];

    return patterns.some(pattern => 
      pattern.from === currentLang && pattern.to === detectedLang
    );
  }

  /**
   * Perform the actual language switch
   * @param {string} callId - Call identifier
   * @param {string} newLanguage - New language to switch to
   * @param {Object} context - Switch context information
   * @returns {Promise<Object>} Switch result
   */
  async performLanguageSwitch(callId, newLanguage, context = {}) {
    const state = this.activeCallLanguageStates.get(callId);
    if (!state) {
      return { switched: false, error: 'No state found' };
    }

    const previousLanguage = state.currentLanguage;
    
    try {
      console.log(`[RealTimeLanguageSwitcher] Performing language switch for call ${callId}: ${previousLanguage} → ${newLanguage}`);

      // Update state
      state.currentLanguage = newLanguage;
      state.lastDetectedLanguage = newLanguage;
      state.lastSwitchTime = Date.now();
      state.switchHistory.push({
        from: previousLanguage,
        to: newLanguage,
        timestamp: Date.now(),
        confidence: context.confidence,
        isInterruption: context.isInterruption,
        source: context.source
      });      // Emit language change event for external handlers
      this.emit('languageChanged', {
        callId,
        language: newLanguage,
        previousLanguage,
        confidence: context.confidence,
        isInterruption: context.isInterruption,
        source: 'realTimeLanguageSwitcher'
      });

      // Track analytics
      analyticsService.trackLanguageSwitch({
        callId,
        language: newLanguage,
        previousLanguage,
        confidence: context.confidence,
        isInterruption: context.isInterruption
      });

      // Emit switch event
      this.emit('languageSwitched', {
        callId,
        from: previousLanguage,
        to: newLanguage,
        context
      });

      console.log(`[RealTimeLanguageSwitcher] Successfully switched language for call ${callId} to ${newLanguage}`);

      return {
        switched: true,
        language: newLanguage,
        previousLanguage,
        confidence: context.confidence,
        switchCount: state.switchHistory.length
      };

    } catch (error) {
      console.error(`[RealTimeLanguageSwitcher] Error performing language switch for call ${callId}:`, error);
      return { switched: false, error: error.message };
    }
  }

  /**
   * Handle user interruption with immediate language adaptation
   * @param {string} callId - Call identifier
   * @param {string} interruptionText - Text that caused the interruption
   * @returns {Promise<Object>} Interruption handling result
   */
  async handleUserInterruption(callId, interruptionText) {
    const state = this.activeCallLanguageStates.get(callId);
    if (!state) {
      return { handled: false };
    }

    console.log(`[RealTimeLanguageSwitcher] Handling interruption for call ${callId}: "${interruptionText.substring(0, 50)}..."`);

    state.interruptionActive = true;

    // Clear any pending timeouts
    if (this.interruptionTimeouts.has(callId)) {
      clearTimeout(this.interruptionTimeouts.get(callId));
    }

    // Process the interruption with high priority for language detection
    const result = await this.processTranscription(callId, interruptionText, true);

    // Set timeout to reset interruption state
    const timeout = setTimeout(() => {
      if (state) {
        state.interruptionActive = false;
      }
      this.interruptionTimeouts.delete(callId);
    }, 5000); // 5 second timeout

    this.interruptionTimeouts.set(callId, timeout);

    return {
      handled: true,
      languageSwitched: result.switched,
      newLanguage: result.language,
      confidence: result.confidence
    };
  }

  /**
   * Get the current language for a call
   * @param {string} callId - Call identifier
   * @returns {string} Current language
   */
  getCurrentLanguage(callId) {
    const state = this.activeCallLanguageStates.get(callId);
    return state ? state.currentLanguage : 'en-US';
  }

  /**
   * Get language switch statistics for a call
   * @param {string} callId - Call identifier
   * @returns {Object} Switch statistics
   */
  getLanguageStats(callId) {
    const state = this.activeCallLanguageStates.get(callId);
    if (!state) {
      return null;
    }

    return {
      currentLanguage: state.currentLanguage,
      totalSwitches: state.switchHistory.length,
      switchHistory: state.switchHistory,
      consecutiveDetections: { ...state.consecutiveDetections },
      lastSwitchTime: state.lastSwitchTime,
      isInterruptionActive: state.interruptionActive
    };
  }

  /**
   * Force a language switch (for testing or manual override)
   * @param {string} callId - Call identifier
   * @param {string} language - Language to switch to
   * @returns {Promise<Object>} Switch result
   */
  async forceLanguageSwitch(callId, language) {
    return await this.performLanguageSwitch(callId, language, {
      confidence: 1.0,
      isInterruption: false,
      source: 'manual_override'
    });
  }

  /**
   * Clean up resources for a call
   * @param {string} callId - Call identifier
   */
  cleanup(callId) {
    if (this.interruptionTimeouts.has(callId)) {
      clearTimeout(this.interruptionTimeouts.get(callId));
      this.interruptionTimeouts.delete(callId);
    }
    
    this.activeCallLanguageStates.delete(callId);
    console.log(`[RealTimeLanguageSwitcher] Cleaned up resources for call ${callId}`);
  }

  /**
   * Get configuration for optimization
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return {
      confidenceThresholds: { ...this.languageConfidenceThresholds },
      activeCalls: this.activeCallLanguageStates.size,
      pendingTimeouts: this.interruptionTimeouts.size
    };
  }

  /**
   * Update confidence thresholds for fine-tuning
   * @param {Object} newThresholds - New threshold values
   */
  updateConfidenceThresholds(newThresholds) {
    Object.assign(this.languageConfidenceThresholds, newThresholds);
    console.log(`[RealTimeLanguageSwitcher] Updated confidence thresholds:`, this.languageConfidenceThresholds);
  }

  /**
   * Enhanced language switching with ultra-fast confidence-based decisions
   * @param {string} callId - Call identifier  
   * @param {string} text - Transcribed text
   * @param {boolean} isAISpeaking - Whether AI is currently speaking
   */
  async processTranscriptionUltraFast(callId, text, isAISpeaking = false) {
    const startTime = Date.now();
    
    try {
      const state = this.activeCallLanguageStates.get(callId);
      if (!state) {
        console.log(`[RealTimeLanguageSwitcher] No state found for call ${callId}`);
        return;
      }

      // Ultra-fast language detection with enhanced accuracy
      const detectionResult = await this.detectLanguageWithConfidence(text, {
        currentLanguage: state.currentLanguage,
        conversationHistory: state.switchHistory.slice(-5) // Last 5 interactions
      });

      const detectedLanguage = detectionResult.language;
      const confidence = detectionResult.confidence;
      const detectionTime = Date.now() - startTime;

      console.log(`[RealTimeLanguageSwitcher] Call ${callId}: Detected "${detectedLanguage}" (${confidence.toFixed(2)}) in ${detectionTime}ms`);

      // Update consecutive detections for stability
      if (!state.consecutiveDetections[detectedLanguage]) {
        state.consecutiveDetections[detectedLanguage] = 0;
      }
      state.consecutiveDetections[detectedLanguage]++;

      // Reset other language counters
      Object.keys(state.consecutiveDetections).forEach(lang => {
        if (lang !== detectedLanguage) {
          state.consecutiveDetections[lang] = Math.max(0, state.consecutiveDetections[lang] - 1);
        }
      });

      // Determine if we should switch languages
      const shouldSwitch = this.shouldSwitchLanguage(
        state.currentLanguage,
        detectedLanguage,
        confidence,
        state,
        isAISpeaking
      );

      if (shouldSwitch) {
        await this.performLanguageSwitch(callId, state.currentLanguage, detectedLanguage, {
          confidence,
          isInterruption: isAISpeaking,
          source: 'ultraFastTranscription',
          detectionTime
        });
      }

      // Update last detection
      state.lastDetectedLanguage = detectedLanguage;
      
    } catch (error) {
      console.error(`[RealTimeLanguageSwitcher] Ultra-fast processing error for call ${callId}: ${error.message}`);
    }
  }

  /**
   * Enhanced language detection with confidence scoring
   */
  async detectLanguageWithConfidence(text, context = {}) {
    try {
      // Multi-layer detection approach for maximum accuracy
      
      // Layer 1: Instant pattern matching (< 5ms)
      const patternResult = this.detectLanguageByPatterns(text);
      
      // Layer 2: Enhanced script analysis (< 10ms)
      const scriptResult = this.detectLanguageByScript(text);
      
      // Layer 3: Vocabulary analysis (< 15ms)
      const vocabularyResult = this.detectLanguageByVocabulary(text);
      
      // Layer 4: Context-aware adjustment
      const contextResult = this.adjustDetectionWithHistory(
        [patternResult, scriptResult, vocabularyResult],
        context
      );
      
      return contextResult;
      
    } catch (error) {
      console.error(`[RealTimeLanguageSwitcher] Detection failed: ${error.message}`);
      return { language: context.currentLanguage || 'en-US', confidence: 0.6 };
    }
  }

  /**
   * Pattern-based language detection for instant results
   */
  detectLanguageByPatterns(text) {
    const lowerText = text.toLowerCase();
    
    // Common Hindi/English patterns
    const patterns = {
      hindi: [
        /\b(मैं|आप|हम|तुम|यह|वह|है|हैं|को|का|की|के|में|से|पर|और|या|नहीं)\b/g,
        /\b(नमस्ते|धन्यवाद|माफ़|करना|होना|जाना|आना|देना|लेना|कहना)\b/g
      ],
      english: [
        /\b(i|you|we|they|this|that|is|are|was|were|have|has|had|do|does|did)\b/g,
        /\b(hello|hi|thank|sorry|please|help|yes|no|okay|sure|right)\b/g
      ],
      hinglish: [
        /\b(main|mujhe|aap|kar|ho|the|and|me|you|my|your|please|sorry)\b/g,
        /\b(chahiye|milega|help|problem|account|bank|card|apply|form)\b/g
      ]
    };
    
    let scores = { hindi: 0, english: 0, hinglish: 0 };
    
    Object.keys(patterns).forEach(lang => {
      patterns[lang].forEach(pattern => {
        const matches = lowerText.match(pattern);
        if (matches) {
          scores[lang] += matches.length;
        }
      });
    });
    
    // Determine language based on scores
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) {
      return { language: 'en-US', confidence: 0.5 };
    }
    
    const detectedLang = Object.keys(scores).find(lang => scores[lang] === maxScore);
    const confidence = Math.min(0.95, 0.6 + (maxScore / text.split(' ').length) * 0.35);
    
    const languageMap = {
      hindi: 'hi-IN',
      english: 'en-US', 
      hinglish: 'mixed'
    };
    
    return { 
      language: languageMap[detectedLang] || 'en-US', 
      confidence 
    };
  }

  /**
   * Script-based detection for Devanagari vs Latin
   */
  detectLanguageByScript(text) {
    const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    const totalChars = devanagariChars + latinChars;
    
    if (totalChars === 0) {
      return { language: 'en-US', confidence: 0.5 };
    }
    
    const devanagariRatio = devanagariChars / totalChars;
    const latinRatio = latinChars / totalChars;
    
    if (devanagariRatio > 0.8) {
      return { language: 'hi-IN', confidence: Math.min(0.95, 0.8 + devanagariRatio * 0.15) };
    } else if (latinRatio > 0.8) {
      return { language: 'en-US', confidence: Math.min(0.95, 0.8 + latinRatio * 0.15) };
    } else if (devanagariRatio > 0.2 && latinRatio > 0.2) {
      return { language: 'mixed', confidence: 0.85 };
    } else {
      return { 
        language: devanagariRatio > latinRatio ? 'hi-IN' : 'en-US', 
        confidence: 0.7 
      };
    }
  }

  /**
   * Vocabulary-based detection using word lists
   */
  detectLanguageByVocabulary(text) {
    const words = text.toLowerCase().split(/\s+/);
    
    const vocabularies = {
      hindi: ['नमस्ते', 'धन्यवाद', 'माफ़', 'करिये', 'मुझे', 'आपको', 'चाहिए', 'होगा', 'मिलेगा'],
      english: ['hello', 'thank', 'sorry', 'please', 'help', 'need', 'want', 'can', 'will', 'get'],
      hinglish: ['main', 'aap', 'mujhe', 'chahiye', 'kar', 'ho', 'hai', 'the', 'and', 'me']
    };
    
    let scores = { hindi: 0, english: 0, hinglish: 0 };
    
    words.forEach(word => {
      Object.keys(vocabularies).forEach(lang => {
        if (vocabularies[lang].includes(word)) {
          scores[lang]++;
        }
      });
    });
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) {
      return { language: 'en-US', confidence: 0.6 };
    }
    
    const detectedLang = Object.keys(scores).find(lang => scores[lang] === maxScore);
    const confidence = Math.min(0.9, 0.7 + (maxScore / words.length) * 0.2);
    
    const languageMap = {
      hindi: 'hi-IN',
      english: 'en-US',
      hinglish: 'mixed'
    };
    
    return { 
      language: languageMap[detectedLang] || 'en-US', 
      confidence 
    };
  }

  /**
   * Adjust detection based on conversation history
   */
  adjustDetectionWithHistory(detectionResults, context) {
    // Combine results with weighted average
    let weightedScore = { 'en-US': 0, 'hi-IN': 0, 'mixed': 0 };
    let totalWeight = 0;
    
    const weights = [0.4, 0.3, 0.3]; // Pattern, Script, Vocabulary weights
    
    detectionResults.forEach((result, index) => {
      const weight = weights[index];
      weightedScore[result.language] += result.confidence * weight;
      totalWeight += weight;
    });
    
    // Normalize scores
    Object.keys(weightedScore).forEach(lang => {
      weightedScore[lang] /= totalWeight;
    });
    
    // Find best result
    const bestLanguage = Object.keys(weightedScore)
      .reduce((a, b) => weightedScore[a] > weightedScore[b] ? a : b);
    const bestConfidence = weightedScore[bestLanguage];
    
    // Apply context adjustment
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recentSwitches = context.conversationHistory
        .filter(entry => Date.now() - entry.timestamp < 30000) // Last 30 seconds
        .length;
      
      // If too many recent switches, be more conservative
      if (recentSwitches > 2 && bestLanguage !== context.currentLanguage) {
        return { 
          language: bestLanguage, 
          confidence: Math.max(0.6, bestConfidence - 0.1) 
        };
      }
    }
    
    return { language: bestLanguage, confidence: bestConfidence };
  }

  /**
   * Enhanced decision logic for language switching
   */
  shouldSwitchLanguage(currentLang, detectedLang, confidence, state, isAISpeaking) {
    // Don't switch if confidence is too low
    if (confidence < this.languageConfidenceThresholds.minimum) {
      return false;
    }
    
    // Don't switch to the same language
    if (currentLang === detectedLang) {
      return false;
    }
    
    // Immediate switch for very high confidence
    if (confidence >= this.languageConfidenceThresholds.immediate) {
      console.log(`[RealTimeLanguageSwitcher] Immediate switch: High confidence (${confidence})`);
      return true;
    }
    
    // Check consecutive detections for stability
    const consecutiveCount = state.consecutiveDetections[detectedLang] || 0;
    
    // For interruptions, be more aggressive
    if (isAISpeaking && confidence >= 0.75 && consecutiveCount >= 1) {
      console.log(`[RealTimeLanguageSwitcher] Interruption switch: ${currentLang} → ${detectedLang}`);
      return true;
    }
    
    // For normal conversation, require more stability
    if (!isAISpeaking && confidence >= this.languageConfidenceThresholds.delayed && consecutiveCount >= 2) {
      console.log(`[RealTimeLanguageSwitcher] Stable switch: ${currentLang} → ${detectedLang}`);
      return true;
    }
    
    // Check time since last switch to prevent rapid switching
    const timeSinceLastSwitch = Date.now() - state.lastSwitchTime;
    if (timeSinceLastSwitch < 2000) { // 2 seconds minimum between switches
      console.log(`[RealTimeLanguageSwitcher] Switch blocked: Too recent (${timeSinceLastSwitch}ms)`);
      return false;
    }
    
    return false;
  }
}

// Export as singleton
const realTimeLanguageSwitcher = new RealTimeLanguageSwitcher();
module.exports = realTimeLanguageSwitcher;
