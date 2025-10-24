const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

// Get all services (with filters)
router.get('/all', serviceController.getAllServices);

// Get unique cities for service
router.get('/cities', serviceController.getCitiesForService);

// Get service by ID
router.get('/:id', serviceController.getServiceById);

// Create new service
router.post('/create', serviceController.createService);

// Update service
router.put('/:id', serviceController.updateService);

// Delete service
router.delete('/:id', serviceController.deleteService);

// Toggle service status
router.patch('/:id/toggle', serviceController.toggleServiceStatus);

// Bulk create services
router.post('/bulk', serviceController.bulkCreateServices);

module.exports = router;
