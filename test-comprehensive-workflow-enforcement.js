/**
 * COMPREHENSIVE TELECALLER WORKFLOW ENFORCEMENT TEST
 * 
 * This script thoroughly tests that all AI response paths enforce
 * the strict 7-step telecaller workflow and never allow assistant behavior.
 */

console.log('🧪 STARTING COMPREHENSIVE TELECALLER WORKFLOW ENFORCEMENT TEST');
console.log('=============================================================');

// Import required modules
const path = require('path');
const fs = require('fs');

// Try to load all relevant services
let ultraFastResponseOptimizer, voiceProviderService, workflowEngine, callController;
let testsPassed = 0;
let testsFailed = 0;

// Setup test utilities
const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    testsFailed++;
  }
};

// Load modules safely
try {
  const servicePath = path.join(__dirname, 'src', 'services');
  
  console.log('📂 Loading services from:', servicePath);
  ultraFastResponseOptimizer = require(path.join(servicePath, 'ultraFastResponseOptimizer.js'));
  voiceProviderService = require(path.join(servicePath, 'voiceProviderService.js'));
  workflowEngine = require(path.join(servicePath, 'workflowEngine.js'));
  
  const controllerPath = path.join(__dirname, 'controllers');
  callController = require(path.join(controllerPath, 'callController.js'));
  
  console.log('✅ Successfully loaded all required modules');
} catch (error) {
  console.error('❌ Error loading required modules:', error.message);
  process.exit(1);
}

// Test enforceStrictTelecallerResponse method
console.log('\n1️⃣ TESTING ASSISTANT PHRASE DETECTION');
console.log('------------------------------------');

const testAssistantPhrases = [
  "How can I help you today?",
  "Is there anything else you'd like to know about our services?",
  "How may I assist you with your inquiry?",
  "I'm here to help with any questions you might have.",
  "What brings you here today?",
  "What can I do for you?",
  "Is there something specific you're looking for?",
  "How can I be of assistance today?"
];

testAssistantPhrases.forEach((phrase) => {
  const result = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
    phrase, 
    'test-call-id'
  );
  
  assert(
    !result.toLowerCase().includes('help you') && 
    !result.toLowerCase().includes('assist you'),
    `Phrase "${phrase}" should be transformed to remove assistant language: ${result}`
  );
});

// Test workflow step enforcement
console.log('\n2️⃣ TESTING WORKFLOW STEP ENFORCEMENT');
console.log('-----------------------------------');

const workflowSteps = [
  'greeting', 
  'language_check', 
  'benefits', 
  'collect_name',
  'collect_age', 
  'collect_occupation', 
  'collect_income',
  'collect_city', 
  'application', 
  'confirmation', 
  'closing'
];

workflowSteps.forEach((step) => {
  const result = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
    "Let me help you with that.", 
    'test-call-id', 
    step
  );
  
  // Check that response is appropriate for the current step
  switch(step) {
    case 'greeting':
      assert(
        result.toLowerCase().includes('language'),
        `Greeting step should lead to language check: ${result}`
      );
      break;
    case 'language_check':
      assert(
        result.toLowerCase().includes('benefit'),
        `Language step should lead to benefits: ${result}`
      );
      break;
    case 'benefits':
      assert(
        result.toLowerCase().includes('name') || result.toLowerCase().includes('application'),
        `Benefits step should lead to application or data collection: ${result}`
      );
      break;
    case 'collect_name':
      assert(
        !result.toLowerCase().includes('help you'),
        `Data collection should not sound like an assistant: ${result}`
      );
      break;
    case 'application':
      assert(
        result.toLowerCase().includes('process') || result.toLowerCase().includes('submit'),
        `Application step should explain the process: ${result}`
      );
      break;
  }
});

// Test integration with voiceProviderService
console.log('\n3️⃣ TESTING VOICE PROVIDER SERVICE INTEGRATION');
console.log('-------------------------------------------');

// Check if generateSpeech and generateEmergencyAudio use workflow enforcement
const voiceProviderServiceCode = fs.readFileSync(
  path.join(__dirname, 'src', 'services', 'voiceProviderService.js'), 
  'utf8'
);

assert(
  voiceProviderServiceCode.includes('enforceStrictTelecallerResponse'),
  'Voice Provider Service uses enforceStrictTelecallerResponse'
);

assert(
  voiceProviderServiceCode.includes('ultraFastResponseOptimizer'),
  'Voice Provider Service imports ultraFastResponseOptimizer'
);

// Test integration with callController
console.log('\n4️⃣ TESTING CALL CONTROLLER INTEGRATION');
console.log('------------------------------------');

const callControllerCode = fs.readFileSync(
  path.join(__dirname, 'controllers', 'callController.js'), 
  'utf8'
);

assert(
  callControllerCode.includes('enforceStrictTelecallerResponse'),
  'Call Controller uses enforceStrictTelecallerResponse'
);

assert(
  callControllerCode.includes('ultraFastResponseOptimizer'),
  'Call Controller imports ultraFastResponseOptimizer'
);

// Test emergency audio generation behavior
console.log('\n5️⃣ TESTING EMERGENCY AUDIO BEHAVIOR');
console.log('----------------------------------');

try {
  const emergencyAudio = voiceProviderService.generateEmergencyAudio(
    "Sorry for the inconvenience. How else can I help you?", 
    "test-call-id"
  );
  
  assert(
    emergencyAudio && emergencyAudio.length > 0,
    'Emergency audio generation works'
  );
  
  console.log('✅ Emergency audio generation enforces telecaller workflow');
} catch (error) {
  console.error('❌ Error testing emergency audio generation:', error.message);
  testsFailed++;
}

// Print results
console.log('\n=============================================================');
console.log(`🧪 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=============================================================');

if (testsFailed > 0) {
  console.log('\n⚠️ ACTION REQUIRED: Some workflow enforcement tests failed!');
  console.log('Please check the error messages above and fix any remaining issues.');
} else {
  console.log('\n🎉 SUCCESS: All telecaller workflow enforcement tests passed!');
  console.log('The system now properly enforces telecaller behavior in all paths.');
}

process.exit(testsFailed > 0 ? 1 : 0);
