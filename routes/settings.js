const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  testFeeCalculation,
  getSettingsHistory,
  resetToDefault
} = require('../controllers/settingsController');
const { adminAuth, checkPermission } = require('../middlewares/adminAuth');

// Get current active settings
router.get('/', getSettings);

// Update settings (admin only)
router.put('/', adminAuth, checkPermission('settings_write'), updateSettings);

// Test fee calculation (admin only)
router.post('/test-calculation', adminAuth, testFeeCalculation);

// Public fee calculation for customers
router.post('/calculate-fees', testFeeCalculation);

// Get settings history (admin only) 
router.get('/history', adminAuth, getSettingsHistory);

// Reset to default settings (admin only)
router.post('/reset-default', adminAuth, checkPermission('settings_write'), resetToDefault);

module.exports = router;