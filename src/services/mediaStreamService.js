const { EventEmitter } = require('events');

class MediaStreamService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.isInterrupted = false;
  }

  // Create a new media stream for a call
  createStream(callId) {
    const stream = {
      id: callId,
      buffer: [],
      isActive: true,
      isInterrupted: false,
      lastActivity: Date.now()
    };

    this.activeStreams.set(callId, stream);
    return stream;
  }

  // Handle incoming audio data for streaming
  pushAudioData(callId, audioData) {
    const stream = this.activeStreams.get(callId);
    if (stream && stream.isActive) {
      stream.buffer.push(audioData);
      stream.lastActivity = Date.now();
      this.emit('audioData', { callId, audioData });
    }
  }

  // Handle user interruption
  handleInterruption(callId) {
    const stream = this.activeStreams.get(callId);
    if (stream) {
      stream.isInterrupted = true;
      stream.isActive = false;
      this.emit('interrupted', { callId });
    }
  }

  // Clear stream when done speaking
  clearStream(callId) {
    const stream = this.activeStreams.get(callId);
    if (stream) {
      stream.buffer = [];
      stream.isActive = false;
      this.activeStreams.delete(callId);
    }
  }

  // Check if there is ongoing speech
  isStreaming(callId) {
    const stream = this.activeStreams.get(callId);
    return stream && stream.isActive;
  }
}

module.exports = new MediaStreamService();
