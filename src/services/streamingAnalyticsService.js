/**
 * Streaming Analytics Service
 * 
 * Monitors and tracks metrics for real-time audio streaming performance,
 * enabling performance optimization and identification of issues.
 */

const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

// Create schema for streaming analytics
const streamingAnalyticsSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    enum: ['openai_realtime', 'elevenlabs_streaming', 'openai_fm'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metrics: {
    latency: Number,          // Audio latency in ms
    bufferSize: Number,       // Size of audio buffer
    underruns: Number,        // Count of buffer underruns
    packetsReceived: Number,  // Total packets received
    packetsSent: Number,      // Total packets sent
    bytesReceived: Number,    // Total bytes received
    bytesSent: Number,        // Total bytes sent
    duration: Number,         // Stream duration in seconds
    jitter: Number,           // Audio jitter in ms
    reconnects: Number        // Count of reconnections
  },
  clientInfo: {
    browser: String,
    os: String,
    device: String,
    network: String
  },
  success: {
    type: Boolean,
    default: true
  },
  errorInfo: {
    code: String,
    message: String,
    timestamp: Date
  }
});

// Create model if it doesn't exist already
let StreamingAnalytics;
try {
  StreamingAnalytics = mongoose.model('StreamingAnalytics');
} catch (e) {
  StreamingAnalytics = mongoose.model('StreamingAnalytics', streamingAnalyticsSchema);
}

/**
 * Analytics service for real-time streaming
 */
class StreamingAnalyticsService {
  constructor() {
    this.activeStreams = new Map();
    this.aggregatedMetrics = {
      totalStreams: 0,
      successRate: 0,
      avgLatency: 0,
      avgDuration: 0,
      providerStats: {
        openai_realtime: {
          count: 0,
          successRate: 0,
          avgLatency: 0
        },
        elevenlabs_streaming: {
          count: 0,
          successRate: 0,
          avgLatency: 0
        },
        openai_fm: {
          count: 0,
          successRate: 0,
          avgLatency: 0
        }
      }
    };
    
    // Initialize with cached data (last 24 hours)
    this.initializeAggregatedMetrics();
    
    logger.info('[StreamingAnalyticsService] Initialized');
  }
    /**
   * Initialize aggregated metrics from database
   */
  async initializeAggregatedMetrics() {
    try {
      // Check if MongoDB is available before attempting aggregation
      if (!global.isMongoDBAvailable || !global.isMongoDBAvailable()) {
        logger.warn('[StreamingAnalyticsService] MongoDB not available, skipping metrics initialization');
        return;
      }

      // Get data from last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const results = await StreamingAnalytics.aggregate([
        { $match: { timestamp: { $gte: oneDayAgo } } },
        { $group: {
          _id: '$provider',
          count: { $sum: 1 },
          successCount: { $sum: { $cond: ['$success', 1, 0] } },
          totalLatency: { $sum: '$metrics.latency' },
          totalDuration: { $sum: '$metrics.duration' }
        }}
      ]);
      
      // Process results
      let totalCount = 0;
      let totalSuccess = 0;
      let totalLatency = 0;
      let totalDuration = 0;
      
      results.forEach(result => {
        const provider = result._id;
        const count = result.count || 0;
        const successCount = result.successCount || 0;
        const successRate = count > 0 ? (successCount / count) * 100 : 0;
        const avgLatency = count > 0 ? result.totalLatency / count : 0;
        
        if (this.aggregatedMetrics.providerStats[provider]) {
          this.aggregatedMetrics.providerStats[provider].count = count;
          this.aggregatedMetrics.providerStats[provider].successRate = successRate;
          this.aggregatedMetrics.providerStats[provider].avgLatency = avgLatency;
        }
        
        totalCount += count;
        totalSuccess += successCount;
        totalLatency += result.totalLatency || 0;
        totalDuration += result.totalDuration || 0;
      });
      
      // Update overall metrics
      this.aggregatedMetrics.totalStreams = totalCount;
      this.aggregatedMetrics.successRate = totalCount > 0 ? (totalSuccess / totalCount) * 100 : 0;
      this.aggregatedMetrics.avgLatency = totalCount > 0 ? totalLatency / totalCount : 0;
      this.aggregatedMetrics.avgDuration = totalCount > 0 ? totalDuration / totalCount : 0;
      
