const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Rider = require('../models/RiderSchema');
const User = require('../models/User');
const XLSX = require('xlsx');

// Get all orders/bookings with filters
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, vehicleType, status, customerId, riderId, driverId, startDate, endDate } = req.query;

    // Build filter object
    const filter = {};

    if (customerId) {
      filter.userId = customerId;
    }

    // Support filtering by rider/driver ID
    if (riderId || driverId) {
      const riderIdentifier = riderId || driverId;

      // Try to find rider to support both _id and phone number
      let riderFilter = null;

      // Check if it's a MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(riderIdentifier)) {
        riderFilter = { $or: [{ driver: riderIdentifier }] };

        // Also check if this ID matches a rider by phone
        try {
          const riderByPhone = await Rider.findById(riderIdentifier).select('phone');
          if (riderByPhone && riderByPhone.phone) {
            riderFilter.$or.push({ rider: riderByPhone.phone });
          }
        } catch (err) {
          console.log('Could not find rider by ID:', err.message);
        }
      } else {
        // Assume it's a phone number or riderId
        riderFilter = { $or: [{ rider: riderIdentifier }] };

        // Also try to find the ObjectId for this rider
        try {
          const riderByPhone = await Rider.findOne({
            $or: [{ phone: riderIdentifier }, { riderId: riderIdentifier }]
          }).select('_id');

          if (riderByPhone) {
            riderFilter.$or.push({ driver: riderByPhone._id });
          }
        } catch (err) {
          console.log('Could not find rider by phone/riderId:', err.message);
        }
      }

      if (riderFilter) {
        Object.assign(filter, riderFilter);
      }
    }

    if (vehicleType) {
      filter.vehicleType = vehicleType;
    }

    if (status) {
      filter.status = status;
    }

    // Date range filter
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Search filter - search by customer name, rider name, or mobile numbers
    let searchUserIds = [];
    let searchRiderIds = [];
    if (search) {
      try {
        // Search for users (customers) by name or phone
        const users = await User.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { lname: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { customerId: { $regex: search, $options: 'i' } }
          ]
        }).select('_id phone customerId');

        searchUserIds = users.map((u) => u._id.toString());
        const userPhones = users.map((u) => u.phone);
        const userCustomerIds = users.map((u) => u.customerId);

        // Search for riders (drivers) by name or phone
        const riders = await Rider.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { riderId: { $regex: search, $options: 'i' } }
          ]
        }).select('_id phone riderId');

        searchRiderIds = riders.map((r) => r._id);
        const riderPhones = riders.map((r) => r.phone);

        // Build search filter for bookings
        const searchFilters = [];

        // Match by user ID (MongoDB ObjectId or customerId string)
        if (searchUserIds.length > 0) {
          searchFilters.push({ userId: { $in: [...searchUserIds, ...userPhones, ...userCustomerIds] } });
        }

        // Match by rider/driver
        if (searchRiderIds.length > 0) {
          searchFilters.push({ driver: { $in: searchRiderIds } });
          searchFilters.push({ rider: { $in: riderPhones } });
        }

        // Add search filter to main filter
        if (searchFilters.length > 0) {
          if (filter.$or) {
            // Merge with existing $or conditions
            filter.$and = [{ $or: filter.$or }, { $or: searchFilters }];
            delete filter.$or;
          } else {
            filter.$or = searchFilters;
          }
        }
      } catch (searchErr) {
        console.error('❌ Search error:', searchErr);
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings with populated user data
    const bookings = await Booking.find(filter)
      .populate('driver', 'riderId name phone vehicleType vehicleregisterNumber') // Use driver field instead of rider
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log(
      '📦 Sample booking from DB:',
      bookings[0]
        ? {
            userId: bookings[0].userId,
            rider: bookings[0].rider,
            driver: bookings[0].driver
          }
        : 'No bookings'
    );

    // Get total count for pagination
    const total = await Booking.countDocuments(filter);

    // Manually fetch user and rider data since userId and rider are stored as strings
    const transformedBookings = await Promise.all(
      bookings.map(async (booking) => {
        let user = null;
        let riderData = null;

        // Fetch user data manually using the string userId
        if (booking.userId) {
          try {
            // Try to find by customerId or phone or _id
            user = await User.findOne({
              $or: [
                { customerId: booking.userId },
                { phone: booking.userId },
                { _id: mongoose.Types.ObjectId.isValid(booking.userId) ? booking.userId : null }
              ]
            }).select('name lname phone email customerId profilePhoto');

            console.log('👤 Found user:', user ? user.name : 'Not found');
          } catch (err) {
            console.log('❌ Error fetching user:', err.message);
          }
        }

        // Fetch rider data - try both driver (ObjectId) and rider (String) fields
        if (booking.driver) {
          // driver is already populated
          riderData = booking.driver;
          console.log('🚗 Using populated driver:', riderData?.name);
        } else if (booking.rider) {
          // Manually fetch rider using string
          try {
            riderData = await Rider.findOne({
              $or: [
                { phone: booking.rider },
                { riderId: booking.rider },
                { _id: mongoose.Types.ObjectId.isValid(booking.rider) ? booking.rider : null }
              ]
            }).select('riderId name phone vehicleType vehicleregisterNumber');

            console.log('🚗 Found rider:', riderData ? riderData.name : 'Not found');
          } catch (err) {
            console.log('❌ Error fetching rider:', err.message);
          }
        }

        return {
          ...booking.toObject(),
          customer: user
            ? {
                _id: user._id,
                customerId: user.customerId || user._id,
                name: user.name && user.lname ? `${user.name} ${user.lname}` : user.name || user.lname || 'Unknown',
                firstName: user.name,
                lastName: user.lname,
                mobile: user.phone,
                phone: user.phone,
                email: user.email,
                profilePhoto: user.profilePhoto
              }
            : null,
          rider: riderData
            ? {
                _id: riderData._id,
                riderId: riderData.riderId || riderData._id,
                name: riderData.name || 'Unknown Driver',
                phone: riderData.phone,
                mobile: riderData.phone,
                vehicleType: riderData.vehicleType,
                vehicleregisterNumber: riderData.vehicleregisterNumber
              }
            : null
        };
      })
    );

    res.status(200).json({
      success: true,
      bookings: transformedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error in getAllOrders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

exports.createBooking = async (req, res) => {
  try {
    console.log('Create booking request body:', req.body);

    // Destructure all relevant fields from the request body
    const {
      userId,
      amountPay,
      payFrom,
      pickup,
      dropoff,
      stops,
      vehicleType,
      price,
      fromAddress,
      dropLocation,
      bookingStatus = 'pending',
      status = 'pending',
      currentStep = '0',
      cashCollected = false,
      quickFee = 0
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    if (!vehicleType) {
      return res.status(400).json({ message: 'vehicleType is required' });
    }

    // Validate quickFee range
    if (quickFee < 0 || quickFee > 100) {
      return res.status(400).json({ message: 'quickFee must be between 0 and 100' });
    }

    // Handle stops array
    let stopsArray = [];
    if (stops) {
      stopsArray = Array.isArray(stops) ? stops : [stops];
      if (stopsArray.length > 4) {
        return res.status(400).json({ message: 'Maximum 4 stops allowed' });
      }
    }

    // Handle product images if uploaded
    let productImages = [];
    if (req.files && req.files.productImages) {
      productImages = req.files.productImages.map((f) => f.path);
    }
    if (productImages.length > 4) {
      return res.status(400).json({ message: 'Maximum 4 product images allowed' });
    }

    // Ensure dropLocation has proper coordinate structure
    let processedDropLocation = [];
    if (dropLocation && Array.isArray(dropLocation)) {
      processedDropLocation = dropLocation.map((drop) => ({
        address: drop.address || drop.Address || drop.Address1 || '',
        latitude: drop.latitude || 0,
        longitude: drop.longitude || 0,
        Address: drop.Address || drop.address,
        Address1: drop.Address1 || drop.address,
        Address2: drop.Address2 || '',
        landmark: drop.landmark || '',
        pincode: drop.pincode || '',
        ReciversName: drop.ReciversName || drop.receiverName || '',
        ReciversMobileNum: drop.ReciversMobileNum || drop.receiverMobile || '',
        professional: drop.professional || drop.tag || ''
      }));
    }

    // Calculate distance from pickup to drop location
    let distanceKm = null;
    if (fromAddress?.latitude && fromAddress?.longitude && processedDropLocation[0]?.latitude && processedDropLocation[0]?.longitude) {
      const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Radius of earth in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const calculatedDistance = getDistanceFromLatLonInKm(
        fromAddress.latitude,
        fromAddress.longitude,
        processedDropLocation[0].latitude,
        processedDropLocation[0].longitude
      );
      distanceKm = calculatedDistance.toFixed(2);
      console.log(`📏 Calculated booking distance: ${distanceKm} km`);
    }

    // Calculate totalDriverEarnings
    const priceValue = price ? Number(price) : 0;
    const quickFeeValue = Number(quickFee) || 0;
    const totalDriverEarnings = priceValue + quickFeeValue;

    // Build the booking object with exact structure you want
    const bookingData = {
      userId,
      amountPay: amountPay || '0',
      bookingStatus,
      payFrom: payFrom || 'drop',
      stops: stopsArray,
      vehicleType,
      productImages,
      status,
      price: priceValue,
      dropLocation: processedDropLocation,
      fromAddress: fromAddress || null,
      currentStep,
      cashCollected,
      distanceKm: distanceKm || '0',
      quickFee: quickFeeValue,
      totalDriverEarnings: totalDriverEarnings
    };

    console.log('Creating booking with data:', bookingData);

    // Create and save the booking
    const booking = new Booking(bookingData);
    await booking.save();

    console.log('Booking created successfully:', booking._id);

    // ✅ Mark booking as broadcasted with timestamp
    booking.broadcastedAt = new Date();
    booking.broadcastCount = 1;
    await booking.save();

    // ✅ AUTO-CANCEL BOOKING AFTER 5 MINUTES IF NOT ACCEPTED
    setTimeout(async () => {
      try {
        const bookingCheck = await Booking.findById(booking._id);
        
        // If booking still pending after 5 minutes, auto-cancel
        if (bookingCheck && bookingCheck.status === 'pending' && !bookingCheck.rider) {
          console.log(`⏰ Auto-canceling booking ${booking._id} - no driver accepted within 5 minutes`);
          
          bookingCheck.status = 'cancelled';
          bookingCheck.bookingStatus = 'Cancelled';
          bookingCheck.cancelledBy = 'system';
          bookingCheck.cancellationReason = 'No driver available - Auto-cancelled after 5 minutes';
          bookingCheck.cancelledAt = new Date();
          await bookingCheck.save();
          
          console.log(`✅ Booking ${booking._id} auto-cancelled due to timeout`);
          
          // TODO: Notify customer via push notification
        } else {
          console.log(`✅ Booking ${booking._id} was accepted or cancelled manually`);
        }
      } catch (err) {
        console.error(`❌ Error auto-canceling booking ${booking._id}:`, err.message);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // ✅ BROADCAST NEW BOOKING TO NEARBY RIDERS VIA WEBSOCKET
    try {
      if (global.wsServer && typeof global.wsServer.broadcastNewBooking === 'function') {
        console.log('🔔 Broadcasting new booking to WebSocket riders...');
        await global.wsServer.broadcastNewBooking(booking);
      } else {
        console.log('⚠️ WebSocket server not available for broadcasting');
      }
    } catch (wsError) {
      console.error('❌ Error broadcasting to WebSocket:', wsError.message);
      // Don't fail the booking creation if WebSocket broadcast fails
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error('Booking creation error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// exports.updateBooking = async (req, res) => {
//   try {
//     const booking = await Booking.findById(req.params.id);
//     if (!booking) return res.status(404).json({ message: "Booking not found" });
//     if (req.user.role === "rider") {
//       // Rider can accept or update status
//       if (!booking.rider) booking.rider = req.user.userId;
//       if (req.body.status) booking.status = req.body.status;
//       await booking.save();
//       return res.json(booking);
//     } else if (
//       req.user.role === "customer" &&
//       booking.customer.toString() === req.user.userId
//     ) {
//       // Customer can cancel
//       if (req.body.status === "cancelled") {
//         booking.status = "cancelled";
//         await booking.save();
//         return res.json(booking);
//       }
//     }
//     res.status(403).json({ message: "Not authorized to update booking" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// exports.listBookings = async (req, res) => {
//   try {
//     let filter = {};
//     if (req.user.role === "customer") filter.customer = req.user.userId;
//     if (req.user.role === "rider") filter.rider = req.user.userId;
//     const bookings = await Booking.find(filter).populate(
//       "customer rider",
//       "name email phone"
//     );
//     res.json(bookings);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

exports.saveFromAddress = async (req, res) => {
  try {
    const { userId, address, latitude, longitude, house, receiverName, receiverMobile, tag } = req.body;
    // if (!address || latitude == null || longitude == null) {
    //   return res.status(400).json({ message: 'Address, latitude, and longitude are required.' });
    // }

    console.log(req.body, 'Sssss2uuuuuuuuu');
    const booking = new Booking({
      userId,
      fromAddress: {
        address,
        latitude,
        longitude,
        house,
        receiverName,
        receiverMobile,
        tag
      }
    });
    await booking.save();
    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to save from address.' });
  }
};

// // Save drop address before order
// exports.saveDropAddress = async (req, res) => {
//   try {
//     console.log(req.body, "bodyydyy");
//     const {
//       userId,
//       number,
//       address1,
//       address2,
//       landmark,
//       pincode,
//       receiverName,
//       receiverMobile,
//       tag,
//     } = req.body;
//     if (!address1) {
//       return res.status(400).json({ message: "Address 1 is required." });
//     }
//     const booking = await Booking.findOne({
//       "fromAddress.receiverMobile": number,
//     });
//     if (!booking) {
//       return res
//         .status(404)
//         .json({ message: "Booking not found for this number." });
//     }
//     // Prepare drop address object
//     const dropAddress = {
//       Address: address1,
//       Address1: address1,
//       Address2: address2,
//       landmark,
//       pincode,
//       ReciversName: receiverName,
//       ReciversMobileNum: receiverMobile,
//       professional: tag,
//     };
//     // Push to dropLocation array
//     booking.dropLocation.push(dropAddress);
//     await booking.save();
//     return res.status(200).json({ success: true, booking });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ message: "Failed to save drop address." });
//   }
// };

// // Comprehensive booking creation with all details
// exports.createBookingWithDetails = async (req, res) => {
//   try {
//     const {
//       userId,
//       amountPay,
//       payFrom,
//       pickup,
//       dropoff,
//       stops,
//       vehicleType,
//       price,
//       dropLocation,
//       fromAddress,
//     } = req.body;

//     console.log(req.body, "Formmmmmmm");
//     // Validate required fields
//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }

//     if (
//       !fromAddress ||
//       !fromAddress.address ||
//       fromAddress.latitude == null ||
//       fromAddress.longitude == null
//     ) {
//       return res.status(400).json({
//         message:
//           "From address with address, latitude, and longitude are required",
//       });
//     }

//     // Handle product images if uploaded
//     let productImages = [];
//     if (req.files && req.files.productImages) {
//       productImages = req.files.productImages.map((f) => f.path);
//     }
//     if (productImages.length > 4) {
//       return res
//         .status(400)
//         .json({ message: "Maximum 4 product images allowed" });
//     }

//     // Handle stops array
//     let stopsArray = [];
//     if (stops) {
//       stopsArray = Array.isArray(stops) ? stops : [stops];
//       if (stopsArray.length > 4) {
//         return res.status(400).json({ message: "Maximum 4 stops allowed" });
//       }
//     }
//     const bookingData = {
//       userId,
//       amountPay,
//       payFrom,
//       pickup,
//       dropoff,
//       stops: stopsArray,
//       vehicleType,
//       productImages,
//       price,
//       fromAddress,
//     };

//     // Add drop locations if provided
//     if (dropLocation && Array.isArray(dropLocation)) {
//       bookingData.dropLocation = dropLocation;
//     }

//     const booking = new Booking(bookingData);
//     await booking.save();

//     return res.status(201).json({
//       success: true,
//       message: "Booking created successfully",
//       booking,
//     });
//   } catch (err) {
//     console.error("Booking creation error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to create booking",
//       error: err.message,
//     });
//   }
// };

// // Get bookings by userId and bookingStatus
// exports.getBookingsByUserAndStatus = async (req, res) => {
//   try {
//     const { userId, bookingStatus } = req.params;

//     // Validate userId
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User ID is required",
//       });
//     }

//     // Validate bookingStatus
//     const validStatuses = ["Ongoing", "Completed", "Cancelled"];
//     if (bookingStatus && !validStatuses.includes(bookingStatus)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid booking status. Must be Ongoing, Completed, or Cancelled",
//       });
//     }

//     // Build filter object
//     const filter = { userId: userId };

//     // Add bookingStatus filter if provided
//     if (bookingStatus) {
//       filter.bookingStatus = bookingStatus;
//     }

//     console.log("Filtering bookings with:", filter);

//     // Get bookings with populated user data
//     const bookings = await Booking.find(filter)
//       .populate("customer", "name email phone")
//       .populate("rider", "name email phone")
//       .sort({ createdAt: -1 }); // Sort by newest first

//     console.log(
//       `Found ${bookings.length} bookings for user ${userId} with status ${
//         bookingStatus || "all"
//       }`
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Bookings retrieved successfully",
//       count: bookings.length,
//       bookings: bookings,
//     });
//   } catch (err) {
//     console.error("Error getting bookings by user and status:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve bookings",
//       error: err.message,
//     });
//   }
// };

// // Get all bookings for a user (all statuses)
// exports.getUserBookings = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     // Validate userId
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User ID is required",
//       });
//     }

//     console.log("Getting all bookings for user:", userId);

//     // Get all bookings for the user
//     const bookings = await Booking.find({ userId: userId })
//       .populate("customer", "name email phone")
//       .populate("rider", "name email phone")
//       .sort({ createdAt: -1 }); // Sort by newest first

//     // Group bookings by status
//     const groupedBookings = {
//       Ongoing: bookings.filter(
//         (booking) => booking.bookingStatus === "Ongoing"
//       ),
//       Completed: bookings.filter(
//         (booking) => booking.bookingStatus === "Completed"
//       ),
//       Cancelled: bookings.filter(
//         (booking) => booking.bookingStatus === "Cancelled"
//       ),
//     };

//     console.log(`Found ${bookings.length} total bookings for user ${userId}`);

//     return res.status(200).json({
//       success: true,
//       message: "User bookings retrieved successfully",
//       totalCount: bookings.length,
//       bookings: groupedBookings,
//       summary: {
//         ongoing: groupedBookings.Ongoing.length,
//         completed: groupedBookings.Completed.length,
//         cancelled: groupedBookings.Cancelled.length,
//       },
//     });
//   } catch (err) {
//     console.error("Error getting user bookings:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve user bookings",
//       error: err.message,
//     });
//   }
// };

// // Update booking status
// exports.updateBookingStatus = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { bookingStatus } = req.body;

//     // Validate bookingStatus
//     const validStatuses = ["Ongoing", "Completed", "Cancelled"];
//     if (!validStatuses.includes(bookingStatus)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid booking status. Must be Ongoing, Completed, or Cancelled",
//       });
//     }

//     // Find and update the booking
//     const booking = await Booking.findByIdAndUpdate(
//       bookingId,
//       { bookingStatus: bookingStatus },
//       { new: true }
//     )
//       .populate("customer", "name email phone")
//       .populate("rider", "name email phone");

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }

//     console.log(`Updated booking ${bookingId} status to ${bookingStatus}`);

//     return res.status(200).json({
//       success: true,
//       message: "Booking status updated successfully",
//       booking: booking,
//     });
//   } catch (err) {
//     console.error("Error updating booking status:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to update booking status",
//       error: err.message,
//     });
//   }
// };

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

exports.assignOrder = async (req, res) => {
  try {
    const { bookingId, driverId, status } = req.body;

    console.log('🎯 assignOrder called with:', { bookingId, driverId, status });

    // Validate required fields
    if (!bookingId || !driverId) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'bookingId and driverId are required'
      });
    }

    // ✅ CHECK: Rider should not have any existing active bookings
    console.log('🔍 Checking if rider already has active bookings...');
    const activeBooking = await Booking.findOne({
      rider: driverId,
      status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] }
    });

    if (activeBooking) {
      console.log('❌ Rider already has an active booking:', activeBooking._id);
      return res.status(409).json({
        success: false,
        message: 'You already have an active booking. Please complete it before accepting a new one.',
        code: 'RIDER_HAS_ACTIVE_BOOKING',
        activeBookingId: activeBooking._id,
        activeBookingStatus: activeBooking.status
      });
    }

    console.log('✅ Rider has no active bookings, proceeding with assignment...');

    // ✅ ATOMIC UPDATE: Prevent race condition
    // Only update if booking is still pending and has no rider assigned
    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'pending',
        $or: [{ rider: { $exists: false } }, { rider: null }, { rider: '' }]
      },
      {
        $set: {
          rider: driverId,
          driver: driverId,
          status: 'accepted',
          bookingStatus: 'Ongoing',
          riderAcceptTime: new Date()
        }
      },
      { new: true }
    );

    if (!booking) {
      console.log('❌ Booking already assigned or not found');
      return res.status(409).json({
        success: false,
        message: 'Booking already assigned to another rider or not available',
        code: 'BOOKING_TAKEN'
      });
    }

    const driver = await Rider.findById(driverId);
    if (!driver) {
      // Rollback booking assignment
      await Booking.findByIdAndUpdate(bookingId, {
        $unset: { rider: '', driver: '' },
        status: 'pending',
        bookingStatus: 'pending'
      });
      console.log('❌ Driver not found:', driverId);
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    console.log('✅ Booking assigned atomically to driver:', driverId);

    // Notify other riders that booking was taken via WebSocket
    try {
      if (global.wsServer && typeof global.wsServer.broadcastToAllRiders === 'function') {
        global.wsServer.broadcastToAllRiders({
          type: 'booking_taken',
          bookingId: booking._id,
          riderId: driverId,
          timestamp: Date.now()
        });
        console.log('📢 Notified other riders that booking was taken');
      }
    } catch (wsErr) {
      console.log('⚠️ Could not notify via WebSocket:', wsErr.message);
    }

    // Manually fetch customer and rider details
    let customerData = null;
    if (booking.userId) {
      try {
        // Try to find user by different methods since userId can be phone, customerId, or ObjectId
        const customer = await User.findOne({
          $or: [
            { phone: booking.userId },
            { customerId: booking.userId },
            { _id: mongoose.Types.ObjectId.isValid(booking.userId) ? booking.userId : null }
          ]
        });
        
        if (customer) {
          customerData = {
            _id: customer._id,
            customerId: customer.customerId,
            name: customer.name,
            lname: customer.lname,
            phone: customer.phone,
            email: customer.email,
            profilePhoto: customer.profilePhoto
          };
          console.log('✅ Customer found:', customer.name, customer.phone);
        } else {
          console.log('⚠️ Customer not found for userId:', booking.userId);
        }
      } catch (custErr) {
        console.log('⚠️ Error fetching customer:', custErr.message);
      }
    }

    const riderData = {
      _id: driver._id,
      name: driver.name,
      lname: driver.lname,
      phone: driver.phone,
      vehicleType: driver.vehicleType
    };

    // Transform dropLocation to include both old and new field names for compatibility
    const transformedDropLocation =
      booking.dropLocation?.map((drop) => ({
        ...drop,
        ReciversName: drop.receiverName || drop.ReciversName,
        ReciversMobileNum: drop.receiverNumber || drop.receiverMobile || drop.ReciversMobileNum,
        Address: drop.Address || drop.address,
        Address1: drop.Address1 || drop.address,
        Address2: drop.Address2,
        landmark: drop.landmark,
        pincode: drop.pincode,
        professional: drop.professional || drop.tag,
        latitude: drop.latitude,
        longitude: drop.longitude
      })) || [];

    // Calculate distances if coordinates are available
    let driverToFromKm = 0;
    let fromToDropKm = 0;

    // Helper function to calculate distance (haversine formula)
    const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radius of earth in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    console.log('\n📍 DISTANCE CALCULATION DEBUG:');
    console.log('From Address:', {
      latitude: booking.fromAddress?.latitude,
      longitude: booking.fromAddress?.longitude
    });
    console.log('Drop Location:', {
      latitude: transformedDropLocation[0]?.latitude,
      longitude: transformedDropLocation[0]?.longitude
    });

    // Calculate pickup to drop distance
    if (
      booking.fromAddress?.latitude &&
      booking.fromAddress?.longitude &&
      transformedDropLocation[0]?.latitude &&
      transformedDropLocation[0]?.longitude
    ) {
      fromToDropKm = getDistanceFromLatLonInKm(
        booking.fromAddress.latitude,
        booking.fromAddress.longitude,
        transformedDropLocation[0].latitude,
        transformedDropLocation[0].longitude
      );
      console.log(`✅ Calculated fromToDropKm: ${fromToDropKm.toFixed(2)} km`);
    } else {
      console.log('❌ Missing coordinates for fromToDropKm calculation');
    }

    // Calculate driver to pickup distance if driver location provided
    if (req.body.latitude && req.body.longitude && booking.fromAddress?.latitude && booking.fromAddress?.longitude) {
      driverToFromKm = getDistanceFromLatLonInKm(
        req.body.latitude,
        req.body.longitude,
        booking.fromAddress.latitude,
        booking.fromAddress.longitude
      );
      console.log(`✅ Calculated driverToFromKm: ${driverToFromKm.toFixed(2)} km`);
    } else {
      console.log('ℹ️ Driver location not provided for driverToFromKm calculation');
    }

    // Create full booking object with populated data
    const fullBooking = {
      ...booking.toObject(),
      customer: customerData,
      rider: riderData,
      dropLocation: transformedDropLocation,
      price: booking.price || booking.amountPay || 0,
      payFrom: booking.payFrom || 'Pay on Delivery',
      amountPay: booking.amountPay,
      driverToFromKm: driverToFromKm > 0 ? driverToFromKm.toFixed(2) : null,
      fromToDropKm: fromToDropKm > 0 ? fromToDropKm.toFixed(2) : null,
      // Also add 'from' and 'to' for OrdersScreen compatibility
      from: {
        address: booking.fromAddress?.address,
        latitude: booking.fromAddress?.latitude,
        longitude: booking.fromAddress?.longitude,
        house: booking.fromAddress?.house,
        receiverName: booking.fromAddress?.receiverName,
        receiverMobile: booking.fromAddress?.receiverMobile,
        tag: booking.fromAddress?.tag
      },
      to: transformedDropLocation[0] || {}
    };

    console.log('✅ Returning full booking with customer and rider data');
    console.log('📏 Distance data:', {
      fromToDropKm: fullBooking.fromToDropKm,
      driverToFromKm: fullBooking.driverToFromKm
    });
    console.log('📦 Drop location data:', transformedDropLocation);
    console.log('👤 Customer data:', customerData);

    res.json({
      success: true,
      message: 'Order assigned to driver successfully',
      booking: fullBooking,
      orderDetails: {
        from: booking.fromAddress,
        to: booking.dropLocation
      }
    });
  } catch (err) {
    console.error('❌ Error in assignOrder:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

// ✅ CANCEL BOOKING: Allow customer to cancel their booking
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId, userId, reason } = req.body;

    console.log('❌ cancelBooking called with:', { bookingId, userId, reason });

    // Validate required fields
    if (!bookingId || !userId) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'bookingId and userId are required'
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify the booking belongs to the user
    if (booking.userId !== userId) {
      console.log('❌ Unauthorized: Booking does not belong to user');
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this booking'
      });
    }

    // Check if booking is already cancelled or completed
    if (booking.status === 'cancelled' || booking.bookingStatus === 'Cancelled') {
      console.log('❌ Booking already cancelled');
      return res.status(400).json({
        success: false,
        message: 'This booking is already cancelled'
      });
    }

    if (booking.status === 'completed' || booking.bookingStatus === 'Completed') {
      console.log('❌ Cannot cancel completed booking');
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a completed booking'
      });
    }

    // Update booking status to cancelled
    booking.status = 'cancelled';
    booking.bookingStatus = 'Cancelled';
    booking.cancellationReason = reason || 'No reason provided';
    booking.cancelledBy = 'customer';
    booking.cancelledAt = new Date();

    await booking.save();

    console.log(`✅ Booking ${bookingId} cancelled by customer ${userId}`);
    console.log(`📋 Reason: ${booking.cancellationReason}`);

    // TODO: Notify driver via WebSocket if booking was assigned
    if (booking.driver || booking.rider) {
      console.log('📢 Should notify driver about cancellation');
      // if (global.wsServer) {
      //   global.wsServer.notifyDriverCancellation(booking);
      // }
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking: {
        id: booking._id,
        status: booking.status,
        cancelledAt: booking.cancelledAt,
        cancellationReason: booking.cancellationReason
      }
    });
  } catch (err) {
    console.error('❌ Error in cancelBooking:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

// ✅ DECLINE BOOKING: Allow rider to decline/reject booking
exports.declineBooking = async (req, res) => {
  try {
    const { bookingId, riderId, reason } = req.body;

    console.log('🚫 declineBooking called with:', { bookingId, riderId, reason });

    // Validate required fields
    if (!bookingId || !riderId) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'bookingId and riderId are required'
      });
    }

    // Verify rider exists
    const rider = await Rider.findById(riderId);
    if (!rider) {
      console.log('❌ Rider not found:', riderId);
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // ✅ ATOMIC UPDATE: Add rider to declinedBy array
    // Use $addToSet to ensure rider is only added once
    const updateData = {
      $addToSet: { declinedBy: riderId },
      $inc: { broadcastCount: 1 }
    };

    // Store decline reason if provided
    if (reason) {
      updateData.$set = {
        [`declineReasons.${riderId}`]: reason
      };
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true }
    );

    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log(`✅ Rider ${riderId} declined booking ${bookingId}`);
    console.log(`📊 Total declines: ${booking.declinedBy?.length || 0}`);

    // ✅ AUTO-REBROADCAST: If rider declines, broadcast to other available riders
    try {
      if (global.wsServer && typeof global.wsServer.broadcastNewBooking === 'function') {
        console.log('📢 Re-broadcasting booking to other riders after decline...');
        
        // Small delay to allow rider to be fully removed from the pool
        setTimeout(async () => {
          await global.wsServer.broadcastNewBooking(booking);
          console.log(`✅ Booking ${bookingId} re-broadcasted to remaining riders`);
        }, 500);
      }
    } catch (broadcastErr) {
      console.error('❌ Error re-broadcasting after decline:', broadcastErr.message);
    }

    // ✅ AUTO-CANCEL: If too many riders decline (e.g., 5+), auto-cancel the booking
    if (booking.declinedBy.length >= 5) {
      console.log(`⚠️ Booking ${bookingId} declined by ${booking.declinedBy.length} riders - considering auto-cancel`);
      
      // Check if booking is still pending and not assigned
      if (booking.status === 'pending' && !booking.rider) {
        booking.status = 'cancelled';
        booking.bookingStatus = 'Cancelled';
        booking.cancelledBy = 'system';
        booking.cancellationReason = 'No driver available - Multiple drivers declined';
        booking.cancelledAt = new Date();
        await booking.save();
        
        console.log(`✅ Booking ${bookingId} auto-cancelled due to multiple declines`);
        
        // TODO: Notify customer about cancellation
      }
    }

    res.json({
      success: true,
      message: 'Booking declined successfully',
      declineCount: booking.declinedBy?.length || 0
    });
  } catch (err) {
    console.error('❌ Error in declineBooking:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

exports.getAvailableBookingsForDriver = async (req, res) => {
  try {
    const { latitude, longitude, number } = req.body;

    console.log('?? getAvailableBookingsForDriver called');
    console.log('?? Request:', { latitude, longitude, number });

    // if (latitude == null || longitude == null || !number) {
    //   return res.status(400).json({ message: 'Driver latitude, longitude, and phone number required' });
    // }

    if (latitude == null || longitude == null || !number) {
      console.log('ERROR: Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Driver latitude, longitude, and phone number required',
        bookings: []
      });
    }

    // Fetch the driver's vehicle type
    const rider = await Rider.findOne({ phone: number });

    // if (!rider || !rider.vehicleType) {
    //   return res.status(404).json({ message: 'Rider or vehicle type not found' });
    // }

    if (!rider) {
      console.log('ERROR: Rider not found');
      return res.status(404).json({
        success: false,
        message: 'Rider not found. Please complete registration.',
        bookings: []
      });
    }

    if (!rider.vehicleType) {
      console.log('ERROR: Vehicle type not set');
      return res.status(404).json({
        success: false,
        message: 'Vehicle type not set. Please complete vehicle registration.',
        bookings: []
      });
    }
    const driverVehicleType = rider.vehicleType;

    console.log('🚗 Driver vehicle type (raw):', driverVehicleType);

    // Normalize vehicle type to match Booking schema enum ['2W', '3W', 'Truck']
    const normalizeVehicleType = (type) => {
      if (!type) return null;
      const typeStr = type.toString().toLowerCase();

      // Map various formats to standard values
      if (typeStr.includes('2w') || typeStr === '2wheeler' || typeStr === 'bike' || typeStr === 'motorcycle') {
        return '2W';
      }
      if (typeStr.includes('3w') || typeStr === '3wheeler' || typeStr === 'auto' || typeStr === 'rickshaw') {
        return '3W';
      }
      if (typeStr.includes('truck') || typeStr === '4w' || typeStr === 'pickup') {
        return 'Truck';
      }

      // If already in correct format, return as is
      if (type === '2W' || type === '3W' || type === 'Truck') {
        return type;
      }

      return null;
    };

    const normalizedVehicleType = normalizeVehicleType(driverVehicleType);

    if (!normalizedVehicleType) {
      console.log('❌ Could not normalize vehicle type:', driverVehicleType);
      return res.status(400).json({
        success: false,
        message: `Invalid vehicle type: ${driverVehicleType}. Expected: 2W, 3W, or Truck`,
        bookings: []
      });
    }

    console.log('🚗 Driver vehicle type (normalized):', normalizedVehicleType);

    // Find bookings that are not yet assigned to ANY rider, are pending, and match vehicle type
    // IMPORTANT: Only show bookings that have NO rider assigned (exclude accepted orders)
    // ✅ DECLINE FILTER: Exclude bookings this rider has already declined
    // ✅ TIME FILTER: Only show bookings created in the last 5 minutes (fresh bookings only)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const query = {
      $or: [{ rider: { $exists: false } }, { rider: null }, { rider: '' }],
      vehicleType: normalizedVehicleType, // Use normalized vehicle type
      // Only show bookings with 'pending' status (not 'accepted' or 'in_progress')
      status: 'pending',
      bookingStatus: { $nin: ['Completed', 'completed', 'Cancelled', 'cancelled', 'Ongoing', 'In Progress', 'Accepted'] },
      // Exclude bookings that this rider has already declined
      declinedBy: { $ne: rider._id },
      // ✅ FRESHNESS FILTER: Only show bookings created in last 5 minutes
      createdAt: { $gte: fiveMinutesAgo }
    };

    console.log('🔍 Query:', JSON.stringify(query, null, 2));

    const bookings = await Booking.find(query);

    console.log(`✅ Found ${bookings.length} bookings matching criteria`);

    if (bookings.length > 0) {
      console.log('📋 Sample booking details:', {
        id: bookings[0]._id,
        status: bookings[0].status,
        bookingStatus: bookings[0].bookingStatus,
        vehicleType: bookings[0].vehicleType,
        rider: bookings[0].rider,
        hasFromAddress: !!bookings[0].fromAddress,
        hasDropLocation: bookings[0].dropLocation?.length > 0
      });
    } else {
      console.log('⚠️ No bookings found - checking total bookings in DB...');
      const totalBookings = await Booking.countDocuments({});
      const totalByVehicle = await Booking.countDocuments({ vehicleType: normalizedVehicleType });
      const totalPending = await Booking.countDocuments({ status: 'pending' });

      // Also check what vehicle types exist in the database
      const existingVehicleTypes = await Booking.distinct('vehicleType');

      console.log('📊 Database stats:', {
        totalBookings,
        totalByVehicle,
        totalPending,
        driverVehicleType: driverVehicleType,
        normalizedVehicleType: normalizedVehicleType,
        existingVehicleTypes: existingVehicleTypes
      });
    }

    const result = bookings
      .map((booking, index) => {
        // Log each booking for debugging
        console.log(`🔍 Processing booking ${index + 1}/${bookings.length}:`, {
          id: booking._id,
          hasFromAddress: !!booking.fromAddress,
          hasDropLocation: booking.dropLocation?.length > 0,
          fromAddress: booking.fromAddress,
          dropLocation: booking.dropLocation
        });

        // Check if booking has required address data
        if (!booking.fromAddress) {
          console.log(`⚠️ Booking ${booking._id} skipped - missing fromAddress`);
          return null;
        }

        if (!booking.dropLocation || booking.dropLocation.length === 0) {
          console.log(`⚠️ Booking ${booking._id} skipped - missing dropLocation`);
          return null;
        }

        const drop = booking.dropLocation[0];

        // Validate coordinates
        if (!booking.fromAddress.latitude || !booking.fromAddress.longitude) {
          console.log(`⚠️ Booking ${booking._id} skipped - invalid fromAddress coordinates`);
          return null;
        }

        // Calculate driver to pickup distance
        const driverToFromKm = getDistanceFromLatLonInKm(latitude, longitude, booking.fromAddress.latitude, booking.fromAddress.longitude);

        // Calculate pickup to drop distance only if drop has lat/lng
        let fromToDropKm = 0;
        if (drop && typeof drop.latitude === 'number' && typeof drop.longitude === 'number') {
          fromToDropKm = getDistanceFromLatLonInKm(
            booking.fromAddress.latitude,
            booking.fromAddress.longitude,
            drop.latitude,
            drop.longitude
          );
        }

        // ✅ FILTER: Only show bookings within 5km of driver's current location
        if (driverToFromKm > 5) {
          console.log(`⚠️ Booking ${booking._id} skipped - too far (${driverToFromKm.toFixed(2)}km > 5km)`);
          return null;
        }

        console.log(`✅ Booking ${booking._id} included in results`);

        return {
          bookingId: booking._id,
          from: booking.fromAddress,
          to: drop,
          driverToFromKm: driverToFromKm.toFixed(2),
          fromToDropKm: fromToDropKm.toFixed(2),
          price: booking.amountPay,
          quickFee: booking.quickFee || 0,
          totalDriverEarnings: booking.totalDriverEarnings || booking.price || 0,
          status: booking.status || booking.bookingStatus
        };
      })
      .filter(Boolean);

    console.log(`📊 Filtering results: ${bookings.length} total → ${result.length} valid bookings within 5km`);

    console.log(`SUCCESS: Returning ${result.length} nearby bookings (within 5km radius)`);
    res.json({
      success: true,
      message: result.length > 0 ? `Found ${result.length} booking(s) within 5km` : 'No bookings available within 5km',
      bookings: result,
      debug: {
        totalFound: bookings.length,
        validBookings: result.length,
        filteredOut: bookings.length - result.length,
        driverVehicleTypeRaw: driverVehicleType,
        driverVehicleTypeNormalized: normalizedVehicleType,
        searchRadius: '5km'
      }
    });
  } catch (err) {
    console.error('Error in getAvailableBookingsForDriver:', err);
    // res.status(500).json({ message: err.message });

    res.status(500).json({
      success: false,
      message: err.message,
      bookings: []
    });
  }
};

