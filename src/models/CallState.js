const mongoose = require('mongoose');

const CallStateSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Reference to the Call record
  callRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call',
    required: false // Made optional for testing scenarios
  },
  
  // Workflow being followed
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallWorkflow',
    required: true
  },
  
  // Current position in the call flow
  currentStep: {
    stepId: String,
    stepName: String,
    stepType: String,
    startTime: Date,
    attemptCount: {
      type: Number,
      default: 1
    }
  },
  
  // Complete history of steps taken
  stepHistory: [{
    stepId: {
      type: String
    },
    stepName: {
      type: String
    },
    stepType: {
      type: String
    },
    startTime: {
      type: Date
    },
    endTime: {
      type: Date
    },
    customerResponse: {
      type: String
    },
    agentResponse: {
      type: String
    },
    outcome: {
      type: String // 'completed', 'skipped', 'failed', 'objection'
    },
    duration: {
      type: Number
    },
    attemptNumber: {
      type: Number
    }
  }],
  
  // Current language preference
  language: {
    type: String,
    enum: ['english', 'hindi'],
    default: 'english'
  },
  
  // Language switch history
  languageHistory: [{
    from: {
      type: String
    },
    to: {
      type: String
    },
    timestamp: {
      type: Date
    },
    stepId: {
      type: String
    },
    reason: {
      type: String // 'customer_request', 'auto_detect'
    }
  }],
  
  // Dynamic variables for this call
  variables: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  // Customer responses and analysis
  customerResponses: [{
    stepId: {
      type: String
    },
    response: {
      type: String
    },
    timestamp: {
      type: Date
    },
    sentiment: {
      type: String // 'positive', 'negative', 'neutral'
    },
    intent: {
      type: String // 'interested', 'objection', 'question', 'ready_to_apply'
    },
    confidence: {
      type: Number
    },
    audioUrl: {
      type: String
    }
  }],
  
  // Objections encountered and handled
  objections: [{
    type: {
      type: String
    },
    stepId: {
      type: String
    },
    customerStatement: {
      type: String
    },
    response: {
      type: String
    },
    source: {
      type: String // 'knowledge_base', 'llm', 'agent'
    },
    timestamp: {
      type: Date
    },
    resolved: {
      type: Boolean
    },
    attempts: {
      type: Number
    }
  }],
  
  // Questions asked by customer
  customerQuestions: [{
    question: {
      type: String
    },
    stepId: {
      type: String
    },
    answer: {
      type: String
    },
    source: {
      type: String // 'knowledge_base', 'llm'
    },
    timestamp: {
      type: Date
    },
    satisfaction: {
      type: String // 'satisfied', 'needs_followup'
    }
  }],
  
  // Call outcome and next actions
  outcome: {
    status: String, // 'in_progress', 'application_submitted', 'not_interested', 'callback_scheduled'
    reason: String,
    nextActions: [String],
    followUpDate: Date,
    notes: String
  },
  
  // Performance metrics for this call
  metrics: {
    totalDuration: Number,
    objectionCount: Number,
    languageSwitches: Number,
    stepRepeats: Number,
    customerEngagement: String, // 'high', 'medium', 'low'
    scriptAdherence: Number // percentage
  },
  
  // Real-time flags
  flags: {
    customerInterrupted: Boolean,
    technicalIssues: Boolean,
    escalationNeeded: Boolean,
    callbackRequested: Boolean,
    applicationStarted: Boolean
  },
  
  // For debugging and analysis
  debug: {
    lastProcessedAudio: Date,
    lastTTSGenerated: Date,
    errorCount: Number,
    warnings: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
CallStateSchema.index({ callId: 1 });
CallStateSchema.index({ callRecord: 1 });
CallStateSchema.index({ workflowId: 1 });
CallStateSchema.index({ 'currentStep.stepType': 1 });
CallStateSchema.index({ language: 1 });
CallStateSchema.index({ 'outcome.status': 1 });

// Methods for state management
CallStateSchema.methods.moveToNextStep = function(nextStepId, customerResponse, stepType = null, stepName = null) {
  // Add current step to history
  if (this.currentStep.stepId) {
    this.stepHistory.push({
      stepId: this.currentStep.stepId,
      stepName: this.currentStep.stepName,
      stepType: this.currentStep.stepType,
      startTime: this.currentStep.startTime,
      endTime: new Date(),
      customerResponse: customerResponse,
      outcome: 'completed',
      duration: new Date() - this.currentStep.startTime,
      attemptNumber: this.currentStep.attemptCount
    });
  }
  
  // Update current step
  this.currentStep = {
    stepId: nextStepId,
    stepType: stepType,
    stepName: stepName,
    startTime: new Date(),
    attemptCount: 1
  };
};

CallStateSchema.methods.addObjection = function(objectionType, customerStatement, response, source) {
  const objectionEntry = {
    type: objectionType || 'unknown',
    stepId: this.currentStep ? this.currentStep.stepId : 'unknown',
    customerStatement: customerStatement || '',
    response: response || '',
    source: source || 'unknown',
    timestamp: new Date(),
    resolved: false,
    attempts: 1
  };
  
  this.objections.push(objectionEntry);
};

CallStateSchema.methods.switchLanguage = function(newLanguage, reason) {
  if (this.language !== newLanguage) {
    this.languageHistory.push({
      from: this.language,
      to: newLanguage,
      timestamp: new Date(),
      stepId: this.currentStep.stepId,
      reason: reason
    });
    this.language = newLanguage;
  }
};

module.exports = mongoose.model('CallState', CallStateSchema);