      logger.info('[StreamingAnalyticsService] Initialized with historical data');
    } catch (error) {
      logger.error('[StreamingAnalyticsService] Error initializing metrics:', error);
    }
  }
  
  /**
   * Start tracking a streaming session
   * @param {string} callId - Call ID
   * @param {string} sessionId - Session ID
   * @param {Object} initialData - Initial session data
   */
  startStreamSession(callId, sessionId, initialData = {}) {
    const streamKey = `${callId}:${sessionId}`;
    
    this.activeStreams.set(streamKey, {
      callId,
      sessionId,
      provider: initialData.provider || 'unknown',
      startTime: Date.now(),
      metrics: {
        latency: 0,
        bufferSize: 0,
        underruns: 0,
        packetsReceived: 0,
        packetsSent: 0,
        bytesReceived: 0,
        bytesSent: 0,
        duration: 0,
        jitter: 0,
        reconnects: 0
      },
      clientInfo: initialData.clientInfo || {},
      checkpoints: [],
      lastUpdate: Date.now()
    });
    
    logger.debug(`[StreamingAnalyticsService] Started tracking stream ${streamKey}`);
    
    return streamKey;
  }
  
  /**
   * Update metrics for a streaming session
   * @param {string} streamKey - Stream key (callId:sessionId)
   * @param {Object} metrics - Updated metrics
   */
  updateStreamMetrics(streamKey, metrics) {
    const session = this.activeStreams.get(streamKey);
    if (!session) {
      logger.warn(`[StreamingAnalyticsService] Cannot update metrics for unknown stream ${streamKey}`);
      return false;
    }
    
    // Update metrics
    Object.assign(session.metrics, metrics);
    session.lastUpdate = Date.now();
    
    return true;
  }
  
  /**
   * Add checkpoint event to stream timeline
   * @param {string} streamKey - Stream key (callId:sessionId)
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  addStreamCheckpoint(streamKey, event, data = {}) {
    const session = this.activeStreams.get(streamKey);
    if (!session) {
      logger.warn(`[StreamingAnalyticsService] Cannot add checkpoint for unknown stream ${streamKey}`);
      return false;
    }
    
    // Add checkpoint
    session.checkpoints.push({
      event,
      timestamp: Date.now(),
      ...data
    });
    
    return true;
  }
  
  /**
   * End tracking a streaming session
   * @param {string} streamKey - Stream key (callId:sessionId)
   * @param {boolean} success - Whether the stream completed successfully
   * @param {Object} finalMetrics - Final metrics
   * @param {Object} error - Error info if failed
   */
  async endStreamSession(streamKey, success = true, finalMetrics = {}, error = null) {
    const session = this.activeStreams.get(streamKey);
    if (!session) {
      logger.warn(`[StreamingAnalyticsService] Cannot end unknown stream ${streamKey}`);
      return false;
    }
    
    try {
      // Update final metrics
      Object.assign(session.metrics, finalMetrics);
      
      // Calculate duration
      session.metrics.duration = (Date.now() - session.startTime) / 1000; // seconds
      
      // Create analytics record
      const analytics = new StreamingAnalytics({
        callId: session.callId,
        sessionId: session.sessionId,
        provider: session.provider,
        timestamp: new Date(session.startTime),
        metrics: session.metrics,
        clientInfo: session.clientInfo,
        success,
        errorInfo: error ? {
          code: error.code || 'unknown',
          message: error.message || 'Unknown error',
          timestamp: new Date()
        } : undefined
      });
      
      // Save to database
      await analytics.save();
      
      // Update aggregated metrics
      this.updateAggregatedMetrics(session.provider, success, session.metrics);
      
      // Remove from active streams
      this.activeStreams.delete(streamKey);
      
      logger.debug(`[StreamingAnalyticsService] Ended tracking stream ${streamKey} (success: ${success})`);
      
      return true;
    } catch (err) {
      logger.error(`[StreamingAnalyticsService] Error ending stream ${streamKey}:`, err);
      return false;
    }
  }
  
  /**
   * Update aggregated metrics with new session data
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether the stream completed successfully
   * @param {Object} metrics - Session metrics
   */
  updateAggregatedMetrics(provider, success, metrics) {
    // Update provider-specific stats
    if (this.aggregatedMetrics.providerStats[provider]) {
      const providerStats = this.aggregatedMetrics.providerStats[provider];
      providerStats.count++;
      
      if (success) {
        const successCount = (providerStats.successRate * providerStats.count / 100) + 1;
        providerStats.successRate = (successCount / providerStats.count) * 100;
      } else {
        const successCount = (providerStats.successRate * providerStats.count / 100);
        providerStats.successRate = (successCount / providerStats.count) * 100;
      }
      
      // Update latency with exponential moving average
      const alpha = 0.1; // Smoothing factor
      providerStats.avgLatency = (1 - alpha) * providerStats.avgLatency + alpha * (metrics.latency || 0);
    }
    
    // Update overall metrics
    this.aggregatedMetrics.totalStreams++;
    
    const totalSuccessCount = (this.aggregatedMetrics.successRate * (this.aggregatedMetrics.totalStreams - 1) / 100);
    this.aggregatedMetrics.successRate = ((totalSuccessCount + (success ? 1 : 0)) / this.aggregatedMetrics.totalStreams) * 100;
    
    // Update overall latency with exponential moving average
    const alpha = 0.1; // Smoothing factor
    this.aggregatedMetrics.avgLatency = (1 - alpha) * this.aggregatedMetrics.avgLatency + alpha * (metrics.latency || 0);
    
    // Update duration with exponential moving average
    this.aggregatedMetrics.avgDuration = (1 - alpha) * this.aggregatedMetrics.avgDuration + alpha * (metrics.duration || 0);
  }
  
  /**
   * Get aggregated metrics
   * @param {string} provider - Optional provider filter
   * @returns {Object} Aggregated metrics
   */
  getAggregatedMetrics(provider = null) {
    if (provider && this.aggregatedMetrics.providerStats[provider]) {
      return this.aggregatedMetrics.providerStats[provider];
    }
    return this.aggregatedMetrics;
  }
  
  /**
   * Get metrics for a specific time period
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @param {string} provider - Optional provider filter
   * @returns {Promise<Object>} Metrics for the period
   */
  async getMetricsForPeriod(startTime, endTime, provider = null) {
    try {
      const query = {
        timestamp: { $gte: startTime, $lte: endTime }
      };
      
      if (provider) {
        query.provider = provider;
      }
      
      const results = await StreamingAnalytics.aggregate([
        { $match: query },
        { $group: {
          _id: '$provider',
          count: { $sum: 1 },
          successCount: { $sum: { $cond: ['$success', 1, 0] } },
          totalLatency: { $sum: '$metrics.latency' },
          totalDuration: { $sum: '$metrics.duration' },
          totalUnderruns: { $sum: '$metrics.underruns' },
          totalReconnects: { $sum: '$metrics.reconnects' }
        }}
      ]);
      
      // Process and format results
      const formattedResults = {
        period: {
          start: startTime,
          end: endTime
        },
        providers: {},
        overall: {
          totalStreams: 0,
          successRate: 0,
          avgLatency: 0,
          avgDuration: 0,
          totalUnderruns: 0,
          totalReconnects: 0
        }
      };
      
      let totalCount = 0;
      let totalSuccess = 0;
      let totalLatency = 0;
      let totalDuration = 0;
      let totalUnderruns = 0;
      let totalReconnects = 0;
      
      results.forEach(result => {
        const provider = result._id;
        const count = result.count || 0;
        const successCount = result.successCount || 0;
        const successRate = count > 0 ? (successCount / count) * 100 : 0;
        const avgLatency = count > 0 ? result.totalLatency / count : 0;
        const avgDuration = count > 0 ? result.totalDuration / count : 0;
        
        formattedResults.providers[provider] = {
          count,
          successRate,
          avgLatency,
          avgDuration,
          totalUnderruns: result.totalUnderruns || 0,
          totalReconnects: result.totalReconnects || 0
        };
        
        totalCount += count;
        totalSuccess += successCount;
        totalLatency += result.totalLatency || 0;
        totalDuration += result.totalDuration || 0;
        totalUnderruns += result.totalUnderruns || 0;
        totalReconnects += result.totalReconnects || 0;
      });
      
      // Update overall metrics
      formattedResults.overall.totalStreams = totalCount;
      formattedResults.overall.successRate = totalCount > 0 ? (totalSuccess / totalCount) * 100 : 0;
      formattedResults.overall.avgLatency = totalCount > 0 ? totalLatency / totalCount : 0;
      formattedResults.overall.avgDuration = totalCount > 0 ? totalDuration / totalCount : 0;
      formattedResults.overall.totalUnderruns = totalUnderruns;
      formattedResults.overall.totalReconnects = totalReconnects;
      
      return formattedResults;
    } catch (error) {
      logger.error('[StreamingAnalyticsService] Error getting metrics for period:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup old session data
   */
  cleanupOldSessions() {
    const now = Date.now();
    // Clean up any sessions without activity for more than 15 minutes
    for (const [key, session] of this.activeStreams.entries()) {
      if (now - session.lastUpdate > 15 * 60 * 1000) {
        logger.warn(`[StreamingAnalyticsService] Auto-closing stale stream ${key}`);
        
        // End session as failed
        this.endStreamSession(key, false, session.metrics, {
          code: 'timeout',
          message: 'Session timed out due to inactivity'
        });
      }
    }
  }
}

// Create singleton instance
const streamingAnalytics = new StreamingAnalyticsService();

// Start periodic cleanup
setInterval(() => {
  streamingAnalytics.cleanupOldSessions();
}, 5 * 60 * 1000); // Every 5 minutes

module.exports = streamingAnalytics;
