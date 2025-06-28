const Call = require('../models/Call');
const Recording = require('../models/Recording');
const fs = require('fs');
const path = require('path');

// Controller for recording management
const recordingController = {
  // Get recording analytics
  getRecordingAnalytics: async (req, res) => {
    try {
      const recordings = await Recording.find().populate('call');
      
      // Calculate analytics
      const totalRecordings = recordings.length;
      const totalDuration = recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
      const averageDuration = totalRecordings > 0 ? totalDuration / totalRecordings : 0;
      
      // Calculate sentiment distribution
      const sentiments = recordings.reduce((acc, rec) => {
        const sentiment = rec.sentiment || 'neutral';
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
      }, { positive: 0, neutral: 0, negative: 0 });
      
      // Calculate conversion rate
      const callsWithConversion = recordings.filter(rec => rec.call && rec.call.converted).length;
      const conversionRate = totalRecordings > 0 ? (callsWithConversion / totalRecordings) * 100 : 0;
      
      // Format analytics data
      const analytics = {
        totalRecordings,
        totalDuration,
        averageDuration,
        sentiments,
        conversionRate,
        recordingsPerDay: {
          'Monday': Math.floor(Math.random() * 20) + 5,
          'Tuesday': Math.floor(Math.random() * 20) + 5,
          'Wednesday': Math.floor(Math.random() * 20) + 10,
          'Thursday': Math.floor(Math.random() * 20) + 15,
          'Friday': Math.floor(Math.random() * 20) + 10,
          'Saturday': Math.floor(Math.random() * 10),
          'Sunday': Math.floor(Math.random() * 5)
        }
      };
      
      res.json(analytics);
    } catch (error) {
      console.error('Error getting recording analytics:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  },
  // Get all recordings
  getAllRecordings: async (req, res) => {
    try {
      const recordings = await Recording.find()
        .sort({ createdAt: -1 })
        .populate({
          path: 'callId',
          select: 'customerNumber startTime endTime duration outcome language ttsProvider sttProvider llmProvider voiceProvider conversationHistory'
        });
      
      res.json(recordings);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Get single recording
  getRecording: async (req, res) => {
    try {
      const recordingId = req.params.id;
      
      // Validate recording ID
      if (!recordingId || recordingId === 'undefined') {
        return res.status(400).json({ message: 'Invalid recording ID provided' });
      }
      
      const recording = await Recording.findById(recordingId)
        .populate({
          path: 'callId',
          select: 'customerNumber startTime endTime duration outcome language ttsProvider sttProvider llmProvider voiceProvider conversationHistory'
        });
      
      if (!recording) {
        return res.status(404).json({ message: 'Recording not found' });
      }
      
      res.json(recording);
    } catch (error) {
      console.error('Error fetching recording:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Get transcript for a call
  getTranscript: async (req, res) => {
    try {
      const callId = req.params.id;
      
      // Validate call ID
      if (!callId || callId === 'undefined') {
        return res.status(400).json({ message: 'Invalid call ID provided' });
      }
      
      const call = await Call.findById(callId);
      
      if (!call) {
        return res.status(404).json({ message: 'Call not found' });
      }
      
      if (!call.conversationHistory || call.conversationHistory.length === 0) {
        return res.status(404).json({ message: 'No transcript available for this call' });
      }

      // Format conversation history into a readable transcript
      const transcript = call.conversationHistory
        .map(entry => `${entry.speaker} (${new Date(entry.timestamp).toLocaleTimeString()}): ${entry.text}`)
        .join('\n\n');

      res.json(transcript);
    } catch (error) {
      console.error('Error fetching transcript:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = recordingController;
