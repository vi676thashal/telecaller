/**
 * Credit Card Sales Controller
 * 
 * Manages the credit card sales call flow, customer interactions,
 * and sales analytics for AI voice agent
 */

const Call = require('../models/Call');
const Script = require('../models/Script');
const Prompt = require('../models/Prompt');
const callAnalyticsService = require('./callAnalyticsService');
const openaiService = require('./openaiService');
const twilioService = require('./twilioService');
const { logger } = require('../utils/logger');

class CreditCardSalesController {
  constructor() {
    this.activeCallSessions = new Map();
    this.cardTypes = {
      rewards: {
        benefits: ['Points on every purchase', 'Reward redemption options', 'Welcome bonus points'],
        targetCustomer: 'Regular spenders who want to earn rewards'
      },
      cashback: {
        benefits: ['Cash back on all purchases', 'Higher rates in select categories', 'Direct statement credit'],
        targetCustomer: 'Value-oriented customers who prefer cash over points'
      },
      travel: {
        benefits: ['Travel insurance', 'Airport lounge access', 'No foreign transaction fees'],
        targetCustomer: 'Frequent travelers looking for travel perks'
      },
      secured: {
        benefits: ['Build credit history', 'Lower approval requirements', 'Graduate to unsecured card'],
        targetCustomer: 'Customers looking to establish or rebuild credit'
      },
      business: {
        benefits: ['Separate business expenses', 'Employee cards', 'Business-specific rewards'],
        targetCustomer: 'Business owners and entrepreneurs'
      },
      premium: {
        benefits: ['Concierge service', 'Higher credit limits', 'Premium travel benefits'],
        targetCustomer: 'High-income individuals seeking premium benefits'
      }
    };
    
    // Common objections and responses
    this.objections = {
      fees: [
        "The annual fee is waived for the first year, and the rewards you earn typically offset the fee in subsequent years.",
        "When you consider the benefits and rewards, the fee actually pays for itself for most customers."
      ],
      interest_rate: [
        "We offer competitive rates starting at 14.99% APR, but you can avoid interest entirely by paying your balance in full each month.",
        "Our rates are among the lowest in the industry for this type of card, and you'll have a grace period on new purchases."
      ],
      approval: [
        "Our digital application process is quick and simple, taking less than 5 minutes to complete and get an instant decision.",
        "We have options for various credit profiles, and I can help determine which card would be best suited for you."
      ],
      alternatives: [
        "Our rewards program offers more value than competitors, with higher earning rates and more flexible redemption options.",
        "What sets our card apart is the combination of rewards, benefits, and customer service that other cards can't match."
      ]
    };
  }

