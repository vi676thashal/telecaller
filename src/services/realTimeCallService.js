/**
 * Real-Time Call Service
 * Integrates CallController with the real-time streaming server
 * Handles call state synchronization and WebSocket communication
 */

const WebSocket = require('ws');
const Call = require('../models/Call');
// Check if vadServiceAdapter exists, if not use a dummy implementation
let voiceActivityDetectionService;
try {
  voiceActivityDetectionService = require('./vadServiceAdapter');
} catch (error) {
  console.log('[RealTimeCallService] VAD service adapter not found, using fallback');
  voiceActivityDetectionService = {
    initialize: () => Promise.resolve(),
    detect: () => Promise.resolve(false),
    cleanup: () => Promise.resolve()
  };
}

class RealTimeCallService {
  constructor() {
    this.activeStreams = new Map(); // Track active streaming connections
    this.callStates = new Map(); // Synchronize call states
  }
  /**
   * Initialize real-time processing for a call
   * @param {string} callId - Database call ID
   * @param {Object} callData - Call configuration data
   */
  async initializeCall(callId, callData) {
    try {
      console.log(`[RealTimeCallService] Initializing real-time call: ${callId}`);
      
      // Store call configuration for the streaming server
      this.callStates.set(callId, {
        id: callId,
        phoneNumber: callData.phoneNumber,
        script: callData.script || 'Welcome to Secure Voice AI. How can I assist you today?',
        prompt: callData.prompt || 'You are a helpful AI assistant.',
        language: callData.language || 'en-US',
        voiceProvider: callData.voiceProvider || 'elevenlabs',
        voiceId: callData.voiceId || null,
        campaignName: callData.campaignName || 'Default Campaign',
        startTime: new Date(),
        status: 'initialized',
        config: {
          enableInterruptions: callData.enableInterruptions !== false,
          recordConversation: callData.recordConversation !== false,
          ttsProvider: callData.ttsProvider || 'elevenlabs',
          sttProvider: callData.sttProvider || 'deepgram', // Updated default to deepgram
          llmProvider: callData.llmProvider || 'openai'
        }
      });
      
      // Try to initialize voice activity detection if the service is available
      try {
        this.initializeVoiceActivityDetection(callId, callData.sttProvider);
      } catch (vadError) {
        console.warn(`[RealTimeCallService] Could not initialize VAD service: ${vadError.message}`);
      }

      console.log(`[RealTimeCallService] Call ${callId} initialized with real-time streaming`);
      return true;
    } catch (error) {
      console.error(`[RealTimeCallService] Error initializing call ${callId}:`, error);
      return false;
    }
  }
  
  /**
   * Initialize voice activity detection service with the STT provider
   * @param {string} callId - Database call ID
   * @param {string} sttProvider - Speech-to-text provider to use
   */  initializeVoiceActivityDetection(callId, sttProvider) {
    try {
      if (voiceActivityDetectionService && typeof voiceActivityDetectionService.setSTTProvider === 'function') {
        // Set the STT provider in the voice activity detection service
        voiceActivityDetectionService.setSTTProvider(callId, sttProvider);
        console.log(`[RealTimeCallService] Voice activity detection initialized for call ${callId} with STT provider: ${sttProvider}`);
      } else {
        console.log(`[RealTimeCallService] Voice activity detection service not available or missing setSTTProvider method`);
      }
    } catch (error) {
      console.error(`[RealTimeCallService] Error initializing voice activity detection for call ${callId}:`, error);
    }
  }

  /**
   * Get call configuration for the streaming server
   * @param {string} callId - Database call ID
   * @returns {Object|null} Call configuration
   */
  getCallConfig(callId) {
    return this.callStates.get(callId) || null;
  }

