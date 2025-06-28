/**
 * Simple Real-Time Call Service
 * Basic call management without voice cloning dependencies
 */

class SimpleRealTimeCallService {
  constructor() {
    this.callStates = new Map();
  }

  /**
   * Initialize a call
   * @param {string} callId - Database call ID
   * @param {Object} callData - Call configuration data
   */
  async initializeCall(callId, callData) {
    try {
      console.log(`[SimpleRealTimeCallService] Initializing call: ${callId}`);
      
      this.callStates.set(callId, {
        id: callId,
        phoneNumber: callData.phoneNumber,
        script: callData.script || 'Hello, how can I help you today?',
        prompt: callData.prompt || 'You are a helpful AI assistant.',
        language: callData.language || 'en-US',
        voiceProvider: callData.voiceProvider || 'elevenlabs',
        startTime: new Date(),
        status: 'initialized'
      });

      return true;
    } catch (error) {
      console.error(`[SimpleRealTimeCallService] Error initializing call ${callId}:`, error);
      return false;
    }
  }

  /**
   * Update call status
   * @param {string} callId - Database call ID
   * @param {Object} status - Status update object
   */
  async updateCallStatus(callId, status) {
    try {
      if (this.callStates.has(callId)) {
        const callState = this.callStates.get(callId);
        Object.assign(callState, status);
        callState.lastActivity = new Date();
      }
      console.log(`[SimpleRealTimeCallService] Updated call ${callId} status`);
    } catch (error) {
      console.error(`[SimpleRealTimeCallService] Error updating call status:`, error);
    }
  }

  /**
   * Get call configuration
   * @param {string} callId - Database call ID
   * @returns {Object|null} Call configuration
   */
  getCallConfig(callId) {
    return this.callStates.get(callId) || null;
  }

  /**
   * Clean up call resources
   * @param {string} callId - Database call ID
   */
  async cleanup(callId) {
    try {
      console.log(`[SimpleRealTimeCallService] Cleaning up call: ${callId}`);
      this.callStates.delete(callId);
    } catch (error) {
      console.error(`[SimpleRealTimeCallService] Error during cleanup:`, error);
    }
  }
}

// Export singleton instance
const simpleRealTimeCallService = new SimpleRealTimeCallService();
module.exports = simpleRealTimeCallService;
