const mongoose = require('mongoose');

const ScriptSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  language: {
    type: String,
    enum: ['english', 'hindi', 'mixed'],
    required: true
  },
  // Credit card sales specific fields
  scriptType: {
    type: String,
    enum: ['general', 'credit_card', 'rewards_card', 'business_card', 'premium_card'],
    default: 'credit_card'
  },
  cardFeatures: [{
    type: String
  }],
  interestRate: {
    type: String
  },
  annualFee: {
    type: String
  },
  rewardPoints: {
    type: String
  },
  targetAudience: {
    type: String
  },
  objectionHandling: {
    type: Map,
    of: String
  },
  stages: {
    greeting: {
      type: String
    },
    qualification: {
      type: String
    },
    features: {
      type: String
    },
    closing: {
      type: String
    }
  },
  category: {
    type: String,
    enum: ['sales', 'support', 'general', 'follow-up'],
    default: 'sales'
  },
  
  // New workflow integration fields
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallWorkflow'
  },
  
  // Dynamic content variables
  variables: {
    type: Map,
    of: String // e.g., "cardName" -> "SBI SimplySave", "bankName" -> "SBI"
  },
  
  // Multi-language content structure
  contentByLanguage: {
    english: {
      greeting: String,
      benefits: String,
      objectionResponses: {
        type: Map,
        of: String
      },
      closing: String
    },
    hindi: {
      greeting: String,
      benefits: String,
      objectionResponses: {
        type: Map,
        of: String
      },
      closing: String
    }
  },
  
  // Flow-specific configurations
  flowConfig: {
    allowLanguageSwitch: {
      type: Boolean,
      default: true
    },
    maxObjectionAttempts: {
      type: Number,
      default: 3
    },
    enableLLMFallback: {
      type: Boolean,
      default: true
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Script', ScriptSchema);
