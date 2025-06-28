
/**
 * Service Integration Index
 * 
 * This file exports all application services for easy access and provides
 * documentation about how services interact with each other.
 */

// Core services
const openaiService = require('./openaiService');
const elevenlabsService = require('./elevenlabsService');
const twilioService = require('./twilioService');
const audioStreamService = require('./audioStreamService');
const realTimeStreamingService = require('./realTimeStreamingService');
const streamingAnalyticsService = require('./streamingAnalyticsService');
const voiceActivityDetectionService = require('./voiceActivityDetectionService_new');

// Export all services
module.exports = {
  // AI and Speech Services
  openai: openaiService,
  elevenlabs: elevenlabsService,
  twilio: twilioService,
  
  // Streaming Services
  audioStream: audioStreamService,
  realTimeStreaming: realTimeStreamingService,
  streamingAnalytics: streamingAnalyticsService,
  
  // Audio Processing Services
  voiceActivityDetection: voiceActivityDetectionService,
};

/**
 * Service Dependencies and Interactions
 * 
 * realTimeStreamingService -> [openaiService, elevenlabsService] - For generating speech
 * realTimeStreamingService -> streamingAnalyticsService - For monitoring performance
 * realTimeStreamingService -> voiceActivityDetectionService - For interruption detection
 * audioStreamService -> [openaiService, elevenlabsService] - For legacy streaming
 * twilioService -> audioStreamService - For Twilio media streaming
 */
