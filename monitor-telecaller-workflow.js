/**
 * MONITOR-TELECALLER-WORKFLOW.JS
 * 
 * This script monitors the production system to ensure that all AI responses
 * strictly follow the telecaller workflow and never revert to assistant-like behavior.
 * 
 * Run this periodically to validate ongoing compliance.
 */

const ultraFastResponseOptimizer = require('./src/services/ultraFastResponseOptimizer');
const Call = require('./src/models/Call');
const CallState = require('./src/models/CallState');
const fs = require('fs');
const path = require('path');
const { logger } = require('./src/utils/logger');

// Override logger for cleaner output
logger.info = console.log;
logger.error = console.error;
logger.warning = console.warn;

// Configuration
const MONITOR_CONFIG = {
  // How many recent calls to check
  sampleSize: 20,
  
  // Whether to log all violations to a file
  logViolations: true,
  
  // Path for violation logs
  violationLogPath: './logs/telecaller_violations.log',
  
  // Sample phrases to test for assistant-like behavior detection
  testPhrases: [
    "How can I help you today?",
    "Is there anything else you'd like to know about?",
    "What questions do you have for me?",
    "I'm here to assist you with any concerns",
    "Feel free to ask me anything about the card",
    "How may I assist you with your application?",
    "Would you like me to explain any features?",
    "I'm happy to provide more information",
    "Do you need help with anything else?",
    "What would you like to know more about?"
  ],
  
  // Test all workflow steps
  testSteps: [
    'greeting',
    'language_check',
    'benefits',
    'collect_name',
    'collect_age',
    'collect_occupation',
    'collect_income',
    'collect_city', 
    'collect_email',
    'application',
    'confirmation',
    'closing'
  ]
};

/**
 * Run the workflow enforcement monitor
 */
async function monitorTelecallerWorkflow() {
  console.log('🔍 STARTING TELECALLER WORKFLOW MONITOR');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log('--------------------------------------------------');
  
  let violationCount = 0;
  let violations = [];
  
  // First validate that the enforcement logic works properly
  console.log('\n1️⃣ VERIFYING ENFORCEMENT LOGIC');
  
  try {
    const enforcementResults = await testEnforcementLogic();
    console.log(`✅ Tested ${enforcementResults.total} enforcement scenarios`);
    
    if (enforcementResults.failures.length > 0) {
      console.error(`❌ Found ${enforcementResults.failures.length} enforcement failures!`);
      violationCount += enforcementResults.failures.length;
      violations = violations.concat(enforcementResults.failures);
      
      for (const failure of enforcementResults.failures.slice(0, 5)) {
        console.error(`   - ${failure.step}: "${failure.input}" → "${failure.output}"`);
      }
      
      if (enforcementResults.failures.length > 5) {
        console.error(`   - ... and ${enforcementResults.failures.length - 5} more`);
      }
    } else {
      console.log('✅ All enforcement tests passed!');
    }
  } catch (err) {
    console.error(`❌ Error testing enforcement logic: ${err.message}`);
    return;
  }
  
  // Next check recent calls if database is available
  console.log('\n2️⃣ CHECKING RECENT CALL HISTORIES');
  
  try {
    // Attempt to find recent calls
    const recentCalls = await Call.find({})
      .sort({ updatedAt: -1 })
      .limit(MONITOR_CONFIG.sampleSize);
    
    if (recentCalls.length > 0) {
      console.log(`✅ Found ${recentCalls.length} recent calls to check`);
      
      // Check each call for workflow compliance
      for (const call of recentCalls) {
        try {
          // Find call states for this call
          const callStates = await CallState.find({ callId: call._id })
            .sort({ createdAt: 1 });
          
          if (!callStates || callStates.length === 0) {
            console.log(`⚠️ No call states found for call ${call._id}`);
            continue;
          }
          
          console.log(`📞 Checking call ${call._id} - ${callStates.length} states`);
          
          // Verify proper workflow progression
          let lastStepType = null;
          
          for (let i = 0; i < callStates.length; i++) {
            const state = callStates[i];
            const currentStepType = state.currentStep?.stepType;
            
            if (!currentStepType) {
              continue;
            }
            
            if (i > 0 && lastStepType) {
              // Check for valid progression
              // This is a simplified check; production version would be more comprehensive
              if (currentStepType === lastStepType) {
                // Same step is OK (e.g., answering questions before moving on)
                continue;
              }
              
              // Check if this is a valid transition per our workflow
              // This is a simplified version of the actual workflow logic
              const validNext = getValidNextSteps(lastStepType);
              
              if (!validNext.includes(currentStepType)) {
                const violation = {
                  callId: call._id,
                  type: 'invalid_progression',
                  description: `Invalid workflow progression from ${lastStepType} to ${currentStepType}`,
                  timestamp: state.createdAt
                };
                
                console.error(`❌ ${violation.description}`);
                violations.push(violation);
                violationCount++;
              }
            }
            
            lastStepType = currentStepType;
          }
        } catch (err) {
          console.error(`❌ Error checking call ${call._id}: ${err.message}`);
        }
      }
    } else {
      console.log('⚠️ No recent calls found to check');
    }
  } catch (err) {
    // Likely running without database connection
    console.log(`⚠️ Could not check recent calls: ${err.message}`);
    console.log('Continuing with static tests...');
  }
  
  console.log('\n3️⃣ FINAL RESULTS');
  console.log('--------------------------------------------------');
  
  if (violationCount > 0) {
    console.error(`❌ Found ${violationCount} workflow violations!`);
    
    if (MONITOR_CONFIG.logViolations) {
      // Save violations to a log file
      try {
        const logDir = path.dirname(MONITOR_CONFIG.violationLogPath);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logContent = JSON.stringify({
          timestamp: new Date().toISOString(),
          violationCount,
          violations
        }, null, 2);
        
        fs.writeFileSync(MONITOR_CONFIG.violationLogPath, logContent);
        console.log(`✅ Violations logged to ${MONITOR_CONFIG.violationLogPath}`);
      } catch (err) {
        console.error(`❌ Error logging violations: ${err.message}`);
      }
    }
  } else {
    console.log('✅ ALL CHECKS PASSED - No telecaller workflow violations detected');
  }
  
  console.log('--------------------------------------------------');
  console.log('Monitor completed at:', new Date().toISOString());
}

