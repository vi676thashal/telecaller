const CallWorkflow = require('../models/CallWorkflow');
const CallState = require('../models/CallState');
const KnowledgeBase = require('../models/KnowledgeBase');
const Call = require('../models/Call');
const openaiService = require('./openaiService');
const customerDataCollectionService = require('./customerDataCollectionService');

class WorkflowEngine {
  constructor() {
    this.activeCallStates = new Map(); // In-memory cache for active calls
  }

  /**
   * Get next step ID based on current step and customer intent - ENHANCED WITH DATA COLLECTION
   */
  getNextStepFromWorkflow(currentStepType, intent, collectedData = {}) {
    // ENHANCED 7-STEP FLOW WITH DATA COLLECTION: 
    // Greeting → Language → Benefits → Details Collection → Application → Confirmation → Closing
    const flowMap = {
      // Step 1 → Step 2: Always go to language check after greeting
      'greeting': 'language_check',
      
      // Step 2 → Step 3: Always present benefits after language selection
      'language_check': 'benefits',
      
      // Step 3 → Step 4/5: After benefits presentation - FIXED TO USE CORRECT STEP TYPE
      'benefits': intent === 'not_interested' ? 'closing' : 
                  intent === 'objection' ? 'objection_handling' : 'collect_name',
      
      // Step 4: Objection handling → back to benefits or close
      'objection_handling': intent === 'not_interested' ? 'closing' : 'collect_name',
      
      // Step 5: Data collection sub-steps - START WITH COLLECT_NAME
      'collect_name': 'collect_age',
      'collect_age': 'collect_occupation', 
      'collect_occupation': 'collect_income',
      'collect_income': 'collect_city',
      'collect_city': 'collect_email',
      'collect_email': 'application',
      
      // Step 6: After collecting details, confirm application
      'application': intent === 'not_interested' ? 'closing' : 'confirmation',
      
      // Step 7: Confirmation → END (successful close)
      'confirmation': null,
      
      // Step 8: Closing → END
      'closing': null
    };

    const nextStep = flowMap[currentStepType];
    console.log(`🔄 ENHANCED FLOW: ${currentStepType} → ${nextStep} (Intent: ${intent})`);
    return nextStep;
  }

  /**
   * Determine next data collection step based on what's already collected
   */
  getDataCollectionNextStep(collectedData) {
    if (!collectedData.name) return 'collect_name';
    if (!collectedData.age) return 'collect_age';
    if (!collectedData.occupation) return 'collect_occupation';
    if (!collectedData.monthlyIncome) return 'collect_income';
    if (!collectedData.city) return 'collect_city';
    if (!collectedData.email) return 'collect_email';
    return 'application'; // All data collected, proceed to application
  }

