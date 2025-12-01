const express = require('express');
const router = express.Router();
const {
  generateShareToken,
  getSharedTripDetails,
  updateTripLocation,
  revokeShareToken
} = require('../controllers/tripSharingController');
const { auth } = require('../middlewares/auth');

// Generate share token (protected route)
router.post('/generate-share-token/:bookingId', auth, generateShareToken);

// Get shared trip details (public route)
router.get('/track-trip/:token', getSharedTripDetails);

// Update trip location for live tracking (protected route)
router.put('/update-location/:bookingId', auth, updateTripLocation);

// Revoke share token (protected route)
router.delete('/revoke-share-token/:bookingId', auth, revokeShareToken);

module.exports = router;