const CallWorkflow = require('../models/CallWorkflow');
const Script = require('../models/Script');

class DynamicContentManager {
  constructor() {
    this.templateCache = new Map();
    this.cardConfigurations = new Map();
  }

  /**
   * Populate template with dynamic variables
   */
  async populateTemplate(template, variables, language = 'english') {
    try {
      let content = template;
      
      // Replace all {{variable}} placeholders
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value || '');
      }

      // Handle conditional content based on language
      content = this.handleLanguageSpecificContent(content, language);
      
      return content;
    } catch (error) {
      console.error('Error populating template:', error);
      return template;
    }
  }

  /**
   * Get card-specific content for any step
   */
  async getCardSpecificContent(cardType, stepType, language = 'english', variables = {}) {
    try {
      // Check cache first
      const cacheKey = `${cardType}_${stepType}_${language}`;
      if (this.templateCache.has(cacheKey)) {
        const cached = this.templateCache.get(cacheKey);
        return this.populateTemplate(cached, variables, language);
      }

      // Load card configuration
      const cardConfig = await this.getCardConfiguration(cardType);
      if (!cardConfig) {
        throw new Error(`Card configuration not found for ${cardType}`);
      }

      // Get step-specific content
      const stepContent = this.getStepContent(cardConfig, stepType, language);
      
      // Cache the content
      this.templateCache.set(cacheKey, stepContent);
      
      // Populate with variables
      return this.populateTemplate(stepContent, variables, language);
      
    } catch (error) {
      console.error('Error getting card-specific content:', error);
      return this.getFallbackContent(stepType, language);
    }
  }

  /**
   * Get card configuration with all content templates
   */
  async getCardConfiguration(cardType) {
    try {
      // Check cache
      if (this.cardConfigurations.has(cardType)) {
        return this.cardConfigurations.get(cardType);
      }

      // Define your card configurations
      const configs = {
        'sbi_simplysave': {
          cardName: 'SBI SimplySAVE Credit Card',
          bankName: 'SBI Bank',
          agentName: 'Priya',
          features: {
            primary: '5X reward points on all shopping',
            secondary: 'No annual fee for first year',
            cashback: 'Welcome bonus on first transaction',
            dining: 'Extra rewards on dining and grocery'
          },
          content: {
            english: {
              greeting: "Hello Sir/Madam! This is {{agentName}} calling from {{bankName}}. How are you today? I hope I am not disturbing you. I am calling to share information about a special {{cardName}} that could be perfect for you.",
              benefits: "Sir, I am specifically calling about the {{cardName}}. Here are the benefits: {{features.cashback}}, {{features.primary}}, {{features.dining}}, And {{features.secondary}}. This card will be very helpful for your daily shopping and savings.",
              application: "Perfect, Sir. I will start the application process now. I just need a few basic details. May I begin?",
              confirmation: "Thank you, Sir. I have received all the details. I will submit your application now. An {{bankName}} representative will contact you within 24 to 48 hours for verification. Thank you for your cooperation. Have a wonderful day!"
            },
            hindi: {
              greeting: "नमस्ते सर/मैडम! मैं {{agentName}} बोल रही हूँ {{bankName}} से। आप कैसे हैं? मुझे आशा है कि मैं आपको परेशान नहीं कर रही। मैं आपको {{cardName}} के बारे में जानकारी देने के लिए कॉल कर रही हूँ।",
              benefits: "सर, मैं विशेष रूप से {{cardName}} के बारे में कॉल कर रही हूँ। इसके लाभ इस प्रकार हैं: {{features.cashback}}, {{features.primary}}, {{features.dining}}, और {{features.secondary}}। यह कार्ड आपकी रोजमर्रा की खरीदारी और बचत के लिए बहुत लाभकारी रहेगा।",
              application: "परफेक्ट सर। मैं अभी आवेदन प्रक्रिया शुरू कर देती हूँ। मुझे केवल कुछ बुनियादी जानकारी चाहिए। क्या मैं शुरू करूँ?",
              confirmation: "धन्यवाद सर। सारी जानकारी प्राप्त हो गई है। मैं अब आपका आवेदन जमा कर रही हूँ। {{bankName}} का प्रतिनिधि अगले 24 से 48 घंटों में आपसे सत्यापन के लिए संपर्क करेगा। सहयोग के लिए धन्यवाद।"
            }
          }
        },

        'sbi_prime': {
          cardName: 'SBI Prime Credit Card',
          bankName: 'SBI Bank',
          agentName: 'Priya',
          features: {
            primary: 'Premium rewards and benefits',
            secondary: 'Complimentary airport lounge access',
            cashback: 'High cashback on premium purchases',
            dining: 'Exclusive dining privileges'
          },
          content: {
            english: {
              greeting: "Hello Sir/Madam! This is {{agentName}} from {{bankName}}. I'm calling about our premium {{cardName}} designed for valued customers like you.",
              benefits: "The {{cardName}} offers: {{features.primary}}, {{features.secondary}}, {{features.cashback}}, and {{features.dining}}. This is perfect for your premium lifestyle.",
              application: "Excellent! Let me start your premium application process. I'll need some details to get this processed quickly.",
              confirmation: "Thank you! Your premium application is submitted. Our relationship manager will contact you within 24 hours for personalized service."
            },
            hindi: {
              greeting: "नमस्ते सर/मैडम! मैं {{agentName}} हूँ {{bankName}} से। मैं आपके लिए हमारे प्रीमियम {{cardName}} के बारे में कॉल कर रही हूँ।",
              benefits: "{{cardName}} के फायदे: {{features.primary}}, {{features.secondary}}, {{features.cashback}}, और {{features.dining}}। यह आपकी प्रीमियम लाइफस्टाइल के लिए बिल्कुल सही है।",
              application: "बेहतरीन! मैं आपकी प्रीमियम एप्लीकेशन प्रोसेस शुरू करती हूँ। जल्दी प्रोसेसिंग के लिए कुछ जानकारी चाहिए।",
              confirmation: "धन्यवाद! आपकी प्रीमियम एप्लीकेशन जमा हो गई। हमारे रिलेशनशिप मैनेजर 24 घंटे में व्यक्तिगत सेवा के लिए संपर्क करेंगे।"
            }
          }
        }
      };

      const config = configs[cardType] || configs['sbi_simplysave']; // Default fallback
      this.cardConfigurations.set(cardType, config);
      return config;

    } catch (error) {
      console.error('Error getting card configuration:', error);
      return null;
    }
  }

  /**
   * Get content for specific step
   */
  getStepContent(cardConfig, stepType, language) {
    try {
      // Map step types to content keys
      const stepContentMap = {
        'greeting': 'greeting',
        'language_check': 'language_check',
        'interest_check': 'interest_check', 
        'benefits': 'benefits',
        'application': 'application',
        'confirmation': 'confirmation',
        'closing': 'closing'
      };

      const contentKey = stepContentMap[stepType];
      
      if (contentKey && cardConfig.content[language] && cardConfig.content[language][contentKey]) {
        return cardConfig.content[language][contentKey];
      }

      // Fallback to default step content
      return this.getDefaultStepContent(stepType, language);
      
    } catch (error) {
      console.error('Error getting step content:', error);
      return this.getDefaultStepContent(stepType, language);
    }
  }

  /**
   * Get default step content (your original call flow)
   */
  getDefaultStepContent(stepType, language) {
    const defaultContent = {
      english: {
        greeting: "Hello Sir/Madam! This is {{agentName}} calling from {{bankName}}. How are you today? I hope I am not disturbing you. I am calling to share information about a special credit card that could be perfect for you.",
        language_check: "May I continue in English or would you prefer to speak in Hindi?",
        interest_check: "Sir/Madam, I would like to quickly tell you about the benefits of this card. It will only take 2 minutes. May I proceed?",
        benefits: "Sir, this card offers excellent benefits including rewards, cashback, and no annual fee. Would you like to know more?",
        objection_handling: "I understand your concern. Let me explain how this card would benefit you specifically.",
        application: "Perfect! I can start the application process now. I just need some basic details. May I begin?",
        confirmation: "Thank you! I have all the details. Your application will be processed and you'll be contacted within 24-48 hours.",
        closing: "Thank you for your time. If you have any questions in the future, please feel free to contact us. Have a great day!"
      },
      hindi: {
        greeting: "नमस्ते सर/मैडम! मैं {{agentName}} बोल रही हूँ {{bankName}} से। आप कैसे हैं? मुझे आशा है कि मैं आपको परेशान नहीं कर रही। मैं आपको एक विशेष क्रेडिट कार्ड के बारे में बताना चाहती हूँ।",
        language_check: "क्या मैं हिंदी में बात कर सकती हूँ या आप अंग्रेजी में बात करना चाहेंगे?",
        interest_check: "सर/मैडम, मैं जल्दी से इस कार्ड के फायदे बताना चाहती हूँ। इसमें सिर्फ 2 मिनट लगेंगे। क्या मैं शुरू करूँ?",
        benefits: "सर, इस कार्ड के बेहतरीन फायदे हैं जैसे रिवार्ड्स, कैशबैक, और कोई वार्षिक फीस नहीं। क्या आप और जानना चाहेंगे?",
        objection_handling: "मैं आपकी बात समझती हूँ। मुझे बताने दीजिए कि यह कार्ड आपके लिए कैसे फायदेमंद होगा।",
        application: "परफेक्ट! मैं अभी आवेदन प्रक्रिया शुरू कर सकती हूँ। मुझे कुछ बुनियादी जानकारी चाहिए। क्या मैं शुरू करूँ?",
        confirmation: "धन्यवाद! सारी जानकारी मिल गई है। आपका आवेदन प्रोसेस होगा और 24-48 घंटे में आपसे संपर्क किया जाएगा।",
        closing: "आपके समय के लिए धन्यवाद। यदि भविष्य में कोई प्रश्न हो, तो कृपया संपर्क करें। आपका दिन शुभ हो!"
      }
    };

    return defaultContent[language]?.[stepType] || defaultContent.english[stepType] || "Thank you for your time.";
  }

  /**
   * Adapt content for customer profile
   */
  async adaptContentForCustomer(content, customerProfile = {}) {
    try {
      let adaptedContent = content;
      
      // Adapt based on customer characteristics
      if (customerProfile.previousObjections && customerProfile.previousObjections.length > 0) {
        // Customer has objected before, be more persuasive but respectful
        adaptedContent = this.addPersuasiveElements(adaptedContent);
      }
      
      if (customerProfile.engagementLevel === 'low') {
        // Customer seems disengaged, make content more engaging
        adaptedContent = this.makeContentMoreEngaging(adaptedContent);
      }
      
      if (customerProfile.timeConstrained) {
        // Customer is in a hurry, make content more concise
        adaptedContent = this.makeContentConcise(adaptedContent);
      }

      return adaptedContent;
    } catch (error) {
      console.error('Error adapting content for customer:', error);
      return content;
    }
  }

  /**
   * Handle language-specific content formatting
   */
  handleLanguageSpecificContent(content, language) {
    if (language === 'hindi') {
      // Add respectful Hindi honorifics if not present
      if (!content.includes('सर') && !content.includes('मैडम')) {
        content = content.replace(/Sir/g, 'सर').replace(/Madam/g, 'मैडम');
      }
    }
    
    return content;
  }

  /**
   * Add persuasive elements for skeptical customers
   */
  addPersuasiveElements(content) {
    const persuasiveWords = {
      english: ['specifically designed for you', 'exclusive benefits', 'limited time offer'],
      hindi: ['विशेष रूप से आपके लिए', 'अनन्य लाभ', 'सीमित समय का ऑफर']
    };

    // Add social proof or urgency (you can customize this)
    return content;
  }

  /**
   * Make content more engaging for disengaged customers
   */
  makeContentMoreEngaging(content) {
    // Add questions or interactive elements
    if (!content.includes('?')) {
      content += " What do you think about this?";
    }
    return content;
  }

  /**
   * Make content more concise for time-constrained customers
   */
  makeContentConcise(content) {
    // Remove unnecessary words, keep only essential information
    return content.replace(/I hope I am not disturbing you\.\s*/g, '')
                  .replace(/How are you today\?\s*/g, '')
                  .trim();
  }

  /**
   * Get fallback content if card-specific content fails
   */
  getFallbackContent(stepType, language) {
    return this.getDefaultStepContent(stepType, language);
  }

  /**
   * Create complete call script for a card
   */
  async createCompleteCallScript(cardType, language = 'english') {
    try {
      const cardConfig = await this.getCardConfiguration(cardType);
      if (!cardConfig) {
        throw new Error(`Card configuration not found for ${cardType}`);
      }

      const variables = {
        agentName: cardConfig.agentName,
        bankName: cardConfig.bankName,
        cardName: cardConfig.cardName,
        'features.primary': cardConfig.features.primary,
        'features.secondary': cardConfig.features.secondary,
        'features.cashback': cardConfig.features.cashback,
        'features.dining': cardConfig.features.dining
      };

      const steps = ['greeting', 'language_check', 'interest_check', 'benefits', 'application', 'confirmation', 'closing'];
      const script = {};

      for (const step of steps) {
        script[step] = await this.getCardSpecificContent(cardType, step, language, variables);
      }

      return script;
    } catch (error) {
      console.error('Error creating complete call script:', error);
      throw error;
    }
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.templateCache.clear();
    this.cardConfigurations.clear();
  }

  /**
   * Get analytics on content usage
   */
  getAnalytics() {
    return {
      templateCacheSize: this.templateCache.size,
      cardConfigCacheSize: this.cardConfigurations.size,
      mostUsedTemplates: Array.from(this.templateCache.keys()).slice(0, 10)
    };
  }
}

module.exports = new DynamicContentManager();
