const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Rider = require('../models/RiderSchema');

// Helper function to calculate and update average rating
const updateUserRating = async (userId, isRider = false) => {
  try {
    console.log(`🔄 Updating ${isRider ? 'rider' : 'user'} rating for ID:`, userId);
    
    const Model = isRider ? Rider : User;
    const reviewField = isRider ? 'riderReview' : 'customerReview';
    
    // Get all completed bookings with reviews for this user
    const matchCondition = isRider 
      ? { $or: [{ rider: userId }, { driver: userId }], status: 'completed' }
      : { userId: userId, status: 'completed' };
    
    const bookings = await Booking.find(matchCondition);
    
    // Extract ratings from reviews
    const ratings = bookings
      .map(booking => booking[reviewField]?.rating)
      .filter(rating => rating !== undefined && rating !== null);
    
    console.log(`📊 Found ${ratings.length} ratings for ${isRider ? 'rider' : 'user'}: ${userId}`);
    
    if (ratings.length === 0) {
      console.log(`⚠️ No ratings found for ${isRider ? 'rider' : 'user'}: ${userId}`);
      return;
    }
    
    // Calculate average rating
    const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
    const averageRating = Math.round((totalRating / ratings.length) * 10) / 10; // Round to 1 decimal
    
    // Count rating breakdown
    const ratingBreakdown = {
      oneStar: ratings.filter(r => r === 1).length,
      twoStar: ratings.filter(r => r === 2).length,
      threeStar: ratings.filter(r => r === 3).length,
      fourStar: ratings.filter(r => r === 4).length,
      fiveStar: ratings.filter(r => r === 5).length
    };
    
    // Update user/rider with new rating data
    await Model.findOneAndUpdate(
      isRider 
        ? { $or: [{ _id: userId }, { phone: userId }, { riderId: userId }] }
        : { $or: [{ _id: userId }, { phone: userId }, { customerId: userId }] },
      {
        averageRating,
        totalReviews: ratings.length,
        ratingBreakdown
      }
    );
    
    console.log(`✅ Updated ${isRider ? 'rider' : 'user'} rating:`, {
      userId,
      averageRating,
      totalReviews: ratings.length,
      ratingBreakdown
    });
    
    return { averageRating, totalReviews: ratings.length, ratingBreakdown };
  } catch (error) {
    console.error(`❌ Error updating ${isRider ? 'rider' : 'user'} rating:`, error);
    throw error;
  }
};

