const Customer = require('../models/Customer');

// Controller for customer management
const customerController = {
  // Get all customers
  getAllCustomers: async (req, res) => {
    try {
      const customers = await Customer.find().sort({ createdAt: -1 });
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Get single customer
  getCustomer: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);
      
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Create new customer
  createCustomer: async (req, res) => {
    try {
      const { name, phoneNumber, email, notes } = req.body;
      
      // Validate input
      if (!name || !phoneNumber) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Check if customer with phone number already exists
      const existingCustomer = await Customer.findOne({ phoneNumber });
      if (existingCustomer) {
        return res.status(400).json({ message: 'Customer with this phone number already exists' });
      }
      
      // Create customer
      const customer = new Customer({
        name,
        phoneNumber,
        email,
        notes
      });
      
      await customer.save();
      
      res.status(201).json(customer);
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Update customer
  updateCustomer: async (req, res) => {
    try {
      const { name, phoneNumber, email, notes } = req.body;
      
      // Validate input
      if (!name || !phoneNumber) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Find and update customer
      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        { name, phoneNumber, email, notes },
        { new: true }
      );
      
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Delete customer
  deleteCustomer: async (req, res) => {
    try {
      const customer = await Customer.findByIdAndDelete(req.params.id);
      
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      
      res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = customerController;
