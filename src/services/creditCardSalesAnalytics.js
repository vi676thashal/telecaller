/**
 * Credit Card Sales Analytics Service
 * 
 * Tracks and analyzes credit card sales calls, applications, and conversions
 * Provides real-time performance metrics for the voice agent
 */

const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const Call = require('../models/Call');

class CreditCardSalesAnalytics {
  constructor() {
    this.activeSales = new Map();
    this.salesMetrics = {
      totalCalls: 0,
      totalDuration: 0,
      interruptedCalls: 0,
      interestedCustomers: 0,
      applicationStarted: 0,
      applicationCompleted: 0,
      callsByCardType: {},
      callsByLanguage: {},
      conversionRate: 0,
      averageCallDuration: 0
    };
  }
  
  /**
   * Initialize tracking for a new credit card sales call
   * @param {string} callId - Call identifier
   * @param {Object} initialData - Initial call data
   */
  initializeSalesTracking(callId, initialData = {}) {
    this.activeSales.set(callId, {
      callId,
      cardType: initialData.cardType || 'unknown',
      language: initialData.language || 'english',
      startTime: Date.now(),
      customerInterest: 0, // 0-100 scale
      applicationStatus: 'not_started', // not_started, in_progress, completed, abandoned
      interruptions: 0,
      lastUpdate: Date.now(),
      customerResponseTimes: [],
      keyInsights: [],
      objections: [],
      customerDetails: {}
    });
    
    logger.info(`Credit card sales tracking initialized for call ${callId}`, {
      cardType: initialData.cardType,
      language: initialData.language
    });
    
    this.salesMetrics.totalCalls++;
    
    // Increment card type metrics
    if (initialData.cardType) {
      if (!this.salesMetrics.callsByCardType[initialData.cardType]) {
        this.salesMetrics.callsByCardType[initialData.cardType] = 0;
      }
      this.salesMetrics.callsByCardType[initialData.cardType]++;
    }
    
    // Increment language metrics
    if (initialData.language) {
      if (!this.salesMetrics.callsByLanguage[initialData.language]) {
        this.salesMetrics.callsByLanguage[initialData.language] = 0;
      }
      this.salesMetrics.callsByLanguage[initialData.language]++;
    }
  }
  
  /**
   * Update customer interest level based on conversation
   * @param {string} callId - Call identifier
   * @param {number} interestChange - Change in interest level (-10 to +10)
   * @param {string} reason - Reason for interest change
   */
  updateCustomerInterest(callId, interestChange, reason = '') {
    const call = this.activeSales.get(callId);
    if (!call) return;
    
    // Adjust interest level bounded to 0-100
    call.customerInterest = Math.max(0, Math.min(100, call.customerInterest + interestChange));
    
    // Add insight if significant change
    if (Math.abs(interestChange) >= 5) {
      call.keyInsights.push({
        timestamp: Date.now(),
        type: interestChange > 0 ? 'positive' : 'negative',
        text: reason,
        interestChange
      });
    }
    
    // Update last activity time
    call.lastUpdate = Date.now();
    
    // If interest is high enough, count as interested customer
    if (call.customerInterest >= 60 && !this.salesMetrics.interestedCustomers.includes(callId)) {
      this.salesMetrics.interestedCustomers++;
    }
    
    logger.info(`Customer interest updated for call ${callId}:`, {
      newInterestLevel: call.customerInterest,
      change: interestChange,
      reason
    });
  }
  
  /**
   * Track customer objection during sales call
   * @param {string} callId - Call identifier
   * @param {string} objection - Customer objection
   * @param {string} aiResponse - How AI responded to the objection
   */
  trackCustomerObjection(callId, objection, aiResponse) {
    const call = this.activeSales.get(callId);
    if (!call) return;
    
    call.objections.push({
      timestamp: Date.now(),
      objection,
      aiResponse
    });
    
    logger.info(`Customer objection tracked for call ${callId}:`, { objection });
  }
  
  /**
   * Update application status in the sales process
   * @param {string} callId - Call identifier
   * @param {string} status - Application status (not_started, in_progress, completed, abandoned)
   * @param {string} detail - Additional detail about status change
   */
  updateApplicationStatus(callId, status, detail = '') {
    const call = this.activeSales.get(callId);
    if (!call) return;
    
    const previousStatus = call.applicationStatus;
    call.applicationStatus = status;
    
    // Add to key insights
    call.keyInsights.push({
      timestamp: Date.now(),
      type: 'application_status',
      text: `Application status changed from ${previousStatus} to ${status}: ${detail}`
    });
    
    // Update metrics
    if (status === 'in_progress' && previousStatus === 'not_started') {
      this.salesMetrics.applicationStarted++;
    } else if (status === 'completed' && previousStatus !== 'completed') {
      this.salesMetrics.applicationCompleted++;
      
      // Recalculate conversion rate
      this.salesMetrics.conversionRate = (this.salesMetrics.applicationCompleted / this.salesMetrics.totalCalls) * 100;
    }
    
    logger.info(`Application status updated for call ${callId}:`, {
      previousStatus,
      newStatus: status,
      detail
    });
  }
  