// ✅ SUBMIT CUSTOMER REVIEW: Customer rates Rider
exports.submitCustomerReview = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { rating, feedback, customerId } = req.body;
    
    console.log('📝 Customer review submission:', { bookingId, rating, feedback, customerId });
    
    // Validate required fields
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating is required and must be between 1 and 5'
      });
    }
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Verify booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings'
      });
    }
    
    // Verify customer owns this booking
    if (booking.userId !== customerId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to review this booking'
      });
    }
    
    // Check if customer has already reviewed
    if (booking.customerReview && booking.customerReview.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this booking'
      });
    }
    
    // Add customer review to booking
    booking.customerReview = {
      rating: parseInt(rating),
      feedback: feedback || '',
      reviewedAt: new Date(),
      reviewedBy: customerId
    };
    
    await booking.save();
    
    // Update rider's average rating
    const riderId = booking.driver || booking.rider;
    if (riderId) {
      await updateUserRating(riderId, true);
    }
    
    // Send WebSocket notification to rider about new review
    try {
      const webSocketServer = global.webSocketServer;
      if (webSocketServer) {
        webSocketServer.broadcastReviewNotification({
          bookingId: booking._id,
          reviewBy: customerId,
          reviewFor: riderId,
          rating: parseInt(rating),
          isRiderReview: false // Customer reviewing Rider
        });
      }
    } catch (wsError) {
      console.log('⚠️ WebSocket notification failed:', wsError.message);
    }
    
    console.log('✅ Customer review submitted successfully');
    
    res.status(200).json({
      success: true,
      message: 'Review submitted successfully',
      review: booking.customerReview
    });
    
  } catch (error) {
    console.error('❌ Error submitting customer review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ✅ SUBMIT RIDER REVIEW: Rider rates Customer
exports.submitRiderReview = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { rating, feedback, riderId } = req.body;
    
    console.log('📝 Rider review submission:', { bookingId, rating, feedback, riderId });
    
    // Validate required fields
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating is required and must be between 1 and 5'
      });
    }
    
    if (!riderId) {
      return res.status(400).json({
        success: false,
        message: 'Rider ID is required'
      });
    }
    
    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Verify booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings'
      });
    }
    
    // Verify rider is assigned to this booking
    const assignedRiderId = booking.driver?.toString() || booking.rider;
    if (assignedRiderId !== riderId) {
      // Also check by rider phone or other identifiers
      const rider = await Rider.findOne({
        $or: [
          { _id: riderId },
          { phone: riderId },
          { riderId: riderId }
        ]
      });
      
      if (!rider || (assignedRiderId !== rider._id.toString() && assignedRiderId !== rider.phone && assignedRiderId !== rider.riderId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to review this booking'
        });
      }
    }
    
    // Check if rider has already reviewed
    if (booking.riderReview && booking.riderReview.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this booking'
      });
    }
    
    // Add rider review to booking
    booking.riderReview = {
      rating: parseInt(rating),
      feedback: feedback || '',
      reviewedAt: new Date(),
      reviewedBy: riderId
    };
    
    await booking.save();
    
    // Update customer's average rating
    if (booking.userId) {
      await updateUserRating(booking.userId, false);
    }
    
    // Send WebSocket notification to customer about new review
    try {
      const webSocketServer = global.webSocketServer;
      if (webSocketServer) {
        webSocketServer.broadcastReviewNotification({
          bookingId: booking._id,
          reviewBy: riderId,
          reviewFor: booking.userId,
          rating: parseInt(rating),
          isRiderReview: true // Rider reviewing Customer
        });
      }
    } catch (wsError) {
      console.log('⚠️ WebSocket notification failed:', wsError.message);
    }
    
    console.log('✅ Rider review submitted successfully');
    
    res.status(200).json({
      success: true,
      message: 'Review submitted successfully',
      review: booking.riderReview
    });
    
  } catch (error) {
    console.error('❌ Error submitting rider review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ✅ GET BOOKING REVIEWS: Get both customer and rider reviews for a booking
exports.getBookingReviews = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    console.log('📖 Fetching reviews for booking:', bookingId);
    
    const booking = await Booking.findById(bookingId).select('customerReview riderReview');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    res.status(200).json({
      success: true,
      reviews: {
        customerReview: booking.customerReview || null,
        riderReview: booking.riderReview || null
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching booking reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ✅ GET USER RATING: Get user's average rating and review history
exports.getUserRating = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📊 Fetching user rating for:', userId);
    
    // Find user by multiple possible identifiers
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null },
        { phone: userId },
        { customerId: userId }
      ]
    }).select('averageRating totalReviews ratingBreakdown name phone');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get recent reviews (last 10)
    const recentBookings = await Booking.find({
      userId: user._id.toString(),
      status: 'completed',
      'customerReview.rating': { $exists: true }
    })
    .sort({ 'customerReview.reviewedAt': -1 })
    .limit(10)
    .select('customerReview createdAt');
    
    const recentReviews = recentBookings.map(booking => ({
      rating: booking.customerReview.rating,
      feedback: booking.customerReview.feedback,
      reviewedAt: booking.customerReview.reviewedAt,
      bookingDate: booking.createdAt
    }));
    
    res.status(200).json({
      success: true,
      userRating: {
        userId: user._id,
        name: user.name,
        phone: user.phone,
        averageRating: user.averageRating || 0,
        totalReviews: user.totalReviews || 0,
        ratingBreakdown: user.ratingBreakdown || {
          oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0
        },
        recentReviews
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user rating:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ✅ GET RIDER RATING: Get rider's average rating and review history
exports.getRiderRating = async (req, res) => {
  try {
    const { riderId } = req.params;
    
    console.log('📊 Fetching rider rating for:', riderId);
    
    // Find rider by multiple possible identifiers
    const rider = await Rider.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(riderId) ? riderId : null },
        { phone: riderId },
        { riderId: riderId }
      ]
    }).select('averageRating totalReviews ratingBreakdown name phone riderId vehicleType');
    
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }
    
    // Get recent reviews (last 10)
    const recentBookings = await Booking.find({
      $or: [
        { driver: rider._id, status: 'completed', 'riderReview.rating': { $exists: true } },
        { rider: rider.phone, status: 'completed', 'riderReview.rating': { $exists: true } },
        { rider: rider.riderId, status: 'completed', 'riderReview.rating': { $exists: true } }
      ]
    })
    .sort({ 'riderReview.reviewedAt': -1 })
    .limit(10)
    .select('riderReview createdAt');
    
    const recentReviews = recentBookings.map(booking => ({
      rating: booking.riderReview.rating,
      feedback: booking.riderReview.feedback,
      reviewedAt: booking.riderReview.reviewedAt,
      bookingDate: booking.createdAt
    }));
    
    res.status(200).json({
      success: true,
      riderRating: {
        riderId: rider._id,
        riderCode: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        vehicleType: rider.vehicleType,
        averageRating: rider.averageRating || 0,
        totalReviews: rider.totalReviews || 0,
        ratingBreakdown: rider.ratingBreakdown || {
          oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0
        },
        recentReviews
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching rider rating:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ✅ GET ALL REVIEWS: Get all reviews with pagination (for admin)
exports.getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all' } = req.query;
    
    console.log('📚 Fetching all reviews:', { page, limit, type });
    
    let matchCondition = { status: 'completed' };
    
    if (type === 'customer') {
      matchCondition['customerReview.rating'] = { $exists: true };
    } else if (type === 'rider') {
      matchCondition['riderReview.rating'] = { $exists: true };
    } else {
      matchCondition['$or'] = [
        { 'customerReview.rating': { $exists: true } },
        { 'riderReview.rating': { $exists: true } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const bookings = await Booking.find(matchCondition)
      .populate('driver', 'name phone riderId vehicleType')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('customerReview riderReview userId rider driver createdAt updatedAt');
    
    const total = await Booking.countDocuments(matchCondition);
    
    const reviews = bookings.map(booking => ({
      bookingId: booking._id,
      bookingDate: booking.createdAt,
      customerReview: booking.customerReview || null,
      riderReview: booking.riderReview || null,
      customer: { id: booking.userId },
      rider: booking.driver || { phone: booking.rider }
    }));
    
    res.status(200).json({
      success: true,
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalReviews: total,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching all reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};