  /**
   * Start a new call flow
   */
  async startCallFlow(callId, workflowId, initialData = {}) {
    try {
      console.log(`Starting call flow for call ${callId} with workflow ${workflowId}`);
      
      // Load the workflow
      const workflow = await CallWorkflow.findById(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // Find the first step (greeting)
      const firstStep = workflow.steps.find(step => step.type === 'greeting');
      if (!firstStep) {
        throw new Error('No greeting step found in workflow');
      }

      // Merge initial variables with workflow card configuration variables
      let allVariables = initialData.variables || {};
      if (workflow.cardConfigurations && workflow.cardConfigurations.length > 0) {
        const cardConfig = workflow.cardConfigurations[0];
        // Convert Map to object if needed
        const cardVariables = cardConfig.variables instanceof Map 
          ? Object.fromEntries(cardConfig.variables) 
          : cardConfig.variables;
        allVariables = { ...cardVariables, ...allVariables };
      }

      // Create initial call state
      const callState = new CallState({
        callId: callId,
        callRecord: initialData.callRecordId,
        workflowId: workflowId,
        language: initialData.language || 'english',
        currentStep: {
          stepId: firstStep.id,
          stepName: firstStep.name,
          stepType: firstStep.type,
          startTime: new Date(),
          attemptCount: 1
        },
        variables: new Map(Object.entries(allVariables))
      });

      await callState.save();
      this.activeCallStates.set(callId, callState);

      // Generate the first step content
      const content = await this.generateStepContent(workflow, firstStep, callState);
      
      console.log(`Call flow started successfully for ${callId}`);
      return {
        stepId: firstStep.id,
        stepType: firstStep.type,
        content: content,
        language: callState.language,
        variables: Object.fromEntries(callState.variables),
        nextExpectedResponses: firstStep.expectedResponses
      };

    } catch (error) {
      console.error('Error starting call flow:', error);
      throw error;
    }
  }

  /**
   * Process customer response and determine next step with data collection
   */
  async processCustomerResponse(callId, customerResponse, audioData = null) {
    try {
      console.log(`Processing response for call ${callId}: "${customerResponse}"`);
      
      // Get current call state
      let callState = this.activeCallStates.get(callId) || 
                     await CallState.findOne({ callId }).populate('workflowId');
      
      if (!callState) {
        throw new Error(`Call state not found for ${callId}`);
      }

      // ALWAYS analyze customer response first to detect questions
      const analysis = await this.analyzeCustomerResponse(customerResponse, callState);
      
      // Handle data collection steps ONLY if it's not a question
      const currentStepType = callState.currentStep.stepType;
      if (this.isDataCollectionStep(currentStepType) && analysis.intent !== 'question') {
        return await this.handleDataCollectionResponse(callState, customerResponse, currentStepType);
      }
      
      // Record the response
      callState.customerResponses.push({
        stepId: callState.currentStep.stepId,
        response: customerResponse,
        timestamp: new Date(),
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        confidence: analysis.confidence,
        audioUrl: audioData?.url
      });

      // Initialize customer data collection when they show interest
      if (currentStepType === 'benefits' && analysis.intent === 'interested') {
        await this.initializeCustomerDataCollection(callId, callState);
      }

      // Handle different response types - STRICT WORKFLOW ENFORCEMENT
      let nextStep;
      if (analysis.intent === 'objection') {
        nextStep = await this.handleObjection(callState, customerResponse, analysis);
      } else if (analysis.intent === 'question') {
        // Answer question and IMMEDIATELY proceed to next workflow step
        nextStep = await this.handleQuestion(callState, customerResponse);
        
        // If question response includes next step progression, update call state
        if (nextStep && nextStep.proceedToNextStep) {
          console.log(`📋 Question answered, advancing workflow to: ${nextStep.stepType}`);
          callState.moveToNextStep(nextStep.stepId, `Question: ${customerResponse}`, nextStep.stepType, nextStep.stepName);
          await callState.save();
          this.activeCallStates.set(callId, callState);
        }
        
        return nextStep;
      } else {
        // Normal workflow progression - no questions, just proceed
        nextStep = await this.determineNextStep(callState, analysis);
      }

      // Update call state
      if (nextStep) {
        callState.moveToNextStep(nextStep.stepId, customerResponse, nextStep.stepType, nextStep.stepName);
        await callState.save();
        this.activeCallStates.set(callId, callState);
      }

      return nextStep;

    } catch (error) {
      console.error('Error processing customer response:', error);
      throw error;
    }
  }

  /**
   * Check if current step is a data collection step
   */
  isDataCollectionStep(stepType) {
    const dataCollectionSteps = [
      'collect_name', 'collect_age', 'collect_occupation', 
      'collect_income', 'collect_city', 'collect_email'
    ];
    return dataCollectionSteps.includes(stepType);
  }

  /**
   * Handle customer response during data collection
   */
  async handleDataCollectionResponse(callState, customerResponse, currentStepType) {
    try {
      console.log(`[DataCollection] Handling ${currentStepType}: "${customerResponse}"`);
      
      // Parse the customer information from response
      const fieldName = currentStepType.replace('collect_', '');
      const parsedData = customerDataCollectionService.parseCustomerInformation(customerResponse, fieldName);
      
      if (Object.keys(parsedData).length > 0) {
        // Save the collected data
        await customerDataCollectionService.collectBasicInformation(callState.callId, parsedData);
        console.log(`[DataCollection] Saved ${fieldName}:`, parsedData);
      }

      // Get collection progress to determine next step
      const progress = await customerDataCollectionService.getCollectionProgress(callState.callId);
      const nextStepId = this.getDataCollectionNextStep(progress.customer || {});
      
      // Find the next step in workflow
      const workflow = await CallWorkflow.findById(callState.workflowId);
      const nextStep = workflow.steps.find(step => step.type === nextStepId) || 
                      workflow.steps.find(step => step.type === 'application'); // Fallback
      
      if (!nextStep) {
        throw new Error(`Next step ${nextStepId} not found in workflow`);
      }

      const content = await this.generateStepContent(workflow, nextStep, callState);
      
      return {
        stepId: nextStep.id,
        stepType: nextStep.type,
        content: content,
        language: callState.language,
        variables: Object.fromEntries(callState.variables),
        dataCollected: parsedData,
        collectionProgress: progress.progress
      };

    } catch (error) {
      console.error('Error handling data collection response:', error);
      throw error;
    }
  }

  /**
   * Initialize customer data collection
   */
  async initializeCustomerDataCollection(callId, callState) {
    try {
      // Extract phone number from call variables or state
      const phoneNumber = callState.variables.get('customerNumber') || 
                         callState.variables.get('phoneNumber') || 
                         'unknown';
      
      await customerDataCollectionService.initializeCustomerDataCollection(callId, phoneNumber);
      console.log(`[DataCollection] Initialized for call ${callId}`);
    } catch (error) {
      console.error('Error initializing customer data collection:', error);
    }
  }

  /**
   * Handle customer objections - Use the same strict workflow
   */
  async handleObjection(callState, objectionText, analysis) {
    try {
      console.log(`Handling objection: ${objectionText}`);
      
      // Get a generic objection response
      const response = await this.getGenericObjectionResponse(
        this.getObjectionType(objectionText), 
        callState.language
      );

      // Use the standard workflow to determine next step
      const workflow = await CallWorkflow.findById(callState.workflowId);
      const nextStepType = this.getNextStepFromWorkflow('objection_handling', 'interested'); // After objection, assume interested
      
      if (!nextStepType) {
        // End call if no next step
        return {
          stepId: null,
          stepType: 'completed',
          content: response + ' Thank you for your time.',
          language: callState.language,
          completed: true,
          callEnded: true
        };
      }

      // Find step by TYPE, not ID - FIXED
      const nextStep = workflow.steps.find(step => step.type === nextStepType);
      if (!nextStep) {
        throw new Error(`Next step with type ${nextStepType} not found in workflow`);
      }

      const nextContent = await this.generateStepContent(workflow, nextStep, callState);

      return {
        stepId: nextStep.id,
        stepType: nextStep.type,
        content: `${response}\n\n${nextContent}`, // Objection response + next step
        language: callState.language,
        isObjectionResponse: true,
        objectionHandled: true
      };

    } catch (error) {
      console.error('Error handling objection:', error);
      throw error;
    }
  }

  /**
   * Handle customer questions - STRICT: Only answer explicit questions, then immediately continue workflow
   */
  async handleQuestion(callState, question) {
    try {
      console.log(`🤔 Handling explicit question: "${question}"`);
      
      const cardType = callState.variables.get('cardType') || 'general';
      
      // Search knowledge base for answer
      const kbAnswer = await this.findAnswerInKB(question, cardType, callState.language);
      
      let answer;
      let source = 'knowledge_base';

      if (kbAnswer) {
        answer = kbAnswer.answer[callState.language];
      } else {
        // Use LLM for unknown questions - keep it brief
        answer = await this.getLLMAnswer(question, callState);
        source = 'llm';
      }

      // Record the question
      callState.customerQuestions.push({
        question: question,
        stepId: callState.currentStep.stepId,
        answer: answer,
        source: source,
        timestamp: new Date()
      });

      // IMMEDIATELY continue with workflow after answering question
      const workflow = await CallWorkflow.findById(callState.workflowId);
      const currentStep = workflow.steps.find(step => step.id === callState.currentStep.stepId);
      
      // During data collection, stay on the same step after answering question
      if (this.isDataCollectionStep(currentStep.type)) {
        console.log(`💡 Question answered during data collection, staying on: ${currentStep.type}`);
        const stepContent = await this.generateStepContent(workflow, currentStep, callState);
        return {
          stepId: currentStep.id,
          stepType: currentStep.type,
          content: `${answer}\n\nNow, ${stepContent}`, // Answer + continue with data collection
          language: callState.language,
          isQuestionResponse: true,
          stayOnCurrentStep: true
        };
      }
      
      // For non-data collection steps, proceed to next step after answering
      const analysis = { intent: 'interested', sentiment: 'positive', confidence: 0.9 };
      const nextStep = await this.determineNextStep(callState, analysis);
      
      if (nextStep) {
        console.log(`💡 Question answered, proceeding to next step: ${nextStep.stepType}`);
        return {
          stepId: nextStep.stepId,
          stepType: nextStep.stepType,
          content: `${answer}\n\nNow, ${nextStep.content}`, // Answer + immediately continue workflow
          language: callState.language,
          isQuestionResponse: true,
          proceedToNextStep: true
        };
      } else {
        // If no next step, just answer and stay on current step
        return {
          stepId: currentStep.id,
          stepType: currentStep.type,
          content: `${answer}\n\n${await this.generateStepContent(workflow, currentStep, callState)}`,
          language: callState.language,
          isQuestionResponse: true
        };
      }

    } catch (error) {
      console.error('Error handling question:', error);
      throw error;
    }
  }

  /**
   * Determine next step based on call flow logic with data collection
   */
  async determineNextStep(callState, analysis) {
    try {
      const workflow = await CallWorkflow.findById(callState.workflowId);
      const currentStep = workflow.steps.find(step => step.id === callState.currentStep.stepId);
      
      // If current step is not found (e.g., "completed"), workflow has ended
      if (!currentStep) {
        console.log(`🏁 Step ${callState.currentStep.stepId} not found in workflow - call completed`);
        return null;
      }
      
      // Get collected customer data if available
      let collectedData = {};
      try {
        const progress = await customerDataCollectionService.getCollectionProgress(callState.callId);
        collectedData = progress.customer || {};
      } catch (error) {
        console.log('[DataCollection] No customer data available yet');
      }
      
      // Use enhanced workflow logic with data collection
      let nextStepType = this.getNextStepFromWorkflow(currentStep.type, analysis.intent, collectedData);
      
      // Handle workflow completion - if nextStepType is null, the workflow has ended
      if (nextStepType === null || nextStepType === undefined) {
        // Mark call as completed and end automatically
        callState.callCompleted = true;
        callState.outcome = {
          status: 'completed',
          reason: 'workflow_completed',
          notes: 'Call flow completed successfully'
        };
        callState.endTime = new Date();
        await callState.save();
        
        // Remove from active calls
        this.activeCallStates.delete(callState.callId);
        
        console.log(`🏁 Call ${callState.callId} completed and ended automatically`);
        
        return {
          stepId: null,
          stepType: 'completed',
          content: 'Call ended. Thank you for your time.',
          language: callState.language,
          variables: Object.fromEntries(callState.variables),
          completed: true,
          callEnded: true
        };
      }

      // Find next step by TYPE, not ID - FIXED
      const nextStep = workflow.steps.find(step => step.type === nextStepType);
      if (!nextStep) {
        throw new Error(`Next step with type ${nextStepType} not found in workflow`);
      }

      const content = await this.generateStepContent(workflow, nextStep, callState);
      
      return {
        stepId: nextStep.id,
        stepType: nextStep.type,
        content: content,
        language: callState.language,
        variables: Object.fromEntries(callState.variables)
      };

    } catch (error) {
      console.error('Error determining next step:', error);
      throw error;
    }
  }

  /**
   * Generate step content with variables for multi-bank support
   */
  async generateStepContent(workflow, step, callState) {
    try {
      const language = callState.language;
      let template = step.template[language];
      
      // Get all variables from call state (already includes workflow variables)
      const variables = Object.fromEntries(callState.variables);

      // Replace variables in template
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        template = template.replace(regex, value);
      }

      return template;

    } catch (error) {
      console.error('Error generating step content:', error);
      return step.template[callState.language] || step.template.english;
    }
  }