// exports.getOngoingBookingForRider = async (req, res) => {
//   try {
//     const { riderId, phone } = req.query;

//     let riderQuery = {};

//     if (riderId) {
//       riderQuery.rider = riderId;
//     } else if (phone) {
//       // Find rider by phone
//       const rider = await Rider.findOne({ phone });
//       if (!rider) return res.status(404).json({ message: 'Rider not found' });
//       riderQuery.rider = rider._id;
//     } else {
//       return res.status(400).json({ message: 'riderId or phone required' });
//     }
//     // Find ongoing booking
//     const booking = await Booking.findOne({
//       ...riderQuery,
//       $or: [
//         { status: { $in: ['accepted', 'in_progress'] } },
//       ]
//     });

//     // console.log(booking, "ssswwwwwwwwwwwwwwww")
//     if (!booking) return res.status(404).json({ message: 'No ongoing booking found' });

//     // Manually fetch customer and rider
//     const customer = booking.userId ? await require('../models/User').findById(booking.userId) : null;
//     const bookingObj = booking.toObject();
//     bookingObj.customer = customer;

//     res.json(bookingObj);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// Get booking details with rider details

exports.getOngoingBookingForRider = async (req, res) => {
  try {
    const { riderId, phone } = req.query;

    console.log('🔍 getOngoingBookingForRider called with:', { riderId, phone });

    let riderQuery = {};

    if (riderId) {
      riderQuery.rider = riderId;
      console.log('📞 Using riderId:', riderId);
    } else if (phone) {
      // Find rider by phone
      console.log('📞 Looking up rider by phone:', phone);
      const rider = await Rider.findOne({ phone });
      if (!rider) {
        console.log('❌ Rider not found for phone:', phone);
        return res.status(404).json({ message: 'Rider not found' });
      }
      console.log('✅ Found rider:', rider._id);
      riderQuery.rider = rider._id;
    } else {
      console.log('❌ No riderId or phone provided');
      return res.status(400).json({ message: 'riderId or phone required' });
    }

    console.log('🔍 Searching for ongoing booking with query:', riderQuery);

    // First, count how many active bookings this rider has
    let activeCount = 0;
    try {
      activeCount = await Booking.countDocuments({
        ...riderQuery,
        status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] }
      });
      console.log('📊 Active bookings count for this rider:', activeCount);
    } catch (countErr) {
      console.log('⚠️ Error counting active bookings:', countErr.message);
    }

    // Find ongoing booking with better status filtering
    let booking;
    try {
      booking = await Booking.findOne({
        ...riderQuery,
        status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] }
      }).populate('userId', 'name phone email'); // Populate customer data directly
    } catch (bookingErr) {
      console.error('❌ Database error while searching for booking:', bookingErr);
      throw new Error(`Database error: ${bookingErr.message}`);
    }

    console.log('📋 Found booking:', booking ? booking._id : 'None');
    
    // If multiple active bookings found, log warning
    if (activeCount > 1) {
      console.log('⚠️ WARNING: Rider has', activeCount, 'active bookings! This should not happen.');
      // Get all active bookings for debugging
      const allActiveBookings = await Booking.find({
        ...riderQuery,
        status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] }
      }).select('_id bookingId status createdAt');
      console.log('📋 All active bookings:', allActiveBookings);
    }

    if (!booking) {
      console.log('⚠️ No ongoing booking found');
      return res.status(404).json({ message: 'No ongoing booking found' });
    }

    // Create response object with customer data
    const bookingObj = booking.toObject();

    // If userId is populated, use it as customer, otherwise try manual lookup
    if (booking.userId && typeof booking.userId === 'object') {
      bookingObj.customer = booking.userId;
      console.log('✅ Customer data populated from userId:', {
        name: booking.userId.name,
        phone: booking.userId.phone
      });
    } else if (booking.userId) {
      // Manual lookup if population didn't work
      try {
        console.log('🔍 Manual lookup for customer with userId:', booking.userId);
        const customer = await User.findById(booking.userId);
        if (customer) {
          bookingObj.customer = customer;
          console.log('👤 Manual customer lookup success:', {
            name: customer.name,
            phone: customer.phone
          });
        } else {
          console.log('⚠️ Customer not found in manual lookup');
          bookingObj.customer = null;
        }
      } catch (userErr) {
        console.log('⚠️ Error in manual customer lookup:', userErr.message);
        bookingObj.customer = null;
      }
    } else {
      console.log('ℹ️ No userId in booking, skipping customer lookup');
      bookingObj.customer = null;
    }

    // Calculate distances if coordinates are available
    let fromToDropKm = 0;

    // Helper function to calculate distance (haversine formula)
    const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radius of earth in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    console.log('\n📍 ONGOING BOOKING DISTANCE DEBUG:');
    console.log('From Address:', {
      latitude: booking.fromAddress?.latitude,
      longitude: booking.fromAddress?.longitude
    });
    console.log('Drop Location:', {
      latitude: booking.dropLocation?.[0]?.latitude,
      longitude: booking.dropLocation?.[0]?.longitude
    });

    // Calculate pickup to drop distance
    if (
      booking.fromAddress?.latitude &&
      booking.fromAddress?.longitude &&
      booking.dropLocation?.[0]?.latitude &&
      booking.dropLocation?.[0]?.longitude
    ) {
      fromToDropKm = getDistanceFromLatLonInKm(
        booking.fromAddress.latitude,
        booking.fromAddress.longitude,
        booking.dropLocation[0].latitude,
        booking.dropLocation[0].longitude
      );
      console.log(`✅ Calculated fromToDropKm: ${fromToDropKm.toFixed(2)} km`);
    } else {
      console.log('❌ Missing coordinates for fromToDropKm calculation');
    }

    // Add calculated distances, price, and payment info to booking object
    bookingObj.fromToDropKm = fromToDropKm > 0 ? fromToDropKm.toFixed(2) : null;
    bookingObj.price = booking.price || booking.amountPay || 0;
    bookingObj.payFrom = booking.payFrom || 'Pay on Delivery';
    bookingObj.amountPay = booking.amountPay;
    bookingObj.quickFee = booking.quickFee || 0;
    bookingObj.totalDriverEarnings = booking.totalDriverEarnings || bookingObj.price;

    // Transform dropLocation for compatibility
    if (bookingObj.dropLocation && bookingObj.dropLocation.length > 0) {
      bookingObj.dropLocation = bookingObj.dropLocation.map((drop) => ({
        ...drop,
        ReciversName: drop.receiverName || drop.ReciversName,
        ReciversMobileNum: drop.receiverNumber || drop.receiverMobile || drop.ReciversMobileNum,
        Address: drop.Address || drop.address,
        Address1: drop.Address1 || drop.address,
        latitude: drop.latitude,
        longitude: drop.longitude
      }));

      // Add 'to' object for compatibility
      bookingObj.to = bookingObj.dropLocation[0];
    }

    // Add 'from' object for compatibility
    if (bookingObj.fromAddress) {
      bookingObj.from = {
        address: bookingObj.fromAddress.address,
        latitude: bookingObj.fromAddress.latitude,
        longitude: bookingObj.fromAddress.longitude,
        house: bookingObj.fromAddress.house,
        receiverName: bookingObj.fromAddress.receiverName,
        receiverMobile: bookingObj.fromAddress.receiverMobile,
        tag: bookingObj.fromAddress.tag
      };
    }

    // Add metadata about active bookings count
    bookingObj.activeBookingsCount = activeCount;
    
    console.log('✅ Returning ongoing booking with data:', {
      bookingId: bookingObj._id,
      status: bookingObj.status,
      hasCustomer: !!bookingObj.customer,
      customerName: bookingObj.customer?.name || 'No name',
      customerPhone: bookingObj.customer?.phone || 'No phone',
      rider: bookingObj.rider,
      fromToDropKm: bookingObj.fromToDropKm,
      price: bookingObj.price,
      activeBookingsCount: activeCount
    });

    res.json(bookingObj);
  } catch (err) {
    console.error('❌ Error in getOngoingBookingForRider:', err);
    res.status(500).json({ message: err.message, error: 'Internal server error' });
  }
};

