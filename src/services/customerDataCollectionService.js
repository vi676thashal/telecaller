const Customer = require('../models/Customer');
const Call = require('../models/Call');

/**
 * Customer Data Collection Service
 * Handles collecting and saving customer information during credit card sales calls
 */
class CustomerDataCollectionService {

  /**
   * Initialize customer data collection for a call
   */
  async initializeCustomerDataCollection(callId, phoneNumber) {
    try {
      console.log(`[CustomerData] Initializing data collection for call ${callId}`);
      
      // Check if customer already exists
      let customer = await Customer.findOne({ phoneNumber });
      
      if (!customer) {
        // Create new customer record
        customer = new Customer({
          name: 'Unknown', // Will be updated when collected
          phoneNumber: phoneNumber,
          applicationStatus: 'interested'
        });
        await customer.save();
        console.log(`[CustomerData] Created new customer record: ${customer._id}`);
      } else {
        console.log(`[CustomerData] Found existing customer: ${customer._id}`);
      }

      // Update call record to reference this customer
      let call;
      if (typeof callId === 'string' && callId.length === 24 && /^[a-f\d]{24}$/i.test(callId)) {
        // Valid ObjectId string
        call = await Call.findByIdAndUpdate(callId, {
          collectedCustomerData: customer._id,
          dataCollectionStatus: 'in_progress'
        });
      } else {
        // String callId, search by callId field
        call = await Call.findOneAndUpdate({ callId: callId }, {
          collectedCustomerData: customer._id,
          dataCollectionStatus: 'in_progress'
        });
      }

      return customer;
    } catch (error) {
      console.error('[CustomerData] Error initializing customer data collection:', error);
      throw error;
    }
  }

  /**
   * Collect basic customer information during call
   */
  async collectBasicInformation(callId, data) {
    try {
      console.log(`[CustomerData] Collecting basic info for call ${callId}:`, data);
      
      // Get the call to find associated customer
      let call;
      if (typeof callId === 'string' && callId.length === 24 && /^[a-f\d]{24}$/i.test(callId)) {
        // Valid ObjectId string
        call = await Call.findById(callId).populate('collectedCustomerData');
      } else {
        // String callId, search by callId field
        call = await Call.findOne({ callId: callId }).populate('collectedCustomerData');
      }
      
      if (!call || !call.collectedCustomerData) {
        throw new Error('Customer record not found for this call');
      }

      const customer = call.collectedCustomerData;
      
      // Update customer with collected data
      const updateFields = {};
      
      if (data.name && data.name !== 'Unknown') {
        updateFields.name = data.name;
      }
      
      if (data.email) {
        updateFields.email = data.email;
      }
      
      if (data.age) {
        updateFields.age = parseInt(data.age);
      }
      
      if (data.occupation) {
        updateFields.occupation = data.occupation;
      }
      
      if (data.monthlyIncome) {
        updateFields.monthlyIncome = data.monthlyIncome;
      }
      
      if (data.city) {
        updateFields.city = data.city;
      }
      
      if (data.panCard) {
        updateFields.panCard = data.panCard.toUpperCase();
      }
      
      if (data.cardType) {
        updateFields.interestedCardType = data.cardType;
      }
      
      if (data.bankName) {
        updateFields.bankAppliedTo = data.bankName;
      }

      // Update application status
      updateFields.applicationStatus = 'details_collected';
      
      // Update customer record
      const updatedCustomer = await Customer.findByIdAndUpdate(
        customer._id,
        updateFields,
        { new: true }
      );

      // Add to call history
      await Customer.findByIdAndUpdate(customer._id, {
        $push: {
          callHistory: {
            callId: callId,
            outcome: 'details_collected',
            notes: `Collected: ${Object.keys(updateFields).join(', ')}`
          }
        }
      });

      // Update call status
      if (typeof callId === 'string' && callId.length === 24 && /^[a-f\d]{24}$/i.test(callId)) {
        // Valid ObjectId string
        await Call.findByIdAndUpdate(callId, {
          dataCollectionStatus: 'completed',
          applicationStarted: true
        });
      } else {
        // String callId, search by callId field
        await Call.findOneAndUpdate({ callId: callId }, {
          dataCollectionStatus: 'completed',
          applicationStarted: true
        });
      }

      console.log(`[CustomerData] Updated customer ${customer._id} with collected data`);
      return updatedCustomer;

    } catch (error) {
      console.error('[CustomerData] Error collecting customer information:', error);
      throw error;
    }
  }

