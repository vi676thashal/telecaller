/**
 * Multilingual Speech Processor Service
 * 
 * This service handles language detection, speech processing,
 * and voice selection for multilingual conversations.
 */

const openAiFmService = require('./openAiFmService');
const analyticsService = require('./analyticsService');
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

// Configuration for language detection
const LANG_DETECTION_CONFIG = {
  // Minimum confidence to accept language detection
  MIN_CONFIDENCE: 0.7,
  // Sample size for language detection (characters)
  SAMPLE_SIZE: 50,
  // Minimum length of text for reliable detection
  MIN_TEXT_LENGTH: 10,
  // Languages supported
  SUPPORTED_LANGUAGES: ['en-US', 'hi-IN', 'mixed']
};

class MultilingualSpeechProcessor {
  constructor() {
    this.languageDetectionCache = new Map();
    this.voiceSelectionCache = new Map();
    this.languageConfidence = new Map();
    this.lastDetectionTime = 0;
    
    // Initialize caches TTL cleanup
    setInterval(() => this.cleanupCaches(), 10 * 60 * 1000); // Every 10 minutes
  }
  
  /**
   * Detect language from text
   * @param {string} text - Text to detect language from
   * @returns {Promise<Object>} - Detected language and confidence
   */
  async detectLanguage(text) {
    if (!text || text.trim().length < LANG_DETECTION_CONFIG.MIN_TEXT_LENGTH) {
      return { language: 'unknown', confidence: 0 };
    }
    
    try {
      // Check cache first
      const cacheKey = text.slice(0, LANG_DETECTION_CONFIG.SAMPLE_SIZE);
      if (this.languageDetectionCache.has(cacheKey)) {
        return this.languageDetectionCache.get(cacheKey);
      }
      
      // Use OpenAI FM service for language detection
      const detectedLanguage = await openAiFmService.identifyLanguage(text);
      
      // Validate detected language
      let language = 'en-US'; // Default to English
      let confidence = 0.8;   // Default confidence
      
      if (detectedLanguage.startsWith('hi')) {
        language = 'hi-IN';
        confidence = 0.9;
      } else if (detectedLanguage === 'mixed') {
        language = 'mixed';
        confidence = 0.75;
      }
      
      const result = { language, confidence };
      
      // Cache result
      this.languageDetectionCache.set(cacheKey, result);
      this.lastDetectionTime = Date.now();
      
      // Update language confidence tracking
      if (!this.languageConfidence.has(language)) {
        this.languageConfidence.set(language, []);
      }
      const confidenceArray = this.languageConfidence.get(language);
      confidenceArray.push(confidence);
      if (confidenceArray.length > 10) {
        confidenceArray.shift(); // Keep last 10 values
      }
      
      return result;
    } catch (error) {
      logger.error(`Error detecting language: ${error.message}`);
      return { language: 'en-US', confidence: 0.5 }; // Default to English on error
    }
  }
  