  /**
   * Initialize a new credit card sales call
   * @param {string} callId - Call identifier
   * @param {object} callInfo - Call information
   * @returns {object} Call session
   */
  async initializeCall(callId, callInfo) {
    try {
      logger.info(`Initializing credit card sales call: ${callId}`);
      
      // Get card type details
      const cardType = callInfo.cardType || 'premium';
      const cardDetails = this.cardTypes[cardType] || this.cardTypes.premium;
      
      // Get script and prompt
      let script = null;
      let prompt = null;
      
      if (callInfo.scriptId) {
        script = await Script.findById(callInfo.scriptId);
      } else {
        // Find default credit card script
        script = await Script.findOne({
          name: { $regex: /credit card/i }
        });
      }
      
      if (callInfo.promptId) {
        prompt = await Prompt.findById(callInfo.promptId);
      } else {
        // Find default sales prompt
        prompt = await Prompt.findOne({
          name: { $regex: /sales|credit card/i }
        });
      }
      
      // If script or prompt not found, create default
      if (!script) {
        script = {
          content: `You are a credit card sales agent for a premium bank. You're calling about our ${cardType} credit card.`
        };
      }
      
      if (!prompt) {
        prompt = {
          content: "You are a professional and friendly sales representative. Be persuasive but honest."
        };
      }
      
      // Create call session
      const callSession = {
        id: callId,
        startTime: new Date(),
        cardType,
        cardDetails,
        scriptContent: script.content,
        promptContent: prompt.content,
        language: callInfo.language || 'english',
        customerInfo: {
          name: callInfo.customerName,
          phoneNumber: callInfo.phoneNumber
        },
        salesStage: 'introduction',
        leadStatus: 'new',
        objections: [],
        customerInterest: 'unknown',
        applicationStarted: false,
        nextActions: []
      };
      
      // Store call session
      this.activeCallSessions.set(callId, callSession);
      
      // Initialize analytics
      callAnalyticsService.initializeCall(callId, {
        type: 'credit_card_sales',
        cardType,
        language: callInfo.language
      });
      
      logger.info(`Credit card sales call initialized: ${callId}, Card Type: ${cardType}`);
      
      return callSession;
    } catch (error) {
      logger.error(`Error initializing credit card sales call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Process user message and update call status
   * @param {string} callId - Call identifier
   * @param {string} message - User message
   * @returns {object} Updated status and next actions
   */
  async processUserMessage(callId, message) {
    try {
      const callSession = this.activeCallSessions.get(callId);
      if (!callSession) {
        throw new Error(`Call session not found for ID: ${callId}`);
      }
      
      // Analyze message for intent, objections, and interest
      const analysis = await this._analyzeUserMessage(callId, message);
      
      // Update call session with analysis
      callSession.customerInterest = analysis.interest || callSession.customerInterest;
      
      if (analysis.objection && !callSession.objections.includes(analysis.objection)) {
        callSession.objections.push(analysis.objection);
      }
      
      if (analysis.salesStage) {
        callSession.salesStage = analysis.salesStage;
      }
      
      // Determine lead status
      if (analysis.interest === 'high') {
        callSession.leadStatus = 'hot';
      } else if (analysis.interest === 'medium') {
        callSession.leadStatus = 'warm';
      } else if (analysis.interest === 'low') {
        callSession.leadStatus = 'cold';
      }
      
      // Check if application started
      if (analysis.applicationIntent) {
        callSession.applicationStarted = true;
      }
      
      // Update call record in database
      await Call.findByIdAndUpdate(callId, {
        $set: {
          customerInterest: callSession.customerInterest,
          leadQuality: callSession.leadStatus,
          objections: callSession.objections,
          applicationStarted: callSession.applicationStarted,
          salesStage: callSession.salesStage
        }
      });
      
      // Generate next actions based on updated state
      callSession.nextActions = this._generateNextActions(callSession);
      
      // Update call session in memory
      this.activeCallSessions.set(callId, callSession);
      
      return {
        customerInterest: callSession.customerInterest,
        leadStatus: callSession.leadStatus,
        objections: callSession.objections,
        salesStage: callSession.salesStage,
        applicationStarted: callSession.applicationStarted,
        nextActions: callSession.nextActions
      };
    } catch (error) {
      logger.error(`Error processing user message for call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze user message for intent, objections, and interest
   * @param {string} callId - Call identifier
   * @param {string} message - User message
   * @returns {object} Analysis results
   * @private
   */
  async _analyzeUserMessage(callId, message) {
    try {
      const callSession = this.activeCallSessions.get(callId);
      if (!callSession) {
        throw new Error(`Call session not found for ID: ${callId}`);
      }
      
      // Simple keyword-based analysis
      const lowerMessage = message.toLowerCase();
      
      // Default analysis
      const analysis = {
        interest: null,
        objection: null,
        salesStage: null,
        applicationIntent: false
      };
      
      // Check for interest level
      if (/(interested|sign me up|tell me more|sounds good|benefits)/i.test(lowerMessage)) {
        analysis.interest = 'high';
      } else if (/(maybe|might be|consider|think about|how much|compare)/i.test(lowerMessage)) {
        analysis.interest = 'medium';
      } else if (/(not interested|no thanks|too expensive|high fee|later|not now)/i.test(lowerMessage)) {
        analysis.interest = 'low';
      }
      
      // Check for objections
      if (/(annual fee|yearly fee|how much is the fee|expensive fee)/i.test(lowerMessage)) {
        analysis.objection = 'fees';
      } else if (/(interest rate|apr|interest too high)/i.test(lowerMessage)) {
        analysis.objection = 'interest_rate';
      } else if (/(will i qualify|credit score|get approved|qualify)/i.test(lowerMessage)) {
        analysis.objection = 'approval';
      } else if (/(other card|different option|better offer|compare)/i.test(lowerMessage)) {
        analysis.objection = 'alternatives';
      }
      
      // Check for application intent
      if (/(apply|sign me up|start application|get card|proceed)/i.test(lowerMessage)) {
        analysis.applicationIntent = true;
        analysis.salesStage = 'application';
      }
      
      // Check for sales stage progression
      if (/(what are the benefits|features|perks|advantages)/i.test(lowerMessage)) {
        analysis.salesStage = 'features';
      } else if (/(how does it work|process|steps|approval)/i.test(lowerMessage)) {
        analysis.salesStage = 'qualification';
      } else if (/(compare|difference|better than|versus)/i.test(lowerMessage)) {
        analysis.salesStage = 'comparison';
      } else if (/(let me think|call back|not now)/i.test(lowerMessage)) {
        analysis.salesStage = 'closing';
      }
      
      return analysis;
    } catch (error) {
      logger.error(`Error analyzing user message for call ${callId}:`, error);
      return {
        interest: null,
        objection: null,
        salesStage: null,
        applicationIntent: false
      };
    }
  }

  /**
   * Generate next actions based on call session state
   * @param {object} callSession - Call session
   * @returns {array} Next actions
   * @private
   */
  _generateNextActions(callSession) {
    try {
      const nextActions = [];
      
      // Based on sales stage
      switch (callSession.salesStage) {
        case 'introduction':
          nextActions.push({
            action: 'explain_benefits',
            priority: 'high',
            message: `Explain the key benefits of the ${callSession.cardType} credit card`
          });
          break;
          
        case 'features':
          nextActions.push({
            action: 'detail_features',
            priority: 'high',
            message: `Provide detailed features of the ${callSession.cardType} credit card`
          });
          break;
          
        case 'qualification':
          nextActions.push({
            action: 'explain_process',
            priority: 'high',
            message: 'Explain the application and approval process'
          });
          break;
          
        case 'comparison':
          nextActions.push({
            action: 'compare_options',
            priority: 'high',
            message: 'Compare this card with alternatives and highlight advantages'
          });
          break;
          
        case 'objection_handling':
          // Find latest objection
          const latestObjection = callSession.objections.length > 0 ? 
            callSession.objections[callSession.objections.length - 1] : null;
          
          if (latestObjection) {
            nextActions.push({
              action: 'handle_objection',
              priority: 'high',
              message: `Address objection about ${latestObjection}`,
              objection: latestObjection
            });
          }
          break;
          
        case 'application':
          nextActions.push({
            action: 'start_application',
            priority: 'high',
            message: 'Guide customer through starting the application'
          });
          break;
          
        case 'closing':
          if (callSession.customerInterest === 'high') {
            nextActions.push({
              action: 'close_sale',
              priority: 'high',
              message: 'Close the sale and confirm next steps'
            });
          } else {
            nextActions.push({
              action: 'soft_close',
              priority: 'high',
              message: 'Thank the customer and leave the door open for future interest'
            });
          }
          break;
          
        default:
          // Default next action
          nextActions.push({
            action: 'build_rapport',
            priority: 'medium',
            message: 'Continue building rapport and identify customer needs'
          });
      }
      
      // Add objection handling if there are objections
      if (callSession.objections.length > 0 && callSession.salesStage !== 'objection_handling') {
        nextActions.push({
          action: 'transition_to_objection_handling',
          priority: 'high',
          message: 'Address customer objections before proceeding'
        });
      }
      
      // Add closing action if customer interest is high
      if (callSession.customerInterest === 'high' && !callSession.applicationStarted 
          && callSession.salesStage !== 'application' && callSession.salesStage !== 'closing') {
        nextActions.push({
          action: 'suggest_application',
          priority: 'high',
          message: 'Suggest starting the application process'
        });
      }
      
      return nextActions;
    } catch (error) {
      logger.error('Error generating next actions:', error);
      return [];
    }
  }

  /**
   * End call and save final state
   * @param {string} callId - Call identifier
   * @returns {object} Call outcome
   */
  async endCall(callId) {
    try {
      const callSession = this.activeCallSessions.get(callId);
      if (!callSession) {
        throw new Error(`Call session not found for ID: ${callId}`);
      }
      
      // Determine final outcome
      let outcome = 'completed';
      if (callSession.applicationStarted) {
        outcome = 'application_initiated';
      } else if (callSession.customerInterest === 'high') {
        outcome = 'interested_no_application';
      } else if (callSession.customerInterest === 'low') {
        outcome = 'not_interested';
      }
      
      // Calculate duration
      const endTime = new Date();
      const duration = Math.round((endTime - callSession.startTime) / 1000); // in seconds
      
      // Update call record
      await Call.findByIdAndUpdate(callId, {
        $set: {
          status: 'completed',
          endTime,
          duration,
          outcome
        }
      });
      
      // Clean up session
      this.activeCallSessions.delete(callId);
      
      // Log call completion
      logger.info(`Credit card sales call ${callId} completed. Outcome: ${outcome}, Duration: ${duration}s`);
      
      return {
        outcome,
        duration,
        customerInterest: callSession.customerInterest,
        leadStatus: callSession.leadStatus,
        objections: callSession.objections,
        applicationStarted: callSession.applicationStarted
      };
    } catch (error) {
      logger.error(`Error ending call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Get objection handling response
   * @param {string} objectionType - Type of objection
   * @returns {string} Response to objection
   */
  getObjectionResponse(objectionType) {
    const responses = this.objections[objectionType];
    if (!responses || responses.length === 0) {
      return "I understand your concern. Let me address that for you.";
    }
    
    // Return a random response from the list
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Get card benefits based on type
   * @param {string} cardType - Card type
   * @returns {object} Card benefits and target customer
   */
  getCardBenefits(cardType) {
    return this.cardTypes[cardType] || this.cardTypes.premium;
  }

  /**
   * Get all active call sessions
   * @returns {Map} Active call sessions
   */
  getAllActiveSessions() {
    return this.activeCallSessions;
  }
}

// Create singleton instance
const creditCardSalesController = new CreditCardSalesController();
module.exports = creditCardSalesController;