  /**
   * Parse customer information from natural language response
   */
  parseCustomerInformation(response, currentField) {
    try {
      const lowerResponse = response.toLowerCase().trim();
      const parsedData = {};

      // Parse based on current field being collected
      switch (currentField) {
        case 'name':
          // Extract name (remove common prefixes)
          const nameMatch = response.replace(/^(my name is|i am|this is|mera naam|naam hai)/i, '').trim();
          if (nameMatch && nameMatch.length > 1) {
            parsedData.name = this.capitalizeWords(nameMatch);
          }
          break;

        case 'age':
          // Extract age
          const ageMatch = response.match(/(\d{1,2})/);
          if (ageMatch && parseInt(ageMatch[1]) >= 18 && parseInt(ageMatch[1]) <= 100) {
            parsedData.age = parseInt(ageMatch[1]);
          }
          break;

        case 'occupation':
          // Map occupation types
          if (lowerResponse.includes('job') || lowerResponse.includes('salaried') || lowerResponse.includes('employee')) {
            parsedData.occupation = 'salaried';
          } else if (lowerResponse.includes('business') || lowerResponse.includes('own')) {
            parsedData.occupation = 'business_owner';
          } else if (lowerResponse.includes('self employed') || lowerResponse.includes('freelance')) {
            parsedData.occupation = 'self_employed';
          }
          break;

        case 'income':
          // Parse income ranges
          if (lowerResponse.includes('25') || lowerResponse.includes('twenty five')) {
            parsedData.monthlyIncome = '25k_50k';
          } else if (lowerResponse.includes('50') || lowerResponse.includes('fifty')) {
            parsedData.monthlyIncome = '50k_1l';
          } else if (lowerResponse.includes('lakh') || lowerResponse.includes('1l')) {
            parsedData.monthlyIncome = '1l_2l';
          } else if (lowerResponse.includes('2') && lowerResponse.includes('lakh')) {
            parsedData.monthlyIncome = '2l_5l';
          }
          break;

        case 'city':
          // Extract city name
          const cityMatch = response.replace(/^(i live in|from|city is)/i, '').trim();
          if (cityMatch && cityMatch.length > 2) {
            parsedData.city = this.capitalizeWords(cityMatch);
          }
          break;

        case 'email':
          // Extract email
          const emailMatch = response.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (emailMatch) {
            parsedData.email = emailMatch[1].toLowerCase();
          }
          break;

        case 'pan':
          // Extract PAN card
          const panMatch = response.match(/([A-Z]{5}[0-9]{4}[A-Z]{1})/i);
          if (panMatch) {
            parsedData.panCard = panMatch[1].toUpperCase();
          }
          break;
      }

      return parsedData;
    } catch (error) {
      console.error('[CustomerData] Error parsing customer information:', error);
      return {};
    }
  }

  /**
   * Get customer data collection progress
   */
  async getCollectionProgress(callId) {
    try {
      // Handle both ObjectId and string callId
      let call;
      if (typeof callId === 'string' && callId.length === 24 && /^[a-f\d]{24}$/i.test(callId)) {
        // Valid ObjectId string
        call = await Call.findById(callId).populate('collectedCustomerData');
      } else {
        // String callId, search by callId field
        call = await Call.findOne({ callId: callId }).populate('collectedCustomerData');
      }
      
      if (!call || !call.collectedCustomerData) {
        return { progress: 0, status: 'not_started' };
      }

      const customer = call.collectedCustomerData;
      const fields = ['name', 'age', 'occupation', 'monthlyIncome', 'city', 'email'];
      const completedFields = fields.filter(field => customer[field] && customer[field] !== 'Unknown');
      
      return {
        progress: Math.round((completedFields.length / fields.length) * 100),
        status: call.dataCollectionStatus,
        completedFields: completedFields,
        customer: customer
      };
    } catch (error) {
      console.error('[CustomerData] Error getting collection progress:', error);
      return { progress: 0, status: 'error' };
    }
  }

  /**
   * Capitalize words for proper name formatting
   */
  capitalizeWords(str) {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  /**
   * Get all customers with their application status for dashboard
   */
  async getCustomersForDashboard() {
    try {
      const customers = await Customer.find({})
        .populate('callHistory.callId')
        .sort({ lastUpdated: -1 })
        .limit(100);

      return customers.map(customer => ({
        id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        applicationStatus: customer.applicationStatus,
        interestedCardType: customer.interestedCardType,
        bankAppliedTo: customer.bankAppliedTo,
        city: customer.city,
        monthlyIncome: customer.monthlyIncome,
        lastUpdated: customer.lastUpdated,
        totalCalls: customer.callHistory.length,
        lastCallOutcome: customer.callHistory.length > 0 ? customer.callHistory[customer.callHistory.length - 1].outcome : null
      }));
    } catch (error) {
      console.error('[CustomerData] Error getting customers for dashboard:', error);
      return [];
    }
  }

  /**
   * Get customer data for a specific call
   */
  async getCustomerData(callId) {
    try {
      console.log(`[CustomerData] Getting customer data for call ${callId}`);
      
      // Find call record
      let call;
      if (typeof callId === 'string' && callId.length === 24 && /^[a-f\d]{24}$/i.test(callId)) {
        call = await Call.findById(callId).populate('collectedCustomerData');
      } else {
        call = await Call.findOne({ callId: callId }).populate('collectedCustomerData');
      }

      if (!call) {
        console.log(`[CustomerData] Call ${callId} not found`);
        return null;
      }

      if (!call.collectedCustomerData) {
        console.log(`[CustomerData] No customer data collected for call ${callId}`);
        return null;
      }

      return call.collectedCustomerData;
    } catch (error) {
      console.error(`[CustomerData] Error getting customer data for call ${callId}:`, error);
      throw error;
    }
  }
}

module.exports = new CustomerDataCollectionService();
