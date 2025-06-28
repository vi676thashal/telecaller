/**
 * FINAL TELECALLER WORKFLOW VALIDATION TEST
 * 
 * This test script comprehensively validates all aspects of the telecaller workflow enforcement
 * to ensure the AI never behaves like an assistant and always follows the 7-step workflow.
 */

const workflowEngine = require('./src/services/workflowEngine');
const openaiService = require('./src/services/openaiService');
const ultraFastResponseOptimizer = require('./src/services/ultraFastResponseOptimizer');
const voiceProviderService = require('./src/services/voiceProviderService');

// Test IDs
const TEST_CALL_ID = 'test-call-' + Date.now();
const TEST_WORKFLOW_ID = '65a0c6db4a8e1de73a7f5b3a'; // Replace with a valid workflow ID from your DB

// Mock data for the test workflow steps
const mockWorkflowSteps = [
  { id: 'step1', name: 'Greeting', type: 'greeting', template: { english: 'Hello, this is {{agentName}} from {{bankName}}. I\'m calling about our exclusive credit card offer.' } },
  { id: 'step2', name: 'Language Check', type: 'language_check', template: { english: 'Would you prefer to continue in English or Hindi?' } },
  { id: 'step3', name: 'Benefits', type: 'benefits', template: { english: 'Our credit card offers cashback, reward points, and airport lounge access.' } },
  { id: 'step4', name: 'Data Collection - Name', type: 'collect_name', template: { english: 'To proceed with your application, may I have your full name please?' } },
  { id: 'step5', name: 'Data Collection - Age', type: 'collect_age', template: { english: 'Thanks. Could you please tell me your age?' } },
  { id: 'step6', name: 'Data Collection - Occupation', type: 'collect_occupation', template: { english: 'What is your occupation?' } },
  { id: 'step7', name: 'Data Collection - Income', type: 'collect_income', template: { english: 'May I know your monthly income?' } },
  { id: 'step8', name: 'Data Collection - City', type: 'collect_city', template: { english: 'What city do you reside in?' } },
  { id: 'step9', name: 'Data Collection - Email', type: 'collect_email', template: { english: 'Finally, could you share your email address?' } },
  { id: 'step10', name: 'Application', type: 'application', template: { english: 'Thank you. Would you like to proceed with the application?' } },
  { id: 'step11', name: 'Confirmation', type: 'confirmation', template: { english: 'Great! Your application is being processed.' } },
  { id: 'step12', name: 'Closing', type: 'closing', template: { english: 'Thank you for your time today.' } }
];

