const mongoose = require('mongoose');
const Settings = require('../models/Settings');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  initializeDefaultSettings();
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const initializeDefaultSettings = async () => {
  try {
    console.log('🔄 Initializing default fee settings...');

    // Check if settings already exist
    const existingSettings = await Settings.findOne({ isActive: true });
    
    if (existingSettings) {
      console.log('✅ Settings already exist:', {
        id: existingSettings._id,
        version: existingSettings.version,
        platformFees: existingSettings.platformFees,
        gstPercentage: existingSettings.gstPercentage
      });
      
      // Test fee calculation
      console.log('\n🧪 Testing fee calculation...');
      
      const testCases = [
        { amount: 100, vehicleType: '2W' },
        { amount: 100, vehicleType: '3W' },
        { amount: 100, vehicleType: 'Truck' },
        { amount: 100, vehicleType: 'E-Loader' }
      ];
      
      for (const testCase of testCases) {
        const breakdown = existingSettings.calculateFeeBreakdown(testCase.amount, testCase.vehicleType);
        console.log(`\n${testCase.vehicleType} (₹${testCase.amount}):`);
        console.log(`  Platform Fee: ₹${breakdown.platformFee} (${breakdown.platformFeePercentage}%)`);
        console.log(`  GST: ₹${breakdown.gstAmount} (${breakdown.gstPercentage}%)`);
        console.log(`  Rider Earnings: ₹${breakdown.riderEarnings}`);
        console.log(`  Display - Base: ₹${breakdown.displayBreakdown.baseFare}, Distance: ₹${breakdown.displayBreakdown.distanceCharge}, Tax: ₹${breakdown.displayBreakdown.serviceTax}`);
      }
      
      process.exit(0);
    }

    // Create default settings
    const defaultSettings = new Settings({
      platformFees: {
        '2W': 8,     // 8% for bikes
        '3W': 10,    // 10% for 3-wheelers
        'Truck': 12, // 12% for trucks
        'E-Loader': 11 // 11% for e-loaders
      },
      gstPercentage: 0, // 0% GST for now
      displayBreakdown: {
        baseFarePercentage: 60,     // 60% shown as base fare
        distanceChargePercentage: 25, // 25% shown as distance charge
        serviceTaxPercentage: 15    // 15% shown as service tax
      },
      configuration: {
        minimumBookingAmount: 50,
        maxPlatformFeeCap: 1000,
        currency: 'INR'
      },
      isActive: true,
      version: '1.0.0'
    });

    await defaultSettings.save();
    
    console.log('✅ Default settings created successfully:', {
      id: defaultSettings._id,
      platformFees: defaultSettings.platformFees,
      gstPercentage: defaultSettings.gstPercentage,
      version: defaultSettings.version
    });

    // Test the fee calculation
    console.log('\n🧪 Testing fee calculation with new settings...');
    
    const testCases = [
      { amount: 100, vehicleType: '2W' },
      { amount: 100, vehicleType: '3W' },
      { amount: 100, vehicleType: 'Truck' },
      { amount: 100, vehicleType: 'E-Loader' },
      { amount: 500, vehicleType: 'Truck' }
    ];
    
    for (const testCase of testCases) {
      const breakdown = defaultSettings.calculateFeeBreakdown(testCase.amount, testCase.vehicleType);
      console.log(`\n${testCase.vehicleType} (₹${testCase.amount}):`);
      console.log(`  Platform Fee: ₹${breakdown.platformFee} (${breakdown.platformFeePercentage}%)`);
      console.log(`  GST: ₹${breakdown.gstAmount} (${breakdown.gstPercentage}%)`);
      console.log(`  Rider Earnings: ₹${breakdown.riderEarnings}`);
      console.log(`  Display Breakdown:`);
      console.log(`    - Base Fare: ₹${breakdown.displayBreakdown.baseFare}`);
      console.log(`    - Distance Charge: ₹${breakdown.displayBreakdown.distanceCharge}`);
      console.log(`    - Service Tax: ₹${breakdown.displayBreakdown.serviceTax}`);
      console.log(`    - Final Amount: ₹${breakdown.displayBreakdown.finalAmount}`);
    }

    console.log('\n✅ Initialization complete! Settings are ready to use.');
    
  } catch (error) {
    console.error('❌ Error initializing settings:', error);
  } finally {
    mongoose.disconnect();
  }
};

console.log('🚀 Starting settings initialization...');