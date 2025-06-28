// Dynamic Bank Configuration Service
const workflowInitializer = require('./workflowInitializer');

class DynamicBankService {
  
  /**
   * Parse bank configuration from prompt or call script
   */
  parseBankFromPrompt(prompt) {
    try {
      const lowerPrompt = prompt.toLowerCase();
      
      // Bank detection patterns
      const bankPatterns = {
        'sbi': ['sbi', 'state bank of india', 'state bank'],
        'hdfc': ['hdfc', 'hdfc bank'],
        'icici': ['icici', 'icici bank'],
        'axis': ['axis', 'axis bank'],
        'kotak': ['kotak', 'kotak mahindra', 'kotak bank'],
        'yesbank': ['yes bank', 'yesbank'],
        'indusind': ['indusind', 'indusind bank'],
        'pnb': ['pnb', 'punjab national bank'],
        'boi': ['bank of india', 'boi'],
        'canara': ['canara bank', 'canara'],
        'union': ['union bank', 'union bank of india']
      };

      // Agent name detection patterns
      const agentPatterns = {
        'priya': ['priya'],
        'rahul': ['rahul'],
        'anjali': ['anjali'],
        'amit': ['amit'],
        'sneha': ['sneha'],
        'vikash': ['vikash', 'vikas'],
        'pooja': ['pooja'],
        'rajesh': ['rajesh']
      };

      let detectedBank = null;
      let detectedAgent = null;

      // Detect bank
      for (const [bank, patterns] of Object.entries(bankPatterns)) {
        if (patterns.some(pattern => lowerPrompt.includes(pattern))) {
          detectedBank = bank;
          break;
        }
      }

      // Detect agent name
      for (const [agent, patterns] of Object.entries(agentPatterns)) {
        if (patterns.some(pattern => lowerPrompt.includes(pattern))) {
          detectedAgent = agent;
          break;
        }
      }

      return {
        bank: detectedBank || 'sbi', // Default to SBI
        agent: detectedAgent || 'priya', // Default to Priya
        confidence: detectedBank ? 0.9 : 0.5
      };

    } catch (error) {
      console.error('Error parsing bank from prompt:', error);
      return {
        bank: 'sbi',
        agent: 'priya',
        confidence: 0.5
      };
    }
  }

  /**
   * Get bank configuration from detected bank
   */
  getBankConfig(bankName, agentName = 'priya') {
    const bankConfigs = {
      'sbi': {
        bankName: 'SBI Bank',
        bankDisplayName: 'SBI',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'SimplySAVE Credit Card',
        cardType: 'sbi_simplysave',
        workflowName: 'SimplySave Credit Card Sales Flow'
      },
      'hdfc': {
        bankName: 'HDFC Bank',
        bankDisplayName: 'HDFC',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'MoneyBack Credit Card',
        cardType: 'hdfc_moneyback',
        workflowName: 'MoneyBack Credit Card Sales Flow'
      },
      'icici': {
        bankName: 'ICICI Bank',
        bankDisplayName: 'ICICI',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'Amazon Pay Credit Card',
        cardType: 'icici_amazon',
        workflowName: 'Amazon Pay Credit Card Sales Flow'
      },
      'axis': {
        bankName: 'Axis Bank',
        bankDisplayName: 'Axis',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'Flipkart Credit Card',
        cardType: 'axis_flipkart',
        workflowName: 'Flipkart Credit Card Sales Flow'
      },
      'kotak': {
        bankName: 'Kotak Mahindra Bank',
        bankDisplayName: 'Kotak',
        agentName: this.capitalizeFirst(agentName),
        cardName: '811 Credit Card',
        cardType: 'kotak_811',
        workflowName: '811 Credit Card Sales Flow'
      },
      'yesbank': {
        bankName: 'Yes Bank',
        bankDisplayName: 'Yes Bank',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'First Exclusive Credit Card',
        cardType: 'yes_first_exclusive',
        workflowName: 'First Exclusive Credit Card Sales Flow'
      },
      'indusind': {
        bankName: 'IndusInd Bank',
        bankDisplayName: 'IndusInd',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'Legends Credit Card',
        cardType: 'indusind_legends',
        workflowName: 'Legends Credit Card Sales Flow'
      },
      'pnb': {
        bankName: 'Punjab National Bank',
        bankDisplayName: 'PNB',
        agentName: this.capitalizeFirst(agentName),
        cardName: 'RuPay Platinum Credit Card',
        cardType: 'pnb_rupay',
        workflowName: 'RuPay Platinum Credit Card Sales Flow'
      }
    };

    return bankConfigs[bankName.toLowerCase()] || bankConfigs['sbi'];
  }

  /**
   * Create workflow based on prompt
   */
  async createWorkflowFromPrompt(prompt) {
    try {
      const parsed = this.parseBankFromPrompt(prompt);
      const config = this.getBankConfig(parsed.bank, parsed.agent);
      
      console.log(`🤖 Auto-detected: ${config.bankDisplayName} Bank with agent ${config.agentName}`);
      
      const workflow = await workflowInitializer.createCustomBankWorkflow(config);
      
      return {
        workflow,
        config,
        detection: parsed,
        success: true
      };

    } catch (error) {
      console.error('Error creating workflow from prompt:', error);
      throw error;
    }
  }

  /**
   * Get or create workflow for a bank
   */
  async getOrCreateWorkflow(bankName, agentName = 'priya') {
    try {
      const config = this.getBankConfig(bankName, agentName);
      
      // Try to get existing workflow
      let workflow = await workflowInitializer.getWorkflowForCard(config.cardType);
      
      if (!workflow) {
        // Create new workflow if it doesn't exist
        workflow = await workflowInitializer.createCustomBankWorkflow(config);
        console.log(`✨ Created new workflow for ${config.bankDisplayName}`);
      } else {
        console.log(`✅ Using existing workflow for ${config.bankDisplayName}`);
      }

      return {
        workflow,
        config,
        success: true
      };

    } catch (error) {
      console.error('Error getting/creating workflow:', error);
      throw error;
    }
  }

  /**
   * Utility to capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Get all supported banks
   */
  getSupportedBanks() {
    return [
      'SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Yes Bank', 
      'IndusInd', 'PNB', 'Bank of India', 'Canara Bank', 'Union Bank'
    ];
  }

  /**
   * Get all supported agent names
   */
  getSupportedAgents() {
    return ['Priya', 'Rahul', 'Anjali', 'Amit', 'Sneha', 'Vikash', 'Pooja', 'Rajesh'];
  }
}

module.exports = new DynamicBankService();
