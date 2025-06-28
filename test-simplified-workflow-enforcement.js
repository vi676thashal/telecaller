/**
 * SIMPLIFIED TELECALLER WORKFLOW ENFORCEMENT TEST
 * 
 * This test script focuses only on the local validation aspects of the telecaller workflow
 * enforcement. It doesn't require any OpenAI API keys or external service calls.
 */

// Use relative path for requiring the module
const path = require('path');
console.log('Current directory:', __dirname);
console.log('Attempting to load ultraFastResponseOptimizer...');
const ultraFastResponseOptimizer = require('./src/services/ultraFastResponseOptimizer');

// Test ID
const TEST_CALL_ID = 'test-call-' + Date.now();

console.log('🧪 STARTING SIMPLIFIED TELECALLER WORKFLOW ENFORCEMENT TESTS');

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
 * Test Case: Validate UltraFastResponseOptimizer enforcement mechanisms
 */
function testUltraFastResponseOptimizer() {
  console.log('\n🔍 TEST CASE: UltraFast Response Optimizer Enforcement\n');
  try {
    // Test with assistant-like phrases that should be stripped
    const assistantPhrases = [
      {
        phrase: "How can I help you with this credit card?",
        step: "benefits",
        description: "Basic assistant question"
      },
      {
        phrase: "Is there anything else you need help with today?",
        step: "collect_name",
        description: "Follow-up assistance question"
      },
      {
        phrase: "I'm an AI assistant here to help with your credit card questions",
        step: "benefits",
        description: "AI self-identification"
      },
      {
        phrase: "What would you like to know about our services?",
        step: "language_check",
        description: "Open-ended assistance question"
      },
      {
        phrase: "Feel free to ask me any questions about the credit card",
        step: "collect_age",
        description: "Invitation for questions"
      },
      {
        phrase: "I'm here to answer any questions you might have about the credit card.",
        step: "greeting",
        description: "Service offering phrase"
      },
      {
        phrase: "Do you have any concerns I can address about the credit card?",
        step: "benefits",
        description: "Concern-oriented assistance"
      }
    ];

    for (let i = 0; i < assistantPhrases.length; i++) {
      const test = assistantPhrases[i];
      const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
        test.phrase, TEST_CALL_ID, test.step
      );

      // Check if the problematic phrase is removed
      const stillHasAssistantPhrases = new RegExp(test.phrase.substring(0, 15).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(enforced);
      
      assert(`Should clean ${test.description}`, !stillHasAssistantPhrases);
      console.log(`Original: "${test.phrase}"`);
      console.log(`Enforced: "${enforced}"\n`);
    }

    // Test workflow enforcement for specific steps
    const steps = [
      { type: 'greeting', expectedKeywords: ['language', 'English', 'Hindi', 'prefer'] },
      { type: 'language_check', expectedKeywords: ['benefit', 'advantage', 'feature', 'offer'] },
      { type: 'benefits', expectedKeywords: ['application', 'proceed', 'name', 'interest'] },
      { type: 'collect_name', expectedKeywords: ['name', 'full name'] },
      { type: 'collect_age', expectedKeywords: ['age', 'old', 'year'] },
      { type: 'collect_occupation', expectedKeywords: ['occupation', 'profession', 'work', 'job'] },
      { type: 'collect_income', expectedKeywords: ['income', 'earning', 'salary', 'month'] },
      { type: 'collect_city', expectedKeywords: ['city', 'location', 'reside', 'live'] },
      { type: 'collect_email', expectedKeywords: ['email', 'mail', '@'] },
      { type: 'application', expectedKeywords: ['application', 'process', 'submit', 'proceed'] },
      { type: 'confirmation', expectedKeywords: ['confirm', 'process', 'submitted', 'application'] },
      { type: 'closing', expectedKeywords: ['thank', 'appreciate', 'interest', 'opportunity'] }
    ];
    
    for (const step of steps) {
      // Use a generic response that doesn't contain any step-specific keywords
      const genericResponse = "Thank you for your time.";
      const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
        genericResponse, TEST_CALL_ID, step.type
      );

      // Check if the response now contains step-specific keywords
      const hasRequiredKeyword = step.expectedKeywords.some(keyword => 
        enforced.toLowerCase().includes(keyword.toLowerCase())
      );
      
      assert(`Should enforce workflow for ${step.type} step`, hasRequiredKeyword);
      console.log(`Step ${step.type} response: "${enforced}"`);
      console.log(`Required keywords: ${step.expectedKeywords.join(', ')}\n`);
    }

    // Test resilience against creative assistant phrases
    const creativeAssistantPhrases = [
      "Perhaps I could assist you with understanding more about this credit card",
      "Would it be helpful if I explained the benefits in more detail?",
      "I'd be delighted to provide any clarification you might need",
      "Don't hesitate to ask if anything isn't clear about our offering",
      "I'm at your service regarding any aspect of this credit card"
    ];

    for (let i = 0; i < creativeAssistantPhrases.length; i++) {
      const phrase = creativeAssistantPhrases[i];
      // Test with different steps to ensure consistent enforcement
      const stepTypes = ['benefits', 'collect_name', 'application'];
      
      for (const step of stepTypes) {
        const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
          phrase, TEST_CALL_ID, step
        );

        // The enforced response should follow the telecaller script for the given step
        const containsOriginalAssistantPhrasing = enforced.includes(phrase.substring(5, 20));
        assert(`Should replace creative assistant phrase ${i+1} in ${step} step`, !containsOriginalAssistantPhrasing);
        console.log(`Step: ${step}`);
        console.log(`Original: "${phrase}"`);
        console.log(`Enforced: "${enforced}"\n`);
      }
    }

  } catch (error) {
    console.error('Error in testUltraFastResponseOptimizer:', error);
    allTestsPassed = false;
  }
  
  return allTestsPassed;
}

// Run the test
const testResult = testUltraFastResponseOptimizer();

// Print summary
console.log('\n🏁 TEST SUMMARY:');
console.log(testResult ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED!');

if (testResult) {
  console.log('\n🎉 SUCCESS: The telecaller workflow enforcement system is correctly enforcing telecaller behavior!');
  console.log('All responses follow the telecaller workflow and never behave like a generic assistant.');
  console.log('\nThis confirms that the enforcement mechanisms are working correctly. For a complete validation');
  console.log('including LLM integration, run the full test suite with API keys configured.');
} else {
  console.log('\n⚠️ WARNING: Some tests failed. Please review the failures and fix the remaining issues.');
}
