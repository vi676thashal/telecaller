const express = require('express');
const router = express.Router();
const workflowEngine = require('../services/workflowEngine');
const knowledgeBaseService = require('../services/knowledgeBaseService');
const CallState = require('../models/CallState');
const Call = require('../models/Call');

// Start new call flow
router.post('/start', async (req, res) => {
  try {
    const { 
      callId, 
      workflowId, 
      cardType = 'sbi_simplysave',
      language = 'english',
      customerNumber,
      agentName = 'Priya',
      bankName = 'SBI Bank'
    } = req.body;

    // Validate required fields
    if (!callId || !workflowId) {
      return res.status(400).json({
        success: false,
        message: 'callId and workflowId are required'
      });
    }

    // Create or find call record
    let callRecord = await Call.findOne({ customerNumber });
    if (!callRecord) {
      callRecord = new Call({
        customerNumber,
        status: 'initiating',
        scriptId: null, // Will be set based on workflow
        promptId: null
      });
      await callRecord.save();
    }

    // Start the call flow
    const flowResult = await workflowEngine.startCallFlow(callId, workflowId, {
      callRecordId: callRecord._id,
      variables: {
        cardType,
        agentName,
        bankName,
        customerNumber
      },
      language
    });

    // Update call record
    callRecord.status = 'in-progress';
    await callRecord.save();

    res.json({
      success: true,
      message: 'Call flow started successfully',
      data: {
        callId,
        callRecordId: callRecord._id,
        ...flowResult
      }
    });

  } catch (error) {
    console.error('Error starting call flow:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting call flow',
      error: error.message
    });
  }
});

// Process customer response
router.post('/:callId/response', async (req, res) => {
  try {
    const { callId } = req.params;
    const { response, audioData } = req.body;

    if (!response) {
      return res.status(400).json({
        success: false,
        message: 'Customer response is required'
      });
    }

    // Process the response through workflow engine
    const nextStep = await workflowEngine.processCustomerResponse(
      callId, 
      response, 
      audioData
    );

    if (!nextStep) {
      return res.status(404).json({
        success: false,
        message: 'Unable to determine next step'
      });
    }

    res.json({
      success: true,
      message: 'Response processed successfully',
      data: nextStep
    });

  } catch (error) {
    console.error('Error processing customer response:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing customer response',
      error: error.message
    });
  }
});

// Handle objection
router.post('/:callId/objection', async (req, res) => {
  try {
    const { callId } = req.params;
    const { objectionText, objectionType } = req.body;

    if (!objectionText) {
      return res.status(400).json({
        success: false,
        message: 'Objection text is required'
      });
    }

    // Get current call state for context
    const callState = await CallState.findOne({ callId });
    if (!callState) {
      return res.status(404).json({
        success: false,
        message: 'Call state not found'
      });
    }

    const cardType = callState.variables.get('cardType') || 'general';
    
    // Handle objection through knowledge base service
    const objectionResponse = await knowledgeBaseService.handleObjection(
      objectionText, 
      { 
        cardType, 
        language: callState.language,
        stepType: callState.currentStep.stepType 
      }
    );

    let nextStep;
    if (objectionResponse.found) {
      // Process successful objection handling
      nextStep = await workflowEngine.handleObjection(
        callState, 
        objectionText, 
        { objectionType: objectionResponse.type }
      );
    } else {
      // Use LLM fallback
      const llmResponse = await knowledgeBaseService.getLLMFallback(
        objectionText,
        { cardType, language: callState.language }
      );
      
      nextStep = await workflowEngine.handleObjection(
        callState,
        objectionText,
        { objectionType: 'general' }
      );
    }

    res.json({
      success: true,
      message: 'Objection handled successfully',
      data: {
        objectionHandled: true,
        response: objectionResponse,
        nextStep
      }
    });

  } catch (error) {
    console.error('Error handling objection:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling objection',
      error: error.message
    });
  }
});

// Switch language
router.put('/:callId/language', async (req, res) => {
  try {
    const { callId } = req.params;
    const { language } = req.body;

    if (!language || !['english', 'hindi'].includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Valid language (english/hindi) is required'
      });
    }

    const result = await workflowEngine.switchLanguage(callId, language);

    res.json({
      success: true,
      message: `Language switched to ${language}`,
      data: result
    });

  } catch (error) {
    console.error('Error switching language:', error);
    res.status(500).json({
      success: false,
      message: 'Error switching language',
      error: error.message
    });
  }
});

