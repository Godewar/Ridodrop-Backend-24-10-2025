const express = require('express');
const router = express.Router();
const riderController = require('../controllers/riderController');
const upload = require('../utils/multerConfig');

router.post(
  '/create/rider',
  upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'FrontaadharCard', maxCount: 1 },
    { name: 'BackaadharCard', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ]),
  riderController.createRider
);

router.put(
  '/update/rider',
  upload.fields([
    { name: 'vehicleimageFront', maxCount: 1 },
    { name: 'vehicleimageBack', maxCount: 1 },
    { name: 'vehicleRcFront', maxCount: 1 },
    { name: 'vehicleRcBack', maxCount: 1 },
    { name: 'vehicleInsurence', maxCount: 1 },
    { name: 'drivingLicenseFront', maxCount: 1 },
    { name: 'drivingLicenseBack', maxCount: 1 }
  ]),
  riderController.updateRider
);

// Export routes - MUST be before /:id route to avoid conflicts
router.get('/export/excel', riderController.exportDriversToExcel);
router.get('/export/documents', riderController.exportDriversDocuments);

router.get('/get/rider', riderController.getRiderById);
router.get('/:id', riderController.getRiderById); // Support fetching by ID in URL params
router.get('/all/riders', riderController.getAllRiders);

// Update online status and location
router.post('/update-online-status', riderController.updateOnlineStatus);

// Block and Unblock routes
router.patch('/:id/block', riderController.blockRider);
router.patch('/:id/unblock', riderController.unblockRider);

// Delete rider route
router.delete('/:id', riderController.deleteRider);

// Document approval routes
router.patch('/:id/approve-document', riderController.approveIndividualDocument);
router.patch('/:id/reject-document', riderController.rejectIndividualDocument);
router.patch('/:id/approve', riderController.approveAllDocuments);
router.patch('/:id/reject', riderController.rejectAllDocuments);

module.exports = router;
