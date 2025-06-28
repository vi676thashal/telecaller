/**
 * Voice Activity Detection (VAD) and Language Identification Service
 * 
 * This service provides real-time detection of:
 * 1. When a user is speaking vs. silent
 * 2. Which language is being spoken (English, Hindi, or mixed)
 * 3. Basic emotion detection from audio
 * 4. Real-time audio chunk processing for enhanced accuracy
 */

const openAiFmService = require('./openAiFmService');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const VAD_CONFIG = {
  // Minimum audio level to consider as speech
  SPEECH_THRESHOLD: 0.02,
  // Minimum duration (ms) of silence to consider speech ended
  SILENCE_DURATION: 500,
  // Sample size for language identification
  LANGUAGE_SAMPLE_SIZE: 1000, // 1 second of audio
  // How often to check for language change (ms)
  LANGUAGE_CHECK_INTERVAL: 2000,
  // Audio collection threshold for transcription (ms)
  TRANSCRIPTION_THRESHOLD: 1500,
  // Max audio duration to collect before forcing transcription (ms)
  MAX_AUDIO_COLLECTION: 10000
};

class VoiceActivityDetectionService {
  constructor() {
    this.isSpeaking = false;
    this.lastSpeechDetectedAt = null;
    this.detectedLanguage = 'en-US';
    this.audioBuffer = Buffer.alloc(0);
    this.emotionalState = 'neutral';
    this.speechHistory = [];
    this.languageConfidence = 0;
    this.speakingStartedAt = null;
    this.activeTranscriptionJobs = new Map();
    this.transcriptionCallbacks = new Map();
    this.audioCollectionStreams = new Map();
    this.activeLanguageDetection = false;
    this.lastLanguageDetectionTime = 0;
  }
  