  /**
   * Update call status
   * @param {string} callId - Database call ID  
   * @param {string} status - New status
   */
  async updateCallStatus(callId, status) {
    try {
      // Update local state
      if (this.callStates.has(callId)) {
        const callState = this.callStates.get(callId);
        callState.status = status;
        callState.lastActivity = new Date();
      }

      // Update database
      await Call.findByIdAndUpdate(callId, { 
        status: status,
        lastActivity: new Date()
      });

      console.log(`[RealTimeCallService] Updated call ${callId} status to: ${status}`);
    } catch (error) {
      console.error(`[RealTimeCallService] Error updating call status for ${callId}:`, error);
    }
  }

  /**
   * Add transcript entry for a call
   * @param {string} callId - Database call ID
   * @param {Object} transcriptEntry - Transcript entry
   */
  async addTranscript(callId, transcriptEntry) {
    try {
      // Update database with new transcript entry
      await Call.findByIdAndUpdate(callId, {
        $push: { 
          transcript: {
            speaker: transcriptEntry.speaker,
            text: transcriptEntry.text,
            timestamp: transcriptEntry.timestamp || new Date(),
            language: transcriptEntry.language
          }
        },
        lastActivity: new Date()
      });

      // Update local state
      if (this.callStates.has(callId)) {
        const callState = this.callStates.get(callId);
        if (!callState.transcripts) {
          callState.transcripts = [];
        }
        callState.transcripts.push(transcriptEntry);
      }

      console.log(`[RealTimeCallService] Added transcript for call ${callId}: ${transcriptEntry.speaker} - ${transcriptEntry.text.substring(0, 50)}...`);
    } catch (error) {
      console.error(`[RealTimeCallService] Error adding transcript for ${callId}:`, error);
    }
  }

  /**
   * Register a WebSocket connection for a call
   * @param {string} callId - Database call ID
   * @param {WebSocket} ws - WebSocket connection
   */
  registerWebSocket(callId, ws) {
    try {
      this.activeStreams.set(callId, {
        ws: ws,
        connected: true,
        connectedAt: new Date()
      });

      console.log(`[RealTimeCallService] Registered WebSocket for call: ${callId}`);
    } catch (error) {
      console.error(`[RealTimeCallService] Error registering WebSocket for ${callId}:`, error);
    }
  }

  /**
   * Clean up call resources
   * @param {string} callId - Database call ID
   */
  async cleanup(callId) {
    try {
      console.log(`[RealTimeCallService] Cleaning up call: ${callId}`);

      // Update final call status
      if (this.callStates.has(callId)) {
        const callState = this.callStates.get(callId);
        
        await Call.findByIdAndUpdate(callId, {
          status: 'completed',
          endTime: new Date(),
          duration: Math.round((new Date() - callState.startTime) / 1000)
        });
      }

      // Remove from active states
      this.callStates.delete(callId);
      this.activeStreams.delete(callId);

      console.log(`[RealTimeCallService] Cleanup completed for call: ${callId}`);
    } catch (error) {
      console.error(`[RealTimeCallService] Error during cleanup for ${callId}:`, error);
    }
  }

  /**
   * Get all active calls
   * @returns {Array} Array of active call IDs
   */
  getActiveCalls() {
    return Array.from(this.callStates.keys());
  }

  /**
   * Check if a call is active
   * @param {string} callId - Database call ID
   * @returns {boolean} True if call is active
   */
  isCallActive(callId) {
    return this.callStates.has(callId);
  }

  /**
   * Get call statistics
   * @returns {Object} Call statistics
   */
  getStats() {
    return {
      activeCalls: this.callStates.size,
      activeStreams: this.activeStreams.size,
      calls: Array.from(this.callStates.values()).map(call => ({
        id: call.id,
        status: call.status,
        startTime: call.startTime,
        language: call.language,
        duration: Math.round((new Date() - call.startTime) / 1000)
      }))
    };
  }
}

// Export both the class and a singleton instance for flexibility
const realTimeCallServiceInstance = new RealTimeCallService();

module.exports = realTimeCallServiceInstance;
module.exports.default = RealTimeCallService; // Also export the class as default
module.exports.RealTimeCallService = RealTimeCallService; // Named export
