const KnowledgeBase = require('../models/KnowledgeBase');
const openaiService = require('./openaiService');

class KnowledgeBaseService {
  constructor() {
    this.cache = new Map(); // Cache frequently accessed responses
    this.initialized = false;
  }

  /**
   * Initialize with your predefined objection responses
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Check if KB is empty and populate with your call flow responses
      const count = await KnowledgeBase.countDocuments();
      if (count === 0) {
        await this.populateInitialKnowledgeBase();
      }
      
      this.initialized = true;
      console.log('Knowledge Base Service initialized successfully');
    } catch (error) {
      console.error('Error initializing Knowledge Base Service:', error);
    }
  }

  /**
   * Populate KB with your predefined objection responses
   */
  async populateInitialKnowledgeBase() {
    const initialEntries = [
      // Your specific objection responses from the call flow
      {
        category: 'objections',
        objectionType: 'already_have_cards',
        question: 'I already have credit cards',
        alternateQuestions: [
          'already have cards',
          'don\'t need more cards',
          'have enough cards',
          'already using other cards'
        ],
        answer: {
          english: "I completely understand, Sir. However, the SBI SimplySAVE Card offers better reward structure and cashback compared to your existing cards. You can easily compare them.",
          hindi: "मैं पूरी तरह समझती हूं, सर। लेकिन एसबीआई सिंपलीसेव कार्ड का रिवार्ड स्ट्रक्चर और कैशबैक आपके मौजूदा कार्डों की तुलना में बेहतर है। आप आसानी से तुलना कर सकते हैं।"
        },
        cardType: 'sbi_simplysave',
        priority: 9,
        keywords: ['already', 'have', 'cards', 'existing', 'other'],
        predefinedResponse: true
      },
      
      {
        category: 'objections',
        objectionType: 'high_fees',
        question: 'Annual fees are too high',
        alternateQuestions: [
          'expensive card',
          'high charges',
          'costly fees',
          'annual fee kitna hai'
        ],
        answer: {
          english: "Sir, the first year is completely free, and the annual fee is automatically waived based on your spending.",
          hindi: "सर, पहला साल पूरी तरह निःशुल्क है, और आपकी खरीदारी के आधार पर वार्षिक फीस स्वतः माफ हो जाएगी।"
        },
        cardType: 'sbi_simplysave',
        priority: 9,
        keywords: ['fees', 'charges', 'expensive', 'costly', 'annual'],
        predefinedResponse: true
      },
      
      {
        category: 'objections', 
        objectionType: 'no_time',
        question: 'I don\'t have time',
        alternateQuestions: [
          'very busy',
          'no time now',
          'call later',
          'in a hurry'
        ],
        answer: {
          english: "Sir, it will only take 2 minutes to confirm some basic details. I will handle the rest of the process for you.",
          hindi: "सर, केवल 2 मिनट लगेंगे कुछ जरूरी जानकारी की पुष्टि में। बाकी प्रक्रिया मैं स्वयं संभाल लूंगी।"
        },
        cardType: 'general',
        priority: 8,
        keywords: ['time', 'busy', 'later', 'hurry', 'rush'],
        predefinedResponse: true
      },

      // SBI SimplySave Card Features
      {
        category: 'features',
        question: 'What are the benefits of SBI SimplySave card',
        alternateQuestions: [
          'card benefits',
          'card features',
          'what do I get',
          'card ke fayde'
        ],
        answer: {
          english: "SBI SimplySAVE Credit Card benefits: Welcome bonus on first transaction, 5X reward points on all shopping, Extra rewards on dining and grocery, First year annual fee completely waived.",
          hindi: "एसबीआई सिंपलीसेव क्रेडिट कार्ड के फायदे: पहले लेनदेन पर वेलकम बोनस, हर खरीदारी पर 5X रिवार्ड पॉइंट्स, डाइनिंग और किराने की खरीदारी पर अतिरिक्त रिवार्ड, पहले साल की वार्षिक फीस पूरी तरह माफ।"
        },
        cardType: 'sbi_simplysave',
        priority: 10,
        keywords: ['benefits', 'features', 'rewards', 'cashback', 'fayde'],
        predefinedResponse: true
      },

      // Application Process
      {
        category: 'general',
        question: 'How to apply for the card',
        alternateQuestions: [
          'application process',
          'how to get card',
          'kaise apply kare',
          'documents needed'
        ],
        answer: {
          english: "I can start the application right now. I just need your full name, mobile number, date of birth, PAN card number, monthly income, and your current bank details. It takes only 2 minutes.",
          hindi: "मैं अभी आवेदन शुरू कर सकती हूं। मुझे केवल आपका पूरा नाम, मोबाइल नंबर, जन्म तिथि, पैन कार्ड नंबर, मासिक आय, और आपके बैंक की जानकारी चाहिए। केवल 2 मिनट लगेंगे।"
        },
        cardType: 'general',
        priority: 9,
        keywords: ['apply', 'application', 'documents', 'process', 'kaise'],
        predefinedResponse: true
      },

      // Eligibility 
      {
        category: 'general',
        question: 'What is the eligibility criteria',
        alternateQuestions: [
          'am I eligible',
          'minimum income',
          'eligibility requirements',
          'income criteria'
        ],
        answer: {
          english: "Basic eligibility: Age 21-60 years, minimum monthly income Rs. 15,000, good credit score. If you have a salary account with any bank, you're likely eligible.",
          hindi: "बुनियादी योग्यता: आयु 21-60 वर्ष, न्यूनतम मासिक आय 15,000 रुपये, अच्छा क्रेडिट स्कोर। यदि आपका किसी बैंक में सैलरी अकाउंट है, तो आप योग्य हैं।"
        },
        cardType: 'general',
        priority: 8,
        keywords: ['eligible', 'eligibility', 'income', 'criteria', 'requirements'],
        predefinedResponse: true
      }
    ];

    try {
      await KnowledgeBase.insertMany(initialEntries);
      console.log('Initial knowledge base populated with predefined responses');
    } catch (error) {
      console.error('Error populating initial knowledge base:', error);
    }
  }

