/**
 * ULTRA-FAST RESPONSE OPTIMIZER
 * Optimizes response timing to achieve human-like conversation flow
 * 
 * This service implements several optimization strategies:
 * 1. Response caching for instant replies
 * 2. Predictive response generation
 * 3. Pre-computed audio synthesis
 * 4. Streaming transcription
 * 5. Parallel processing pipelines
 * 6. STRICT WORKFLOW ENFORCEMENT - Ensures telecaller behavior
 */

const { EventEmitter } = require('events');
const zeroLatencyConfig = require('../config/zeroLatencyConfig');
const workflowEngine = require('./workflowEngine'); // Import workflow engine

class UltraFastResponseOptimizer extends EventEmitter {
  constructor() {
    super();
    
    // Response caching for instant delivery
    this.responseCache = new Map();
    this.audioCache = new Map();
    this.commonResponses = new Map();
    
    // Predictive response generation
    this.contextPredictions = new Map();
    this.conversationPatterns = new Map();
    
    // Pre-processed audio for instant playback
    this.preComputedAudio = new Map();
    
    // Performance tracking
    this.optimizationMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      predictiveHits: 0,
      averageOptimizedTime: 0
    };
    
    // TELECALLER MODE ENFORCEMENT
    this.strictTelecallerMode = true;
    this.forbiddenPhrases = [
      'how can I help you',
      'how may I assist you',
      'how can I assist you',
      'what can I help you with',
      'is there anything else you need',
      'anything else I can help with'
    ];
    