  /**
   * Process audio chunk for speech detection
   * @param {Buffer} audioChunk - Audio data
   * @param {number} sampleRate - Audio sample rate
   * @param {string} callId - Call identifier for tracking
   * @returns {Object} Detection results
   */
  processAudioChunk(audioChunk, sampleRate = 16000, callId = null) {
    // Append to buffer for language ID
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioChunk]);
    
    // Trim buffer if it gets too large
    if (this.audioBuffer.length > sampleRate * 5) { // Keep max 5 seconds
      this.audioBuffer = this.audioBuffer.slice(this.audioBuffer.length - sampleRate * 5);
    }
    
    // Basic VAD: Calculate audio level (RMS)
    const level = this.calculateAudioLevel(audioChunk);
    const now = Date.now();
    
    // Check if audio level indicates speech
    const speechDetected = level > VAD_CONFIG.SPEECH_THRESHOLD;
    let speechEvent = null;
    
    // Speech state machine
    if (speechDetected) {
      if (!this.isSpeaking) {
        // Speech just started
        this.isSpeaking = true;
        this.lastSpeechDetectedAt = now;
        this.speakingStartedAt = now;
        speechEvent = 'start';
        
        // Start collecting audio for transcription if we have a callId
        if (callId) {
          this.startAudioCollection(callId);
        }
        
        // Schedule language detection after collecting enough samples
        this.scheduleLanguageDetection();
      } else {
        // Continuing speech
        this.lastSpeechDetectedAt = now;
        
        // If we've been speaking for a while, do an interim transcription
        if (callId && this.speakingStartedAt && 
            (now - this.speakingStartedAt > VAD_CONFIG.MAX_AUDIO_COLLECTION)) {
          this.transcribeCollectedAudio(callId, true);
        }
      }
    } else if (this.isSpeaking && (now - this.lastSpeechDetectedAt > VAD_CONFIG.SILENCE_DURATION)) {
      // Silence detected for long enough, speech ended
      this.isSpeaking = false;
      speechEvent = 'end';
      
      // Process collected audio for transcription if we have a callId
      if (callId && this.speakingStartedAt) {
        const speechDuration = now - this.speakingStartedAt;
        
        // Only transcribe if speech was long enough
        if (speechDuration > VAD_CONFIG.TRANSCRIPTION_THRESHOLD) {
          this.transcribeCollectedAudio(callId, false);
        } else {
          this.stopAudioCollection(callId);
        }
        
        this.speakingStartedAt = null;
      }
    }
    
    return {
      isSpeaking: this.isSpeaking,
      audioLevel: level,
      language: this.detectedLanguage,
      emotion: this.emotionalState,
      confidenceScore: this.languageConfidence,
      speechEvent
    };
  }
  
  /**
   * Start collecting audio for a specific call
   * @param {string} callId - Call identifier
   */
  startAudioCollection(callId) {
    // Stop any existing collection first
    this.stopAudioCollection(callId);
    
    // Create a new PassThrough stream for audio collection
    const stream = new PassThrough();
    this.audioCollectionStreams.set(callId, {
      stream,
      startTime: Date.now(),
      buffer: Buffer.alloc(0)
    });
    
    console.log(`[VAD] Started audio collection for call ${callId}`);
  }
  
  /**
   * Add audio to the collection for a specific call
   * @param {string} callId - Call identifier
   * @param {Buffer} audioChunk - Audio data
   */
  addAudioToCollection(callId, audioChunk) {
    const collection = this.audioCollectionStreams.get(callId);
    if (!collection) return;
    
    // Add to the buffer
    collection.buffer = Buffer.concat([collection.buffer, audioChunk]);
    collection.stream.write(audioChunk);
  }
  
  /**
   * Stop collecting audio for a specific call
   * @param {string} callId - Call identifier
   */
  stopAudioCollection(callId) {
    const collection = this.audioCollectionStreams.get(callId);
    if (!collection) return;
    
    collection.stream.end();
    this.audioCollectionStreams.delete(callId);
    console.log(`[VAD] Stopped audio collection for call ${callId}`);
  }
  
  /**
   * Transcribe collected audio using Whisper
   * @param {string} callId - Call identifier
   * @param {boolean} isInterim - Whether this is an interim transcription
   */
  async transcribeCollectedAudio(callId, isInterim = false) {
    const collection = this.audioCollectionStreams.get(callId);
    if (!collection || collection.buffer.length < 1000) {
      return;
    }
    
    try {
      // Create temporary audio file
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `speech_${callId}_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, collection.buffer);
      
      // If interim, we keep collecting but also send for transcription
      if (!isInterim) {
        this.stopAudioCollection(callId);
      }
      
      // Schedule transcription with OpenAI Whisper
      this.scheduleWhisperTranscription(tempFile, callId, isInterim);
      
    } catch (error) {
      console.error(`[VAD] Error processing audio for transcription: ${error.message}`);
      this.stopAudioCollection(callId);
    }
  }
  
  /**
   * Schedule a transcription job with Whisper
   * @param {string} audioFile - Path to audio file
   * @param {string} callId - Call identifier
   * @param {boolean} isInterim - Whether this is an interim transcription
   */
  async scheduleWhisperTranscription(audioFile, callId, isInterim) {
    try {
      console.log(`[VAD] Scheduling Whisper transcription for call ${callId}`);
      
      // This would typically call the OpenAI Whisper API
      // For now, we'll use the openAiFmService as a wrapper
      const transcriptionResult = await openAiFmService.transcribeAudio(audioFile);
      
      // Process the transcription result
      if (transcriptionResult && transcriptionResult.text) {
        const { text, language } = transcriptionResult;
        
        // Update language if detected
        if (language) {
          this.detectedLanguage = language;
          this.languageConfidence = 0.95; // Whisper is highly accurate
        }
        
        // Add to speech history
        this.addTranscribedSpeech(text);
        
        // Notify any listeners
        const callback = this.transcriptionCallbacks.get(callId);
        if (callback) {
          callback(text, this.detectedLanguage, isInterim);
        }
        
        console.log(`[VAD] Transcription completed for call ${callId}: ${text.substring(0, 50)}...`);
      }
      
      // Clean up temp file if needed
      if (fs.existsSync(audioFile)) {
        fs.unlinkSync(audioFile);
      }
      
    } catch (error) {
      console.error(`[VAD] Error with Whisper transcription: ${error.message}`);
    }
  }
  
  /**
   * Register a callback for transcription results
   * @param {string} callId - Call identifier
   * @param {Function} callback - Callback function
   */
  registerTranscriptionCallback(callId, callback) {
    this.transcriptionCallbacks.set(callId, callback);
  }
  
  /**
   * Unregister a transcription callback
   * @param {string} callId - Call identifier
   */
  unregisterTranscriptionCallback(callId) {
    this.transcriptionCallbacks.delete(callId);
  }
  
  /**
   * Schedule language detection to avoid excessive API calls
   */
  scheduleLanguageDetection() {
    const now = Date.now();
    if (this.activeLanguageDetection || 
        now - this.lastLanguageDetectionTime < VAD_CONFIG.LANGUAGE_CHECK_INTERVAL) {
      return;
    }
    
    this.activeLanguageDetection = true;
    this.lastLanguageDetectionTime = now;
    
    setTimeout(() => {
      this.detectLanguage().finally(() => {
        this.activeLanguageDetection = false;
      });
    }, 300);
  }
  
  /**
   * Calculate RMS audio level from PCM buffer
   * @param {Buffer} buffer - Audio buffer
   * @returns {number} RMS level (0-1)
   */
  calculateAudioLevel(buffer) {
    // Handle different audio formats (assumes 16-bit PCM)
    const samples = new Int16Array(buffer.buffer);
    
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      // Convert to float -1 to 1
      const sample = samples[i] / 32768.0;
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / samples.length);
    return rms;
  }
  
  /**
   * Detect language from collected audio
   * Uses Whisper through OpenAI API for language ID
   */
  async detectLanguage() {
    try {
      if (this.audioBuffer.length < 16000) {
        // Not enough audio data yet
        return;
      }
      
      // This would typically use a standalone Whisper model or OpenAI Audio API
      // For this implementation, we'll use the openAiFmService to detect language
      // In production, you would send the audio to Whisper API directly
      
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `lang_detection_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, this.audioBuffer);
      
      // Use Whisper via openAiFmService for language detection
      const result = await openAiFmService.detectLanguageFromAudio(tempFile);
      
      if (result && result.language) {
        this.detectedLanguage = result.language;
        this.languageConfidence = result.confidence || 0.7;
      }
      
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      console.log(`[VAD] Detected language: ${this.detectedLanguage} (confidence: ${this.languageConfidence})`);
    } catch (error) {
      console.error('[VAD] Language detection error:', error);
    }
  }
  
  /**
   * Add transcribed speech to history
   * @param {string} text - Transcribed text
   */
  addTranscribedSpeech(text) {
    this.speechHistory.push(text);
    if (this.speechHistory.length > 20) {
      this.speechHistory.shift(); // Keep history manageable
    }
    
    // Detect emotional state
    this.detectEmotion(text);
  }
  
  /**
   * Detect emotional context from speech
   * @param {string} text - Transcribed text
   */
  async detectEmotion(text) {
    try {
      this.emotionalState = await openAiFmService.detectEmotion(text);
    } catch (error) {
      console.error('[VAD] Emotion detection error:', error);
      // Keep current emotional state on error
    }
  }
  
  /**
   * Reset detection state
   */
  reset() {
    this.isSpeaking = false;
    this.lastSpeechDetectedAt = null;
    this.audioBuffer = Buffer.alloc(0);
    this.speechHistory = [];
    this.detectedLanguage = 'en-US';
    this.emotionalState = 'neutral';
    this.activeLanguageDetection = false;
    
    // Clean up any active audio collections
    for (const callId of this.audioCollectionStreams.keys()) {
      this.stopAudioCollection(callId);
    }
    
    // Clear callbacks
    this.transcriptionCallbacks.clear();
  }
}

// Export a singleton instance
module.exports = new VoiceActivityDetectionService();
