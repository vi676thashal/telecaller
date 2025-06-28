const CallWorkflow = require('../models/CallWorkflow');
const KnowledgeBase = require('../models/KnowledgeBase');
const knowledgeBaseService = require('../services/knowledgeBaseService');

class WorkflowInitializer {
  /**
   * Initialize the system with multi-bank support
   */
  async initializeSystem() {
    try {
      console.log('Initializing Multi-Bank AI Call Flow System...');

      // Initialize knowledge base service first
      await knowledgeBaseService.initialize();

      // Create workflows for different banks
      await this.createSBISimplySaveWorkflow();
      await this.createSBIPrimeWorkflow();
      await this.createHDFCWorkflow();
      await this.createICICIWorkflow();
      await this.createAxisWorkflow();
      await this.createKotakWorkflow();
      await this.createYesBankWorkflow();

      console.log('Multi-Bank AI Call Flow System initialized successfully!');
      return true;
    } catch (error) {
      console.error('Error initializing system:', error);
      throw error;
    }
  }

  /**
   * Create dynamic credit card workflow for any bank
   */
  async createDynamicCreditCardWorkflow(bankConfig = {}) {
    try {
      // Default bank configuration (SBI)
      const config = {
        bankName: 'SBI Bank',
        bankDisplayName: 'SBI',
        agentName: 'Priya',
        cardName: 'SimplySAVE Credit Card',
        cardType: 'simplysave',
        workflowName: 'Credit Card Sales Flow',
        ...bankConfig
      };

      const fullWorkflowName = `${config.bankDisplayName} ${config.workflowName}`;
      
      // Check if workflow already exists
      const existingWorkflow = await CallWorkflow.findOne({ 
        name: fullWorkflowName
      });
      
      if (existingWorkflow) {
        console.log(`${fullWorkflowName} already exists`);
        return existingWorkflow;
      }

      const workflowData = {
        name: fullWorkflowName,
        description: `Complete 7-step call flow for ${config.bankDisplayName} ${config.cardName} sales with objection handling`,
        industry: 'credit_cards',
        version: '1.0',
        
        steps: [
          {
            id: 'greeting',
            name: 'Call Initiation & Greeting',
            type: 'greeting',
            order: 1,
            template: {
              english: `Hello Sir/Madam! This is {{agentName}} calling from {{bankName}}. How are you today? I hope I am not disturbing you. May I have just 2 minutes to share some benefits of a special {{bankDisplayName}} credit card designed for your daily expenses?`,
              hindi: `नमस्ते सर/मैडम! मैं {{agentName}} बोल रही हूँ {{bankName}} से। आप कैसे हैं? मुझे उम्मीद है कि मैं आपको परेशान नहीं कर रही। क्या मैं आपके दैनिक खर्चों के लिए बनाए गए एक विशेष {{bankDisplayName}} क्रेडिट कार्ड के कुछ लाभ सिर्फ 2 मिनट में बता सकती हूँ?`
            },
            expectedResponses: [
              { response: 'hello', nextStep: 'language_check', confidence: 0.9 },
              { response: 'yes', nextStep: 'language_check', confidence: 0.8 },
              { response: 'ok', nextStep: 'language_check', confidence: 0.8 },
              { response: 'not interested', nextStep: 'not_interested_closing', confidence: 0.9 }
            ],
            branchingLogic: {
              interested: 'language_check',
              notInterested: 'not_interested_closing',
              default: 'language_check'
            },
            variables: [
              { name: 'agentName', type: 'string', required: true },
              { name: 'bankName', type: 'string', required: true }
            ]
          },
          
          {
            id: 'language_check',
            name: 'Language Preference',
            type: 'language_check',
            order: 2,
            template: {
              english: "Would you prefer to continue in Hindi or English?",
              hindi: "क्या आप हिंदी में बात करना चाहेंगे या अंग्रेजी में?"
            },
            expectedResponses: [
              { response: 'english', nextStep: 'present_benefits', confidence: 0.9 },
              { response: 'hindi', nextStep: 'present_benefits', confidence: 0.9 },
              { response: 'continue', nextStep: 'present_benefits', confidence: 0.8 }
            ],
            branchingLogic: {
              default: 'present_benefits'
            }
          },

          {
            id: 'present_benefits',
            name: 'Present Card Benefits',
            type: 'benefits',
            order: 3,
            template: {
              english: `Sir/Madam, the {{bankDisplayName}} {{cardName}} offers you: A welcome bonus or cashback on your first purchase. 5X reward points on shopping. Extra rewards on dining and groceries. The first year annual fee is fully waived. It is perfect for saving money on your everyday spending.`,
              hindi: `सर/मैडम, {{bankDisplayName}} {{cardName}} के लाभ इस प्रकार हैं: पहली खरीदारी पर वेलकम बोनस या कैशबैक। हर खरीदारी पर 5X रिवार्ड पॉइंट्स। डाइनिंग और किराना खर्च पर अतिरिक्त रिवार्ड्स। पहले साल की वार्षिक फीस पूरी तरह माफ है। यह आपके रोज़मर्रा के खर्चों में बचत के लिए एक बेहतरीन कार्ड है।`
            },
            expectedResponses: [
              { response: 'interested', nextStep: 'collect_details', confidence: 0.9 },
              { response: 'good', nextStep: 'collect_details', confidence: 0.8 },
              { response: 'already have', nextStep: 'objection_handling', confidence: 0.9 },
              { response: 'expensive', nextStep: 'objection_handling', confidence: 0.9 },
              { response: 'not interested', nextStep: 'not_interested_closing', confidence: 0.9 }
            ],
            branchingLogic: {
              interested: 'collect_details',
              objection: 'objection_handling',
              notInterested: 'not_interested_closing',
              default: 'collect_details'
            }
          },

          {
            id: 'objection_handling',
            name: 'Quick Objection Handling',
            type: 'objection_handling',
            order: 4,
            template: {
              english: "I understand your concern. Let me address that for you.",
              hindi: "मैं आपकी बात समझती हूं। मुझे इसका जवाब देने दीजिए।"
            },
            expectedResponses: [
              { response: 'ok tell me', nextStep: 'present_benefits', confidence: 0.8 },
              { response: 'still not interested', nextStep: 'not_interested_closing', confidence: 0.9 },
              { response: 'maybe', nextStep: 'collect_details', confidence: 0.7 }
            ],
            branchingLogic: {
              interested: 'collect_name',
              notInterested: 'not_interested_closing',
              default: 'not_interested_closing'
            },
            maxRetries: 1 // Only one rebuttal as per your requirement
          },

          // Data Collection Steps
          {
            id: 'collect_name',
            name: 'Collect Customer Name',
            type: 'collect_name',
            order: 5,
            template: {
              english: "Great! I'm happy to help you with the {{cardName}}. To proceed with your application, may I please have your full name?",
              hindi: "बेहतरीन! मुझे {{cardName}} के लिए आपकी मदद करने में खुशी होगी। आपका आवेदन आगे बढ़ाने के लिए, कृपया अपना पूरा नाम बताइए?"
            },
            expectedResponses: [
              { response: 'name_provided', nextStep: 'collect_age', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_age',
            name: 'Collect Customer Age',
            type: 'collect_age',
            order: 6,
            template: {
              english: "Thank you, {{customerName}}. May I know your age for the application?",
              hindi: "धन्यवाद, {{customerName}}। आवेदन के लिए आपकी उम्र जान सकती हूँ?"
            },
            expectedResponses: [
              { response: 'age_provided', nextStep: 'collect_occupation', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_occupation',
            name: 'Collect Occupation',
            type: 'collect_occupation', 
            order: 7,
            template: {
              english: "Perfect. Are you currently employed, self-employed, or have your own business?",
              hindi: "बहुत अच्छा। क्या आप नौकरीपेशा हैं, स्व-रोजगार में हैं, या अपना व्यवसाय है?"
            },
            expectedResponses: [
              { response: 'occupation_provided', nextStep: 'collect_income', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_income',
            name: 'Collect Monthly Income',
            type: 'collect_income',
            order: 8,
            template: {
              english: "What is your approximate monthly income? Is it above 25,000, 50,000, or 1 lakh?",
              hindi: "आपकी अनुमानित मासिक आय कितनी है? क्या यह 25,000, 50,000 या 1 लाख से ऊपर है?"
            },
            expectedResponses: [
              { response: 'income_provided', nextStep: 'collect_city', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_city',
            name: 'Collect City',
            type: 'collect_city',
            order: 9,
            template: {
              english: "Which city do you currently live in?",
              hindi: "आप वर्तमान में किस शहर में रहते हैं?"
            },
            expectedResponses: [
              { response: 'city_provided', nextStep: 'collect_email', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_email',
            name: 'Collect Email Address',
            type: 'collect_email',
            order: 10,
            template: {
              english: "Lastly, may I have your email address for sending the application details?",
              hindi: "अंत में, आवेदन की जानकारी भेजने के लिए आपका ईमेल पता मिल सकता है?"
            },
            expectedResponses: [
              { response: 'email_provided', nextStep: 'application', confidence: 0.9 }
            ]
          },

          {
            id: 'collect_details',
            name: 'Collect Application Details',
            type: 'application',
            order: 11,
            template: {
              english: "Perfect! Let me confirm your details: Name: {{customerName}}, Age: {{customerAge}}, Occupation: {{customerOccupation}}, Monthly Income: {{customerIncome}}, City: {{customerCity}}, Email: {{customerEmail}}. I'm now submitting your {{cardName}} application. Is everything correct?",
              hindi: "बहुत अच्छा! मैं आपकी जानकारी confirm कर लेती हूँ: नाम: {{customerName}}, उम्र: {{customerAge}}, पेशा: {{customerOccupation}}, मासिक आय: {{customerIncome}}, शहर: {{customerCity}}, ईमेल: {{customerEmail}}। मैं अब आपका {{cardName}} आवेदन submit कर रही हूँ। क्या सब कुछ सही है?"
            },
            expectedResponses: [
              { response: 'yes sure', nextStep: 'confirmation_closing', confidence: 0.9 },
              { response: 'ok', nextStep: 'confirmation_closing', confidence: 0.8 },
              { response: 'later', nextStep: 'not_interested_closing', confidence: 0.7 }
            ],
            branchingLogic: {
              interested: 'confirmation_closing',
              notInterested: 'not_interested_closing',
              default: 'confirmation_closing'
            }
          },

          {
            id: 'confirmation_closing',
            name: 'Confirmation & Closing',
            type: 'confirmation',
            order: 6,
            template: {
              english: `Thank you, Sir. I have submitted your application. A {{bankDisplayName}} representative will contact you within 48 hours for verification. Thank you for your time. Have a wonderful day!`,
              hindi: `धन्यवाद सर। आपकी सारी जानकारी मिल गई है। मैं आपका आवेदन जमा कर रही हूँ। {{bankDisplayName}} का प्रतिनिधि अगले 48 घंटों में सत्यापन के लिए आपसे संपर्क करेगा। आपके समय के लिए धन्यवाद। आपका दिन शुभ हो!`
            },
            expectedResponses: [],
            branchingLogic: {
              default: null // Auto-end call
            }
          },

          {
            id: 'not_interested_closing',
            name: 'Not Interested Closing',
            type: 'closing',
            order: 7,
            template: {
              english: `That's absolutely fine, Sir/Madam. If you need a credit card in the future, please visit your nearest {{bankDisplayName}} branch or call us anytime. Thank you and have a great day!`,
              hindi: `कोई बात नहीं सर/मैडम। यदि भविष्य में आपको क्रेडिट कार्ड की आवश्यकता हो, तो कृपया अपनी नजदीकी {{bankDisplayName}} शाखा पर जाएँ या हमें कभी भी कॉल करें। धन्यवाद और आपका दिन मंगलमय हो!`
            },
            expectedResponses: [],
            branchingLogic: {
              default: null // Auto-end call
            }
          }
        ],

        // Your specific 8-step flow structure
        flowStructure: {
          greeting: { nextStep: 'language_check', allowSkip: false },
          language_check: { nextStep: 'interest_check', allowSkip: false },
          interest_check: { 
            nextStep: 'benefits', 
            allowSkip: false, 
            branchOptions: ['benefits', 'objection_handling', 'closing'] 
          },
          benefits: { 
            nextStep: 'application', 
            allowSkip: false, 
            branchOptions: ['application', 'objection_handling'] 
          },
          objection_handling: { 
            nextStep: 'benefits', 
            allowSkip: false, 
            maxAttempts: 3, 
            branchOptions: ['benefits', 'closing'] 
          },
          application: { nextStep: 'confirmation', allowSkip: false },
          confirmation: { nextStep: 'closing', allowSkip: false },
          closing: { nextStep: null, allowSkip: false }
        },

        // Card configurations
        cardConfigurations: [
          {
            cardType: bankConfig.cardType,
            variables: {
              cardName: bankConfig.cardName,
              bankName: bankConfig.bankName,
              bankDisplayName: bankConfig.bankDisplayName,
              agentName: bankConfig.agentName,
              welcomeBonus: 'Welcome bonus on first transaction',
              rewardPoints: '5X reward points on all shopping',
              diningRewards: 'Extra rewards on dining and grocery',
              annualFee: 'First year annual fee completely waived'
            }
          }
        ],

        // Objection handling configuration
        objectionConfig: {
          maxObjectionsPerCall: 3,
          fallbackToLLM: true,
          escalationSteps: ['closing']
        },

        isActive: true
      };

      const workflow = new CallWorkflow(workflowData);
      await workflow.save();
      
      console.log(`${fullWorkflowName} created successfully`);
      return workflow;

    } catch (error) {
      console.error(`Error creating ${bankConfig.bankDisplayName || 'Bank'} workflow:`, error);
      throw error;
    }
  }

  /**
   * Create SBI SimplySave workflow (legacy method for compatibility)
   */
  async createSBISimplySaveWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'SBI Bank',
      bankDisplayName: 'SBI',
      agentName: 'Priya',
      cardName: 'SimplySAVE Credit Card',
      cardType: 'sbi_simplysave',
      workflowName: 'SimplySave Credit Card Sales Flow'
    });
  }

  /**
   * Create SBI Prime workflow for premium customers
   */
  async createSBIPrimeWorkflow() {
    try {
      const existingWorkflow = await CallWorkflow.findOne({ 
        name: 'SBI Prime Credit Card Sales Flow' 
      });
      
      if (existingWorkflow) {
        console.log('SBI Prime workflow already exists');
        return existingWorkflow;
      }

      // Copy the SimplySave workflow structure but with premium content
      const simplySaveWorkflow = await CallWorkflow.findOne({ 
        name: 'SBI SimplySave Credit Card Sales Flow' 
      });
      
      if (!simplySaveWorkflow) {
        throw new Error('SimplySave workflow must be created first');
      }

      const primeWorkflowData = JSON.parse(JSON.stringify(simplySaveWorkflow.toObject()));
      delete primeWorkflowData._id;
      delete primeWorkflowData.createdAt;
      delete primeWorkflowData.updatedAt;

      // Customize for SBI Prime
      primeWorkflowData.name = 'SBI Prime Credit Card Sales Flow';
      primeWorkflowData.description = 'Premium 8-step call flow for SBI Prime Credit Card sales';
      
      // Update benefits step for premium card
      const benefitsStep = primeWorkflowData.steps.find(step => step.id === 'benefits');
      if (benefitsStep) {
        benefitsStep.template.english = "Sir, I am calling about the premium {{cardName}}. Here are the exclusive benefits: High cashback on premium purchases, Complimentary airport lounge access, Premium rewards and benefits, Exclusive dining privileges, and comprehensive travel insurance. This card is designed for your premium lifestyle.";
        benefitsStep.template.hindi = "सर, मैं प्रीमियम {{cardName}} के बारे में कॉल कर रही हूं। इसके अनन्य लाभ हैं: प्रीमियम खरीदारी पर उच्च कैशबैक, मुफ्त एयरपोर्ट लाउंज एक्सेस, प्रीमियम रिवार्ड्स और लाभ, विशेष डाइनिंग विशेषाधिकार, और व्यापक यात्रा बीमा। यह कार्ड आपकी प्रीमियम जीवनशैली के लिए डिज़ाइन किया गया है।";
      }

      // Update card configuration
      primeWorkflowData.cardConfigurations = [
        {
          cardType: 'sbi_prime',
          variables: {
            cardName: 'SBI Prime Credit Card',
            bankName: 'SBI Bank',
            agentName: 'Priya',
            welcomeBonus: 'High cashback on premium purchases',
            rewardPoints: 'Premium rewards and benefits',
            diningRewards: 'Exclusive dining privileges',
            annualFee: 'Premium benefits justify the annual fee'
          }
        }
      ];

      const primeWorkflow = new CallWorkflow(primeWorkflowData);
      await primeWorkflow.save();
      
      console.log('SBI Prime workflow created successfully');
      return primeWorkflow;

    } catch (error) {
      console.error('Error creating SBI Prime workflow:', error);
      throw error;
    }
  }

  /**
   * Create workflows for different banks
   */
  async createHDFCWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'HDFC Bank',
      bankDisplayName: 'HDFC',
      agentName: 'Priya',
      cardName: 'MoneyBack Credit Card',
      cardType: 'hdfc_moneyback',
      workflowName: 'MoneyBack Credit Card Sales Flow'
    });
  }

  async createICICIWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'ICICI Bank',
      bankDisplayName: 'ICICI',
      agentName: 'Priya',
      cardName: 'Amazon Pay Credit Card',
      cardType: 'icici_amazon',
      workflowName: 'Amazon Pay Credit Card Sales Flow'
    });
  }

  async createAxisWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'Axis Bank',
      bankDisplayName: 'Axis',
      agentName: 'Priya',
      cardName: 'Flipkart Credit Card',
      cardType: 'axis_flipkart',
      workflowName: 'Flipkart Credit Card Sales Flow'
    });
  }

  async createKotakWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'Kotak Mahindra Bank',
      bankDisplayName: 'Kotak',
      agentName: 'Priya',
      cardName: '811 Credit Card',
      cardType: 'kotak_811',
      workflowName: '811 Credit Card Sales Flow'
    });
  }

  async createYesBankWorkflow() {
    return await this.createDynamicCreditCardWorkflow({
      bankName: 'Yes Bank',
      bankDisplayName: 'Yes Bank',
      agentName: 'Priya',
      cardName: 'First Exclusive Credit Card',
      cardType: 'yes_first_exclusive',
      workflowName: 'First Exclusive Credit Card Sales Flow'
    });
  }

  async createCustomBankWorkflow(bankConfig) {
    return await this.createDynamicCreditCardWorkflow(bankConfig);
  }

  /**
   * Get workflow for different banks and card types
   */
  async getWorkflowForCard(cardType) {
    try {
      const workflowMap = {
        // SBI Cards
        'sbi_simplysave': 'SBI SimplySave Credit Card Sales Flow',
        'sbi_prime': 'SBI Prime Credit Card Sales Flow',
        
        // HDFC Cards
        'hdfc_moneyback': 'HDFC MoneyBack Credit Card Sales Flow',
        
        // ICICI Cards
        'icici_amazon': 'ICICI Amazon Pay Credit Card Sales Flow',
        
        // Axis Cards
        'axis_flipkart': 'Axis Flipkart Credit Card Sales Flow',
        
        // Kotak Cards
        'kotak_811': 'Kotak 811 Credit Card Sales Flow',
        
        // Yes Bank Cards
        'yes_first_exclusive': 'Yes Bank First Exclusive Credit Card Sales Flow'
      };

      const workflowName = workflowMap[cardType] || workflowMap['sbi_simplysave'];
      
      const workflow = await CallWorkflow.findOne({ 
        name: workflowName,
        isActive: true 
      });

      return workflow;
    } catch (error) {
      console.error('Error getting workflow for card:', error);
      return null;
    }
  }

  /**
   * Get workflow by bank name and card type
   */
  async getWorkflowByBank(bankName, cardType = 'default') {
    try {
      const bankWorkflowMap = {
        'sbi': cardType === 'prime' ? 'SBI Prime Credit Card Sales Flow' : 'SBI SimplySave Credit Card Sales Flow',
        'hdfc': 'HDFC MoneyBack Credit Card Sales Flow',
        'icici': 'ICICI Amazon Pay Credit Card Sales Flow',
        'axis': 'Axis Flipkart Credit Card Sales Flow',
        'kotak': 'Kotak 811 Credit Card Sales Flow',
        'yesbank': 'Yes Bank First Exclusive Credit Card Sales Flow'
      };

      const workflowName = bankWorkflowMap[bankName.toLowerCase()] || bankWorkflowMap['sbi'];
      
      const workflow = await CallWorkflow.findOne({ 
        name: workflowName,
        isActive: true 
      });

      return workflow;
    } catch (error) {
      console.error('Error getting workflow by bank:', error);
      return null;
    }
  }

  /**
   * Create a test call with the workflow
   */
  async createTestCall(cardType = 'sbi_simplysave') {
    try {
      const workflow = await this.getWorkflowForCard(cardType);
      if (!workflow) {
        throw new Error(`No workflow found for card type: ${cardType}`);
      }

      // Create or find a test script
      const Script = require('../models/Script');
      let testScript = await Script.findOne({ name: 'Test SBI SimplySave Script' });
      if (!testScript) {
        testScript = new Script({
          name: 'Test SBI SimplySave Script',
          content: 'This is a test script for SBI SimplySave Credit Card sales',
          language: 'english',
          scriptType: 'credit_card',
          cardFeatures: ['Welcome Benefits', 'Cashback', 'Reward Points'],
          interestRate: '3.5% per month',
          annualFee: 'Free for first year',
          rewardPoints: '5 reward points for every ₹100 spent'
        });
        await testScript.save();
      }

      // Create or find a test prompt
      const Prompt = require('../models/Prompt');
      let testPrompt = await Prompt.findOne({ name: 'Test Credit Card Sales Prompt' });
      if (!testPrompt) {
        testPrompt = new Prompt({
          name: 'Test Credit Card Sales Prompt',
          content: 'You are a professional telecaller selling SBI credit cards. Be friendly and persuasive.',
          category: 'sales',
          isActive: true
        });
        await testPrompt.save();
      }

      // Create a test call record with valid scriptId and promptId
      const Call = require('../models/Call');
      const testCallRecord = new Call({
        customerNumber: '+91-9999999999',
        status: 'initiating',
        scriptId: testScript._id,
        promptId: testPrompt._id
      });
      await testCallRecord.save();

      const workflowEngine = require('../services/workflowEngine');
      const testCallId = `test_${Date.now()}`;

      const result = await workflowEngine.startCallFlow(testCallId, workflow._id, {
        callRecordId: testCallRecord._id,
        variables: {
          cardType: cardType,
          agentName: 'Priya',
          bankName: 'SBI Bank',
          customerNumber: '+91-9999999999'
        },
        language: 'english'
      });

      console.log('Test call created successfully:', testCallId);
      return { testCallId, result, callRecordId: testCallRecord._id };

    } catch (error) {
      console.error('Error creating test call:', error);
      throw error;
    }
  }
}

module.exports = new WorkflowInitializer();