  /**
   * Detect language from audio
   * @param {Buffer} audioBuffer - Audio data
   * @returns {Promise<Object>} - Detected language and confidence
   */
  async detectLanguageFromAudio(audioBuffer) {
    try {
      // Create a temporary file for the audio
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `lang_detect_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioBuffer);
      
      // Use Whisper for transcription with language detection
      const transcription = await openAiFmService.transcribeAudio(tempFile);
      
      // Clean up temp file
      fs.unlinkSync(tempFile);
      
      // If transcription successful, detect language from text
      if (transcription && transcription.text) {
        return this.detectLanguage(transcription.text);
      }
      
      return { language: 'unknown', confidence: 0 };
    } catch (error) {
      logger.error(`Error detecting language from audio: ${error.message}`);
      return { language: 'en-US', confidence: 0.5 }; // Default to English on error
    }
  }
  
  /**
   * Select best voice for a language and emotion
   * @param {string} language - Language code
   * @param {string} emotion - Emotional context
   * @returns {Promise<Object>} - Selected voice
   */  async selectVoiceForLanguage(language, emotion = 'neutral') {
    try {
      // Generate cache key
      const cacheKey = `${language}:${emotion}`;
      
      // Check cache first
      if (this.voiceSelectionCache.has(cacheKey)) {
        return this.voiceSelectionCache.get(cacheKey);
      }
      
      // Use OpenAI FM service for voice selection
      const defaultVoice = {
        id: this.getOptimalVoiceForLanguage(language),
        name: this.getVoiceNameForLanguage(language),
        language: this.normalizeLanguageCode(language),
        emotion: emotion
      };
      
      // Cache result
      this.voiceSelectionCache.set(cacheKey, defaultVoice);
      
      return defaultVoice;
    } catch (error) {
      logger.error(`Error selecting voice for language ${language}: ${error.message}`);
      
      // Return a default voice based on language with Hindi-English-Mix optimization
      const defaultVoice = {
        id: this.getOptimalVoiceForLanguage(language),
        name: this.getVoiceNameForLanguage(language),
        language: this.normalizeLanguageCode(language)
      };
      
      return defaultVoice;
    }
  }
  
  /**
   * Get optimal voice ID for a specific language including mixed languages
   * @param {string} language - Language code
   * @returns {string} - Optimal voice ID
   */
  getOptimalVoiceForLanguage(language) {
    const voiceMap = {
      'hi-IN': 'nova',        // OpenAI Nova for Hindi - good Indian accent
      'en-US': 'alloy',       // OpenAI Alloy for English - neutral
      'mixed': 'nova',        // Nova works best for Hindi-English-Mix
      'hinglish': 'nova',     // Nova handles code-switching well
      'en-IN': 'nova',        // Indian English - Nova
      'hi': 'nova',           // Hindi - Nova
      'en': 'alloy'           // English - Alloy
    };
    
    return voiceMap[language] || (language.startsWith('hi') ? 'nova' : 'alloy');
  }
  
  /**
   * Get voice name for language
   * @param {string} language - Language code
   * @returns {string} - Voice name
   */
  getVoiceNameForLanguage(language) {
    if (language === 'mixed' || language === 'hinglish') {
      return 'Hindi-English Mix (Nova)';
    } else if (language.startsWith('hi')) {
      return 'Hindi (Nova)';
    } else {
      return 'English (Alloy)';
    }
  }
  
  /**
   * Normalize language code for TTS services
   * @param {string} language - Language code
   * @returns {string} - Normalized language code
   */
  normalizeLanguageCode(language) {
    const codeMap = {
      'mixed': 'en-US',      // Use en-US for mixed content
      'hinglish': 'en-US',   // Use en-US for Hinglish
      'hi': 'hi-IN',
      'en': 'en-US',
      'hindi': 'hi-IN',
      'english': 'en-US'
    };
    
    return codeMap[language] || (language.startsWith('hi') ? 'hi-IN' : 'en-US');
  }
  
  /**
   * Detect emotion from text
   * @param {string} text - Text to detect emotion from
   * @returns {Promise<string>} - Detected emotion
   */
  async detectEmotion(text) {
    try {
      // Simple keyword-based emotion detection
      // In production, use a more sophisticated sentiment analysis service
      const text_lower = text.toLowerCase();
      
      if (text_lower.includes('happy') || text_lower.includes('glad') || 
          text_lower.includes('great') || text_lower.includes('खुश') ||
          text_lower.includes('प्रसन्न')) {
        return 'cheerful';
      }
      
      if (text_lower.includes('sad') || text_lower.includes('sorry') ||
          text_lower.includes('unfortunate') || text_lower.includes('दुःख') ||
          text_lower.includes('खेद')) {
        return 'sad';
      }
      
      if (text_lower.includes('angry') || text_lower.includes('frustrat') ||
          text_lower.includes('क्रोधित') || text_lower.includes('निराश')) {
        return 'authoritative';
      }
      
      if (text_lower.includes('thank') || text_lower.includes('appreciate') ||
          text_lower.includes('धन्यवाद') || text_lower.includes('आभार')) {
        return 'warm';
      }
      
      if (text_lower.includes('help') || text_lower.includes('need assistance') ||
          text_lower.includes('मदद') || text_lower.includes('सहायता')) {
        return 'empathetic';
      }
      
      // Default emotion
      return 'neutral';
    } catch (error) {
      logger.error(`Error detecting emotion: ${error.message}`);
      return 'neutral'; // Default to neutral on error
    }
  }
  
  /**
   * Process transcribed text for language and emotion
   * @param {string} text - Transcribed text
   * @returns {Promise<Object>} - Processing result with language and emotion
   */
  async processTranscribedText(text) {
    try {
      const languageResult = await this.detectLanguage(text);
      const emotion = await this.detectEmotion(text);
      
      return {
        text,
        language: languageResult.language,
        confidence: languageResult.confidence,
        emotion
      };
    } catch (error) {
      logger.error(`Error processing transcribed text: ${error.message}`);
      return {
        text,
        language: 'en-US',
        confidence: 0.5,
        emotion: 'neutral'
      };
    }
  }
  
  /**
   * Clean up caches periodically
   */
  cleanupCaches() {
    // Limit cache sizes
    if (this.languageDetectionCache.size > 1000) {
      // Keep only the newest 500 entries
      const entries = [...this.languageDetectionCache.entries()];
      this.languageDetectionCache = new Map(entries.slice(-500));
    }
    
    if (this.voiceSelectionCache.size > 100) {
      // Just clear it completely if too large
      this.voiceSelectionCache.clear();
    }
  }
  
  /**
   * Get language confidence statistics
   * @returns {Object} - Language confidence statistics
   */
  getLanguageConfidenceStats() {
    const stats = {};
    
    for (const [language, confidences] of this.languageConfidence.entries()) {
      if (confidences.length > 0) {
        const sum = confidences.reduce((a, b) => a + b, 0);
        const avg = sum / confidences.length;
        stats[language] = {
          count: confidences.length,
          averageConfidence: avg,
          lastDetection: this.lastDetectionTime
        };
      }
    }
    
    return stats;
  }
  
  /**
   * Check if a language switch is needed
   * @param {string} currentLanguage - Current language
   * @param {string} detectedLanguage - Detected language
   * @param {number} confidence - Detection confidence
   * @returns {boolean} - Whether to switch language
   */
  shouldSwitchLanguage(currentLanguage, detectedLanguage, confidence) {
    // Only switch if confidence is high enough
    if (confidence < LANG_DETECTION_CONFIG.MIN_CONFIDENCE) {
      return false;
    }
    
    // If current language is unknown, switch
    if (currentLanguage === 'unknown') {
      return true;
    }
    
    // If detected language is the same, don't switch
    if (currentLanguage === detectedLanguage) {
      return false;
    }
    
    // If current is mixed and detected is specific, switch
    if (currentLanguage === 'mixed' && 
        (detectedLanguage === 'en-US' || detectedLanguage === 'hi-IN')) {
      return true;
    }
    
    // If current is specific and detected is mixed, stay with specific
    if ((currentLanguage === 'en-US' || currentLanguage === 'hi-IN') && 
        detectedLanguage === 'mixed') {
      return false;
    }
    
    // Otherwise, switch languages
    return true;
  }
}

// Export as singleton
const multilingualSpeechProcessor = new MultilingualSpeechProcessor();
module.exports = multilingualSpeechProcessor;