exports.getBookingWithRiderDetails = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    let riderDetails = null;
    if (booking.rider) {
      // Rider is stored as string ID
      riderDetails = await Rider.findById(booking.rider);
    }
    res.json({ booking, riderDetails });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.uploadBookingImage = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const imagePath = req.file.path; // multer adds this

    console.log(bookingId, imagePath, 'data from images');
    // Find booking and push image path
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Ensure productImages array exists
    if (!Array.isArray(booking.productImages)) {
      booking.productImages = [];
    }
    // Only add if not already present
    if (!booking.productImages.includes(imagePath)) {
      booking.productImages.push(imagePath);
      await booking.save();
      console.log(imagePath, 'Image path saved to booking');
      res.json({ message: 'Image uploaded and saved', imagePath, booking });
    } else {
      res.json({ message: 'Image already uploaded', imagePath, booking });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error uploading image', error: err.message });
  }
};

exports.updateBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const updateData = req.body;

    console.log('📝 updateBooking called with:', { bookingId, updateData });

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        message: 'Booking not found' 
      });
    }

    // Validate quickFee if provided
    if (updateData.quickFee !== undefined) {
      const quickFeeValue = Number(updateData.quickFee);
      if (isNaN(quickFeeValue) || quickFeeValue < 0 || quickFeeValue > 100) {
        return res.status(400).json({ 
          success: false,
          message: 'quickFee must be a number between 0 and 100' 
        });
      }
      updateData.quickFee = quickFeeValue;
    }

    // Auto-recalculate totalDriverEarnings if price or quickFee is updated
    const newPrice = updateData.price !== undefined ? Number(updateData.price) : booking.price || 0;
    const newQuickFee = updateData.quickFee !== undefined ? Number(updateData.quickFee) : booking.quickFee || 0;
    updateData.totalDriverEarnings = newPrice + newQuickFee;

    console.log('💰 Recalculated earnings:', {
      price: newPrice,
      quickFee: newQuickFee,
      totalDriverEarnings: updateData.totalDriverEarnings
    });

    // Update the booking
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    console.log('✅ Booking updated successfully');

    // 🔔 NOTIFY ABOUT TIP UPDATE VIA WEBSOCKET
    try {
      if (global.wsServer && updateData.quickFee !== undefined) {
        const tipUpdateMessage = {
          type: 'tip_added',
          bookingId: updatedBooking._id,
          tipAmount: updatedBooking.quickFee,
          newTotalEarnings: updatedBooking.totalDriverEarnings,
          newAmount: updatedBooking.amountPay,
          timestamp: Date.now()
        };
        
        console.log('💰 Tip added to booking:', updatedBooking._id, 'Amount:', updatedBooking.quickFee);
        console.log('📨 Tip message:', JSON.stringify(tipUpdateMessage, null, 2));
        console.log('⏰ Time:', new Date().toLocaleTimeString());
        
        if (updatedBooking.rider) {
          // Booking has assigned rider - send to specific rider
          console.log('🎯 Sending tip update to assigned rider:', updatedBooking.rider);
          global.wsServer.sendToRider(updatedBooking.rider.toString(), tipUpdateMessage);
          console.log('✅ Tip update sent to assigned rider');
        } else {
          // Pending booking - broadcast to all nearby riders who can see this booking
          console.log('📢 Broadcasting tip update for pending booking to nearby riders');
          await global.wsServer.broadcastTipUpdateForPendingBooking(updatedBooking, tipUpdateMessage);
          console.log('✅ Tip update broadcasted to nearby riders');
        }
      }
    } catch (wsError) {
      console.error('❌ Error notifying about tip:', wsError.message);
    }

    res.json({ 
      success: true,
      message: 'Booking updated successfully',
      booking: updatedBooking 
    });
  } catch (err) {
    console.error('❌ Error in updateBooking:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error updating booking', 
      error: err.message 
    });
  }
};

