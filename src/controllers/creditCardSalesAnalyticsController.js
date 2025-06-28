/**
 * Credit Card Sales Analytics Controller
 * 
 * API endpoints for real-time and historical analytics of credit card sales calls
 */

const express = require('express');
const { creditCardSalesAnalytics } = require('../services/creditCardSalesAnalytics');
const Call = require('../models/Call');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Get current sales metrics overview
 */
router.get('/metrics/overview', async (req, res) => {
  try {
    const metrics = creditCardSalesAnalytics.getSalesMetrics();
    
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error('Error getting sales metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching sales metrics'
    });
  }
});

/**
 * Get real-time metrics for active calls
 */
router.get('/metrics/active-calls', async (req, res) => {
  try {
    const activeCalls = Array.from(creditCardSalesAnalytics.activeSales.keys())
      .map(callId => creditCardSalesAnalytics.getCallAnalytics(callId))
      .filter(Boolean);
    
    res.json({
      success: true,
      activeCallCount: activeCalls.length,
      activeCalls
    });
  } catch (error) {
    logger.error('Error getting active call metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching active call metrics'
    });
  }
});

/**
 * Get historical data for completed calls
 */
router.get('/historical', async (req, res) => {
  try {
    const { startDate, endDate, cardType, limit = 100 } = req.query;
    
    const query = { 'creditCardSales': { $exists: true } };
    
    // Add date filters if provided
    if (startDate) {
      query.createdAt = { $gte: new Date(startDate) };
    }
    
    if (endDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
    }
    
    // Add card type filter if provided
    if (cardType) {
      query['creditCardSales.cardType'] = cardType;
    }
    
    const calls = await Call.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('callSid to from duration creditCardSales.cardType creditCardSales.customerInterest creditCardSales.applicationStatus creditCardSales.interruptions creditCardSales.applicationCompleted createdAt')
      .lean();
    
    res.json({
      success: true,
      count: calls.length,
      calls
    });
  } catch (error) {
    logger.error('Error getting historical call data:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching historical call data'
    });
  }
});

/**
 * Get detailed analysis for a specific call
 */
router.get('/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    // Try to get from active calls first
    const activeCall = creditCardSalesAnalytics.getCallAnalytics(callId);
    
    if (activeCall) {
      return res.json({
        success: true,
        call: activeCall,
        isActive: true
      });
    }
    
    // If not active, try to get from database
    const call = await Call.findOne({
      callSid: callId,
      'creditCardSales': { $exists: true }
    }).lean();
    
    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }
    
    res.json({
      success: true,
      call: {
        ...call,
        isActive: false
      }
    });
  } catch (error) {
    logger.error(`Error getting call ${req.params.callId} data:`, error);
    res.status(500).json({
      success: false,
      error: 'Error fetching call data'
    });
  }
});

/**
 * Get conversion metrics by card type
 */
router.get('/metrics/by-card-type', async (req, res) => {
  try {
    const pipeline = [
      { $match: { 'creditCardSales': { $exists: true } } },
      { $group: {
        _id: '$creditCardSales.cardType',
        totalCalls: { $sum: 1 },
        completedApplications: {
          $sum: { $cond: [{ $eq: ['$creditCardSales.applicationStatus', 'completed'] }, 1, 0] }
        },
        avgInterest: { $avg: '$creditCardSales.customerInterest' },
        avgInterruptions: { $avg: '$creditCardSales.interruptions' },
        totalDuration: { $sum: '$duration' }
      }},
      { $project: {
        cardType: '$_id',
        totalCalls: 1,
        completedApplications: 1,
        conversionRate: {
          $multiply: [{ $divide: ['$completedApplications', '$totalCalls'] }, 100]
        },
        avgInterest: 1,
        avgInterruptions: 1,
        avgCallDuration: { $divide: ['$totalDuration', '$totalCalls'] }
      }},
      { $sort: { totalCalls: -1 } }
    ];
    
    const cardTypeMetrics = await Call.aggregate(pipeline);
    
    res.json({
      success: true,
      cardTypeMetrics
    });
  } catch (error) {
    logger.error('Error getting card type metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching card type metrics'
    });
  }
});

/**
 * Get metrics by language
 */
router.get('/metrics/by-language', async (req, res) => {
  try {
    const pipeline = [
      { $match: { 'creditCardSales': { $exists: true } } },
      { $group: {
        _id: '$creditCardSales.language',
        totalCalls: { $sum: 1 },
        completedApplications: {
          $sum: { $cond: [{ $eq: ['$creditCardSales.applicationStatus', 'completed'] }, 1, 0] }
        },
        avgInterest: { $avg: '$creditCardSales.customerInterest' },
        avgInterruptions: { $avg: '$creditCardSales.interruptions' }
      }},
      { $project: {
        language: '$_id',
        totalCalls: 1,
        completedApplications: 1,
        conversionRate: {
          $multiply: [{ $divide: ['$completedApplications', '$totalCalls'] }, 100]
        },
        avgInterest: 1,
        avgInterruptions: 1
      }},
      { $sort: { totalCalls: -1 } }
    ];
    
    const languageMetrics = await Call.aggregate(pipeline);
    
    res.json({
      success: true,
      languageMetrics
    });
  } catch (error) {
    logger.error('Error getting language metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching language metrics'
    });
  }
});

module.exports = router;
