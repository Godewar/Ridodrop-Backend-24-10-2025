const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

// Get referral statistics for a user by ID
router.get('/stats/:userId', referralController.getReferralStats);

// Get referral statistics by phone number
router.get('/stats', referralController.getReferralStatsByPhone);

// Get all referrals (Admin)
router.get('/all', referralController.getAllReferrals);

// Get referral campaigns info
router.get('/campaigns', referralController.getReferralCampaigns);

// Get single campaign by ID
router.get('/campaigns/:id', referralController.getCampaignById);

// Create a new campaign (Admin)
router.post('/campaigns', referralController.createCampaign);

// Update a campaign (Admin)
router.put('/campaigns/:id', referralController.updateCampaign);

// Delete a campaign (Admin)
router.delete('/campaigns/:id', referralController.deleteCampaign);

// Create a new referral
router.post('/create', referralController.createReferral);

// Update referral status
router.patch('/:id/status', referralController.updateReferralStatus);

// Manual milestone credit by admin
router.post('/manual-credit', referralController.manualCreditMilestone);

module.exports = router;