exports.updateBookingStep = async (req, res) => {
  try {
    const bookingId = req.params.id;

    console.log(req.params, 'eddede');
    const { currentStep } = req.body;
    const booking = await Booking.findByIdAndUpdate(bookingId, { currentStep }, { new: true });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: 'Step updated', booking });
  } catch (err) {
    res.status(500).json({ message: 'Error updating step', error: err.message });
  }
};

exports.completeBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { latitude, longitude } = req.body; // Get rider's current location

    console.log('📋 Completing booking:', bookingId);
    console.log('📍 Rider location:', { latitude, longitude });

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { 
        status: 'completed', 
        currentStep: 4, 
        bookingStatus: 'Completed',
        riderEndTime: new Date()
      },
      { new: true }
    ).populate('rider', 'phone vehicleType');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    console.log('✅ Booking completed successfully');

    // If rider location provided, fetch next available bookings within 5km
    let nextBookings = [];
    if (latitude && longitude && booking.rider) {
      try {
        console.log('🔍 Searching for next available bookings...');

        const riderId = booking.rider._id;
        const riderPhone = booking.rider.phone;
        const vehicleType = booking.rider.vehicleType;

        // Normalize vehicle type
        const normalizeVehicleType = (type) => {
          if (!type) return null;
          const typeStr = type.toString().toLowerCase();
          if (typeStr.includes('2w') || typeStr === '2wheeler' || typeStr === 'bike' || typeStr === 'motorcycle') return '2W';
          if (typeStr.includes('3w') || typeStr === '3wheeler' || typeStr === 'auto' || typeStr === 'rickshaw') return '3W';
          if (typeStr.includes('truck') || typeStr === '4w' || typeStr === 'pickup') return 'Truck';
          if (type === '2W' || type === '3W' || type === 'Truck') return type;
          return null;
        };

        const normalizedVehicleType = normalizeVehicleType(vehicleType);

        if (normalizedVehicleType) {
          // Find available bookings matching criteria
          const query = {
            $or: [{ rider: { $exists: false } }, { rider: null }, { rider: '' }],
            vehicleType: normalizedVehicleType,
            $and: [
              {
                $or: [{ status: 'pending' }, { status: 'in_progress' }, { bookingStatus: 'Ongoing' }, { bookingStatus: 'pending' }]
              }
            ],
            status: { $nin: ['completed', 'cancelled'] },
            bookingStatus: { $nin: ['Completed', 'completed', 'Cancelled', 'cancelled'] }
          };

          const availableBookings = await Booking.find(query);
          console.log(`📦 Found ${availableBookings.length} potential bookings`);

          // Filter bookings within 5km
          nextBookings = availableBookings
            .map((b) => {
              if (!b.fromAddress || !b.fromAddress.latitude || !b.fromAddress.longitude) return null;
              if (!b.dropLocation || b.dropLocation.length === 0) return null;

              const drop = b.dropLocation[0];
              const driverToFromKm = getDistanceFromLatLonInKm(latitude, longitude, b.fromAddress.latitude, b.fromAddress.longitude);

              // Only include bookings within 5km
              if (driverToFromKm > 5) return null;

              let fromToDropKm = 0;
              if (drop && typeof drop.latitude === 'number' && typeof drop.longitude === 'number') {
                fromToDropKm = getDistanceFromLatLonInKm(b.fromAddress.latitude, b.fromAddress.longitude, drop.latitude, drop.longitude);
              }

              return {
                bookingId: b._id,
                from: b.fromAddress,
                to: drop,
                driverToFromKm: driverToFromKm.toFixed(2),
                fromToDropKm: fromToDropKm.toFixed(2),
                price: b.amountPay,
                quickFee: b.quickFee || 0,
                totalDriverEarnings: b.totalDriverEarnings || b.price || 0,
                status: b.status || b.bookingStatus
              };
            })
            .filter(Boolean);

          console.log(`✅ Found ${nextBookings.length} nearby bookings within 5km`);
        }
      } catch (nextBookingsErr) {
        console.error('⚠️ Error fetching next bookings:', nextBookingsErr.message);
        // Don't fail the completion if next bookings fetch fails
      }
    }

    res.json({
      message: 'Booking completed',
      booking,
      nextBookings: nextBookings,
      hasNextBookings: nextBookings.length > 0
    });
  } catch (err) {
    console.error('❌ Error completing booking:', err);
    res.status(500).json({ message: 'Error completing booking', error: err.message });
  }
};

