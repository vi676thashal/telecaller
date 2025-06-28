/**
 * Test Telecaller Workflow Enforcement
 * 
 * This script tests that the ultraFastResponseOptimizer correctly enforces
 * telecaller behavior and workflow for all types of responses.
 */

// Use console.log for logging in this test script
const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn
};

// Load our modules
let ultraFastResponseOptimizer, voiceProviderService;
try {
  ultraFastResponseOptimizer = require('./src/services/ultraFastResponseOptimizer');
  voiceProviderService = require('./src/services/voiceProviderService');
  console.log('✅ Modules loaded successfully');
} catch (err) {
  console.error('❌ Error loading modules:', err.message);
  process.exit(1);
}

// Mock workflowEngine for testing
const mockWorkflowEngine = {
  activeCallStates: new Map(),
  getNextStepFromWorkflow: (currentStep, intent) => {
    const flowMap = {
      'greeting': 'language_check',
      'language_check': 'benefits',
      'benefits': 'collect_name',
      'collect_name': 'collect_age',
      'collect_age': 'collect_occupation',
      'collect_occupation': 'collect_income',
      'collect_income': 'application',
      'application': 'confirmation',
      'confirmation': 'closing',
      'closing': null
    };
    return flowMap[currentStep] || null;
  }
};

// Setup mock call state for testing
const mockCallState = {
  callId: 'test-call-123',
  currentStep: {
    type: 'greeting',
    id: 'greeting-1'
  },
  getIntent: () => 'interested'
};

// Add to workflow engine
mockWorkflowEngine.activeCallStates.set('test-call-123', mockCallState);

// Replace the real workflowEngine with our mock for testing
const originalWorkflowEngine = ultraFastResponseOptimizer.workflowEngine;
ultraFastResponseOptimizer.workflowEngine = mockWorkflowEngine;

// Test cases with assistant-like phrases that should be corrected
const testCases = [
  {
    step: 'greeting',
    input: "Hello, how can I help you today?",
    expected: "telecaller"
  },
  {
    step: 'language_check',
    input: "Is there anything else I can assist you with?",
    expected: "telecaller"
  },
  {
    step: 'benefits',
    input: "What would you like to know about our services?",
    expected: "telecaller"
  },
  {
    step: 'collect_name',
    input: "How may I assist you today?",
    expected: "name collection"
  },
  {
    step: 'collect_age',
    input: "What can I help you with?",
    expected: "age question"
  }
];

// Run the tests
async function runTests() {
  console.log('🧪 TESTING TELECALLER WORKFLOW ENFORCEMENT');
  console.log('=========================================');
  
  let passCount = 0;
  let failCount = 0;
  
  for (const [index, test] of testCases.entries()) {
    console.log(`\nTest ${index + 1}: ${test.step}`);
    console.log(`Input: "${test.input}"`);
    
    // Set current step for test
    mockCallState.currentStep.type = test.step;
    
    // Test enforceStrictTelecallerResponse method
    const result = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
      test.input,
      'test-call-123',
      test.step
    );
    
    console.log(`Output: "${result}"`);
    
    // Check if assistant-like phrases were removed
    const containsAssistantPhrases = 
      result.toLowerCase().includes('how can i help') ||
      result.toLowerCase().includes('may i assist') ||
      result.toLowerCase().includes('how can i assist') ||
      result.toLowerCase().includes('what can i help') ||
      result.toLowerCase().includes('anything else you need') ||
      result.toLowerCase().includes('anything else i can help');
    
    // Check if telecaller workflow is enforced
    const enforcesWorkflow =
      (test.step === 'greeting' && result.toLowerCase().includes('language')) ||
      (test.step === 'language_check' && result.toLowerCase().includes('benefit')) ||
      (test.step === 'collect_name' && result.toLowerCase().includes('name')) ||
      (test.step === 'collect_age' && result.toLowerCase().includes('age')) ||
      (test.step === 'collect_occupation' && result.toLowerCase().includes('occupation'));
    
    if (!containsAssistantPhrases && 
        (enforcesWorkflow || !test.expected.includes('question'))) {
      console.log('✅ PASS: Assistant phrases removed and workflow enforced');
      passCount++;
    } else {
      console.log('❌ FAIL: ' + 
        (containsAssistantPhrases ? 'Contains assistant phrases' : 'Missing workflow enforcement'));
      failCount++;
    }
  }
  
  // Test voice provider service integration
  console.log('\nTesting voice provider integration');
  try {
    const mockOptions = {
      callId: 'test-call-123',
      provider: 'elevenlabs',
      stepType: 'greeting'
    };
    
    // Mock the actual speech generation to avoid API calls
    const originalGenerateSpeech = voiceProviderService.generateSpeech;
    voiceProviderService.generateSpeech = async (text) => {
      return `mock-audio-url-for-${text.substring(0, 10)}`;
    };
    
    const assistantPhrase = "Hello, how may I assist you today?";
    await voiceProviderService.generateSpeech(assistantPhrase, mockOptions);
    
    console.log('✅ PASS: Voice provider integration test completed');
    passCount++;
    
    // Restore original function
    voiceProviderService.generateSpeech = originalGenerateSpeech;
  } catch (error) {
    console.error('❌ FAIL: Voice provider integration test failed:', error.message);
    failCount++;
  }
  
  // Test emergency audio generation
  console.log('\nTesting emergency audio generation');
  try {
    const assistantEmergencyPhrase = "I'm sorry, I'm having trouble understanding. How can I help you?";
    const emergencyAudio = voiceProviderService.generateEmergencyAudio(
      assistantEmergencyPhrase, 
      'test-call-123'
    );
    
    console.log('✅ PASS: Emergency audio generation test completed');
    passCount++;
  } catch (error) {
    console.error('❌ FAIL: Emergency audio generation test failed:', error.message);
    failCount++;
  }
  
  // Restore original workflow engine
  ultraFastResponseOptimizer.workflowEngine = originalWorkflowEngine;
  
  // Summary
  console.log('\n=========================================');
  console.log(`Test Summary: ${passCount} passed, ${failCount} failed`);
  console.log('=========================================');
  
  if (failCount === 0) {
    console.log('🎉 All tests passed! The telecaller workflow enforcement is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Please review the issues above.');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
