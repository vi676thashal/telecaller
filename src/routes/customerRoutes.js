const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

// Routes for customer management
router.get('/', customerController.getAllCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;
