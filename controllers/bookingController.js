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
      .populate('userId', 'name lname phone email customerId profilePhoto')
      .populate('rider', 'name lname phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Booking.countDocuments(filter);

    // Transform data to include customer information
    const transformedBookings = bookings.map((booking) => {
      const user = booking.userId;
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
          : null
      };
    });

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
      cashCollected
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
//       if (!booking.rider) booking.rider = req.user._id;
//       if (req.body.status) booking.status = req.body.status;
//       await booking.save();
//       return res.json(booking);
//     } else if (
//       req.user.role === "customer" &&
//       booking.customer.toString() === req.user._id
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
//     if (req.user.role === "customer") filter.customer = req.user._id;
//     if (req.user.role === "rider") filter.rider = req.user._id;
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

    // Fetch booking and driver
    const booking = await Booking.findById(bookingId);
    const driver = await Rider.findById(driverId);

    if (!booking || !driver) {
      return res.status(404).json({ message: 'Booking or Driver not found' });
    }

    // // Calculate distances
    // const driverToFromKm = getDistanceFromLatLonInKm(
    //   driver.latitude,
    //   driver.longitude,
    //   booking.fromAddress.latitude,
    //   booking.fromAddress.longitude
    // );

    // // Assume first drop location for demo
    // const drop = booking.dropLocation[0];
    // const fromToDropKm = getDistanceFromLatLonInKm(
    //   booking.fromAddress.latitude,
    //   booking.fromAddress.longitude,
    //   drop.latitude,
    //   drop.longitude
    // );

    // // Example price calculation (customize as needed)
    // const price = (driverToFromKm + fromToDropKm) * 10; // 10 currency units per km

    // Assign driver to booking
    booking.rider = driver._id;
    booking.status = 'accepted';
    // booking.price = price;
    booking.riderAcceptTime = new Date();
    // If the request includes status 'completed', set riderEndTime
    if (req.body.status === 'completed') {
      booking.status = 'completed';
      booking.riderEndTime = new Date();
    }
    await booking.save();

    res.json({
      message: 'Order assigned to driver',
      orderDetails: {
        from: booking.fromAddress,
        to: booking.dropLocation
        // driverToFromKm: driverToFromKm.toFixed(2),
        // fromToDropKm: fromToDropKm.toFixed(2),
        // price: price.toFixed(2),
      }
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

// exports.getAvailableBookingsForDriver = async (req, res) => {
//   try {
//     const { latitude, longitude, number } = req.body; // driver's current location and phone number

//     console.log(latitude, longitude, number, "in availanle booking")
//     if (latitude == null || longitude == null || !number) {
//       return res
//         .status(400)
//         .json({ message: "Driver latitude, longitude, and phone number required" });
//     }

//     // Fetch the driver's vehicle type
//     const rider = await Rider.findOne({ phone: number });

//     // console.log(rider, "wswsw")
//     if (!rider || !rider.vehicleType) {
//       return res.status(404).json({ message: "Rider or vehicle type not found" });
//     }
//     const driverVehicleType = rider.vehicleType;

//     console.log(driverVehicleType)
//     // Find bookings that are not yet assigned to a rider, are ongoing/pending, and match vehicle type
//     const bookings = await Booking.find({
//       rider: { $exists: false },
//       vehicleType: driverVehicleType, // Filter by vehicle type
//       $or: [
//         { status: "pending" },
//         { bookingStatus: "Ongoing" }
//       ],
//       status: { $ne: "completed" },
//       bookingStatus: { $ne: "Completed" }
//     });

//     const result = bookings
//       .map((booking) => {
//         if (!booking.fromAddress || !booking.dropLocation.length) return null;
//         const drop = booking.dropLocation[0];

//         // Calculate driver to pickup distance
//         const driverToFromKm = getDistanceFromLatLonInKm(
//           latitude,
//           longitude,
//           booking.fromAddress.latitude,
//           booking.fromAddress.longitude
//         );

//         // Calculate pickup to drop distance only if drop has lat/lng
//         let fromToDropKm = 0;
//         if (
//           drop &&
//           typeof drop.latitude === "number" &&
//           typeof drop.longitude === "number"
//         ) {
//           fromToDropKm = getDistanceFromLatLonInKm(
//             booking.fromAddress.latitude,
//             booking.fromAddress.longitude,
//             drop.latitude,
//             drop.longitude
//           );
//         }

//         // const price = (driverToFromKm + fromToDropKm) * 10;

//         // if (driverToFromKm > 10) return null;

//         return {
//           bookingId: booking._id,
//           from: booking.fromAddress,
//           to: drop,
//           driverToFromKm: driverToFromKm.toFixed(2),
//           fromToDropKm: fromToDropKm.toFixed(2),
//           price: booking.amountPay,
//           status: booking.status || booking.bookingStatus,
//         };
//       })
//       .filter(Boolean);

//     console.log(result, "Resul all booking ")
//     res.json({
//       message: "Available bookings for driver within 5km",
//       bookings: result,
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

exports.getAvailableBookingsForDriver = async (req, res) => {
  try {
    const { latitude, longitude, number } = req.body; // driver's phone number

    console.log(latitude, longitude, number, 'in available booking');

    if (latitude == null || longitude == null || !number) {
      return res.status(400).json({ message: 'Driver latitude, longitude, and phone number required' });
    }

    // Fetch the driver's vehicle type
    const rider = await Rider.findOne({ phone: number });

    if (!rider || !rider.vehicleType) {
      return res.status(404).json({ message: 'Rider or vehicle type not found' });
    }

    const driverVehicleType = rider.vehicleType;

    console.log('Driver vehicle type:', driverVehicleType);

    // Find bookings that are not yet assigned to a rider, are ongoing/pending, and match vehicle type
    const bookings = await Booking.find({
      rider: { $exists: false },
      vehicleType: driverVehicleType, // Filter by vehicle type
      $or: [{ status: 'pending' }, { bookingStatus: 'Ongoing' }],
      status: { $ne: 'completed' },
      bookingStatus: { $ne: 'Completed' }
    });

    console.log(`Found ${bookings.length} bookings matching criteria`);

    const result = bookings
      .map((booking) => {
        if (!booking.fromAddress || !booking.dropLocation.length) return null;
        const drop = booking.dropLocation[0];

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

        // Only show orders within reasonable distance (optional filter)
        // if (driverToFromKm > 10) return null;

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

    console.log(`Returning ${result.length} orders to driver`);

    res.json({
      message: 'Available bookings for driver',
      bookings: result
    });
  } catch (err) {
    console.error('Error in getAvailableBookingsForDriver:', err);
    res.status(500).json({ message: err.message });
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

    console.log('✅ Returning ongoing booking with data:', {
      bookingId: bookingObj._id,
      status: bookingObj.status,
      hasCustomer: !!bookingObj.customer,
      customerName: bookingObj.customer?.name || 'No name',
      customerPhone: bookingObj.customer?.phone || 'No phone',
      rider: bookingObj.rider
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
    console.log(bookingId);
    const booking = await Booking.findByIdAndUpdate(bookingId, { status: 'completed', currentStep: 4 }, { new: true });

    console.log(booking);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: 'Booking completed', booking });
  } catch (err) {
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
    if (!userId && req.user && req.user._id) {
      userId = req.user._id;
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