/**
 * Test the enforcement logic with sample inputs
 */
async function testEnforcementLogic() {
  const results = {
    total: 0,
    passed: 0,
    failures: []
  };
  
  // Test each phrase with each step
  for (const step of MONITOR_CONFIG.testSteps) {
    for (const phrase of MONITOR_CONFIG.testPhrases) {
      results.total++;
      
      try {
        // Test if the enforcer properly handles this phrase
        const enforced = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
          phrase,
          'monitor-test-call-id',
          step
        );
        
        // Check if the phrase was properly transformed
        // 1. It shouldn't contain the original assistant-like phrase
        // 2. It should contain step-appropriate content
        
        let containsOriginalPhrase = enforced.toLowerCase().includes(phrase.toLowerCase());
        
        // Check for specific phrases based on step
        let hasStepContext = false;
        
        switch (step) {
          case 'greeting':
            hasStepContext = enforced.toLowerCase().includes('language') || 
                              enforced.toLowerCase().includes('call') ||
                              enforced.toLowerCase().includes('offer');
            break;
          case 'language_check':
            hasStepContext = enforced.toLowerCase().includes('english') || 
                              enforced.toLowerCase().includes('hindi') ||
                              enforced.toLowerCase().includes('language');
            break;
          case 'benefits':
            hasStepContext = enforced.toLowerCase().includes('benefit') || 
                              enforced.toLowerCase().includes('card') ||
                              enforced.toLowerCase().includes('offer');
            break;
          case 'collect_name':
            hasStepContext = enforced.toLowerCase().includes('name');
            break;
          case 'collect_age':
            hasStepContext = enforced.toLowerCase().includes('age');
            break;
          // Add more step-specific checks as needed
          default:
            // For other steps, just check that the phrase was changed
            hasStepContext = !containsOriginalPhrase;
        }
        
        if (containsOriginalPhrase || !hasStepContext) {
          // This is a failure - the phrase wasn't properly transformed
          results.failures.push({
            step,
            input: phrase,
            output: enforced,
            reason: containsOriginalPhrase ? 
              'Contains original assistant phrase' : 
              'Missing step-specific context'
          });
        } else {
          results.passed++;
        }
      } catch (err) {
        results.failures.push({
          step,
          input: phrase,
          output: null,
          reason: `Error: ${err.message}`
        });
      }
    }
  }
  
  return results;
}

/**
 * Get valid next steps for a given step type
 */
function getValidNextSteps(stepType) {
  const flowMap = {
    'greeting': ['language_check'],
    'language_check': ['benefits'],
    'benefits': ['collect_name', 'closing', 'objection_handling'],
    'objection_handling': ['collect_name', 'closing'],
    'collect_name': ['collect_age'],
    'collect_age': ['collect_occupation'],
    'collect_occupation': ['collect_income'],
    'collect_income': ['collect_city'],
    'collect_city': ['collect_email'],
    'collect_email': ['application'],
    'application': ['confirmation', 'closing'],
    'confirmation': ['closing'],
    'closing': []
  };
  
  return flowMap[stepType] || [];
}

// Run the monitor
monitorTelecallerWorkflow().catch(err => {
  console.error('Error running workflow monitor:', err);
});
