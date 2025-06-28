const mongoose = require('mongoose');

const CallWorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  industry: {
    type: String,
    enum: ['credit_cards', 'loans', 'insurance', 'banking', 'general'],
    default: 'credit_cards'
  },
  version: {
    type: String,
    default: '1.0'
  },
  steps: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: [
        'greeting', 
        'language_check', 
        'interest_check', 
        'benefits', 
        'present_benefits',
        'collect_details',
        'objection_handling', 
        'application', 
        'confirmation', 
        'confirmation_closing',
        'not_interested_closing',
        'closing',
        'collect_name',
        'collect_age',
        'collect_occupation',
        'collect_income',
        'collect_city',
        'collect_email'
      ],
      required: true
    },
    order: {
      type: Number,
      required: true
    },
    template: {
      english: {
        type: String,
        required: true
      },
      hindi: {
        type: String,
        required: true
      }
    },
    expectedResponses: [{
      response: {
        type: String
      },
      nextStep: {
        type: String
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1
      }
    }],
    branchingLogic: {
      interested: {
        type: String
      },
      notInterested: {
        type: String
      },
      needsInfo: {
        type: String
      },
      objection: {
        type: String
      },
      maybe: {
        type: String
      },
      default: {
        type: String
      }
    },
    variables: [{
      name: {
        type: String
      },
      type: {
        type: String
      },
      required: {
        type: Boolean,
        default: false
      }
    }],
    maxRetries: {
      type: Number,
      default: 2
    },
    timeoutSeconds: {
      type: Number,
      default: 30
    }
  }],
  
  // Your specific 8-step flow structure
  flowStructure: {
    greeting: {
      nextStep: {
        type: String,
        default: 'language_check'
      },
      allowSkip: {
        type: Boolean,
        default: false
      }
    },
    language_check: {
      nextStep: {
        type: String,
        default: 'interest_check'
      },
      allowSkip: {
        type: Boolean,
        default: false
      }
    },
    interest_check: {
      nextStep: {
        type: String,
        default: 'benefits'
      },
      allowSkip: {
        type: Boolean,
        default: false
      },
      branchOptions: [{
        type: String
      }]
    },
    benefits: {
      nextStep: {
        type: String,
        default: 'application'
      },
      allowSkip: {
        type: Boolean,
        default: false
      },
      branchOptions: [{
        type: String
      }]
    },
    objection_handling: {
      nextStep: {
        type: String,
        default: 'benefits'
      },
      allowSkip: {
        type: Boolean,
        default: false
      },
      maxAttempts: {
        type: Number,
        default: 3
      },
      branchOptions: [{
        type: String
      }]
    },
    application: {
      nextStep: {
        type: String,
        default: 'confirmation'
      },
      allowSkip: {
        type: Boolean,
        default: false
      }
    },
    confirmation: {
      nextStep: {
        type: String,
        default: 'closing'
      },
      allowSkip: {
        type: Boolean,
        default: false
      }
    },
    closing: {
      nextStep: {
        type: String,
        default: null
      },
      allowSkip: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Card-specific configurations
  cardConfigurations: [{
    cardType: String, // 'sbi_simplysave', 'sbi_prime', etc.
    variables: {
      type: Map,
      of: String
    },
    customSteps: [{
      stepId: String,
      customContent: {
        english: String,
        hindi: String
      }
    }]
  }],
  
  // Objection handling configuration
  objectionConfig: {
    maxObjectionsPerCall: {
      type: Number,
      default: 3
    },
    fallbackToLLM: {
      type: Boolean,
      default: true
    },
    escalationSteps: [String]
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Analytics and performance tracking
  analytics: {
    totalCalls: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 0
    },
    averageCallDuration: {
      type: Number,
      default: 0
    },
    commonDropOffPoints: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
CallWorkflowSchema.index({ industry: 1, isActive: 1 });
CallWorkflowSchema.index({ name: 1 });
CallWorkflowSchema.index({ 'cardConfigurations.cardType': 1 });

module.exports = mongoose.model('CallWorkflow', CallWorkflowSchema);