  /**
   * Find best answer for a question
   */
  async findAnswer(question, context = {}) {
    try {
      await this.initialize();

      const { cardType = 'general', language = 'english', stepType } = context;
      
      // Check cache first
      const cacheKey = `${question}_${cardType}_${language}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Search in knowledge base
      const entries = await KnowledgeBase.find({
        $and: [
          { cardType: { $in: [cardType, 'general'] } },
          { isActive: true },
          {
            $or: [
              { question: { $regex: question, $options: 'i' } },
              { alternateQuestions: { $regex: question, $options: 'i' } },
              { keywords: { $in: this.extractKeywords(question) } }
            ]
          }
        ]
      });

      if (entries.length === 0) {
        return null;
      }

      // Score and rank entries
      const scoredEntries = entries.map(entry => ({
        entry,
        score: this.calculateRelevanceScore(question, entry, context)
      })).filter(item => item.score > 3)
        .sort((a, b) => b.score - a.score);

      if (scoredEntries.length > 0) {
        const bestMatch = scoredEntries[0].entry;
        
        // Cache the result
        this.cache.set(cacheKey, bestMatch);
        
        // Update usage stats
        bestMatch.usage.timesUsed += 1;
        bestMatch.usage.lastUsed = new Date();
        await bestMatch.save();

        return bestMatch;
      }

      return null;
    } catch (error) {
      console.error('Error finding answer:', error);
      return null;
    }
  }

  /**
   * Handle objections specifically
   */
  async handleObjection(objectionText, context = {}) {
    try {
      await this.initialize();

      const { cardType = 'general', language = 'english' } = context;
      
      // Classify objection type
      const objectionType = this.classifyObjection(objectionText);
      
      // Find specific objection response
      const objectionResponse = await KnowledgeBase.findOne({
        objectionType: objectionType,
        cardType: { $in: [cardType, 'general'] },
        isActive: true
      }).sort({ priority: -1 });

      if (objectionResponse) {
        // Update usage stats
        objectionResponse.usage.timesUsed += 1;
        objectionResponse.usage.lastUsed = new Date();
        await objectionResponse.save();

        return {
          found: true,
          response: objectionResponse.answer[language] || objectionResponse.answer.english,
          type: objectionType,
          source: 'knowledge_base',
          confidence: 0.9
        };
      }

      // If no specific response found, try general search
      const generalAnswer = await this.findAnswer(objectionText, context);
      if (generalAnswer) {
        return {
          found: true,
          response: generalAnswer.answer[language] || generalAnswer.answer.english,
          type: 'general',
          source: 'knowledge_base',
          confidence: 0.7
        };
      }

      return {
        found: false,
        type: objectionType,
        source: 'not_found'
      };

    } catch (error) {
      console.error('Error handling objection:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Get card-specific features
   */
  async getCardFeatures(cardType, language = 'english') {
    try {
      const features = await KnowledgeBase.find({
        category: 'features',
        cardType: { $in: [cardType, 'general'] },
        isActive: true
      }).sort({ priority: -1 });

      return features.map(feature => ({
        feature: feature.question,
        description: feature.answer[language] || feature.answer.english
      }));
    } catch (error) {
      console.error('Error getting card features:', error);
      return [];
    }
  }

  /**
   * Add new knowledge base entry
   */
  async addEntry(entryData) {
    try {
      const entry = new KnowledgeBase(entryData);
      await entry.save();
      
      // Clear cache to force refresh
      this.cache.clear();
      
      return entry;
    } catch (error) {
      console.error('Error adding KB entry:', error);
      throw error;
    }
  }

  /**
   * Update existing entry
   */
  async updateEntry(entryId, updateData) {
    try {
      const entry = await KnowledgeBase.findByIdAndUpdate(
        entryId, 
        updateData, 
        { new: true }
      );
      
      // Clear cache
      this.cache.clear();
      
      return entry;
    } catch (error) {
      console.error('Error updating KB entry:', error);
      throw error;
    }
  }

  /**
   * Get LLM fallback response
   */
  async getLLMFallback(question, context = {}) {
    try {
      const { cardType = 'credit card', language = 'english' } = context;
      
      const systemPrompt = `You are a professional ${cardType} sales representative. Answer questions accurately and persuasively. Keep responses under 50 words. Respond in ${language}.`;
      
      const response = await openaiService.getChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ]);

      return {
        found: true,
        response: response.content,
        source: 'llm',
        confidence: 0.6
      };
    } catch (error) {
      console.error('Error getting LLM fallback:', error);
      return {
        found: false,
        response: "I'll get back to you with accurate information about that.",
        source: 'fallback',
        confidence: 0.3
      };
    }
  }

  /**
   * Classify objection type
   */
  classifyObjection(objectionText) {
    const lowerText = objectionText.toLowerCase();
    
    const objectionPatterns = {
      'already_have_cards': ['already have', 'have card', 'existing card', 'don\'t need'],
      'high_fees': ['expensive', 'costly', 'high fee', 'charges', 'annual fee'],
      'no_time': ['no time', 'busy', 'later', 'hurry', 'rush'],
      'not_interested': ['not interested', 'don\'t want', 'no thanks'],
      'need_to_think': ['think about', 'consider', 'decide later'],
      'spouse_decision': ['wife', 'husband', 'spouse', 'discuss with']
    };

    for (const [type, patterns] of Object.entries(objectionPatterns)) {
      if (patterns.some(pattern => lowerText.includes(pattern))) {
        return type;
      }
    }

    return 'general';
  }

  /**
   * Calculate relevance score
   */
  calculateRelevanceScore(question, entry, context) {
    let score = 0;
    const lowerQuestion = question.toLowerCase();
    
    // Exact question match
    if (entry.question.toLowerCase().includes(lowerQuestion)) {
      score += 10;
    }
    
    // Alternative questions match
    const matchingAlt = entry.alternateQuestions.find(alt => 
      alt.toLowerCase().includes(lowerQuestion) || lowerQuestion.includes(alt.toLowerCase())
    );
    if (matchingAlt) score += 8;
    
    // Keywords match
    const questionKeywords = this.extractKeywords(question);
    const matchingKeywords = entry.keywords.filter(keyword => 
      questionKeywords.some(qKeyword => 
        keyword.toLowerCase().includes(qKeyword.toLowerCase())
      )
    );
    score += matchingKeywords.length * 2;
    
    // Priority bonus
    score += entry.priority;
    
    // Card type relevance
    if (context.cardType && entry.cardType === context.cardType) {
      score += 3;
    }
    
    // Predefined response bonus
    if (entry.predefinedResponse) {
      score += 5;
    }
    
    return score;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    const stopWords = ['the', 'is', 'are', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .map(word => word.replace(/[^\w]/g, ''));
  }

  /**
   * Get analytics for knowledge base performance
   */
  async getAnalytics() {
    try {
      const totalEntries = await KnowledgeBase.countDocuments({ isActive: true });
      const mostUsed = await KnowledgeBase.find({ isActive: true })
        .sort({ 'usage.timesUsed': -1 })
        .limit(10);
      
      const categoryStats = await KnowledgeBase.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]);

      return {
        totalEntries,
        mostUsed,
        categoryStats,
        cacheSize: this.cache.size
      };
    } catch (error) {
      console.error('Error getting KB analytics:', error);
      return {};
    }
  }
}

module.exports = new KnowledgeBaseService();
