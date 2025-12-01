const Booking = require('../models/Booking');
const User = require('../models/User');
const RiderSchema = require('../models/RiderSchema');
const crypto = require('crypto');

// Generate a shareable token for trip tracking
exports.generateShareToken = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.body; // Verify the user owns this booking

    console.log('🔗 Generating share token for booking:', bookingId);

    // Find the booking and verify ownership
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify user owns this booking
    if (booking.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to share this trip'
      });
    }

    // Generate unique token (24 characters, URL-safe)
    const shareToken = crypto.randomBytes(12).toString('hex');

    // Save token to booking (add shareToken field)
    booking.shareToken = shareToken;
    booking.shareTokenCreatedAt = new Date();
    await booking.save();

    console.log('✅ Share token generated:', shareToken);

    res.json({
      success: true,
      shareToken,
      shareUrl: `http://192.168.1.33:3000/track-trip/${shareToken}`,
      message: 'Share link generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating share token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate share link',
      error: error.message
    });
  }
};

// Get trip details by share token (public endpoint)
exports.getSharedTripDetails = async (req, res) => {
  try {
    const { token } = req.params;

    console.log('🔍 Getting shared trip details for token:', token);

    // Find booking by share token
    const booking = await Booking.findOne({ shareToken: token })
      .populate('driver', 'name phone vehicleNumber vehicleType')
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found or sharing link has expired'
      });
    }

    // Get customer details
    let customer = null;
    if (booking.userId) {
      customer = await User.findOne({
        $or: [
          { customerId: booking.userId },
          { phone: booking.userId },
          { _id: booking.userId }
        ]
      }).select('name phone').lean();
    }

    // Prepare trip details for sharing (remove sensitive info)
    const tripDetails = {
      orderId: booking.orderId || booking._id.toString().slice(-8).toUpperCase(),
      status: booking.status,
      bookingStatus: booking.bookingStatus,
      currentStep: booking.currentStep,
      vehicleType: booking.vehicleType,
      
      // Customer info (limited)
      customer: customer ? {
        name: customer.name || 'Customer',
        // Don't share full phone number for privacy
        phone: customer.phone ? `${customer.phone.slice(0, 3)}****${customer.phone.slice(-3)}` : null
      } : null,
      
      // Driver/Rider info
      rider: booking.driver ? {
        name: booking.driver.name,
        vehicleNumber: booking.driver.vehicleNumber,
        vehicleType: booking.driver.vehicleType,
        // Don't share full phone number for privacy
        phone: booking.driver.phone ? `${booking.driver.phone.slice(0, 3)}****${booking.driver.phone.slice(-3)}` : null
      } : null,
      
      // Addresses
      fromAddress: booking.fromAddress ? {
        address: booking.fromAddress.address,
        receiverName: booking.fromAddress.receiverName
      } : null,
      
      dropLocation: booking.dropLocation ? booking.dropLocation.map(drop => ({
        address: drop.address || drop.Address || drop.Address1,
        receiverName: drop.receiverName || drop.ReciversName,
        latitude: drop.latitude,
        longitude: drop.longitude
      })) : [],
      
      // Timing info
      createdAt: booking.createdAt,
      riderAcceptTime: booking.riderAcceptTime,
      riderEndTime: booking.riderEndTime,
      
      // Payment info (limited)
      paymentMethod: booking.payFrom || 'Cash',
      amount: booking.price || booking.amountPay,
      
      // Distance
      distanceKm: booking.distanceKm,
      
      // Current location (if available and trip is active)
      currentLocation: booking.status === 'in_progress' ? booking.currentLocation : null
    };

    console.log('✅ Returning shared trip details');

    res.json({
      success: true,
      trip: tripDetails,
      lastUpdated: new Date()
    });

  } catch (error) {
    console.error('❌ Error getting shared trip details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trip details',
      error: error.message
    });
  }
};

// Update trip location for live tracking (called by driver app)
exports.updateTripLocation = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { latitude, longitude, riderId } = req.body;

    console.log('📍 Updating trip location for booking:', bookingId);

    // Find booking and verify rider
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify rider is assigned to this booking
    if (booking.rider !== riderId && booking.driver.toString() !== riderId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this trip'
      });
    }

    // Update current location
    booking.currentLocation = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timestamp: new Date()
    };

    await booking.save();

    // Broadcast location update via WebSocket to trip watchers
    if (global.wsServer && booking.shareToken) {
      const watchers = global.wsServer.tripWatchers.get(booking.shareToken);
      if (watchers && watchers.size > 0) {
        const locationUpdate = {
          type: 'trip_location_update',
          shareToken: booking.shareToken,
          location: {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            timestamp: new Date()
          },
          status: booking.status,
          currentStep: booking.currentStep
        };

        watchers.forEach(ws => {
          global.wsServer.sendToClient(ws, locationUpdate);
        });

        console.log(`📍 Location broadcasted to ${watchers.size} trip watchers`);
      }
    }

    console.log('✅ Trip location updated successfully');

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: booking.currentLocation
    });

  } catch (error) {
    console.error('❌ Error updating trip location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};

// Revoke/disable share token
exports.revokeShareToken = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.body;

    console.log('🚫 Revoking share token for booking:', bookingId);

    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to revoke this share link'
      });
    }

    // Remove share token
    booking.shareToken = null;
    booking.shareTokenCreatedAt = null;
    await booking.save();

    console.log('✅ Share token revoked successfully');

    res.json({
      success: true,
      message: 'Share link has been disabled'
    });

  } catch (error) {
    console.error('❌ Error revoking share token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke share link',
      error: error.message
    });
  }
};