const Settings = require('../models/Settings');

// Get current active settings
exports.getSettings = async (req, res) => {
  try {
    console.log('📥 Getting current settings...');

    let settings = await Settings.findOne({ isActive: true }).sort({ effectiveFrom: -1 });

    // If no settings found, create and return default settings
    if (!settings) {
      console.log('⚠️ No active settings found, creating default settings');
      settings = new Settings({
        platformFees: {
          '2W': 8,
          '3W': 10,
          'Truck': 12,
          'E-Loader': 11
        },
        gstPercentage: 0,
        displayBreakdown: {
          baseFarePercentage: 60,
          distanceChargePercentage: 25,
          serviceTaxPercentage: 15
        },
        isActive: true
      });
      await settings.save();
      console.log('✅ Default settings created');
    }

    console.log('📦 Returning settings:', {
      id: settings._id,
      platformFees: settings.platformFees,
      gstPercentage: settings.gstPercentage,
      version: settings.version
    });

    res.json({
      success: true,
      message: 'Settings retrieved successfully',
      settings: {
        id: settings._id,
        platformFees: settings.platformFees,
        gstPercentage: settings.gstPercentage,
        displayBreakdown: settings.displayBreakdown,
        configuration: settings.configuration,
        version: settings.version,
        effectiveFrom: settings.effectiveFrom,
        lastUpdatedBy: settings.lastUpdatedBy,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      }
    });
  } catch (err) {
    console.error('❌ Error getting settings:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving settings',
      error: err.message
    });
  }
};

// Update settings (admin only)
exports.updateSettings = async (req, res) => {
  try {
    console.log('📝 Updating settings with data:', req.body);

    const {
      platformFees,
      gstPercentage,
      displayBreakdown,
      configuration
    } = req.body;

    // Get current active settings
    let settings = await Settings.findOne({ isActive: true }).sort({ effectiveFrom: -1 });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No active settings found'
      });
    }

    // Validate platform fees
    if (platformFees) {
      const validVehicleTypes = ['2W', '3W', 'Truck', 'E-Loader'];
      for (const vehicleType of validVehicleTypes) {
        if (platformFees[vehicleType] !== undefined) {
          const fee = Number(platformFees[vehicleType]);
          if (fee < 0 || fee > 50) {
            return res.status(400).json({
              success: false,
              message: `Platform fee for ${vehicleType} must be between 0% and 50%`
            });
          }
          settings.platformFees[vehicleType] = fee;
        }
      }
    }

    // Validate and update GST percentage
    if (gstPercentage !== undefined) {
      const gst = Number(gstPercentage);
      if (gst < 0 || gst > 30) {
        return res.status(400).json({
          success: false,
          message: 'GST percentage must be between 0% and 30%'
        });
      }
      settings.gstPercentage = gst;
    }

    // Validate and update display breakdown
    if (displayBreakdown) {
      if (displayBreakdown.baseFarePercentage !== undefined) {
        settings.displayBreakdown.baseFarePercentage = Number(displayBreakdown.baseFarePercentage);
      }
      if (displayBreakdown.distanceChargePercentage !== undefined) {
        settings.displayBreakdown.distanceChargePercentage = Number(displayBreakdown.distanceChargePercentage);
      }
      if (displayBreakdown.serviceTaxPercentage !== undefined) {
        settings.displayBreakdown.serviceTaxPercentage = Number(displayBreakdown.serviceTaxPercentage);
      }

      // Validate that breakdown percentages sum up correctly
      const total = settings.displayBreakdown.baseFarePercentage + 
                   settings.displayBreakdown.distanceChargePercentage + 
                   settings.displayBreakdown.serviceTaxPercentage;
      
      if (total !== 100) {
        return res.status(400).json({
          success: false,
          message: `Display breakdown percentages must sum to 100% (currently: ${total}%)`
        });
      }
    }

    // Update configuration if provided
    if (configuration) {
      if (configuration.minimumBookingAmount !== undefined) {
        settings.configuration.minimumBookingAmount = Number(configuration.minimumBookingAmount);
      }
      if (configuration.maxPlatformFeeCap !== undefined) {
        settings.configuration.maxPlatformFeeCap = Number(configuration.maxPlatformFeeCap);
      }
    }

    // Update metadata
    settings.lastUpdatedBy = req.admin?.userId || null; // From admin auth middleware
    settings.version = `${parseInt(settings.version.split('.')[0]) + 1}.0.0`; // Increment major version

    // Save updated settings
    await settings.save();

    console.log('✅ Settings updated successfully:', {
      id: settings._id,
      version: settings.version,
      platformFees: settings.platformFees,
      gstPercentage: settings.gstPercentage
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        id: settings._id,
        platformFees: settings.platformFees,
        gstPercentage: settings.gstPercentage,
        displayBreakdown: settings.displayBreakdown,
        configuration: settings.configuration,
        version: settings.version,
        effectiveFrom: settings.effectiveFrom,
        lastUpdatedBy: settings.lastUpdatedBy,
        updatedAt: settings.updatedAt
      }
    });
  } catch (err) {
    console.error('❌ Error updating settings:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: err.message
    });
  }
};

