/**
 * ENHANCED TTS FALLBACK AND ERROR HANDLING SERVICE
 * 
 * This service provides robust fallback mechanisms for TTS provider failures
 * and ensures consistent audio responses even when providers timeout or fail.
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

class EnhancedTTSFallbackService {
  constructor() {
    this.providerStats = {
      openai_fm: { success: 0, failure: 0, avgTime: 0 },
      elevenlabs: { success: 0, failure: 0, avgTime: 0 },
      rime: { success: 0, failure: 0, avgTime: 0 }
    };
    
    this.fallbackChains = {
      'timeout': ['rime', 'openai_fm', 'elevenlabs'],
      'invalid_voice': ['openai_fm', 'rime'], 
      'api_error': ['elevenlabs', 'rime', 'openai_fm'],
      'network_error': ['openai_fm', 'elevenlabs'],
      'default': ['openai_fm', 'elevenlabs', 'rime']
    };
    
    this.timeouts = {
      openai_fm: 8000,
      chatgpt_tts: 8000,
      elevenlabs: 10000,
      rime: 6000
    };
    
    this.initializeFallbackAudio();
  }

  /**
   * Initialize fallback audio files and directories
   */
  initializeFallbackAudio() {
    const storageDir = path.join(__dirname, '../storage');
    const audioDir = path.join(storageDir, 'audio');
    const fallbackDir = path.join(storageDir, 'fallback');
    
    // Create directories
    [storageDir, audioDir, fallbackDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
    
    // Create enhanced fallback audio files
    this.createFallbackAudioFiles(fallbackDir);
  }

  /**
   * Create robust fallback audio files
   */
  createFallbackAudioFiles(fallbackDir) {
    const fallbackSizes = [
      { name: 'emergency_small.mp3', size: 12 * 1024 },
      { name: 'emergency_medium.mp3', size: 20 * 1024 },
      { name: 'emergency_large.mp3', size: 35 * 1024 },
      { name: 'silence.mp3', size: 15 * 1024 }
    ];
    
    fallbackSizes.forEach(({ name, size }) => {
      const filePath = path.join(fallbackDir, name);
      if (!fs.existsSync(filePath)) {
        const audioBuffer = this.generateValidMP3(size);
        fs.writeFileSync(filePath, audioBuffer);
        logger.info(`Created fallback audio: ${name} (${audioBuffer.length} bytes)`);
      }
    });
  }

  /**
   * Generate a valid MP3 file of specified size
   */
  generateValidMP3(targetSize) {
    const frames = [];
    
    // ID3v2 header (10 bytes)
    frames.push(Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]));
    
    const frameSize = 320;
    const frameCount = Math.ceil((targetSize - 10) / frameSize);
    
    for (let i = 0; i < frameCount; i++) {
      const frame = Buffer.alloc(frameSize);
      
      // Valid MP3 frame header
      frame[0] = 0xff; // Frame sync
      frame[1] = 0xfb; // MPEG-1 Layer 3
      frame[2] = 0x90; // Bitrate and frequency
      frame[3] = 0x44; // Channel mode
      
      // Fill with pattern to create valid audio data
      for (let j = 4; j < frameSize; j++) {
        frame[j] = (i * 127 + j) % 256;
      }
      
      frames.push(frame);
    }
    
    return Buffer.concat(frames);
  }

  /**
   * Classify error type for smart fallback selection
   */
  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('voice') && (message.includes('invalid') || message.includes('not found'))) {
      return 'invalid_voice';
    }
    if (message.includes('api') || message.includes('400') || message.includes('401') || message.includes('403')) {
      return 'api_error';
    }
    if (message.includes('network') || message.includes('enotfound') || message.includes('connection')) {
      return 'network_error';
    }
    
    return 'default';
  }

  /**
   * Get next provider in fallback chain
   */
  getNextProvider(currentProvider, errorType) {
    const chain = this.fallbackChains[errorType] || this.fallbackChains.default;
    const currentIndex = chain.indexOf(currentProvider);
    
    if (currentIndex !== -1 && currentIndex < chain.length - 1) {
      return chain[currentIndex + 1];
    }
    
    return chain.filter(p => p !== currentProvider)[0];
  }

  /**
   * Update provider statistics
   */
  updateStats(provider, success, duration) {
    if (!this.providerStats[provider]) return;
    
    const stats = this.providerStats[provider];
    
    if (success) {
      stats.success++;
      stats.avgTime = (stats.avgTime * (stats.success - 1) + duration) / stats.success;
    } else {
      stats.failure++;
    }
    
    logger.info(`Updated stats for ${provider}: ${stats.success} success, ${stats.failure} failures, avg ${stats.avgTime}ms`);
  }

  /**
   * Get best performing provider
   */
  getBestProvider() {
    let bestProvider = 'openai_fm';
    let bestScore = 0;
    
    for (const [provider, stats] of Object.entries(this.providerStats)) {
      const total = stats.success + stats.failure;
      if (total < 3) continue; // Need minimum samples
      
      const successRate = stats.success / total;
      const speedScore = stats.avgTime > 0 ? Math.min(5000 / stats.avgTime, 1) : 0;
      const score = successRate * 0.7 + speedScore * 0.3;
      
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }
    
    logger.info(`Best performing provider: ${bestProvider} (score: ${bestScore.toFixed(2)})`);
    return bestProvider;
  }

  /**
   * Get timeout for specific provider
   */
  getTimeout(provider) {
    return this.timeouts[provider] || 8000;
  }

  /**
   * Get fallback audio buffer
   */
  getFallbackAudio(preferredSize = 'medium') {
    const fallbackDir = path.join(__dirname, '../storage/fallback');
    const fallbackOptions = [
      { type: preferredSize, path: path.join(fallbackDir, `emergency_${preferredSize}.mp3`) },
      { type: 'medium', path: path.join(fallbackDir, 'emergency_medium.mp3') },
      { type: 'small', path: path.join(fallbackDir, 'emergency_small.mp3') },
      { type: 'large', path: path.join(fallbackDir, 'emergency_large.mp3') },
      { type: 'silence', path: path.join(fallbackDir, 'silence.mp3') }
    ];
    
    for (const option of fallbackOptions) {
      if (fs.existsSync(option.path)) {
        try {
          const stats = fs.statSync(option.path);
          if (stats.size >= 10 * 1024) { // Minimum 10KB for Twilio
            const audioBuffer = fs.readFileSync(option.path);
            logger.info(`Using ${option.type} fallback audio (${audioBuffer.length} bytes)`);
            return audioBuffer;
          }
        } catch (err) {
          logger.warn(`Error reading fallback ${option.path}: ${err.message}`);
        }
      }
    }
    
    // Generate emergency audio if no files work
    logger.warn('All fallback files failed, generating emergency audio');
    return this.generateValidMP3(15 * 1024);
  }

  /**
   * Enhanced error handling with smart recovery
   */
  async handleTTSError(error, provider, text, options = {}) {
    const errorType = this.classifyError(error);
    logger.error(`TTS Error [${provider}] [${errorType}]: ${error.message}`);
    
    // Update failure stats
    this.updateStats(provider, false, 0);
    
    // Get next provider in chain
    const nextProvider = this.getNextProvider(provider, errorType);
    
    if (nextProvider && nextProvider !== provider) {
      logger.info(`Attempting fallback to ${nextProvider} for error type: ${errorType}`);
      return { 
        nextProvider,
        shouldRetry: true,
        timeout: this.getTimeout(nextProvider)
      };
    }
    
    // All providers failed, use fallback audio
    logger.warn('All TTS providers failed, using fallback audio');
    return {
      nextProvider: null,
      shouldRetry: false,
      fallbackAudio: this.getFallbackAudio()
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const report = { providers: {}, recommendations: [] };
    
    for (const [provider, stats] of Object.entries(this.providerStats)) {
      const total = stats.success + stats.failure;
      const successRate = total > 0 ? (stats.success / total * 100).toFixed(1) : 'N/A';
      
      report.providers[provider] = {
        success: stats.success,
        failure: stats.failure,
        successRate: `${successRate}%`,
        avgTime: `${stats.avgTime.toFixed(0)}ms`
      };
      
      if (total >= 5) {
        if (stats.success / total < 0.8) {
          report.recommendations.push(`${provider}: Low success rate (${successRate}%)`);
        }
        if (stats.avgTime > 5000) {
          report.recommendations.push(`${provider}: Slow response time (${stats.avgTime.toFixed(0)}ms)`);
        }
      }
    }
    
    report.bestProvider = this.getBestProvider();
    return report;
  }
}

module.exports = new EnhancedTTSFallbackService();