// Get order history for user or rider by id
exports.getOrderHistory = async (req, res) => {
  try {
    const { userId, rider } = req.query;
    if (!userId && !rider) {
      return res.status(400).json({ message: 'userId or rider is required' });
    }
    if (userId && rider) {
      return res.status(400).json({ message: 'Provide only userId or rider, not both' });
    }
    let filter = {};
    if (userId) {
      filter.userId = userId;
    } else if (rider) {
      filter.rider = rider;
    }
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    res.json({ count: bookings.length, bookings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Mark cash as collected for a booking
exports.collectCash = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findByIdAndUpdate(id, { cashCollected: true }, { new: true });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: 'Cash collected', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Save drop location data - Following SaveFromAddress pattern
exports.saveDropLocation = async (req, res) => {
  try {
    let {
      userId,
      selectedAddress,
      selectedLocation,
      pickupAddress,
      pickupLocation,
      midStops,
      dropDetails,
      address,
      latitude,
      longitude,
      house,
      receiverName,
      receiverMobile,
      tag,
      landmark,
      pincode,
      useMyNumber,
      saveAs,
      userPhoneNumber
    } = req.body;

    // If userId is missing, try to get it from authenticated user (req.user)
    if (!userId && req.user && req.user.userId) {
      userId = req.user.userId;
      console.log('Auto-filled userId from req.user:', userId);
    }

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    console.log(req.body, 'SaveDropLocation data');

    // Create booking with dropLocation data following SaveFromAddress pattern
    const booking = new Booking({
      userId,
      dropLocation: [
        {
          // Support both new mobile app structure and legacy structure
          address: selectedAddress || address,
          latitude: selectedLocation?.latitude || latitude,
          longitude: selectedLocation?.longitude || longitude,
          house: house,
          receiverName: dropDetails?.receiverName || receiverName,
          receiverMobile: dropDetails?.receiverNumber || receiverMobile,
          tag: dropDetails?.saveAs || tag,
          landmark: dropDetails?.landmark || landmark,
          pincode: dropDetails?.pincode || pincode,
          useMyNumber: dropDetails?.useMyNumber || useMyNumber,
          userPhoneNumber: dropDetails?.userPhoneNumber || userPhoneNumber,
          // Additional mobile app fields
          pickupAddress,
          pickupLocation,
          midStops: midStops || []
        }
      ]
    });

    await booking.save();
    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to save drop location.' });
  }
};

// Export Order Details to Excel
exports.exportOrderDetailsToExcel = async (req, res) => {
  try {
    const { search, vehicleType, status, customerId } = req.query;

    // Build filter object
    const filter = {};

    if (customerId) {
      filter.userId = customerId;
    }

    if (vehicleType) {
      filter.vehicleType = vehicleType;
    }

    if (status) {
      filter.status = status;
    }

    // Search filter
    if (search) {
      const users = await User.find({
        $or: [{ name: { $regex: search, $options: 'i' } }, { customerId: { $regex: search, $options: 'i' } }]
      }).select('_id');

      const userIds = users.map((u) => u._id);
      filter.$or = [{ userId: { $in: userIds } }, { orderId: { $regex: search, $options: 'i' } }];
    }

    // Get all bookings matching filter
    const bookings = await Booking.find(filter)
      .populate('userId', 'name customerId phone')
      .populate('driver', 'name riderId phone')
      .sort({ createdAt: -1 });

    // Prepare data for Excel
    const excelData = bookings.map((booking, index) => ({
      'S.No': index + 1,
      'Order ID': booking.orderId || booking._id.toString().slice(-8).toUpperCase(),
      'Customer ID': booking.userId?.customerId || 'N/A',
      'Customer Name': booking.userId?.name || 'N/A',
      'Customer Phone': booking.userId?.phone || 'N/A',
      'Vehicle Type': booking.vehicleType || 'N/A',
      Status: booking.status || 'N/A',
      'Amount (₹)': booking.totalPrice || booking.price || 0,
      'Payment Method': booking.paymentMethod || 'N/A',
      'Pickup Address': booking.fromLocation?.address || booking.fromAddress || 'N/A',
      'Drop Address': booking.toLocation?.address || booking.toAddress || 'N/A',
      'Driver Name': booking.driver?.name || 'N/A',
      'Driver Phone': booking.driver?.phone || 'N/A',
      'Order Date': booking.createdAt ? new Date(booking.createdAt).toLocaleDateString('en-IN') : 'N/A',
      'Order Time': booking.createdAt ? new Date(booking.createdAt).toLocaleTimeString('en-IN') : 'N/A'
    }));

    // Handle empty data case
    if (excelData.length === 0) {
      excelData.push({
        'S.No': '',
        'Order ID': '',
        'Customer ID': '',
        'Customer Name': '',
        'Customer Phone': '',
        'Vehicle Type': '',
        Status: '',
        'Amount (₹)': '',
        'Payment Method': '',
        'Pickup Address': '',
        'Drop Address': '',
        'Driver Name': '',
        'Driver Phone': '',
        'Order Date': '',
        'Order Time': ''
      });
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Order Details');

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=order_details_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting order details to Excel:', error);
    res.status(500).json({ success: false, message: 'Failed to export order details', error: error.message });
  }
};

// Export Cancel Details to Excel
exports.exportCancelDetailsToExcel = async (req, res) => {
  try {
    const { search, dateFilter, customDate } = req.query;

    // Build filter object for cancelled bookings
    const filter = { status: 'Cancelled' };

    // Date filtering
    if (dateFilter && dateFilter !== 'all') {
      const now = new Date();
      let startDate;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'custom':
          if (customDate) {
            startDate = new Date(customDate);
            startDate.setHours(0, 0, 0, 0);
          }
          break;
      }

      if (startDate) {
        filter.cancelledAt = { $gte: startDate };
      }
    }

    // Search filter
    if (search) {
      const users = await User.find({
        $or: [{ name: { $regex: search, $options: 'i' } }, { customerId: { $regex: search, $options: 'i' } }]
      }).select('_id');

      const userIds = users.map((u) => u._id);
      if (userIds.length > 0) {
        filter.userId = { $in: userIds };
      }
    }

    // Get all cancelled bookings matching filter
    const bookings = await Booking.find(filter).populate('userId', 'name customerId phone').sort({ cancelledAt: -1, createdAt: -1 });

    // Prepare data for Excel
    const excelData = bookings.map((booking, index) => ({
      'S.No': index + 1,
      'Order ID': booking.orderId || booking._id.toString().slice(-8).toUpperCase(),
      'Customer ID': booking.userId?.customerId || 'N/A',
      'Customer Name': booking.userId?.name || 'N/A',
      'Customer Phone': booking.userId?.phone || 'N/A',
      'Cancellation Reason': booking.cancellationReason || booking.cancelReason || 'N/A',
      'Cancelled By': booking.cancelledBy || 'N/A',
      'Vehicle Type': booking.vehicleType || 'N/A',
      'Amount (₹)': booking.totalPrice || booking.price || 0,
      'Pickup Address': booking.fromLocation?.address || booking.fromAddress || 'N/A',
      'Drop Address': booking.toLocation?.address || booking.toAddress || 'N/A',
      'Cancel Date': booking.cancelledAt
        ? new Date(booking.cancelledAt).toLocaleDateString('en-IN')
        : booking.createdAt
          ? new Date(booking.createdAt).toLocaleDateString('en-IN')
          : 'N/A',
      'Cancel Time': booking.cancelledAt
        ? new Date(booking.cancelledAt).toLocaleTimeString('en-IN')
        : booking.createdAt
          ? new Date(booking.createdAt).toLocaleTimeString('en-IN')
          : 'N/A'
    }));

    // Handle empty data case
    if (excelData.length === 0) {
      excelData.push({
        'S.No': '',
        'Order ID': '',
        'Customer ID': '',
        'Customer Name': '',
        'Customer Phone': '',
        'Cancellation Reason': '',
        'Cancelled By': '',
        'Vehicle Type': '',
        'Amount (₹)': '',
        'Pickup Address': '',
        'Drop Address': '',
        'Cancel Date': '',
        'Cancel Time': ''
      });
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Cancel Details');

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cancel_details_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting cancel details to Excel:', error);
    res.status(500).json({ success: false, message: 'Failed to export cancel details', error: error.message });
  }
};

// Bulk complete old/stuck bookings for a rider
exports.bulkCompleteOldBookings = async (req, res) => {
  try {
    const { phone, riderId, olderThan } = req.body;

    console.log('🔧 bulkCompleteOldBookings called with:', { phone, riderId, olderThan });

    let riderQuery = {};

    if (riderId) {
      riderQuery.rider = riderId;
    } else if (phone) {
      const rider = await Rider.findOne({ phone });
      if (!rider) {
        return res.status(404).json({ success: false, message: 'Rider not found' });
      }
      riderQuery.rider = rider._id;
      console.log('✅ Found rider:', rider._id, rider.name);
    } else {
      return res.status(400).json({ success: false, message: 'riderId or phone required' });
    }

    // Find all stuck bookings (older than specified hours, default 24 hours)
    const hoursAgo = olderThan || 24;
    const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const stuckBookings = await Booking.find({
      ...riderQuery,
      status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] },
      updatedAt: { $lt: cutoffDate }
    });

    console.log(`📋 Found ${stuckBookings.length} stuck bookings older than ${hoursAgo} hours`);

    if (stuckBookings.length === 0) {
      return res.json({
        success: true,
        message: 'No stuck bookings found',
        updated: 0,
        bookings: []
      });
    }

    // Log details of bookings to be completed
    console.log('📝 Bookings to be completed:');
    stuckBookings.forEach(booking => {
      console.log(`  - ${booking._id} (${booking.status}) - Last updated: ${booking.updatedAt}`);
    });

    // Update all stuck bookings to completed
    const updateResult = await Booking.updateMany(
      {
        ...riderQuery,
        status: { $in: ['accepted', 'in_progress', 'picked_up', 'on_way'] },
        updatedAt: { $lt: cutoffDate }
      },
      {
        $set: {
          status: 'completed',
          bookingStatus: 'Completed',
          completedAt: new Date(),
          adminCompleted: true,
          completionNote: `Auto-completed by bulk operation - stuck for more than ${hoursAgo} hours`
        }
      }
    );

    console.log('✅ Update result:', updateResult);

    res.json({
      success: true,
      message: `Successfully completed ${updateResult.modifiedCount} stuck bookings`,
      updated: updateResult.modifiedCount,
      bookings: stuckBookings.map(b => ({
        id: b._id,
        bookingId: b.bookingId,
        oldStatus: b.status,
        newStatus: 'completed',
        updatedAt: b.updatedAt
      }))
    });

  } catch (error) {
    console.error('❌ Error in bulkCompleteOldBookings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to complete old bookings', 
      error: error.message 
    });
  }
};