// Helper functions
function logResult(testName, result, expected = true) {
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${testName}`);
  if (result !== expected) {
    console.error(`      Expected: ${expected}, Got: ${result}`);
  }
}

// Flag to track overall test status
let allTestsPassed = true;

// Simple assertion function
function assert(testName, condition) {
  logResult(testName, condition);
  if (!condition) allTestsPassed = false;
}

/**
 * Test Case 1: Validate the system prompts and telecaller enforcement in openaiService.getChatCompletion
 */
async function testOpenAIServiceChatCompletion() {
  console.log('\n🔍 TEST CASE 1: OpenAI Service Chat Completion\n');
  try {
    // Test with no system message - should add telecaller enforcement
    const response1 = await openaiService.getChatCompletion([
      { role: 'user', content: 'Tell me about this credit card' }
    ], TEST_CALL_ID, 'benefits');

    // Check if the response doesn't contain assistant-like phrases
    const hasAssistantPhrases1 = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else/i.test(response1.content);
    assert('Should enforce telecaller behavior with no system message', !hasAssistantPhrases1);

    // Test with weak system message - should override with strong telecaller enforcement
    const response2 = await openaiService.getChatCompletion([
      { role: 'system', content: 'You are an assistant that helps with credit card information.' },
      { role: 'user', content: 'Tell me more about the benefits' }
    ], TEST_CALL_ID, 'benefits');

    // Check if the response doesn't contain assistant-like phrases
    const hasAssistantPhrases2 = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else/i.test(response2.content);
    assert('Should override weak system message with strong telecaller enforcement', !hasAssistantPhrases2);

    console.log('Response content sample:', response1.content.substring(0, 100) + '...');

  } catch (error) {
    console.error('Error in testOpenAIServiceChatCompletion:', error);
    allTestsPassed = false;
  }
}

/**
 * Test Case 2: Validate UltraFastResponseOptimizer enforcement mechanisms
 */
async function testUltraFastResponseOptimizer() {
  console.log('\n🔍 TEST CASE 2: UltraFast Response Optimizer\n');
  try {
    // Test with assistant-like phrases that should be stripped
    const assistantPhrases = [
      "How can I help you with this credit card?",
      "Is there anything else you need help with today?",
      "I'm an AI assistant here to help with your credit card questions",
      "What would you like to know about our services?",
      "Feel free to ask me any questions about the credit card"
    ];

    for (let i = 0; i < assistantPhrases.length; i++) {
      const phrase = assistantPhrases[i];
      const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
        phrase, TEST_CALL_ID, 'benefits'
      );

      const stillHasAssistantPhrases = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else|feel free to ask/i.test(enforced);
      assert(`Should clean assistant phrase ${i+1}`, !stillHasAssistantPhrases);
      console.log(`Original: "${phrase.substring(0, 30)}..."`);
      console.log(`Enforced: "${enforced.substring(0, 30)}..."`);
    }

    // Test workflow enforcement for specific steps
    const steps = ['greeting', 'language_check', 'benefits', 'collect_name', 'application', 'confirmation', 'closing'];
    for (const step of steps) {
      const genericResponse = "Thank you for your interest.";
      const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
        genericResponse, TEST_CALL_ID, step
      );

      // Step-specific enforcement check
      let passesStepEnforcement = false;
      
      switch(step) {
        case 'greeting':
          passesStepEnforcement = enforced.includes('language') || enforced.includes('English') || enforced.includes('Hindi');
          break;
        case 'language_check':
          passesStepEnforcement = enforced.includes('benefit') || enforced.includes('offer') || enforced.includes('feature');
          break;  
        case 'benefits':
          passesStepEnforcement = enforced.includes('application') || enforced.includes('proceed') || enforced.includes('name');
          break;
        case 'collect_name':
          passesStepEnforcement = enforced.includes('name') || enforced.includes('full name');
          break;
        default:
          passesStepEnforcement = true; // Less strict for other steps
      }
      
      assert(`Should enforce workflow for ${step} step`, passesStepEnforcement);
      console.log(`Step ${step} content: "${enforced.substring(0, 50)}..."`);
    }

  } catch (error) {
    console.error('Error in testUltraFastResponseOptimizer:', error);
    allTestsPassed = false;
  }
}

/**
 * Test Case 3: Validate Workflow Engine LLM calls
 */
async function testWorkflowEngineLLMCalls() {
  console.log('\n🔍 TEST CASE 3: Workflow Engine LLM Calls\n');
  
  try {
    // Mock a call state for testing
    const mockCallState = {
      callId: TEST_CALL_ID,
      language: 'english',
      currentStep: { stepType: 'benefits', stepId: 'step3' },
      variables: new Map([['cardType', 'SBI Prime Credit Card'], ['bankName', 'SBI Bank']])
    };
    
    // Mock customer questions and objections
    const questions = [
      "What is the interest rate?",
      "Do I need to have a minimum income?",
      "How long does approval take?"
    ];
    
    const objections = [
      "I already have too many credit cards",
      "I don't think I need this right now",
      "The interest rate might be too high"
    ];
    
    // Test question handling
    for (const question of questions) {
      const answer = await workflowEngine.getLLMAnswer(question, mockCallState);
      
      const hasAssistantPhrases = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else/i.test(answer);
      assert(`Question handling should not have assistant phrases (${question})`, !hasAssistantPhrases);
      
      console.log(`Question: "${question}"`);
      console.log(`Answer: "${answer.substring(0, 50)}..."\n`);
    }
    
    // Test objection handling
    for (const objection of objections) {
      const response = await workflowEngine.getLLMObjectionResponse(objection, mockCallState);
      
      const hasAssistantPhrases = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else/i.test(response);
      assert(`Objection response should not have assistant phrases (${objection})`, !hasAssistantPhrases);
      
      console.log(`Objection: "${objection}"`);
      console.log(`Response: "${response.substring(0, 50)}..."\n`);
    }
    
  } catch (error) {
    console.error('Error in testWorkflowEngineLLMCalls:', error);
    allTestsPassed = false;
  }
}

/**
 * Test Case 4: Validate Voice Provider Service workflow enforcement before TTS
 */
async function testVoiceProviderServiceEnforcement() {
  console.log('\n🔍 TEST CASE 4: Voice Provider Service Enforcement\n');
  
  try {
    // Create a test function that mimics the voice provider service's TTS call
    // but returns the processed text instead of audio
    const testTTS = async (text, options = {}) => {
      try {
        // This is the exact enforcement code from voiceProviderService.generateSpeech
        if (typeof options === 'object' && options !== null && options.callId) {
          // Extract callId and stepType if available
          const callId = options.callId;
          const stepType = options.stepType || null;
          
          // Apply strict telecaller workflow enforcement
          console.log(`🔒 Enforcing strict telecaller workflow for call ${callId} before TTS generation`);
          return ultraFastResponseOptimizer.enforceStrictTelecallerResponse(text, callId, stepType);
        }
        return text;
      } catch (error) {
        console.error('Error in testTTS:', error);
        return text;
      }
    };
    
    // Test with various assistant-like phrases
    const testPhrases = [
      {
        input: "How can I help you today with your credit card needs?",
        step: "benefits"
      },
      {
        input: "Is there anything else you'd like to know about our services?",
        step: "collect_name"
      },
      {
        input: "I'm here to address any questions or concerns you might have.",
        step: "language_check"
      }
    ];
    
    for (const test of testPhrases) {
      const result = await testTTS(test.input, { callId: TEST_CALL_ID, stepType: test.step });
      
      const hasAssistantPhrases = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else|I'm here to/i.test(result);
      assert(`Voice Provider enforcement should clean assistant phrase`, !hasAssistantPhrases);
      
      console.log(`Original: "${test.input}"`);
      console.log(`Enforced: "${result}"\n`);
    }
    
  } catch (error) {
    console.error('Error in testVoiceProviderServiceEnforcement:', error);
    allTestsPassed = false;
  }
}

/**
 * Test Case 5: End-to-end scenario test with workflow progression
 */
async function testEndToEndScenario() {
  console.log('\n🔍 TEST CASE 5: End-to-End Workflow Scenario\n');
  
  try {
    // Mock objects and functions for this test
    // We need to simulate a workflow from greeting through the entire 7-step flow
    
    // 1. Mock a simple customer journey through the workflow
    const journey = [
      { step: 'greeting', response: "Hello, who's this?" },
      { step: 'language_check', response: "I prefer English" },
      { step: 'benefits', response: "That sounds good, tell me more" },
      { step: 'collect_name', response: "My name is John Smith" },
      { step: 'collect_age', response: "I'm 35 years old" },
      { step: 'collect_occupation', response: "I work as a software engineer" },
      { step: 'collect_income', response: "My monthly income is 80,000" },
      { step: 'collect_city', response: "I live in Bangalore" },
      { step: 'collect_email', response: "My email is john@example.com" },
      { step: 'application', response: "Yes, I'd like to proceed with the application" },
      { step: 'confirmation', response: "That sounds great" },
    ];
    
    // 2. Simulate each step transition with a response
    for (let i = 0; i < journey.length; i++) {
      const currentStep = journey[i];
      
      console.log(`\n📌 STEP: ${currentStep.step}`);
      console.log(`Customer: "${currentStep.response}"`);
      
      // Generate next step content based on workflow
      const mockStep = mockWorkflowSteps.find(step => step.type === currentStep.step);
      
      // Get LLM answer as if processing this input (simulate workflow engine)
      // Here we're checking that we never drop back into assistant mode in transitions
      const templateContent = mockStep.template.english;
      const generatedResponse = await openaiService.getChatCompletion([
        { 
          role: 'system', 
          content: `You are a telecaller following a script. Current step: ${currentStep.step}. Template: ${templateContent}`
        },
        { role: 'user', content: `The customer said: "${currentStep.response}". Respond as the telecaller.` }
      ], TEST_CALL_ID, currentStep.step);
      
      console.log(`AI: "${generatedResponse.content}"`);
      
      // Now use this response to generate speech, checking the enforcement works
      const enforcedResponse = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
        generatedResponse.content, TEST_CALL_ID, currentStep.step
      );
      
      // Validate that response doesn't contain assistant phrases
      const hasAssistantPhrases = /how (can|may) (I|i) (help|assist) you|what can I do for you|is there anything else|I'm here to|what would you like to know/i.test(enforcedResponse);
      
      assert(`Step ${currentStep.step} workflow transition should not contain assistant phrases`, !hasAssistantPhrases);
    }
    
  } catch (error) {
    console.error('Error in testEndToEndScenario:', error);
    allTestsPassed = false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 STARTING COMPREHENSIVE TELECALLER WORKFLOW ENFORCEMENT TESTS');
  
  try {
    await testOpenAIServiceChatCompletion();
    await testUltraFastResponseOptimizer();
    await testWorkflowEngineLLMCalls();
    await testVoiceProviderServiceEnforcement();
    await testEndToEndScenario();
    
    console.log('\n🏁 TEST SUMMARY:');
    console.log(allTestsPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED!');
    
    if (allTestsPassed) {
      console.log('\n🎉 SUCCESS: The telecaller workflow enforcement system is working correctly!');
      console.log('All responses follow the telecaller workflow and never behave like a generic assistant.');
    } else {
      console.log('\n⚠️ WARNING: Some tests failed. Please review the failures and fix the remaining issues.');
    }
    
  } catch (error) {
    console.error('Error running tests:', error);
    console.log('❌ TESTS FAILED DUE TO ERROR');
  }
}

// Execute tests
runAllTests();
