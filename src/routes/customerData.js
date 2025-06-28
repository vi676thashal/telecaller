const express = require('express');
const router = express.Router();
const customerDataCollectionService = require('../services/customerDataCollectionService');
const Call = require('../models/Call');
const Customer = require('../models/Customer');

/**
 * Get all customers with their data for dashboard
 */
router.get('/customers', async (req, res) => {
  try {
    const customers = await customerDataCollectionService.getCustomersForDashboard();
    res.json({
      success: true,
      customers: customers,
      total: customers.length
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer data'
    });
  }
});

/**
 * Get detailed customer information by ID
 */
router.get('/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customer = await Customer.findById(customerId)
      .populate('callHistory.callId')
      .lean();
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer details'
    });
  }
});

/**
 * Get customer data for a specific call
 */
router.get('/calls/:callId/customer-data', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const call = await Call.findById(callId)
      .populate('collectedCustomerData')
      .lean();
    
    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    const progress = await customerDataCollectionService.getCollectionProgress(callId);

    res.json({
      success: true,
      call: {
        id: call._id,
        customerNumber: call.customerNumber,
        status: call.status,
        outcome: call.outcome,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.duration,
        dataCollectionStatus: call.dataCollectionStatus
      },
      customerData: call.collectedCustomerData,
      collectionProgress: progress
    });
  } catch (error) {
    console.error('Error fetching call customer data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call customer data'
    });
  }
});

/**
 * Update customer application status
 */
router.put('/customers/:customerId/status', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { applicationStatus, notes } = req.body;
    
    const validStatuses = ['interested', 'details_collected', 'application_submitted', 'approved', 'rejected', 'pending'];
    
    if (!validStatuses.includes(applicationStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid application status'
      });
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { 
        applicationStatus,
        $push: {
          callHistory: {
            date: new Date(),
            outcome: 'status_updated',
            notes: notes || `Status updated to ${applicationStatus}`
          }
        }
      },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error updating customer status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer status'
    });
  }
});

/**
 * Get customer data statistics for dashboard
 */
router.get('/stats/customer-data', async (req, res) => {
  try {
    const stats = await Customer.aggregate([
      {
        $group: {
          _id: '$applicationStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalCustomers = await Customer.countDocuments();
    const customersWithData = await Customer.countDocuments({
      name: { $ne: 'Unknown' },
      age: { $exists: true }
    });

    const recentCustomers = await Customer.find({})
      .sort({ lastUpdated: -1 })
      .limit(5)
      .select('name phoneNumber applicationStatus lastUpdated')
      .lean();

    res.json({
      success: true,
      statistics: {
        total: totalCustomers,
        withCompleteData: customersWithData,
        dataCompletionRate: totalCustomers > 0 ? Math.round((customersWithData / totalCustomers) * 100) : 0,
        statusBreakdown: stats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentCustomers: recentCustomers
      }
    });
  } catch (error) {
    console.error('Error fetching customer statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer statistics'
    });
  }
});

/**
 * Search customers by name or phone number
 */
router.get('/search/customers', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }

    const customers = await Customer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { city: { $regex: query, $options: 'i' } }
      ]
    })
    .limit(20)
    .sort({ lastUpdated: -1 })
    .lean();

    res.json({
      success: true,
      customers: customers,
      total: customers.length
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search customers'
    });
  }
});

module.exports = router;
