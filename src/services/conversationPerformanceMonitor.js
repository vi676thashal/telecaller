/**
 * REAL-TIME CONVERSATION PERFORMANCE MONITOR
 * Tracks and optimizes human-like conversation timing
 * 
 * This service monitors conversation flow in real-time and provides
 * insights into whether the AI conversation feels natural and human-like.
 */

const { EventEmitter } = require('events');
const zeroLatencyConfig = require('../config/zeroLatencyConfig');

class ConversationPerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    
    this.activeCallMetrics = new Map();
    this.globalMetrics = {
      totalCalls: 0,
      humanLikeConversations: 0,
      averageResponseTime: 0,
      conversationQualityScore: 0
    };
    
    this.performanceThresholds = zeroLatencyConfig.MONITORING.ALERT_THRESHOLDS;
    this.startMonitoring();
  }
  
  /**
   * Initialize monitoring for a new call
   */
  initializeCall(callId) {
    console.log(`[ConversationMonitor] 🎯 Initializing human-like conversation tracking for call ${callId}`);
    
    this.activeCallMetrics.set(callId, {
      callId,
      startTime: Date.now(),
      conversationTurns: 0,
      humanLikeResponses: 0,
      totalResponseTime: 0,
      fastestResponse: Infinity,
      slowestResponse: 0,
      averageResponseTime: 0,
      interruptionCount: 0,
      silenceGaps: 0,
      qualityScore: 100,
      conversationFlow: 'natural',
      events: []
    });
    
    this.globalMetrics.totalCalls++;
  }
  
  /**
   * Track response timing and quality
   */
  trackResponse(callId, responseData) {
    const metrics = this.activeCallMetrics.get(callId);
    if (!metrics) return;
    
    const {
      responseTime,
      firstChunkLatency,
      transcriptionTime,
      humanLike,
      conversationQuality
    } = responseData;
    
    // Update conversation turn metrics
    metrics.conversationTurns++;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.conversationTurns;
    
    // Track fastest and slowest responses
    metrics.fastestResponse = Math.min(metrics.fastestResponse, responseTime);
    metrics.slowestResponse = Math.max(metrics.slowestResponse, responseTime);
    
    // Count human-like responses
    if (humanLike) {
      metrics.humanLikeResponses++;
    }
    
    // Update quality score based on response timing
    this._updateQualityScore(metrics, responseTime, firstChunkLatency);
    
    // Log real-time assessment
    this._logResponseQuality(callId, responseData, metrics);
    
    // Record event for analysis
    metrics.events.push({
      type: 'response',
      timestamp: Date.now(),
      responseTime,
      firstChunkLatency,
      transcriptionTime,
      humanLike,
      qualityImpact: this._calculateQualityImpact(responseTime)
    });
    
    // Emit quality alerts if needed
    this._checkQualityAlerts(callId, responseData, metrics);
  }
  
  /**
   * Track interruptions (user cutting off AI)
   */
  trackInterruption(callId, interruptionData) {
    const metrics = this.activeCallMetrics.get(callId);
    if (!metrics) return;
    
    metrics.interruptionCount++;
    
    // Record interruption event
    metrics.events.push({
      type: 'interruption',
      timestamp: Date.now(),
      aiSpeakingDuration: interruptionData.aiSpeakingDuration,
      userImpatience: interruptionData.aiSpeakingDuration < 1000 // User interrupted quickly
    });
    
    console.log(`[ConversationMonitor] 🚨 User interrupted call ${callId} (${metrics.interruptionCount} interruptions total)`);
    
    // Interruptions indicate conversation doesn't feel natural
    if (metrics.interruptionCount > 3) {
      metrics.conversationFlow = 'robotic';
      this.emit('conversationQualityAlert', {
        callId,
        issue: 'excessive_interruptions',
        count: metrics.interruptionCount
      });
    }
  }
  
  /**
   * Track silence gaps in conversation
   */
  trackSilenceGap(callId, silenceDuration) {
    const metrics = this.activeCallMetrics.get(callId);
    if (!metrics) return;
    
    if (silenceDuration > 3000) { // 3+ seconds of silence
      metrics.silenceGaps++;
      
      metrics.events.push({
        type: 'silence_gap',
        timestamp: Date.now(),
        duration: silenceDuration,
        awkward: silenceDuration > 5000
      });
      
      console.log(`[ConversationMonitor] 😶 Awkward silence detected in call ${callId}: ${silenceDuration}ms`);
    }
  }
  
  /**
   * Get real-time conversation quality assessment
   */
  getConversationQuality(callId) {
    const metrics = this.activeCallMetrics.get(callId);
    if (!metrics) return null;
    
    const humanLikePercentage = (metrics.humanLikeResponses / metrics.conversationTurns) * 100;
    
    return {
      callId,
      duration: Date.now() - metrics.startTime,
      conversationTurns: metrics.conversationTurns,
      humanLikePercentage: Math.round(humanLikePercentage),
      averageResponseTime: Math.round(metrics.averageResponseTime),
      fastestResponse: metrics.fastestResponse === Infinity ? 0 : metrics.fastestResponse,
      slowestResponse: metrics.slowestResponse,
      qualityScore: Math.round(metrics.qualityScore),
      conversationFlow: metrics.conversationFlow,
      interruptionCount: metrics.interruptionCount,
      silenceGaps: metrics.silenceGaps,
      assessment: this._getQualityAssessment(metrics)
    };
  }
  
  /**
   * Generate real-time performance dashboard data
   */
  getDashboardData() {
    const activeCalls = Array.from(this.activeCallMetrics.values());
    
    if (activeCalls.length === 0) {
      return {
        activeCalls: 0,
        averageQuality: 0,
        humanLikePercentage: 0,
        totalResponseTime: 0,
        performanceStatus: 'no_active_calls'
      };
    }
    
    const totalQuality = activeCalls.reduce((sum, call) => sum + call.qualityScore, 0);
    const totalHumanLike = activeCalls.reduce((sum, call) => sum + call.humanLikeResponses, 0);
    const totalTurns = activeCalls.reduce((sum, call) => sum + call.conversationTurns, 0);
    const totalResponseTime = activeCalls.reduce((sum, call) => sum + call.totalResponseTime, 0);
    
    return {
      activeCalls: activeCalls.length,
      averageQuality: Math.round(totalQuality / activeCalls.length),
      humanLikePercentage: Math.round((totalHumanLike / totalTurns) * 100),
      averageResponseTime: Math.round(totalResponseTime / totalTurns),
      performanceStatus: this._getOverallPerformanceStatus(activeCalls)
    };
  }
  
  /**
   * Finalize call metrics when call ends
   */
  finalizeCall(callId) {
    const metrics = this.activeCallMetrics.get(callId);
    if (!metrics) return;
    
    const finalAssessment = this.getConversationQuality(callId);
    
    console.log(`[ConversationMonitor] 📊 FINAL ASSESSMENT for call ${callId}:`);
    console.log(`  🎯 Quality Score: ${finalAssessment.qualityScore}/100`);
    console.log(`  🤖 Human-like Responses: ${finalAssessment.humanLikePercentage}%`);
    console.log(`  ⚡ Average Response Time: ${finalAssessment.averageResponseTime}ms`);
    console.log(`  🔄 Conversation Flow: ${finalAssessment.conversationFlow}`);
    console.log(`  💬 Total Turns: ${finalAssessment.conversationTurns}`);
    console.log(`  🚨 Interruptions: ${finalAssessment.interruptionCount}`);
    
    // Update global metrics
    if (finalAssessment.humanLikePercentage > 80) {
      this.globalMetrics.humanLikeConversations++;
    }
    
    // Store for historical analysis
    this.emit('callCompleted', finalAssessment);
    
    // Cleanup active metrics
    this.activeCallMetrics.delete(callId);
  }
  
  /**
   * Update quality score based on response timing
   */
  _updateQualityScore(metrics, responseTime, firstChunkLatency) {
    let qualityImpact = 0;
    
    // Excellent response time (human-like)
    if (responseTime <= 100) {
      qualityImpact = +2;
    } else if (responseTime <= 200) {
      qualityImpact = 0; // Neutral
    } else if (responseTime <= 500) {
      qualityImpact = -5; // Noticeable delay
    } else {
      qualityImpact = -10; // Poor experience
    }
    
    // First chunk latency impact
    if (firstChunkLatency > 200) {
      qualityImpact -= 3; // Additional penalty for slow first chunk
    }
    
    metrics.qualityScore = Math.max(0, Math.min(100, metrics.qualityScore + qualityImpact));
    
    // Update conversation flow assessment
    if (metrics.qualityScore > 85) {
      metrics.conversationFlow = 'natural';
    } else if (metrics.qualityScore > 70) {
      metrics.conversationFlow = 'acceptable';
    } else {
      metrics.conversationFlow = 'robotic';
    }
  }
  
  /**
   * Log response quality in real-time
   */
  _logResponseQuality(callId, responseData, metrics) {
    const { responseTime, humanLike, conversationQuality } = responseData;
    const qualityEmoji = humanLike ? '✅' : '❌';
    const speedEmoji = responseTime <= 100 ? '🚀' : responseTime <= 200 ? '⚡' : '🐌';
    
    console.log(`[ConversationMonitor] ${qualityEmoji} ${speedEmoji} Call ${callId}: ${responseTime}ms response (${conversationQuality}) - Quality: ${Math.round(metrics.qualityScore)}/100`);
  }
  
  /**
   * Check for quality alerts
   */
  _checkQualityAlerts(callId, responseData, metrics) {
    const { responseTime, firstChunkLatency } = responseData;
    
    if (responseTime > this.performanceThresholds.VERY_SLOW) {
      this.emit('performanceAlert', {
        level: 'critical',
        callId,
        issue: 'very_slow_response',
        value: responseTime,
        threshold: this.performanceThresholds.VERY_SLOW
      });
    } else if (responseTime > this.performanceThresholds.SLOW_RESPONSE) {
      this.emit('performanceAlert', {
        level: 'warning',
        callId,
        issue: 'slow_response',
        value: responseTime,
        threshold: this.performanceThresholds.SLOW_RESPONSE
      });
    }
    
    if (firstChunkLatency > this.performanceThresholds.AUDIO_SLOW) {
      this.emit('performanceAlert', {
        level: 'warning',
        callId,
        issue: 'slow_audio',
        value: firstChunkLatency,
        threshold: this.performanceThresholds.AUDIO_SLOW
      });
    }
  }
  
  /**
   * Calculate quality impact of response time
   */
  _calculateQualityImpact(responseTime) {
    if (responseTime <= 100) return 'excellent';
    if (responseTime <= 200) return 'good';
    if (responseTime <= 500) return 'acceptable';
    return 'poor';
  }
  
  /**
   * Get quality assessment text
   */
  _getQualityAssessment(metrics) {
    if (metrics.qualityScore > 90) return 'Excellent - Very human-like conversation';
    if (metrics.qualityScore > 80) return 'Good - Natural conversation flow';
    if (metrics.qualityScore > 70) return 'Acceptable - Some delays noticeable';
    if (metrics.qualityScore > 60) return 'Poor - Robotic conversation';
    return 'Very Poor - Significant delays and issues';
  }
  
  /**
   * Get overall performance status
   */
  _getOverallPerformanceStatus(activeCalls) {
    const averageQuality = activeCalls.reduce((sum, call) => sum + call.qualityScore, 0) / activeCalls.length;
    
    if (averageQuality > 85) return 'excellent';
    if (averageQuality > 75) return 'good';
    if (averageQuality > 65) return 'acceptable';
    return 'needs_improvement';
  }
  
  /**
   * Start monitoring intervals
   */
  startMonitoring() {
    // Log performance summary every 30 seconds
    setInterval(() => {
      if (this.activeCallMetrics.size > 0) {
        const dashboardData = this.getDashboardData();
        console.log(`[ConversationMonitor] 📊 PERFORMANCE SUMMARY: ${dashboardData.activeCalls} calls, ${dashboardData.humanLikePercentage}% human-like, avg ${dashboardData.averageResponseTime}ms response`);
      }
    }, 30000);
  }
  
  /**
   * Cleanup when shutting down
   */
  destroy() {
    this.activeCallMetrics.clear();
    this.removeAllListeners();
  }
}

module.exports = new ConversationPerformanceMonitor();
