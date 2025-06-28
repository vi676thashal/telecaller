const Call = require('../models/Call');
const { logger } = require('./loggingService');

class CallAnalyticsService {
  constructor() {
    this.metrics = new Map();
    this.qualityThresholds = {
      minAudioLevel: -50, // dB
      maxLatency: 500,    // ms
      minSampleRate: 8000 // Hz
    };
  }

  // Initialize metrics for a new call
  initializeMetrics(callId) {
    this.metrics.set(callId, {
      startTime: Date.now(),
      audioLevels: [],
      latencies: [],
      disconnections: 0,
      audioQualityIssues: 0,
      transcriptionAccuracy: [],
      silencePeriods: [],
      lastActivity: Date.now()
    });
  }

  // Track audio levels
  trackAudioLevel(callId, level) {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.audioLevels.push({
        timestamp: Date.now(),
        level
      });

      // Check for quality issues
      if (level < this.qualityThresholds.minAudioLevel) {
        metrics.audioQualityIssues++;
        this.logQualityIssue(callId, 'Low audio level detected');
      }
    }
  }

  // Track latency
  trackLatency(callId, latency) {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.latencies.push({
        timestamp: Date.now(),
        value: latency
      });

      if (latency > this.qualityThresholds.maxLatency) {
        this.logQualityIssue(callId, 'High latency detected');
      }
    }
  }

  // Track disconnections
  trackDisconnection(callId) {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.disconnections++;
      this.logQualityIssue(callId, 'Connection disconnected');
    }
  }

  // Track transcription accuracy
  trackTranscriptionAccuracy(callId, accuracy) {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.transcriptionAccuracy.push({
        timestamp: Date.now(),
        value: accuracy
      });
    }
  }

  // Track silence periods
  trackSilencePeriod(callId, duration) {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.silencePeriods.push({
        timestamp: Date.now(),
        duration
      });
    }
  }

  // Log quality issues
  logQualityIssue(callId, issue) {
    logger.warn({
      service: 'call-analytics',
      callId,
      issue,
      timestamp: new Date()
    });
  }

  // Generate call report
  async generateCallReport(callId) {
    const metrics = this.metrics.get(callId);
    if (!metrics) return null;

    const call = await Call.findById(callId);
    if (!call) return null;

    const duration = Date.now() - metrics.startTime;
    const avgLatency = metrics.latencies.reduce((sum, l) => sum + l.value, 0) / metrics.latencies.length;
    const avgAudioLevel = metrics.audioLevels.reduce((sum, a) => sum + a.level, 0) / metrics.audioLevels.length;

    const report = {
      callId,
      duration,
      metrics: {
        averageLatency: avgLatency,
        averageAudioLevel: avgAudioLevel,
        disconnections: metrics.disconnections,
        audioQualityIssues: metrics.audioQualityIssues,
        silencePeriods: metrics.silencePeriods.length,
        transcriptionAccuracy: metrics.transcriptionAccuracy.length > 0 
          ? metrics.transcriptionAccuracy.reduce((sum, t) => sum + t.value, 0) / metrics.transcriptionAccuracy.length 
          : null
      },
      quality: {
        audioQuality: avgAudioLevel >= this.qualityThresholds.minAudioLevel ? 'good' : 'poor',
        connectionStability: metrics.disconnections === 0 ? 'stable' : 'unstable',
        latencyQuality: avgLatency <= this.qualityThresholds.maxLatency ? 'good' : 'poor'
      }
    };

    // Save report to call record
    await Call.findByIdAndUpdate(callId, {
      $set: {
        analytics: report
      }
    });

    return report;
  }

  // Cleanup call metrics
  cleanup(callId) {
    this.metrics.delete(callId);
  }
}

module.exports = new CallAnalyticsService();