  /**
   * Switch language during call
   */
  async switchLanguage(callId, newLanguage) {
    try {
      let callState = this.activeCallStates.get(callId) || 
                     await CallState.findOne({ callId }).populate('workflowId');
      
      if (!callState) {
        throw new Error(`Call state not found for ${callId}`);
      }

      // Update language
      callState.switchLanguage(newLanguage, 'customer_request');
      
      // Regenerate current step content in new language
      const workflow = await CallWorkflow.findById(callState.workflowId);
      const currentStep = workflow.steps.find(step => step.id === callState.currentStep.stepId);
      const content = await this.generateStepContent(workflow, currentStep, callState);

      await callState.save();
      this.activeCallStates.set(callId, callState);

      return {
        stepId: currentStep.id,
        stepType: currentStep.type,
        content: content,
        language: newLanguage,
        languageChanged: true
      };

    } catch (error) {
      console.error('Error switching language:', error);
      throw error;
    }
  }

  /**
   * Analyze customer response for SIMPLE 7-STEP FLOW
   * Made very predictable - always moves forward unless explicit "no"
   */
  async analyzeCustomerResponse(response, callState) {
    try {
      const lowerResponse = response.toLowerCase().trim();
      const currentStepType = callState.currentStep.stepType;
      
      console.log(`📊 ANALYZING: "${response}" at step "${currentStepType}"`);
      
      // FLEXIBLE QUESTION/INFO REQUEST DETECTION - Answer queries and proceed to next step
      const questionWords = ['what', 'how', 'when', 'where', 'why', 'which', 'who', 'can you', 'could you', 'will you', 'would you', 'is there', 'are there', 'do you', 'does it'];
      const infoRequestWords = ['tell me', 'about', 'explain', 'details', 'more about', 'information', 'know about', 'learn about'];
      const hasQuestionMark = response.includes('?');
      const hasQuestionWord = questionWords.some(word => lowerResponse.includes(word));
      const hasInfoRequest = infoRequestWords.some(phrase => lowerResponse.includes(phrase));
      
      // Treat as question/info request if: question mark OR question words OR info request words
      if (hasQuestionMark || hasQuestionWord || hasInfoRequest) {
        console.log('   ❓ QUESTION/INFO REQUEST detected - will answer then continue workflow');
        return { intent: 'question', sentiment: 'neutral', confidence: 0.95 };
      }
      
      // Universal "NO" detection - only way to stop the flow
      const clearNoWords = ['not interested', 'no thanks', 'not now', 'cancel', 'stop', 'don\'t want', 'not need'];
      const isExplicitNo = clearNoWords.some(phrase => lowerResponse.includes(phrase));
      
      if (isExplicitNo) {
        console.log('   🛑 EXPLICIT NO detected - routing to closing');
        return { intent: 'not_interested', sentiment: 'negative', confidence: 0.95 };
      }
      
      // Step-specific routing (simple and predictable) - NO QUESTION HANDLING, JUST PROCEED
      switch (currentStepType) {
        case 'greeting':
          // ANY response moves to language check
          console.log('   ✅ GREETING → Language Check');
          return { intent: 'interested', sentiment: 'positive', confidence: 0.9 };
          
        case 'language_check':
          // ANY response moves to benefits
          console.log('   ✅ LANGUAGE → Benefits');
          return { intent: 'proceed', sentiment: 'neutral', confidence: 0.9 };
          
        case 'benefits':
          // Check for objections, otherwise move to details
          const objectionWords = ['already have', 'have cards', 'expensive', 'costly', 'too many'];
          const hasObjection = objectionWords.some(word => lowerResponse.includes(word));
          
          if (hasObjection) {
            console.log('   ⚠️ OBJECTION detected - handling objection');
            return { intent: 'objection', sentiment: 'negative', confidence: 0.9 };
          }
          
          console.log('   ✅ BENEFITS → Collect Details');
          return { intent: 'interested', sentiment: 'positive', confidence: 0.9 };
          
        case 'objection_handling':
          // After objection handling, any response except clear "no" moves to details
          console.log('   ✅ OBJECTION HANDLED → Collect Details');
          return { intent: 'interested', sentiment: 'positive', confidence: 0.8 };
          
        case 'application':
          // During details collection, any response moves to confirmation
          console.log('   ✅ DETAILS COLLECTED → Confirmation');
          return { intent: 'interested', sentiment: 'positive', confidence: 0.9 };
          
        default:
          console.log('   ✅ DEFAULT → Move Forward');
          return { intent: 'interested', sentiment: 'positive', confidence: 0.7 };
      }

    } catch (error) {
      console.error('Error analyzing customer response:', error);
      return { intent: 'interested', sentiment: 'positive', confidence: 0.5 };
    }
  }