// Test fee calculation endpoint (admin only)
exports.testFeeCalculation = async (req, res) => {
  try {
    const { amount, vehicleType } = req.body;

    if (!amount || !vehicleType) {
      return res.status(400).json({
        success: false,
        message: 'Amount and vehicleType are required'
      });
    }

    const totalAmount = Number(amount);
    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Get current active settings
    const settings = await Settings.findOne({ isActive: true }).sort({ effectiveFrom: -1 });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No active settings found'
      });
    }

    // Calculate fee breakdown
    const feeBreakdown = settings.calculateFeeBreakdown(totalAmount, vehicleType);

    console.log('🧪 Fee calculation test:', {
      input: { amount: totalAmount, vehicleType },
      output: feeBreakdown
    });

    res.json({
      success: true,
      message: 'Fee calculation completed',
      input: {
        amount: totalAmount,
        vehicleType: vehicleType,
        normalizedVehicleType: feeBreakdown.vehicleType
      },
      breakdown: feeBreakdown
    });
  } catch (err) {
    console.error('❌ Error in fee calculation test:', err);
    res.status(500).json({
      success: false,
      message: 'Error calculating fees',
      error: err.message
    });
  }
};

// Get settings history (admin only)
exports.getSettingsHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const settingsHistory = await Settings.find({})
      .populate('lastUpdatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Settings.countDocuments({});

    res.json({
      success: true,
      message: 'Settings history retrieved successfully',
      history: settingsHistory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('❌ Error getting settings history:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving settings history',
      error: err.message
    });
  }
};

// Reset to default settings (admin only)
exports.resetToDefault = async (req, res) => {
  try {
    console.log('🔄 Resetting to default settings...');

    // Deactivate current settings
    await Settings.updateMany({ isActive: true }, { isActive: false });

    // Create new default settings
    const defaultSettings = new Settings({
      platformFees: {
        '2W': 8,
        '3W': 10,
        'Truck': 12,
        'E-Loader': 11
      },
      gstPercentage: 0,
      displayBreakdown: {
        baseFarePercentage: 60,
        distanceChargePercentage: 25,
        serviceTaxPercentage: 15
      },
      configuration: {
        minimumBookingAmount: 50,
        maxPlatformFeeCap: 1000,
        currency: 'INR'
      },
      isActive: true,
      version: '1.0.0',
      lastUpdatedBy: req.admin?.userId || null
    });

    await defaultSettings.save();

    console.log('✅ Default settings reset successfully');

    res.json({
      success: true,
      message: 'Settings reset to default successfully',
      settings: {
        id: defaultSettings._id,
        platformFees: defaultSettings.platformFees,
        gstPercentage: defaultSettings.gstPercentage,
        displayBreakdown: defaultSettings.displayBreakdown,
        configuration: defaultSettings.configuration,
        version: defaultSettings.version,
        effectiveFrom: defaultSettings.effectiveFrom
      }
    });
  } catch (err) {
    console.error('❌ Error resetting settings:', err);
    res.status(500).json({
      success: false,
      message: 'Error resetting settings',
      error: err.message
    });
  }
};