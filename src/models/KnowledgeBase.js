const mongoose = require('mongoose');

const KnowledgeBaseSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['credit_cards', 'objections', 'features', 'pricing', 'general', 'sbi_specific'],
    required: true
  },
  
  // The question or objection
  question: {
    type: String,
    required: true
  },
  
  // Alternative ways the question might be asked
  alternateQuestions: [{
    type: String
  }],
  
  // The response in both languages
  answer: {
    english: {
      type: String,
      required: true
    },
    hindi: {
      type: String,
      required: true
    }
  },
  
  // Objection-specific fields
  objectionType: {
    type: String,
    enum: ['already_have_cards', 'high_fees', 'no_time', 'not_interested', 'need_to_think', 'spouse_decision', 'bad_credit', 'too_many_cards'],
    required: false
  },
  
  // Card-specific information
  cardType: {
    type: String,
    enum: ['general', 'sbi_simplysave', 'sbi_prime', 'sbi_cashback', 'sbi_elite', 'any_sbi'],
    default: 'general'
  },
  
  // Response priority (higher = more relevant)
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  
  // Keywords for better matching
  keywords: [{
    type: String
  }],
  
  // Context when this response should be used
  context: {
    callStage: [{
      type: String
    }],
    customerProfile: {
      type: String
    },
    previousObjections: [{
      type: String
    }]
  },
  
  // Follow-up actions after this response
  followUpActions: [{
    action: {
      type: String
    },
    condition: {
      type: String
    }
  }],
  
  // Performance metrics
  usage: {
    timesUsed: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  },
  
  // Content variations for A/B testing
  variations: [{
    version: {
      type: String
    },
    content: {
      english: {
        type: String
      },
      hindi: {
        type: String
      }
    },
    performance: {
      uses: {
        type: Number,
        default: 0
      },
      successRate: {
        type: Number,
        default: 0
      }
    }
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // For your specific objections from the call flow
  predefinedResponse: {
    type: Boolean,
    default: false // true for your exact objection responses
  }
}, {
  timestamps: true
});

// Indexes for fast searching
KnowledgeBaseSchema.index({ category: 1, cardType: 1, isActive: 1 });
KnowledgeBaseSchema.index({ objectionType: 1, cardType: 1 });
KnowledgeBaseSchema.index({ keywords: 1 });
KnowledgeBaseSchema.index({ question: 'text', 'alternateQuestions': 'text' });

// Methods for semantic search
KnowledgeBaseSchema.methods.calculateRelevance = function(query, context) {
  let score = 0;
  
  // Exact match bonus
  if (this.question.toLowerCase().includes(query.toLowerCase())) {
    score += 10;
  }
  
  // Alternative questions match
  const matchingAlt = this.alternateQuestions.find(alt => 
    alt.toLowerCase().includes(query.toLowerCase())
  );
  if (matchingAlt) score += 8;
  
  // Keywords match
  const queryWords = query.toLowerCase().split(' ');
  const matchingKeywords = this.keywords.filter(keyword => 
    queryWords.some(word => keyword.toLowerCase().includes(word))
  );
  score += matchingKeywords.length * 2;
  
  // Context relevance
  if (context && context.callStage && this.context.callStage.includes(context.callStage)) {
    score += 5;
  }
  
  // Priority weight
  score += this.priority;
  
  return score;
};

module.exports = mongoose.model('KnowledgeBase', KnowledgeBaseSchema);
