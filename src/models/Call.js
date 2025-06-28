const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  customerNumber: {
    type: String,
    required: true
  },
  scriptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Script',
    required: false
  },
  promptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prompt',
    required: false
  },
  // Workflow ID for new AI-driven call flows
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workflow'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['initiating', 'initiated', 'ringing', 'in-progress', 'answered', 'completed', 'failed'],
    default: 'initiating'
  },
  outcome: {
    type: String,
    enum: ['completed', 'successful', 'failed', 'no_answer', 'busy', 'voicemail', 'declined', 'interested', 'callback_scheduled', 'in-progress'],
    default: 'in-progress'
  },
  voiceProvider: {
    type: String,
    enum: ['rime_tts', 'chatgpt_tts', 'elevenlabs', 'openai_fm'],
    default: 'chatgpt_tts'
  },
  ttsProvider: {
    type: String,
    enum: ['chatgpt_tts', 'elevenlabs', 'rime_tts', 'google_tts', 'openai_fm'],
    default: 'chatgpt_tts'
  },
  sttProvider: {
    type: String,
    enum: ['deepgram', 'google_stt', 'azure_stt', 'openai_whisper'],
    default: 'deepgram'
  },
  llmProvider: {
    type: String,
    enum: ['openai', 'gemini', 'claude', 'azure_openai'],
    default: 'openai'
  },
  voiceId: {
    type: String, // Store the specific voice ID selected from the dashboard
    default: null
  },
  twilioSid: {
    type: String
  },
  recordingUrl: {
    type: String
  },
  recordingSid: {
    type: String
  },
  // Customer data collected during call
  collectedCustomerData: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  dataCollectionStatus: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'skipped'],
    default: 'not_started'
  },
  // Credit card sales specific fields
  cardType: {
    type: String,
    enum: ['rewards', 'cashback', 'travel', 'secured', 'business', 'premium'],
    default: 'rewards'
  },
  customerInterest: {
    type: String,
    enum: ['high', 'medium', 'low', 'none', 'unknown'],
    default: 'unknown'
  },
  leadQuality: {
    type: String,
    enum: ['hot', 'warm', 'cold', 'invalid', 'unknown'],
    default: 'unknown'
  },
  objections: [{
    type: String
  }],
  creditScoreRange: {
    type: String
  },
  applicationStarted: {
    type: Boolean,
    default: false
  },
  applicationCompleted: {
    type: Boolean,
    default: false
  },
  conversationHistory: [{
    speaker: {
      type: String,
      enum: ['AI', 'Customer']
    },
    text: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    language: {
      type: String,
      enum: ['english', 'hindi', 'spanish', 'french', 'german', 'japanese', 'chinese', 'arabic', 'russian', 'portuguese', 'unknown'],
      default: 'english'
    }
  }],
  transcriptPath: {
    type: String
  },
  language: {
    type: String,
    default: 'english'
  },
  detectedLanguage: {
    type: String,
    enum: ['english', 'hindi', 'spanish', 'french', 'german', 'japanese', 'chinese', 'arabic', 'russian', 'portuguese', 'unknown'],
    default: 'english'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Call', CallSchema);
