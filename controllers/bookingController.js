const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Rider = require('../models/RiderSchema');
const User = require('../models/User');

// Get all orders/bookings with filters
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, vehicleType, status, customerId, startDate, endDate } = req.query;

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

    // Date range filter
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings with populated user data
    const bookings = await Booking.find(filter)
      .populate('driver', 'riderId name phone vehicleType') // Use driver field instead of rider
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
            }).select('riderId name phone vehicleType');

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
                vehicleType: riderData.vehicleType
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
      cashCollected = false
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    if (!vehicleType) {
      return res.status(400).json({ message: 'vehicleType is required' });
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
      price: price ? Number(price) : 0,
      dropLocation: processedDropLocation,
      fromAddress: fromAddress || null,
      currentStep,
      cashCollected,
      distanceKm: distanceKm || '0'
    };

    console.log('Creating booking with data:', bookingData);

    // Create and save the booking
    const booking = new Booking(bookingData);
    await booking.save();

    console.log('Booking created successfully:', booking._id);
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

    // Fetch booking and driver
    const booking = await Booking.findById(bookingId);
    const driver = await Rider.findById(driverId);

    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!driver) {
      console.log('❌ Driver not found:', driverId);
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    console.log('✅ Found booking and driver');

    // Assign driver to booking
    booking.rider = driver._id;
    booking.status = 'accepted';
    booking.bookingStatus = 'Ongoing';
    booking.riderAcceptTime = new Date();

    // If the request includes status 'completed', set riderEndTime
    if (req.body.status === 'completed') {
      booking.status = 'completed';
      booking.bookingStatus = 'Completed';
      booking.riderEndTime = new Date();
    }

    await booking.save();
    console.log('✅ Booking updated successfully');

    // Manually fetch customer and rider details
    let customerData = null;
    if (booking.userId) {
      try {
        const customer = await User.findById(booking.userId);
        if (customer) {
          customerData = {
            _id: customer._id,
            name: customer.name,
            lname: customer.lname,
            phone: customer.phone,
            email: customer.email,
            profilePhoto: customer.profilePhoto
          };
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

    // Find bookings that are not yet assigned to a rider, are ongoing/pending, and match vehicle type
    const query = {
      $or: [{ rider: { $exists: false } }, { rider: null }, { rider: '' }],
      vehicleType: normalizedVehicleType, // Use normalized vehicle type
      $and: [
        {
          $or: [{ status: 'pending' }, { status: 'in_progress' }, { bookingStatus: 'Ongoing' }, { bookingStatus: 'pending' }]
        }
      ],
      status: { $nin: ['completed', 'cancelled'] },
      bookingStatus: { $nin: ['Completed', 'completed', 'Cancelled', 'cancelled'] }
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

    // Add calculated distances and price to booking object
    bookingObj.fromToDropKm = fromToDropKm > 0 ? fromToDropKm.toFixed(2) : null;
    bookingObj.price = booking.price || booking.amountPay || 0;

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

    console.log('✅ Returning ongoing booking with data:', {
      bookingId: bookingObj._id,
      status: bookingObj.status,
      hasCustomer: !!bookingObj.customer,
      customerName: bookingObj.customer?.name || 'No name',
      customerPhone: bookingObj.customer?.phone || 'No phone',
      rider: bookingObj.rider,
      fromToDropKm: bookingObj.fromToDropKm,
      price: bookingObj.price
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
      { status: 'completed', currentStep: 4, bookingStatus: 'Completed' },
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
