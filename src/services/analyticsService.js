/**
 * Analytics service for tracking voice cloning system metrics
 */

// In-memory data store for metrics
const metrics = {
  languageSwitches: [],
  emotionChanges: [],
  bargeIns: [],
  serviceUsage: {
    conquiTts: 0,
    openAiFm: 0,
  },
  responseLatency: [],
  averageStreamingTime: 0,
  totalStreams: 0,
  languageDistribution: {
    'en-US': 0,
    'hi-IN': 0,
    'mixed': 0,
  },
  serviceFailures: 0,
  bargeInRate: 0, // Percentage of calls with barge-ins
};

const analyticsService = {
  /**
   * Track a language switch event
   * @param {Object} data Language switch data
   */
  trackLanguageSwitch(data) {
    metrics.languageSwitches.push({
      callId: data.callId,
      from: data.previousLanguage,
      to: data.language,
      timestamp: Date.now(),
    });
    
    // Update language distribution
    if (data.language && metrics.languageDistribution.hasOwnProperty(data.language)) {
      metrics.languageDistribution[data.language]++;
    }
    
    console.log(`[Analytics] Tracked language switch: ${data.previousLanguage} -> ${data.language}`);
  },
  
  /**
   * Track an emotion change event
   * @param {Object} data Emotion change data
   */
  trackEmotionChange(data) {
    metrics.emotionChanges.push({
      callId: data.callId,
      from: data.previousEmotion,
      to: data.emotion,
      timestamp: Date.now(),
    });
    
    console.log(`[Analytics] Tracked emotion change: ${data.previousEmotion} -> ${data.emotion}`);
  },
  
  /**
   * Track a barge-in event
   * @param {Object} data Barge-in data
   */
  trackBargeIn(data) {
    metrics.bargeIns.push({
      callId: data.callId,
      timestamp: data.timestamp,
      aiSpeakingTime: data.aiSpeakingTime || 0,
    });
    
    // Update barge-in rate
    metrics.bargeInRate = metrics.bargeIns.length / Math.max(1, metrics.totalStreams);
    
    console.log(`[Analytics] Tracked barge-in for call ${data.callId}`);
  },
  
  /**
   * Track service usage
   * @param {string} service Service name ('conquiTts' or 'openAiFm')
   */
  trackServiceUsage(service) {
    if (metrics.serviceUsage.hasOwnProperty(service)) {
      metrics.serviceUsage[service]++;
    }
  },
  
  /**
   * Track response latency
   * @param {number} latencyMs Latency in milliseconds
   */
  trackLatency(latencyMs) {
    metrics.responseLatency.push(latencyMs);
    
    // Calculate rolling average
    const recentLatencies = metrics.responseLatency.slice(-100); // Last 100 entries
    const averageLatency = recentLatencies.reduce((sum, val) => sum + val, 0) / recentLatencies.length;
    
    console.log(`[Analytics] Tracked response latency: ${latencyMs}ms (avg: ${averageLatency.toFixed(2)}ms)`);
  },
  
  /**
   * Track streaming completion
   * @param {number} streamTimeMs Streaming time in milliseconds
   */
  trackStreamingTime(streamTimeMs) {
    metrics.totalStreams++;
    
    // Calculate rolling average
    const newTotal = metrics.averageStreamingTime * (metrics.totalStreams - 1) + streamTimeMs;
    metrics.averageStreamingTime = newTotal / metrics.totalStreams;
    
    console.log(`[Analytics] Tracked streaming time: ${streamTimeMs}ms (avg: ${metrics.averageStreamingTime.toFixed(2)}ms)`);
  },
  
  /**
   * Track service failure
   * @param {string} service Failed service name
   * @param {string} error Error message
   */
  trackServiceFailure(service, error) {
    metrics.serviceFailures++;
    console.log(`[Analytics] Tracked service failure in ${service}: ${error}`);
  },
  
  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...metrics,
      languageSwitchCount: metrics.languageSwitches.length,
      emotionChangeCount: metrics.emotionChanges.length,
      bargeInCount: metrics.bargeIns.length,
      failureRate: metrics.serviceFailures / Math.max(1, 
        metrics.serviceUsage.conquiTts + metrics.serviceUsage.openAiFm),
      averageLatency: metrics.responseLatency.length > 0 ?
        metrics.responseLatency.reduce((sum, val) => sum + val, 0) / metrics.responseLatency.length : 0,
    };
  },
  
  /**
   * Reset metrics
   */
  resetMetrics() {
    metrics.languageSwitches = [];
    metrics.emotionChanges = [];
    metrics.bargeIns = [];
    metrics.serviceUsage.conquiTts = 0;
    metrics.serviceUsage.openAiFm = 0;
    metrics.responseLatency = [];
    metrics.averageStreamingTime = 0;
    metrics.totalStreams = 0;
    metrics.languageDistribution = {
      'en-US': 0,
      'hi-IN': 0,
      'mixed': 0,
    };
    metrics.serviceFailures = 0;
    metrics.bargeInRate = 0;
    
    console.log('[Analytics] Metrics reset');
  }
};

module.exports = analyticsService;
