const express = require('express');
const router = express.Router();
const customerReferralSettingsController = require('../controllers/customerReferralSettingsController');
const { auth, isAdmin } = require('../middlewares/auth');
const { adminAuth } = require('../middlewares/adminAuth');

// Get customer referral settings (admin only)
router.get('/', auth, adminAuth, customerReferralSettingsController.getSettings);

// Update customer referral settings (admin only)
router.put('/', auth, adminAuth, customerReferralSettingsController.updateSettings);

// Toggle customer referral program on/off (admin only)
router.patch('/toggle', auth, adminAuth, customerReferralSettingsController.toggleProgram);

module.exports = router;
