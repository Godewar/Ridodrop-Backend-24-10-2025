const CustomerReferralSettings = require('../models/CustomerReferralSettings');

// Get customer referral settings
exports.getSettings = async (req, res) => {
  try {
    let settings = await CustomerReferralSettings.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = await CustomerReferralSettings.create({
        referrerReward: 100,
        referredDiscount: 50,
        maxDiscountAmount: 50,
        minBookingAmount: 100,
        isActive: true
      });
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching customer referral settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
};

// Update customer referral settings
exports.updateSettings = async (req, res) => {
  try {
    const {
      referrerReward,
      referredDiscount,
      maxDiscountAmount,
      minBookingAmount,
      isActive
    } = req.body;

    // Validation
    if (referrerReward !== undefined && (referrerReward < 0 || referrerReward > 10000)) {
      return res.status(400).json({
        success: false,
        message: 'Referrer reward must be between 0 and 10000'
      });
    }

    if (referredDiscount !== undefined && (referredDiscount < 0 || referredDiscount > 1000)) {
      return res.status(400).json({
        success: false,
        message: 'Referred discount must be between 0 and 1000'
      });
    }

    if (maxDiscountAmount !== undefined && (maxDiscountAmount < 0 || maxDiscountAmount > 1000)) {
      return res.status(400).json({
        success: false,
        message: 'Max discount amount must be between 0 and 1000'
      });
    }

    if (minBookingAmount !== undefined && (minBookingAmount < 0 || minBookingAmount > 10000)) {
      return res.status(400).json({
        success: false,
        message: 'Min booking amount must be between 0 and 10000'
      });
    }

    // Find and update settings, or create if doesn't exist
    let settings = await CustomerReferralSettings.findOne();
    
    if (!settings) {
      settings = await CustomerReferralSettings.create({
        referrerReward: referrerReward || 100,
        referredDiscount: referredDiscount || 50,
        maxDiscountAmount: maxDiscountAmount || 50,
        minBookingAmount: minBookingAmount || 100,
        isActive: isActive !== undefined ? isActive : true
      });
    } else {
      // Update only provided fields
      if (referrerReward !== undefined) settings.referrerReward = referrerReward;
      if (referredDiscount !== undefined) settings.referredDiscount = referredDiscount;
      if (maxDiscountAmount !== undefined) settings.maxDiscountAmount = maxDiscountAmount;
      if (minBookingAmount !== undefined) settings.minBookingAmount = minBookingAmount;
      if (isActive !== undefined) settings.isActive = isActive;
      
      settings.updatedAt = Date.now();
      await settings.save();
    }

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating customer referral settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error.message
    });
  }
};

// Toggle customer referral program on/off
exports.toggleProgram = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isActive field is required'
      });
    }

    let settings = await CustomerReferralSettings.findOne();
    
    if (!settings) {
      settings = await CustomerReferralSettings.create({
        referrerReward: 100,
        referredDiscount: 50,
        maxDiscountAmount: 50,
        minBookingAmount: 100,
        isActive: isActive
      });
    } else {
      settings.isActive = isActive;
      settings.updatedAt = Date.now();
      await settings.save();
    }

    res.status(200).json({
      success: true,
      message: `Customer referral program ${isActive ? 'activated' : 'deactivated'}`,
      data: settings
    });
  } catch (error) {
    console.error('Error toggling customer referral program:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling program',
      error: error.message
    });
  }
};
