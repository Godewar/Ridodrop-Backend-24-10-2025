const express = require('express');
const router = express.Router();
const priceController = require('../controllers/priceController');

// Get all prices (with filters)
router.get('/all', priceController.getAllPrices);

// Get price by ID
router.get('/:id', priceController.getPriceById);

// Create new price
router.post('/create', priceController.createPrice);

// Update price
router.put('/:id', priceController.updatePrice);

// Delete price
router.delete('/:id', priceController.deletePrice);

// Bulk create prices
router.post('/bulk', priceController.bulkCreatePrices);

module.exports = router;