    this._initializeOptimizations();
  }
  
  /**
   * Initialize optimization strategies
   */
  _initializeOptimizations() {
    console.log('🚀 Initializing ultra-fast response optimizations...');
    
    // Pre-cache common responses
    this._preGenerateCommonResponses();
    
    // Pre-compute audio for instant responses
    this._preComputeCommonAudio();
    
    // Initialize conversation pattern learning
    this._initializePatternLearning();
    
    console.log('✅ Ultra-fast optimizations ready!');
  }
  
  /**
   * Initialize conversation pattern learning
   */
  _initializePatternLearning() {
    // Set up basic conversation patterns
    this.conversationPatterns.set('greeting_flow', ['yes', 'hello', 'hi']);
    this.conversationPatterns.set('interest_flow', ['interested', 'good', 'sounds good']);
    this.conversationPatterns.set('info_flow', ['tell me', 'explain', 'what', 'how']);
    
    console.log('🧠 Conversation pattern learning initialized');
  }
  
  /**
   * Pre-generate common responses for instant retrieval
   */
  _preGenerateCommonResponses() {
    // Initialize common responses for quick retrieval
    console.log('⚡ Pre-generating common responses...');
    
    // Pre-processed audio for instant playback
    this.preComputedAudio = new Map();
    
    // Performance tracking
    this.optimizationMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      predictiveHits: 0,
      averageOptimizedTime: 0
    };
    
    this._initializeOptimizations();
  }
  
  /**
   * Initialize optimization strategies
   */
  _initializeOptimizations() {
    console.log('🚀 Initializing ultra-fast response optimizations...');
    
    // Pre-cache common responses
    this._preGenerateCommonResponses();
    
    // Pre-compute audio for instant responses
    this._preComputeCommonAudio();
    
    // Initialize conversation pattern learning
    this._initializePatternLearning();
    
    console.log('✅ Ultra-fast optimizations ready!');
  }
  
  /**
   * Optimize response generation for ultra-low latency
   */
  async optimizeResponse(input, context = {}) {
    const optimizationStart = Date.now();
    
    try {
      // ENFORCE TELECALLER WORKFLOW - Check for questions/info requests first
      if (context.callId && workflowEngine) {
        try {
          // Get current call state if possible
          const callState = workflowEngine.activeCallStates?.get(context.callId);
          if (callState) {
            // Set the current step in context
            context.currentStep = callState.currentStep?.stepType;
            
            // Check if we need to force specific workflow behaviors
            if (!context.skipWorkflowCheck) {
              // Let the workflow engine handle questions/info requests
              const analysis = await workflowEngine.analyzeCustomerResponse(input, callState);
              if (analysis.intent === 'question' || analysis.intent === 'info_request') {
                const questionResponse = await workflowEngine.handleQuestion(callState, input);
                if (questionResponse) {
                  // Enforce telecaller behavior on the workflow response
                  questionResponse.content = this.enforceTelecallerWorkflow(
                    questionResponse.content, 
                    context.callId, 
                    questionResponse.stepType
                  );
                  
                  return {
                    ...questionResponse,
                    optimized: true,
                    source: 'workflow_engine',
                    responseTime: Date.now() - optimizationStart
                  };
                }
              }
            }
          }
        } catch (error) {
          console.error('Error integrating with workflow engine:', error);
          // Continue with normal optimization if workflow integration fails
        }
      }
      
      // 1. CHECK CACHE FIRST (0-5ms response time)
      const cachedResponse = this._getCachedResponse(input, context);
      if (cachedResponse) {
        // Add telecaller workflow enforcement
        const validatedContent = this.enforceTelecallerWorkflow(
          cachedResponse.content, 
          context.callId, 
          cachedResponse.stepType || context.currentStep
        );
        
        this.optimizationMetrics.cacheHits++;
        console.log(`⚡ INSTANT CACHE HIT: ${Date.now() - optimizationStart}ms`);
        return {
          ...cachedResponse,
          content: validatedContent,
          optimized: true,
          source: 'cache',
          responseTime: Date.now() - optimizationStart
        };
      }
      
      // 2. CHECK PREDICTIVE RESPONSES (5-15ms response time)
      const predictedResponse = this._getPredictiveResponse(input, context);
      if (predictedResponse) {
        // Add telecaller workflow enforcement
        const validatedContent = this.enforceTelecallerWorkflow(
          predictedResponse.content, 
          context.callId, 
          predictedResponse.stepType || context.currentStep
        );
        
        this.optimizationMetrics.predictiveHits++;
        console.log(`🔮 PREDICTIVE HIT: ${Date.now() - optimizationStart}ms`);
        return {
          ...predictedResponse,
          content: validatedContent,
          optimized: true,
          source: 'predictive',
          responseTime: Date.now() - optimizationStart
        };
      }
      
      // 3. PARALLEL FAST GENERATION (20-50ms response time)
      const fastResponse = await this._generateFastResponse(input, context);
      
      // Add telecaller workflow enforcement to generated response
      const validatedFastResponse = {
        ...fastResponse,
        content: this.enforceTelecallerWorkflow(
          fastResponse.content, 
          context.callId, 
          fastResponse.stepType || context.currentStep
        )
      };
      
      // Cache for future use
      this._cacheResponse(input, context, validatedFastResponse);
      
      this.optimizationMetrics.cacheMisses++;
      const totalTime = Date.now() - optimizationStart;
      console.log(`⚡ FAST GENERATION: ${totalTime}ms`);
      
      return {
        ...validatedFastResponse,
        optimized: true,
        source: 'fast_generation',
        responseTime: totalTime
      };
      
    } catch (error) {
      console.error('❌ Response optimization failed:', error);
      // Even emergency responses must follow telecaller workflow
      const emergencyResponse = this._getEmergencyResponse();
      return {
        ...emergencyResponse,
        content: this.enforceTelecallerWorkflow(
          emergencyResponse.content, 
          context.callId, 
          context.currentStep || 'unknown'
        )
      };
    }
  }
  
  /**
   * Pre-generate common responses for instant delivery
   */
  _preGenerateCommonResponses() {
    const commonInputs = [
      'yes', 'no', 'okay', 'sure', 'alright',
      'what', 'how', 'when', 'where', 'why',
      'tell me more', 'explain', 'details',
      'interest rate', 'fees', 'benefits', 'rewards',
      'annual fee', 'cashback', 'application',
      'not interested', 'already have', 'too many cards'
    ];
    
    commonInputs.forEach(input => {
      const response = this._generateTemplateResponse(input);
      this.commonResponses.set(input.toLowerCase(), response);
    });
    
    console.log(`📋 Pre-generated ${commonInputs.length} common responses`);
  }
  
  /**
   * Pre-compute audio for instant playback
   */
  async _preComputeCommonAudio() {
    const commonTexts = [
      "Thank you for your interest.",
      "Let me tell you about the benefits.",
      "The annual fee is waived for the first year.",
      "You can earn cashback on all purchases.",
      "Would you like to proceed with the application?",
      "I understand your concern.",
      "That's a great question.",
      "Let me explain the details."
    ];
    
    // Note: In production, this would actually pre-generate audio
    commonTexts.forEach(text => {
      this.preComputedAudio.set(text.toLowerCase(), {
        audioUrl: `precomputed_${Date.now()}.wav`,
        duration: text.length * 50, // Estimated duration
        ready: true
      });
    });
    
    console.log(`🔊 Pre-computed ${commonTexts.length} audio responses`);
  }
  
  /**
   * Get cached response for instant delivery
   */
  _getCachedResponse(input, context) {
    const cacheKey = this._generateCacheKey(input, context);
    
    // Check exact match first
    let cached = this.responseCache.get(cacheKey);
    if (cached) return cached;
    
    // Check common responses
    cached = this.commonResponses.get(input.toLowerCase().trim());
    if (cached) return cached;
    
    // Check partial matches for flexible responses
    for (const [key, response] of this.commonResponses.entries()) {
      if (input.toLowerCase().includes(key)) {
        return response;
      }
    }
    
    return null;
  }
  
  /**
   * Get predictive response based on conversation pattern
   */
  _getPredictiveResponse(input, context) {
    const conversationState = context.currentStep || 'unknown';
    
    // Predict based on conversation flow
    const predictions = {
      'greeting': this._getGreetingResponse(input),
      'language_check': this._getLanguageResponse(input),
      'benefits': this._getBenefitsResponse(input),
      'collect_name': this._getDataCollectionResponse(input, 'name'),
      'collect_age': this._getDataCollectionResponse(input, 'age'),
      'application': this._getApplicationResponse(input)
    };
    
    return predictions[conversationState] || null;
  }
  
  /**
   * Generate fast response using optimized processing
   */
  async _generateFastResponse(input, context) {
    // Use parallel processing for speed
    const [transcriptionAnalysis, contextAnalysis, responseGeneration] = await Promise.all([
      this._fastTranscriptionAnalysis(input),
      this._fastContextAnalysis(context),
      this._fastResponseGeneration(input, context)
    ]);
    
    return {
      content: responseGeneration.content,
      stepType: responseGeneration.stepType,
      audioReady: false,
      optimizationApplied: true,
      analysisTime: transcriptionAnalysis.time + contextAnalysis.time + responseGeneration.time
    };
  }
  
  /**
   * Cache response for future instant delivery
   */
  _cacheResponse(input, context, response) {
    const cacheKey = this._generateCacheKey(input, context);
    
    // Only cache responses likely to be repeated
    if (this._isCommonQuery(input)) {
      this.responseCache.set(cacheKey, {
        ...response,
        cached: true,
        cacheTime: Date.now()
      });
      
      // Limit cache size
      if (this.responseCache.size > 500) {
        const oldestKey = this.responseCache.keys().next().value;
        this.responseCache.delete(oldestKey);
      }
    }
  }
  
  /**
   * Generate template responses for common inputs
   */
  _generateTemplateResponse(input) {
    const templates = {
      'yes': { content: "Great! Let me continue with the next step.", stepType: 'proceed' },
      'no': { content: "I understand. Thank you for your time.", stepType: 'closing' },
      'okay': { content: "Perfect! Let's move forward.", stepType: 'proceed' },
      'tell me more': { content: "I'd be happy to provide more details.", stepType: 'info_request' },
      'fees': { content: "The annual fee is waived for the first year, then ₹999 annually.", stepType: 'info_response' },
      'benefits': { content: "You'll earn cashback on purchases, enjoy no annual fee first year, and get exclusive offers.", stepType: 'info_response' },
      'interest rate': { content: "Interest rates range from 12% to 24% annually based on your credit profile.", stepType: 'info_response' },
      'not interested': { content: "I understand. Thank you for your time today.", stepType: 'closing' }
    };
    
    return templates[input.toLowerCase()] || null;
  }
  
  /**
   * Predictive responses for different conversation states
   */
  _getGreetingResponse(input) {
    if (input.toLowerCase().includes('yes') || input.toLowerCase().includes('hello')) {
      return { content: "Wonderful! Let me check your preferred language.", stepType: 'language_check' };
    }
    return null;
  }
  
  _getLanguageResponse(input) {
    if (input.toLowerCase().includes('english')) {
      return { content: "Perfect! Let me tell you about our exclusive credit card benefits.", stepType: 'benefits' };
    }
    if (input.toLowerCase().includes('hindi')) {
      return { content: "बहुत अच्छा! मैं आपको हमारे क्रेडिट कार्ड के फायदों के बारे में बताता हूं।", stepType: 'benefits' };
    }
    return null;
  }
  
  _getBenefitsResponse(input) {
    if (input.toLowerCase().includes('interested') || input.toLowerCase().includes('good')) {
      return { content: "Excellent! To proceed with your application, may I have your full name please?", stepType: 'collect_name' };
    }
    if (input.toLowerCase().includes('fee')) {
      return { content: "The annual fee is waived for the first year. Now, to proceed with your application, may I have your full name?", stepType: 'collect_name' };
    }
    return null;
  }
  
  _getDataCollectionResponse(input, field) {
    // For data collection, proceed to next field
    const nextFields = {
      'name': 'collect_age',
      'age': 'collect_occupation',
      'occupation': 'collect_income',
      'income': 'collect_city',
      'city': 'collect_email',
      'email': 'application'
    };
    
    return { content: `Thank you. Now, may I know your ${field === 'name' ? 'age' : 'details'}?`, stepType: nextFields[field] };
  }
  
  _getApplicationResponse(input) {
    if (input.toLowerCase().includes('yes') || input.toLowerCase().includes('proceed')) {
      return { content: "Excellent! I'll process your application now.", stepType: 'confirmation' };
    }
    return null;
  }
  
  /**
   * Enforce strict telecaller behavior - NEVER act like an assistant
   */
  enforceTelecallerWorkflow(response, callId, stepType) {
    if (!this.strictTelecallerMode || !response) {
      return response;
    }
    
    try {
      // Make sure we have access to the workflow engine and call state
      if (!workflowEngine) {
        console.warn('⚠️ WorkflowEngine not available, telecaller mode enforcement limited');
        return this._validateTelecallerResponse(response);
      }
      
      // Get call state through workflow engine if available
      const callState = workflowEngine.activeCallStates?.get(callId);
      if (!callState) {
        return this._validateTelecallerResponse(response);
      }
      
      // Determine correct next step from workflow
      const currentStepType = stepType || callState.currentStep?.stepType || 'unknown';
      
      // Check if response contains forbidden assistant-like phrases
      let validatedResponse = this._validateTelecallerResponse(response);
      
      // Enforce step progression based on 7-step workflow
      if (!validatedResponse.includes('your full name') && currentStepType === 'collect_name') {
        validatedResponse += " May I please have your full name to proceed with the application?";
      }
      else if (!validatedResponse.includes('age') && currentStepType === 'collect_age') {
        validatedResponse += " Could you please tell me your age?";
      }
      else if (!validatedResponse.includes('occupation') && currentStepType === 'collect_occupation') {
        validatedResponse += " What is your occupation?";
      }
      else if (!validatedResponse.includes('income') && currentStepType === 'collect_income') {
        validatedResponse += " May I know your monthly income?";
      }
      
      return validatedResponse;
    } catch (error) {
      console.error('Error enforcing telecaller workflow:', error);
      return this._validateTelecallerResponse(response);
    }
  }
  
  /**
   * CRITICAL INTEGRATION METHOD - Force any response to follow strict telecaller workflow
   * This method is the main entry point that should be called by voice-provider-service
   * before sending any response to the user.
   */
  enforceStrictTelecallerResponse(response, callId, stepType = null) {
    console.log(`🔒 ENFORCING STRICT TELECALLER MODE for call ${callId}`);
    
    try {
      // 1. First get call state from workflow engine
      const callState = workflowEngine?.activeCallStates?.get(callId);
      
      // 2. Determine current step in workflow
      const currentStep = stepType || callState?.currentStep?.stepType || 'unknown';
      console.log(`📊 Current workflow step: ${currentStep}`);
      
      // 3. Validate and filter out assistant-like responses
      let validatedResponse = this._validateTelecallerResponse(response, callId, currentStep);
      
      // 4. Check if we need to force progression to the next step based on workflow
      if (callState || stepType) {
        // Get the expected next step from workflow
        const nextStepType = callState ? workflowEngine.getNextStepFromWorkflow(
          currentStep, 
          callState.getIntent() || 'interested'
        ) : null;
        
        console.log(`🔄 ENFORCING WORKFLOW: ${currentStep} → ${nextStepType || 'next step'}`);
        
        // 5. Force the response to align with the workflow - ENHANCED ENFORCEMENT
        let hasWorkflowElement = false;
        
        // Helper function to check if response contains specific elements
        const containsElement = (text, elements) => {
          return elements.some(element => text.toLowerCase().includes(element.toLowerCase()));
        };
        
        // Helper function to add step element if missing
        const addStepElementIfMissing = (text, stepElements, addElement) => {
          if (!containsElement(text, stepElements)) {
            return text + " " + addElement;
          }
          return text;
        };
        
        switch (currentStep) {
          case 'greeting':
            // Force language check
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['language', 'english', 'hindi', 'prefer'],
              "What language would you prefer for our conversation?"
            );
            break;
            
          case 'language_check':
            // Force benefits presentation
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['benefit', 'advantage', 'feature', 'offer'],
              "Let me tell you about the amazing benefits of our credit card."
            );
            break;
            
          case 'benefits':
            // If user showed interest, move to data collection
            if (!callState || callState.getIntent() === 'interested') {
              validatedResponse = addStepElementIfMissing(
                validatedResponse,
                ['name', 'full name'],
                "To proceed with your application, may I have your full name please?"
              );
            }
            break;
            
          case 'collect_name':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['name', 'full name', 'your name'],
              "May I have your full name please?"
            );
            break;
            
          case 'collect_age':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['occupation', 'profession', 'work', 'job'],
              "What is your occupation?"
            );
            break;
            
          case 'collect_occupation':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['income', 'earning', 'salary', 'per month'],
              "May I know your monthly income?"
            );
            break;
            
          case 'collect_income':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['city', 'location', 'reside', 'live'],
              "What city do you reside in?"
            );
            break;
            
          case 'collect_city':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['email', 'mail', '@'],
              "Finally, could you share your email address?"
            );
            break;
            
          case 'collect_email':
            // Move to application step
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['application', 'process', 'submit', 'proceed'],
              "Thank you for providing all the details. Would you like to proceed with the application?"
            );
            break;
            
          case 'application':
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['process', 'submit', 'application', 'confirmation'],
              "I'm submitting your application now. You'll receive confirmation shortly."
            );
            break;
            
          case 'confirmation':
            // No additional elements needed for confirmation
            break;
            
          case 'closing':
            // Ensure proper closing
            validatedResponse = addStepElementIfMissing(
              validatedResponse,
              ['thank', 'appreciation', 'grateful'],
              "Thank you for your interest in our credit card offer."
            );
            break;
            
          default:
            // For any other step, make sure we're not acting like an assistant
            if (validatedResponse.toLowerCase().includes('help you with')) {
              validatedResponse = validatedResponse.replace(
                /help you with/i, 
                "tell you about our credit card"
              );
            }
            break;
        }
      }
      
      return validatedResponse;
    } catch (error) {
      console.error('Error enforcing strict telecaller response:', error);
      // Even if enforcement fails, we need to return something that sounds like a telecaller
      return this._validateTelecallerResponse(response || "Let me tell you about our credit card offer.");
    }
  }
  
  /**
   * Validate that a response follows telecaller behavior and not assistant-like behavior
   */
  _validateTelecallerResponse(response) {
    if (!response) return "Let me continue with our discussion about the credit card.";
    
    let validatedResponse = response;
    
    // ENHANCED: Check for all variations of forbidden assistant-like phrases
    const forbiddenPatterns = [
      // Generic assistant phrases
      /\b(how )?can I (help|assist) you( today| with anything| further| now)?/i,
      /\b(how )?may I (help|assist) you( today| with anything| further| now)?/i,
      /\bwhat can I (help|assist|do for) you( with)?( today| now)?/i,
      /\bis there anything (else )?(I can|I may) (help|assist) you with/i,
      /\banything else (I can|I may) (help|assist|do for)( you with)?/i,
      /\bhow can I be of (help|assistance|service)( today| to you| now)?/i,
      /\bwhat brings you here today\b/i,
      /\bwhat would you like to know\b/i,
      /\bI'm here to (help|assist)( you)?( today| now)?/i,
      /\bhow may I direct your (call|inquiry)\b/i,
      /\bwhat are you looking for( today)?\b/i,
      /\b(what|how) can I (help|assist|do)( for you)?( today)?\b/i,
      /\bplease let me know how I can (help|assist)( you)?\b/i,
      /\bhow would you like me to (help|assist)( you)?\b/i,
      /\bfeel free to ask( me)?( any)?( questions)?\b/i,
      /\bwould you like me to explain\b/i,  
      
      // ADDITIONAL PATTERNS TO CATCH
      /\bI'm happy to provide more information\b/i,
      /\bI can provide (more|additional) (information|details)\b/i,
      /\bwould you like me to explain\b/i,
      /\bI'd be happy to (help|assist|explain|clarify)\b/i,
      /\bis there (anything|something) specific\b/i,
      /\bare you interested in learning\b/i,
      /\bwhat (information|details) (would|are) you looking for\b/i,
      /\bdo you need (more|any) information\b/i,
      /\bwhat would you like to know more about\b/i,
      /\bI'm here to (address|answer) (your|any) (questions|concerns)\b/i,
      /\bdo you have (any|more) questions\b/i,
      /\blet me know if you need (anything|something) else\b/i,
      /\bfeel free to (ask|inquire)\b/i,
      /\bwhat (else|more) would you like to know\b/i,
      
      // AI self-identification phrases
      /\bI'm an AI\b/i,
      /\bI am an (AI|artificial intelligence)\b/i,
      /\bAs an AI\b/i,
      /\bI'm a (virtual|digital) (assistant|helper)\b/i,
      /\bI'm here to answer your questions\b/i,
      
      // Customer service generic greetings
      /\bhow are you doing today\b/i,
      /\bhave a (great|nice|wonderful) day\b/i,
      /\bhow's your day going\b/i,
      /\bhow has your day been\b/i,
      
      // Generic follow-ups
      /\banything else you need\b/i,
      /\bany other questions\b/i,
      /\bis there anything else\b/i,
      /\bis there something else\b/i,
      /\bdo you have any (other|more) questions\b/i,
      /\bwould you like to know anything else\b/i,
      /\bis there anything you'd like me to explain\b/i,
      /\bcan I clarify anything else for you\b/i,
      /\bI'd be happy to (help|assist) with anything else\b/i,
      /\bfeel free to ask (any|more) questions\b/i
    ];
    
    // Step-specific telecaller replacements for better context
    const telecallerReplacements = {
      // General replacements
      default: [
        "Let me tell you about our credit card benefits",
        "Our credit card offers excellent rewards",
        "To proceed with your credit card application",
        "This credit card is perfect for your needs",
        "I'd be happy to complete your credit card application today"
      ],
      
      // Step-specific replacements
      greeting: [
        "I'm calling about our exclusive credit card offer",
        "I'm reaching out about a special credit card opportunity",
        "I'm calling to tell you about our credit card promotion"
      ],
      
      language_check: [
        "Would you prefer to continue in English or another language?",
        "Let me know which language you'd prefer for discussing our credit card offer",
        "For better communication about our credit card, which language would you prefer?"
      ],
      
      benefits: [
        "Let me highlight the key benefits of our credit card",
        "Our credit card offers several outstanding benefits",
        "The main advantages of our credit card include"
      ],
      
      // ENHANCED COLLECTION STEP REPLACEMENTS
      collect_name: [
        "May I have your full name please?",
        "Could you share your full name to proceed with the credit card application?",
        "I'll need your full name for the credit card application"
      ],
      
      collect_age: [
        "Could you please tell me your age?",
        "May I know your age for the credit card application?",
        "What is your age please?"
      ],
      
      collect_occupation: [
        "What is your occupation?",
        "Could you share your profession?",
        "What work do you do?"
      ],
      
      collect_income: [
        "May I know your monthly income?",
        "What is your monthly income?",
        "Could you share your monthly earnings for the application?"
      ],
      
      collect_city: [
        "What city do you reside in?",
        "Which city are you located in?",
        "May I know which city you live in?"
      ],
      
      collect_email: [
        "Could you share your email address?",
        "What is your email address for sending the confirmation?",
        "May I have your email to send application updates?"
      ],
      
      application: [
        "Your credit card application will be processed as follows",
        "The next steps for your credit card application are",
        "Let me explain how your application will be processed"
      ],
      
      confirmation: [
        "To confirm your interest in our credit card offer",
        "Just to confirm that you'd like to proceed with the credit card application",
        "So you're interested in applying for our credit card, correct?"
      ],
      
      closing: [
        "Thank you for your interest in our credit card",
        "Your application for our credit card will be processed soon",
        "We appreciate your time discussing our credit card offer"
      ]
    };
    
    // Check for forbidden assistant-like phrases
    let replacementsNeeded = false;
    
    // Determine which set of replacements to use based on step context
    let stepCategory = 'default';
    
    // Map the current step to a replacement category if we have step-specific replacements
    if (arguments.length > 2 && arguments[2]) {
      const currentStep = arguments[2];
      
      // Map workflow steps to replacement categories
      if (currentStep === 'greeting') {
        stepCategory = 'greeting';
      } else if (currentStep === 'language_check') {
        stepCategory = 'language_check';
      } else if (currentStep === 'benefits') {
        stepCategory = 'benefits';
      } else if (currentStep.startsWith('collect_')) {
        // ENHANCED: Use specific collection step replacements
        stepCategory = currentStep;
      } else if (currentStep === 'application') {
        stepCategory = 'application';
      } else if (currentStep === 'confirmation') {
        stepCategory = 'confirmation';
      } else if (currentStep === 'closing') {
        stepCategory = 'closing';
      }
    }
    
    // Get the appropriate replacements for this context
    const contextReplacements = telecallerReplacements[stepCategory] || telecallerReplacements.default;
    
    // Check explicitly forbidden phrases
    for (const phrase of this.forbiddenPhrases) {
      if (validatedResponse.toLowerCase().includes(phrase.toLowerCase())) {
        // Replace assistant-like phrase with contextual telecaller-appropriate alternative
        validatedResponse = validatedResponse.replace(
          new RegExp(phrase, 'i'),
          contextReplacements[Math.floor(Math.random() * contextReplacements.length)]
        );
        replacementsNeeded = true;
      }
    }
    
    // Check patterns
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(validatedResponse)) {
        // Replace assistant-like phrase with contextual telecaller-appropriate alternative
        validatedResponse = validatedResponse.replace(
          pattern,
          contextReplacements[Math.floor(Math.random() * contextReplacements.length)]
        );
        replacementsNeeded = true;
      }
    }
    
    // Special check for closing sentence - make sure it stays on topic
    const lastSentence = validatedResponse.split('.').pop().trim();
    if (lastSentence && lastSentence.length > 5) {
      let containsAssistantClosing = false;
      
      // Check if the closing sentence sounds like an assistant
      if (/\bhelp|\bassist|\bquestion|\bneed|\banything else/i.test(lastSentence)) {
        containsAssistantClosing = true;
      }
      
      if (containsAssistantClosing) {
        // Replace just the last sentence with a telecaller-appropriate closing
        const teleCallerClosing = contextReplacements[Math.floor(Math.random() * contextReplacements.length)];
        validatedResponse = validatedResponse.substring(0, validatedResponse.lastIndexOf('.') + 1);
        validatedResponse += ' ' + teleCallerClosing;
        replacementsNeeded = true;
      }
    }
    
    // Log if we made a replacement
    if (replacementsNeeded) {
      console.log('⚠️ FIXED: Assistant-like phrasing detected and replaced with telecaller script');
      console.log(`🔄 Context: ${stepCategory}, Original response had assistant-like language`);
    }
    
    return validatedResponse;
  }
  
  /**
   * Fast analysis methods for parallel processing
   */
  async _fastTranscriptionAnalysis(input) {
    const startTime = Date.now();
    // Simulate fast transcription analysis
    await new Promise(resolve => setTimeout(resolve, 5));
    return { intent: 'general', confidence: 0.9, time: Date.now() - startTime };
  }
  
  async _fastContextAnalysis(context) {
    const startTime = Date.now();
    // Simulate fast context analysis
    await new Promise(resolve => setTimeout(resolve, 3));
    return { relevance: 'high', priority: 'normal', time: Date.now() - startTime };
  }
  
  async _fastResponseGeneration(input, context) {
    const startTime = Date.now();
    
    try {
      // Extract call information
      const callId = context.callId || '';
      const currentStep = context.currentStep || '';
      
      // Create basic response
      let response = { 
        content: "I understand. Let me help you with that.",
        stepType: currentStep || 'unknown',
        time: 0
      };
      
      // Check for specific workflow steps and force appropriate responses
      if (input.toLowerCase().includes('help') || input.toLowerCase().includes('assist')) {
        // This is likely an assistant-like response - redirect to credit card telecaller script
        response.content = "Our SimplySAVE credit card offers great rewards on everyday purchases. Would you be interested in applying today?";
      } 
      else if (currentStep === 'greeting') {
        response.content = "Hello! This is Priya from SBI Bank. I'm calling to tell you about our exclusive SimplySAVE credit card offer that's perfect for your spending habits.";
        response.stepType = 'language_check';
      }
      else if (currentStep === 'language_check') {
        response.content = "Great! Let me tell you about the amazing benefits of our SimplySAVE card. You get 5% cashback on all grocery purchases, 3% on fuel, and 1% on everything else.";
        response.stepType = 'benefits';
      }
      else if (currentStep === 'benefits' && (input.toLowerCase().includes('yes') || input.toLowerCase().includes('interest'))) {
        response.content = "Wonderful! To proceed with your application, may I have your full name please?";
        response.stepType = 'collect_name';
      }
      else if (currentStep.startsWith('collect_')) {
        const field = currentStep.replace('collect_', '');
        const collectedInfo = input.trim();
        
        // Store collected information and move to next step in workflow
        if (field === 'name') {
          response.content = `Thank you, ${collectedInfo}. May I know your age?`;
          response.stepType = 'collect_age';
        }
        else if (field === 'age') {
          response.content = `Thank you for sharing that. What is your occupation?`;
          response.stepType = 'collect_occupation';
        }
        else if (field === 'occupation') {
          response.content = `Great. Could you please share your monthly income?`;
          response.stepType = 'collect_income';
        }
        else if (field === 'income') {
          response.content = `Thank you. In which city do you reside?`;
          response.stepType = 'collect_city';
        }
        else if (field === 'city') {
          response.content = `Perfect. Finally, may I have your email address?`;
          response.stepType = 'collect_email';
        }
        else if (field === 'email') {
          response.content = `Thank you for providing all the required information. I'll now submit your application for the SimplySAVE credit card.`;
          response.stepType = 'application';
        }
      }
      
      // Important: Enforce telecaller behavior
      response.content = this.enforceTelecallerWorkflow(response.content, callId, response.stepType);
      
      response.time = Date.now() - startTime;
      return response;
    } catch (error) {
      console.error('Error in fast response generation:', error);
      return { 
        content: "Let me tell you about our credit card offers. The SimplySAVE card has excellent benefits.",
        stepType: 'benefits',
        time: Date.now() - startTime 
      };
    }
  }
  
  /**
   * Utility methods
   */
  _generateCacheKey(input, context) {
    return `${input.toLowerCase().trim()}_${context.currentStep || 'unknown'}`;
  }
  
  _isCommonQuery(input) {
    const commonWords = ['what', 'how', 'fees', 'rate', 'benefits', 'yes', 'no', 'tell', 'explain'];
    return commonWords.some(word => input.toLowerCase().includes(word));
  }
  
  _getEmergencyResponse() {
    // Always use telecaller phrasing - never say "How can I help you?"
    return {
      content: "I'm calling about the SBI SimplySAVE credit card. To proceed with this excellent offer, I need a few details from you. Could you please let me know if you're interested?",
      stepType: "benefits", // Always default to benefits to keep the workflow moving
      optimized: false,
      source: 'emergency',
      responseTime: 0
    };
  }
  
  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    const totalRequests = this.optimizationMetrics.cacheHits + this.optimizationMetrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.optimizationMetrics.cacheHits / totalRequests) * 100 : 0;
    
    return {
      cacheHitRate: Math.round(cacheHitRate),
      totalCacheHits: this.optimizationMetrics.cacheHits,
      totalCacheMisses: this.optimizationMetrics.cacheMisses,
      predictiveHits: this.optimizationMetrics.predictiveHits,
      cacheSize: this.responseCache.size,
      preComputedResponses: this.commonResponses.size,
      preComputedAudio: this.preComputedAudio.size
    };
  }
  
  /**
   * Clear caches and reset
   */
  clearOptimizations() {
    this.responseCache.clear();
    this.audioCache.clear();
    this.contextPredictions.clear();
    this.optimizationMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      predictiveHits: 0,
      averageOptimizedTime: 0
    };
  }
}

module.exports = new UltraFastResponseOptimizer();
