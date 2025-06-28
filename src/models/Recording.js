const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  callId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call',
    required: true
  },
  path: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Recording', RecordingSchema);