  /**
   * Detect if response contains objection
   */
  detectObjection(response) {
    const objectionIndicators = [
      'already have', 'don\'t need', 'not interested', 'expensive', 'costly', 
      'high fee', 'no time', 'busy', 'later', 'charges', 'annual fee'
    ];
    return objectionIndicators.some(indicator => response.includes(indicator));
  }

  /**
   * Get specific objection type
   */
  getObjectionType(response) {
    if (response.includes('already have') || response.includes('have card')) {
      return 'already_have_cards';
    }
    if (response.includes('expensive') || response.includes('costly') || response.includes('fee')) {
      return 'high_fees';
    }
    if (response.includes('no time') || response.includes('busy') || response.includes('later')) {
      return 'no_time';
    }
    return 'not_interested';
  }

  /**
   * Find objection response in knowledge base
   */
  async findObjectionResponse(objectionType, objectionText, cardType, language) {
    try {
      const responses = await KnowledgeBase.find({
        objectionType: objectionType,
        cardType: { $in: [cardType, 'general'] },
        isActive: true
      }).sort({ priority: -1 });

      if (responses.length > 0) {
        return responses[0];
      }

      return null;
    } catch (error) {
      console.error('Error finding objection response:', error);
      return null;
    }
  }

  /**
   * Find answer in knowledge base
   */
  async findAnswerInKB(question, cardType, language) {
    try {
      const entries = await KnowledgeBase.find({
        cardType: { $in: [cardType, 'general'] },
        isActive: true
      });

      // Calculate relevance scores
      const scoredEntries = entries.map(entry => ({
        entry,
        score: entry.calculateRelevance(question, { cardType, language })
      })).filter(item => item.score > 3) // Minimum relevance threshold
        .sort((a, b) => b.score - a.score);

      return scoredEntries.length > 0 ? scoredEntries[0].entry : null;
    } catch (error) {
      console.error('Error finding answer in KB:', error);
      return null;
    }
  }

