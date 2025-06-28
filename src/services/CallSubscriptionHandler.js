/**
 * Call Subscription Handler
 * 
 * Manages WebSocket-based subscriptions to call events for frontends
 */

const WebSocket = require('ws');
const { logger } = require('../utils/logger');

class CallSubscriptionHandler {
  constructor() {
    this.subscriptions = new Map(); // Map of subscription IDs to WebSocket connections
    this.callSubscribers = new Map(); // Map of call IDs to arrays of subscription IDs
  }
  
  /**
   * Initialize WebSocket server for call event subscriptions
   * @param {http.Server} server - HTTP server instance
   */
  initWebSocketServer(server) {    // Create WebSocket server on /subscribe path
    const wss = new WebSocket.Server({ 
      server,
      path: '/subscribe',
      perMessageDeflate: false,        // Disable compression to prevent frame issues
      skipUTF8Validation: true,        // Allow binary audio data
      fragmentOutgoingMessages: false, // CRITICAL: Prevent control frame fragmentation (fixes Error 31924)
      maxPayload: 65536                // Set appropriate payload size
    });

    logger.info('WebSocket server initialized for call event subscriptions');

    // Setup connection handler
    wss.on('connection', (ws) => {
      const subscriptionId = this.generateSubscriptionId();
      
      this.subscriptions.set(subscriptionId, ws);
      
      logger.info(`New subscription connection established: ${subscriptionId}`);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        subscriptionId,
        message: 'Connected to call event subscription service'
      }));
      
      // Handle subscription messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          
          if (data.type === 'subscribe' && data.callId) {
            this.subscribeToCall(subscriptionId, data.callId);
          } else if (data.type === 'unsubscribe' && data.callId) {
            this.unsubscribeFromCall(subscriptionId, data.callId);
          }
        } catch (error) {
          logger.error(`Error processing subscription message: ${error.message}`);
        }
      });
      
      // Handle disconnection
      ws.on('close', () => {
        this.removeSubscription(subscriptionId);
        logger.info(`Subscription connection closed: ${subscriptionId}`);
      });
    });
  }
  
  /**
   * Generate a unique subscription ID
   * @returns {string} Subscription ID
   */
  generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }
  
  /**
   * Subscribe to events for a specific call
   * @param {string} subscriptionId - Subscription identifier
   * @param {string} callId - Call identifier
   */
  subscribeToCall(subscriptionId, callId) {
    if (!this.callSubscribers.has(callId)) {
      this.callSubscribers.set(callId, new Set());
    }
    
    this.callSubscribers.get(callId).add(subscriptionId);
    
    logger.info(`Subscription ${subscriptionId} subscribed to call ${callId}`);
    
    // Send confirmation
    const ws = this.subscriptions.get(subscriptionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscribed',
        callId,
        message: `Subscribed to call ${callId}`
      }));
    }
  }
  
  /**
   * Unsubscribe from events for a specific call
   * @param {string} subscriptionId - Subscription identifier
   * @param {string} callId - Call identifier
   */
  unsubscribeFromCall(subscriptionId, callId) {
    if (this.callSubscribers.has(callId)) {
      this.callSubscribers.get(callId).delete(subscriptionId);
      
      if (this.callSubscribers.get(callId).size === 0) {
        this.callSubscribers.delete(callId);
      }
      
      logger.info(`Subscription ${subscriptionId} unsubscribed from call ${callId}`);
      
      // Send confirmation
      const ws = this.subscriptions.get(subscriptionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          callId,
          message: `Unsubscribed from call ${callId}`
        }));
      }
    }
  }
  
  /**
   * Remove a subscription completely
   * @param {string} subscriptionId - Subscription identifier
   */
  removeSubscription(subscriptionId) {
    // Remove from all call subscribers
    for (const [callId, subscribers] of this.callSubscribers.entries()) {
      if (subscribers.has(subscriptionId)) {
        subscribers.delete(subscriptionId);
        
        if (subscribers.size === 0) {
          this.callSubscribers.delete(callId);
        }
      }
    }
    
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
  }
  
  /**
   * Publish a call event to all subscribers
   * @param {string} callId - Call identifier
   * @param {Object} event - Event data
   */
  publishEvent(callId, event) {
    if (!this.callSubscribers.has(callId)) return;
    
    const subscribers = this.callSubscribers.get(callId);
    const message = JSON.stringify({
      type: 'event',
      callId,
      event
    });
    
    for (const subscriptionId of subscribers) {
      const ws = this.subscriptions.get(subscriptionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

const callSubscriptionHandler = new CallSubscriptionHandler();
module.exports = { callSubscriptionHandler };
