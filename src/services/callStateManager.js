const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const activeCallStates = new Map();
const CALL_STATE_TIMEOUT = 300000; // 5 minutes

class CallStateManager extends EventEmitter {
  constructor() {
    super();
    // Cleanup interval for stale call states
    setInterval(() => this.cleanupStaleCallStates(), 60000);
  }

  initializeCall(callId) {
    if (!activeCallStates.has(callId)) {
      logger.info(`[CallStateManager] Initializing state for call ${callId}`);
      activeCallStates.set(callId, {
        id: callId,
        active: true,
        mediaStreamReady: false,
        lastActivity: Date.now(),
        greetingAttempts: 0,
        maxGreetingAttempts: 5,
        reconnectAttempts: 0,
        maxReconnectAttempts: 3,
        // Credit card sales specific fields
        webSockets: new Set(),
        language: 'en-US',
        aiSpeaking: false,
        userSpeaking: false,
        transcription: [],
        emotions: ['neutral'],
        interruptions: 0,
        createdAt: Date.now(),
        creditCardInterest: false,
        creditCardType: null,
        conversionLikelihood: 'unknown',
        callStage: 'greeting',
        audioStream: null,
        webSocket: null,
        status: 'initializing'
      });
    }
    return this.getCallState(callId);
  }

  getCallState(callId) {
    const state = activeCallStates.get(callId);
    if (state) {
      state.lastActivity = Date.now();
    }
    return state;
  }

  updateCallState(callId, updates) {
    const state = this.getCallState(callId);
    if (state) {
      Object.assign(state, updates);
      state.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  setMediaStreamReady(callId, isReady) {
    const state = this.getCallState(callId);
    if (state) {
      state.mediaStreamReady = isReady;
      state.lastActivity = Date.now();
      console.log(`[CallStateManager] Media stream ${isReady ? 'ready' : 'not ready'} for call ${callId}`);
    }
  }

  isMediaStreamReady(callId) {
    const state = this.getCallState(callId);
    return state?.mediaStreamReady || false;
  }

  clearCallState(callId, reason = 'unknown') {
    const state = activeCallStates.get(callId);
    if (state) {
      // Only clear if call is completed or errored
      if (state.status === 'completed' || state.status === 'error') {
        console.log(`[CallStateManager] Clearing state for call ${callId}. Reason: ${reason}`);
        activeCallStates.delete(callId);
        return true;
      } else {
        console.log(`[CallStateManager] Keeping state for active call ${callId} (${state.status})`);
        return false;
      }
    }
    return false;
  }

  cleanupStaleCallStates() {
    const now = Date.now();
    for (const [callId, state] of activeCallStates.entries()) {
      if (now - state.lastActivity > CALL_STATE_TIMEOUT) {
        console.log(`[CallStateManager] Cleaning up stale state for call ${callId}`);
        activeCallStates.delete(callId);
      }
    }
  }

  registerWebSocket(callId, ws) {
    const state = this.getCallState(callId);
    if (state) {
      state.webSocket = ws;
      state.lastActivity = Date.now();
      console.log(`[CallStateManager] Registered WebSocket for call ${callId}`);
    }
  }

  unregisterWebSocket(callId) {
    const state = this.getCallState(callId);
    if (state) {
      state.webSocket = null;
      console.log(`[CallStateManager] Unregistered WebSocket for call ${callId}`);
    }
  }
}

module.exports = new CallStateManager();