  /**
   * Get LLM response for objections
   */
  async getLLMObjectionResponse(objectionText, callState) {
    try {
      const cardType = callState.variables.get('cardType') || 'credit card';
      const context = `Customer objection: "${objectionText}". Respond professionally to overcome this objection for ${cardType}. Keep response under 50 words and stay positive. You are a telecaller, not an assistant. Do not ask "How can I help you?" or similar assistant questions.`;
      
      const response = await openaiService.getChatCompletion(
        [
          { role: 'system', content: 'You are Priya, a human telecaller from SBI Bank selling credit cards. Handle objections naturally and persuasively. Never act like an assistant or ask "How can I help you?" - you are calling to sell a specific credit card. Stay focused on the sales process and overcome objections to proceed with the application.' },
          { role: 'user', content: context }
        ],
        callState.callId,
        callState.currentStep.stepType
      );

      // Additional validation to ensure no assistant behavior
      const validatedResponse = this.validateTelecallerResponse(response.content, callState.currentStep.stepType);
      return validatedResponse;
    } catch (error) {
      console.error('Error getting LLM objection response:', error);
      return "I understand your concern. Let me share why this card would still be beneficial for you.";
    }
  }

  /**
   * Get LLM answer for questions
   */
  async getLLMAnswer(question, callState) {
    try {
      const cardType = callState.variables.get('cardType') || 'credit card';
      const context = `Customer question: "${question}". Provide accurate information about ${cardType}. Keep answer concise and helpful. You are a telecaller, not an assistant. Do not ask "How can I help you?" or similar assistant questions.`;
      
      const response = await openaiService.getChatCompletion(
        [
          { role: 'system', content: 'You are Priya, a human telecaller from SBI Bank selling credit cards. Provide accurate, helpful information. Never act like an assistant or ask "How can I help you?" - you are calling to sell a specific credit card. Stay focused on the sales process.' },
          { role: 'user', content: context }
        ],
        callState.callId,
        callState.currentStep.stepType
      );

      // Additional validation to ensure no assistant behavior
      const validatedResponse = this.validateTelecallerResponse(response.content, callState.currentStep.stepType);
      return validatedResponse;
    } catch (error) {
      console.error('Error getting LLM answer:', error);
      return "Let me get back to you with accurate information about that.";
    }
  }

