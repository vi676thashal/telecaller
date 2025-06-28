/**
 * Interruption Handler Service
 * 
 * Specialized service for managing real-time interruptions during AI voice calls
 * with sensitivity tuning and response management for credit card sales conversations
 */

// Create a fallback logger in case the imported one is undefined
let logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

try {
  const loggerModule = require('../utils/logger');
  if (loggerModule && loggerModule.logger) {
    logger = loggerModule.logger;
  }
} catch (err) {
  console.warn('Could not load logger module, using fallback logger');
}

class InterruptionHandler {
  constructor() {
    this.interruptionBuffers = new Map(); // Audio buffer windows for interruption detection
    this.interruptionStatus = new Map();  // Status of interruptions by call
    this.latencyMs = 2000; // Default 2-second latency
    this.sensitivityLevel = 0.5; // 0-1 scale (0 = less sensitive, 1 = more sensitive)
    this.interruptionCooldown = new Map(); // Cooldown periods after interruptions
  }
  
  /**
   * Configure interruption handler settings
   * @param {Object} config - Configuration object
   */
  configure(config = {}) {
    if (config.latencyMs !== undefined) {
      this.latencyMs = Math.max(500, Math.min(5000, config.latencyMs));
    }
    
    if (config.sensitivityLevel !== undefined) {
      this.sensitivityLevel = Math.max(0, Math.min(1, config.sensitivityLevel));
    }
    
    logger.info(`Interruption handler configured: latency=${this.latencyMs}ms, sensitivity=${this.sensitivityLevel}`);
  }
  
  /**
   * Initialize interruption handling for a call
   * @param {string} callId - Call identifier
   */
  initializeCall(callId) {
    this.interruptionBuffers.set(callId, []);
    this.interruptionStatus.set(callId, {
      lastInterruptionTime: 0,
      interruptionCount: 0,
      isUserSpeaking: false,
      isAiSpeaking: false,
      waitingToSpeak: false
    });
    this.interruptionCooldown.set(callId, false);
    
    logger.info(`Interruption handler initialized for call ${callId}`);
  }
  
  /**
   * Process audio segment for interruption detection
   * @param {string} callId - Call identifier
   * @param {Object} audioData - Audio data object
   * @param {boolean} isUserSpeaking - Whether user is currently speaking
   * @returns {boolean} - Whether an interruption was detected
   */
  processAudioSegment(callId, audioData, isUserSpeaking) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return false;
    
    // Update speaking status
    status.isUserSpeaking = isUserSpeaking;
    
    // If in cooldown period, don't process interruptions
    if (this.interruptionCooldown.get(callId)) {
      return false;
    }
    
    // If AI is not speaking, no interruption possible
    if (!status.isAiSpeaking) {
      return false;
    }
    
    // If user starts speaking while AI is speaking, potential interruption
    if (isUserSpeaking) {
      // Add to buffer window
      const buffer = this.interruptionBuffers.get(callId) || [];
      buffer.push({
        timestamp: Date.now(),
        isUserSpeaking
      });
      
      // Keep only recent buffer within latency window
      const cutoffTime = Date.now() - this.latencyMs;
      const filteredBuffer = buffer.filter(item => item.timestamp >= cutoffTime);
      this.interruptionBuffers.set(callId, filteredBuffer);
      
      // Count segments with user speaking
      const speakingSegments = filteredBuffer.filter(item => item.isUserSpeaking).length;
      
      // Calculate interruption threshold based on sensitivity
      // More sensitive = fewer speaking segments needed to trigger
      const thresholdSegments = Math.max(2, Math.floor(10 * (1 - this.sensitivityLevel)));
      
      // If enough speaking segments within window, trigger interruption
      if (speakingSegments >= thresholdSegments) {
        this._triggerInterruption(callId);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Update AI speaking status
   * @param {string} callId - Call identifier
   * @param {boolean} isAiSpeaking - Whether AI is speaking
   */
  updateAiSpeakingStatus(callId, isAiSpeaking) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return;
    
    status.isAiSpeaking = isAiSpeaking;
    
    // If AI stopped speaking, clear any waiting flag
    if (!isAiSpeaking) {
      status.waitingToSpeak = false;
    }
  }
  
  /**
   * Trigger an interruption
   * @param {string} callId - Call identifier
   * @private
   */
  _triggerInterruption(callId) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return;
    
    // Record interruption
    status.lastInterruptionTime = Date.now();
    status.interruptionCount++;
    
    // Set cooldown to prevent multiple rapid interruptions
    this.interruptionCooldown.set(callId, true);
    setTimeout(() => {
      this.interruptionCooldown.set(callId, false);
    }, 3000); // 3-second cooldown
    
    logger.info(`Interruption detected for call ${callId} (#${status.interruptionCount})`);
  }
  
  /**
   * Check if AI should wait before speaking
   * @param {string} callId - Call identifier
   * @returns {boolean} - Whether AI should wait
   */
  shouldWaitBeforeSpeaking(callId) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return false;
    
    return status.isUserSpeaking;
  }
  
  /**
   * Mark AI as waiting to speak
   * @param {string} callId - Call identifier
   */
  markWaitingToSpeak(callId) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return;
    
    status.waitingToSpeak = true;
  }
  
  /**
   * Clean up resources for a call
   * @param {string} callId - Call identifier
   */
  cleanupCall(callId) {
    this.interruptionBuffers.delete(callId);
    this.interruptionStatus.delete(callId);
    this.interruptionCooldown.delete(callId);
    
    logger.info(`Cleaned up interruption handler for call ${callId}`);
  }
  
  /**
   * Get interruption statistics for a call
   * @param {string} callId - Call identifier
   * @returns {Object} - Statistics object
   */
  getStatistics(callId) {
    const status = this.interruptionStatus.get(callId);
    if (!status) return null;
    
    return {
      interruptionCount: status.interruptionCount,
      lastInterruptionTime: status.lastInterruptionTime,
      isUserSpeaking: status.isUserSpeaking,
      isAiSpeaking: status.isAiSpeaking,
      waitingToSpeak: status.waitingToSpeak
    };
  }
}

// Create singleton instance
const interruptionHandler = new InterruptionHandler();
module.exports = { interruptionHandler };
