const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const upload = require('../utils/multerConfig');
const { adminAuth } = require('../middlewares/adminAuth');

// Public routes (for customer app)
router.get('/all', vehicleController.getAllVehicles);
router.get('/type/:vehicleType', vehicleController.getVehiclesByType);
router.get('/:id', vehicleController.getVehicleById);

// Admin routes (protected)
router.post('/', adminAuth, upload.single('image'), vehicleController.createVehicle);
router.put('/:id', adminAuth, upload.single('image'), vehicleController.updateVehicle);
router.delete('/:id', adminAuth, vehicleController.deleteVehicle);

module.exports = router;