// Get current call state
router.get('/:callId/state', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const callState = await CallState.findOne({ callId })
      .populate('workflowId')
      .populate('callRecord');

    if (!callState) {
      return res.status(404).json({
        success: false,
        message: 'Call state not found'
      });
    }

    res.json({
      success: true,
      data: {
        callId: callState.callId,
        currentStep: callState.currentStep,
        language: callState.language,
        variables: Object.fromEntries(callState.variables),
        stepHistory: callState.stepHistory,
        objections: callState.objections,
        customerQuestions: callState.customerQuestions,
        outcome: callState.outcome,
        metrics: callState.metrics,
        workflow: callState.workflowId
      }
    });

  } catch (error) {
    console.error('Error getting call state:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting call state',
      error: error.message
    });
  }
});

// Handle interruption
router.post('/:callId/interrupt', async (req, res) => {
  try {
    const { callId } = req.params;
    const { interruptionText, reason } = req.body;

    const callState = await CallState.findOne({ callId });
    if (!callState) {
      return res.status(404).json({
        success: false,
        message: 'Call state not found'
      });
    }

    // Mark interruption flag
    callState.flags.customerInterrupted = true;
    
    // Add to debug info
    callState.debug.warnings.push(`Interruption at ${new Date().toISOString()}: ${reason}`);
    
    await callState.save();

    // Process the interruption as a response
    const response = await workflowEngine.processCustomerResponse(
      callId,
      interruptionText || "Customer interrupted"
    );

    res.json({
      success: true,
      message: 'Interruption handled',
      data: {
        interruptionHandled: true,
        nextStep: response
      }
    });

  } catch (error) {
    console.error('Error handling interruption:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling interruption',
      error: error.message
    });
  }
});

// End call flow
router.post('/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;
    const { outcome, reason, notes } = req.body;

    const callOutcome = {
      status: outcome || 'completed',
      reason: reason || 'Call completed normally',
      notes: notes || '',
      timestamp: new Date()
    };

    await workflowEngine.endCallFlow(callId, callOutcome);

    // Update call record
    const callState = await CallState.findOne({ callId });
    if (callState && callState.callRecord) {
      await Call.findByIdAndUpdate(callState.callRecord, {
        status: 'completed',
        endTime: new Date(),
        outcome: callOutcome.status
      });
    }

    res.json({
      success: true,
      message: 'Call flow ended successfully',
      data: {
        callId,
        outcome: callOutcome
      }
    });

  } catch (error) {
    console.error('Error ending call flow:', error);
    res.status(500).json({
      success: false,
      message: 'Error ending call flow',
      error: error.message
    });
  }
});

// Get call analytics
router.get('/:callId/analytics', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const callState = await CallState.findOne({ callId });
    if (!callState) {
      return res.status(404).json({
        success: false,
        message: 'Call state not found'
      });
    }

    const analytics = {
      callDuration: callState.metrics.totalDuration,
      stepsCompleted: callState.stepHistory.length,
      objectionsEncountered: callState.objections.length,
      questionsAsked: callState.customerQuestions.length,
      languageSwitches: callState.languageHistory.length,
      currentStep: callState.currentStep,
      customerEngagement: callState.metrics.customerEngagement,
      scriptAdherence: callState.metrics.scriptAdherence,
      outcome: callState.outcome
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Error getting call analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting call analytics',
      error: error.message
    });
  }
});

// Query knowledge base directly
router.post('/knowledge-base/query', async (req, res) => {
  try {
    const { question, cardType = 'general', language = 'english' } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const answer = await knowledgeBaseService.findAnswer(question, {
      cardType,
      language
    });

    if (answer) {
      res.json({
        success: true,
        data: {
          question,
          answer: answer.answer[language] || answer.answer.english,
          source: 'knowledge_base',
          confidence: 0.9
        }
      });
    } else {
      // Try LLM fallback
      const llmResponse = await knowledgeBaseService.getLLMFallback(question, {
        cardType,
        language
      });

      res.json({
        success: true,
        data: {
          question,
          answer: llmResponse.response,
          source: llmResponse.source,
          confidence: llmResponse.confidence
        }
      });
    }

  } catch (error) {
    console.error('Error querying knowledge base:', error);
    res.status(500).json({
      success: false,
      message: 'Error querying knowledge base',
      error: error.message
    });
  }
});

module.exports = router;
