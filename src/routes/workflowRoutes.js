const express = require('express');
const router = express.Router();
const CallWorkflow = require('../models/CallWorkflow');
const workflowEngine = require('../services/workflowEngine');

// Get all workflows
router.get('/', async (req, res) => {
  try {
    const workflows = await CallWorkflow.find({ isActive: true })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: workflows
    });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching workflows',
      error: error.message
    });
  }
});

// Get specific workflow
router.get('/:id', async (req, res) => {
  try {
    const workflow = await CallWorkflow.findById(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching workflow',
      error: error.message
    });
  }
});

// Create new workflow
router.post('/', async (req, res) => {
  try {
    const workflowData = req.body;
    
    // Validate required fields
    if (!workflowData.name || !workflowData.steps || workflowData.steps.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name and steps are required'
      });
    }
    
    const workflow = new CallWorkflow(workflowData);
    await workflow.save();
    
    res.status(201).json({
      success: true,
      message: 'Workflow created successfully',
      data: workflow
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating workflow',
      error: error.message
    });
  }
});

// Update workflow
router.put('/:id', async (req, res) => {
  try {
    const workflow = await CallWorkflow.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Workflow updated successfully',
      data: workflow
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating workflow',
      error: error.message
    });
  }
});

// Delete workflow
router.delete('/:id', async (req, res) => {
  try {
    const workflow = await CallWorkflow.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting workflow',
      error: error.message
    });
  }
});

// Test workflow logic
router.post('/:id/test', async (req, res) => {
  try {
    const { customerResponses = [], cardType = 'sbi_simplysave' } = req.body;
    const workflow = await CallWorkflow.findById(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    // Simulate call flow with test responses
    const testCallId = `test_${Date.now()}`;
    const testResults = [];

    try {
      // Start the flow
      const startResult = await workflowEngine.startCallFlow(testCallId, workflow._id, {
        variables: { cardType, agentName: 'Test Agent', bankName: 'SBI' },
        language: 'english'
      });
      
      testResults.push({
        step: 'start',
        result: startResult
      });

      // Process each test response
      for (let i = 0; i < customerResponses.length; i++) {
        const response = customerResponses[i];
        const stepResult = await workflowEngine.processCustomerResponse(testCallId, response);
        
        testResults.push({
          step: `response_${i + 1}`,
          customerResponse: response,
          result: stepResult
        });
      }

    } catch (testError) {
      console.error('Error during workflow test:', testError);
      testResults.push({
        step: 'error',
        error: testError.message
      });
    } finally {
      // Clean up test call state
      await workflowEngine.endCallFlow(testCallId, { status: 'test_completed' });
    }

    res.json({
      success: true,
      message: 'Workflow test completed',
      data: {
        workflowId: workflow._id,
        testResults
      }
    });

  } catch (error) {
    console.error('Error testing workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing workflow',
      error: error.message
    });
  }
});

// Get workflow analytics
router.get('/:id/analytics', async (req, res) => {
  try {
    const workflow = await CallWorkflow.findById(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        analytics: workflow.analytics,
        performance: {
          totalCalls: workflow.analytics.totalCalls,
          successRate: workflow.analytics.successRate,
          averageCallDuration: workflow.analytics.averageCallDuration,
          commonDropOffPoints: workflow.analytics.commonDropOffPoints
        }
      }
    });
  } catch (error) {
    console.error('Error fetching workflow analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching workflow analytics',
      error: error.message
    });
  }
});

// Duplicate workflow
router.post('/:id/duplicate', async (req, res) => {
  try {
    const originalWorkflow = await CallWorkflow.findById(req.params.id);
    
    if (!originalWorkflow) {
      return res.status(404).json({
        success: false,
        message: 'Workflow not found'
      });
    }

    // Create duplicate with modified name
    const duplicateData = originalWorkflow.toObject();
    delete duplicateData._id;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    duplicateData.name = `${duplicateData.name} (Copy)`;
    duplicateData.analytics = {
      totalCalls: 0,
      successRate: 0,
      averageCallDuration: 0,
      commonDropOffPoints: []
    };

    const duplicateWorkflow = new CallWorkflow(duplicateData);
    await duplicateWorkflow.save();
    
    res.status(201).json({
      success: true,
      message: 'Workflow duplicated successfully',
      data: duplicateWorkflow
    });
  } catch (error) {
    console.error('Error duplicating workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error duplicating workflow',
      error: error.message
    });
  }
});

module.exports = router;