  /**
   * Record customer details for application
   * @param {string} callId - Call identifier
   * @param {Object} details - Customer details collected
   */
  recordCustomerDetails(callId, details) {
    const call = this.activeSales.get(callId);
    if (!call) return;
    
    // Update customer details
    call.customerDetails = {
      ...call.customerDetails,
      ...details
    };
    
    logger.info(`Customer details updated for call ${callId}`, {
      fieldsUpdated: Object.keys(details)
    });
  }
  
  /**
   * Track interruption in sales call
   * @param {string} callId - Call identifier
   */
  trackInterruption(callId) {
    const call = this.activeSales.get(callId);
    if (!call) return;
    
    call.interruptions++;
    
    // Update global metrics
    if (call.interruptions === 1) {
      this.salesMetrics.interruptedCalls++;
    }
    
    logger.info(`Interruption tracked for call ${callId}, count: ${call.interruptions}`);
  }
  
  /**
   * Finalize sales tracking and update metrics
   * @param {string} callId - Call identifier
   * @returns {Object} Final call analytics
   */
  finalizeSalesTracking(callId) {
    const call = this.activeSales.get(callId);
    if (!call) return null;
    
    const endTime = Date.now();
    const callDuration = endTime - call.startTime;
    
    // Update total duration
    this.salesMetrics.totalDuration += callDuration;
    
    // Recalculate average duration
    this.salesMetrics.averageCallDuration = this.salesMetrics.totalDuration / this.salesMetrics.totalCalls;
    
    // Create summary
    const summary = {
      callId: call.callId,
      cardType: call.cardType,
      language: call.language,
      duration: callDuration,
      customerInterest: call.customerInterest,
      applicationStatus: call.applicationStatus,
      interruptions: call.interruptions,
      customerDetails: call.customerDetails,
      applicationCompleted: call.applicationStatus === 'completed',
      keyInsights: call.keyInsights,
      objections: call.objections
    };
    
    // Save data to database
    this._saveSalesDataToDb(call, summary);
    
    // Remove from active tracking
    this.activeSales.delete(callId);
    
    logger.info(`Sales tracking finalized for call ${callId}:`, {
      duration: `${Math.round(callDuration / 1000)}s`,
      customerInterest: call.customerInterest,
      applicationStatus: call.applicationStatus,
      interruptions: call.interruptions
    });
    
    return summary;
  }
  
  /**
   * Save sales tracking data to database
   * @param {Object} call - Call tracking data
   * @param {Object} summary - Call summary
   * @private
   */
  async _saveSalesDataToDb(call, summary) {
    try {
      // Find the call document
      const callDoc = await Call.findOne({ callSid: call.callId });
      
      if (callDoc) {
        // Update with sales data
        callDoc.creditCardSales = summary;
        callDoc.analyticsData = {
          ...callDoc.analyticsData || {},
          customerInterest: call.customerInterest,
          applicationStatus: call.applicationStatus,
          interruptions: call.interruptions,
          objectionCount: call.objections.length
        };
        
        await callDoc.save();
        logger.info(`Saved sales data to database for call ${call.callId}`);
      }
    } catch (error) {
      logger.error(`Error saving sales data to database: ${error.message}`);
    }
  }
  
  /**
   * Get current sales analytics metrics
   * @returns {Object} Current sales metrics
   */
  getSalesMetrics() {
    return {
      ...this.salesMetrics,
      activeCallCount: this.activeSales.size,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get detailed analytics for a call
   * @param {string} callId - Call identifier
   * @returns {Object} Call analytics
   */
  getCallAnalytics(callId) {
    const call = this.activeSales.get(callId);
    if (!call) return null;
    
    const currentDuration = Date.now() - call.startTime;
    
    return {
      callId: call.callId,
      cardType: call.cardType,
      language: call.language,
      duration: currentDuration,
      customerInterest: call.customerInterest,
      applicationStatus: call.applicationStatus,
      interruptions: call.interruptions,
      objectionCount: call.objections.length,
      detailsCollected: Object.keys(call.customerDetails).length,
      isActive: true
    };
  }
}

// Create singleton instance
const creditCardSalesAnalytics = new CreditCardSalesAnalytics();
module.exports = { creditCardSalesAnalytics };