  /**
   * Generic objection responses
   */
  async getGenericObjectionResponse(objectionType, language) {
    const responses = {
      english: {
        'already_have_cards': "I understand you have cards. This one offers unique benefits that complement your existing cards.",
        'high_fees': "The benefits actually outweigh the fees, and we have special offers to reduce costs.",
        'no_time': "I understand you're busy. This will only take 2 minutes, and I'll handle everything for you.",
        'not_interested': "I appreciate your honesty. Let me share just one key benefit that might change your mind."
      },
      hindi: {
        'already_have_cards': "मैं समझता हूं आपके पास कार्ड हैं। यह अलग फायदे देता है।",
        'high_fees': "फायदे फीस से ज्यादा हैं, और हमारे पास विशेष ऑफर हैं।",
        'no_time': "मैं समझता हूं आप व्यस्त हैं। केवल 2 मिनट लगेंगे।",
        'not_interested': "मैं आपकी बात समझता हूं। एक मुख्य फायदा बताता हूं।"
      }
    };

    return responses[language]?.[objectionType] || responses.english[objectionType] || "Thank you for sharing that with me.";
  }

  /**
   * End call flow
   */
  async endCallFlow(callId, outcome) {
    try {
      let callState = this.activeCallStates.get(callId) || 
                     await CallState.findOne({ callId });
      
      if (callState) {
        callState.outcome = outcome;
        callState.metrics.totalDuration = new Date() - callState.createdAt;
        await callState.save();
        
        this.activeCallStates.delete(callId);
      }

      console.log(`Call flow ended for ${callId} with outcome: ${outcome.status}`);
    } catch (error) {
      console.error('Error ending call flow:', error);
    }
  }

