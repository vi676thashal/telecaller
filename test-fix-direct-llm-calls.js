/**
 * DIRECT LLM CALLS FIX VERIFICATION
 * 
 * This script verifies that all direct LLM calls properly enforce telecaller behavior
 * The fix addresses the issue where direct OpenAI calls weren't using the workflow enforcement
 */

const openaiService = require('./src/services/openaiService');
const ultraFastResponseOptimizer = require('./src/services/ultraFastResponseOptimizer');
const workflowEngine = require('./src/services/workflowEngine');

// Simulate a call environment
const TEST_CALL_ID = 'test-fix-call-123';
const TEST_STEP_TYPE = 'benefits';

// Assistant-like phrases that should be caught and fixed
const testMessages = [
  {
    title: 'Direct Generic Assistant',
    messages: [
      { role: 'system', content: 'You are helpful assistant.' },
      { role: 'user', content: 'Tell me about credit cards' }
    ]
  },
  {
    title: 'Direct Help Question',
    messages: [
      { role: 'system', content: 'You are a customer service agent.' },
      { role: 'user', content: 'How do I respond to someone asking about credit card benefits?' }
    ]
  },
  {
    title: 'Simulated Objection Flow',
    messages: [
      { role: 'system', content: 'Respond to a customer objection.' },
      { role: 'user', content: 'I already have too many credit cards, I don\'t need more.' }
    ]
  },
  {
    title: 'Benefits Question',
    messages: [
      { role: 'system', content: 'Answer questions about credit card benefits.' },
      { role: 'user', content: 'What are the cashback benefits of this card?' }
    ]
  }
];

// Test helper functions
const containsAssistantPhrases = (text) => {
  const assistantPhrases = [
    'how can i help you',
    'how may i assist you',
    'what can i do for you',
    'what are you looking for',
    'how can i be of service',
    'what would you like to know',
    'is there anything specific',
    'can i help you with anything',
    'what brings you here today',
    'feel free to ask',
    'i\'m here to help',
    'i\'m an ai',
    'as an assistant',
    'is there anything else'
  ];
  
  text = text.toLowerCase();
  return assistantPhrases.some(phrase => text.includes(phrase));
};

// Run tests
async function runTests() {
  try {
    console.log('🧪 STARTING DIRECT LLM CALLS ENFORCEMENT TEST 🧪\n');

    // Test each message pattern
    for (const [index, test] of testMessages.entries()) {
      console.log(`\nTEST ${index + 1}: ${test.title}`);
      
      console.log(`Running test without callId (pre-fix behavior):`);
      const resultWithoutEnforcement = await openaiService.getChatCompletion(test.messages);
      console.log(`Response: "${resultWithoutEnforcement.content.substring(0, 100)}..."`);
      console.log(`Contains assistant phrases: ${containsAssistantPhrases(resultWithoutEnforcement.content)}`);
      
      console.log(`\nRunning test WITH callId and stepType (post-fix behavior):`);
      const resultWithEnforcement = await openaiService.getChatCompletion(
        test.messages,
        TEST_CALL_ID,
        TEST_STEP_TYPE
      );
      console.log(`Response: "${resultWithEnforcement.content.substring(0, 100)}..."`);
      console.log(`Contains assistant phrases: ${containsAssistantPhrases(resultWithEnforcement.content)}`);
      
      // Verification
      if (containsAssistantPhrases(resultWithEnforcement.content)) {
        console.log(`❌ FAILED: Response still contains assistant-like phrases!`);
      } else {
        console.log(`✅ PASSED: Response properly enforced telecaller behavior!`);
      }
    }
    
    console.log('\n🧪 TEST SUMMARY 🧪');
    console.log('The direct LLM call fix ensures that all OpenAI calls use the');
    console.log('telecaller workflow enforcement, even when called directly from');
    console.log('the workflow engine or other parts of the system.');
    
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();