  /**
   * STRICT TELECALLER MODE: Prevent AI from acting like an assistant
   * This method ensures the AI NEVER asks "How can I help you?" type questions
   * and ALWAYS follows the predefined 7-step workflow
   */
  validateTelecallerResponse(responseContent, currentStepType) {
    // List of forbidden assistant phrases that telecallers should never say
    const forbiddenAssistantPhrases = [
      'how can i help you',
      'how may i assist you',
      'what can i do for you',
      'what are you looking for',
      'how can i be of service',
      'what would you like to know',
      'is there anything specific',
      'can i help you with anything',
      'what brings you here today',
      'आप की क्या मदद कर सकता हूं',
      'मैं आपकी कैसे सहायता कर सकता हूं',
      'आपको क्या चाहिए',
      'क्या मैं आपकी मदद कर सकता हूं'
    ];

    const lowerContent = responseContent.toLowerCase();
    const hasAssistantPhrase = forbiddenAssistantPhrases.some(phrase => 
      lowerContent.includes(phrase)
    );

    if (hasAssistantPhrase) {
      console.log('🚫 BLOCKED ASSISTANT BEHAVIOR - Enforcing telecaller workflow');
      console.log('❌ Forbidden phrase detected in response:', responseContent);
      
      // Return a strict telecaller response based on current step
      switch (currentStepType) {
        case 'greeting':
          return 'Would you prefer to continue in Hindi or English?';
        case 'language_check':
          return 'Let me tell you about the benefits of this special credit card.';
        case 'benefits':
          return 'Are you interested in applying for this credit card? I can start the application process right away.';
        default:
          return 'Let me proceed with the next step of your application.';
      }
    }

    return responseContent; // Return original if no assistant behavior detected
  }
}

module.exports = new WorkflowEngine();
