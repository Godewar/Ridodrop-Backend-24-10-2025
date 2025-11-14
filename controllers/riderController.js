// const Rider = require("../models/RiderSchema");
// const jwt = require("jsonwebtoken");

// // ...existing code...

// exports.createRider = async (req, res) => {
//   try {
//     const { phone } = req.body;

//     if (!phone) {
//       return res.status(400).json({ error: "Phone number is required" });
//     }

//     // Use findOne for a single document
//     const existingRider = await Rider.findOne({ phone: phone });
//     if (existingRider) {
//       return res
//         .status(400)
//         .json({ error: "Rider with this phone number already exists" });
//     }

//     // Build images object from uploaded files
//     const images = {};
//     ["BackaadharCard", "FrontaadharCard", "profilePhoto", "panCard"].forEach(
//       (field) => {
//         if (req.files && req.files[field]) {
//           images[field] = req.files[field][0].path.replace(/\\/g, "/"); // Normalize path for consistency
//         }
//       }
//     );

//     const riderData = {
//       ...req.body,
//       images,
//     };

//     const rider = new Rider(riderData);
//     await rider.save();

//     const token = jwt.sign(
//       { number, userId: rider._id },
//       process.env.JWT_SECRET,
//       {
//         expiresIn: "30d", // Token valid for 30 days
//       }
//     );

//     res.status(201).json(rider, token);
//   } catch (err) {
//     console.log(err);
//     res.status(400).json({ error: err.message });
//   }
// };

// exports.updateRider = async (req, res) => {
//   try {
//     const { phone } = req.body;

//     if (!phone) {
//       return res
//         .status(400)
//         .json({ error: "Phone number is required for update" });
//     }

//     // Prepare update object
//     const updateData = { ...req.body };

//     // Handle new uploaded images
//     if (req.files) {
//       updateData.images = {};
//       [
//         "vehicleimageFront",
//         "vehicleimageBack",
//         "vehicleRcFront",
//         "vehicleRcBack",
//         "vehicleInsurence",

//         "drivingLicenseFront",
//         "drivingLicenseBack",
//       ].forEach((field) => {
//         if (req.files[field]) {
//           updateData.images[field] = req.files[field][0].path;
//         }
//       });
//     }

//     // Update rider using phone number
//     const rider = await Rider.findOneAndUpdate(
//       { phone },
//       { $set: updateData },
//       { new: true, runValidators: true }
//     );

//     if (!rider) return res.status(404).json({ error: "Rider not found" });
//     res.json(rider);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // ...existing code...

// // // Get a single rider by ID
// exports.getRiderById = async (req, res) => {
//   try {
//     // For GET requests, use req.query
//     const number = req.query.number || req.body?.number || req.params?.number || req.headers['number'];

//     const rider = await Rider.findOne({ phone: number });

//     if (!rider) return res.status(404).json({ error: "Rider not found" });
//     res.json(rider);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // // Update a rider by ID
// // exports.updateRider = async (req, res) => {
// //   try {
// //     const rider = await Rider.findByIdAndUpdate(req.params.id, req.body, {
// //       new: true,
// //     });
// //     if (!rider) return res.status(404).json({ error: "Rider not found" });
// //     res.json(rider);
// //   } catch (err) {
// //     res.status(400).json({ error: err.message });
// //   }
// // };

// // // Delete a rider by ID
// // exports.deleteRider = async (req, res) => {
// //   try {
// //     const rider = await Rider.findByIdAndDelete(req.params.id);
// //     if (!rider) return res.status(404).json({ error: "Rider not found" });
// //     res.json({ message: "Rider deleted" });
// //   } catch (err) {
// //     res.status(500).json({ error: err.message });
// //   }
// // };

const Rider = require('../models/RiderSchema');
const jwt = require('jsonwebtoken');

// ...existing code...

exports.createRider = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Use findOne for a single document
    const existingRider = await Rider.findOne({ phone: phone });
    if (existingRider) {
      return res.status(400).json({ error: 'Rider with this phone number already exists' });
    }

    // Build images object from uploaded files
    const images = {};
    ['BackaadharCard', 'FrontaadharCard', 'profilePhoto', 'panCard'].forEach((field) => {
      if (req.files && req.files[field]) {
        images[field] = req.files[field][0].path.replace(/\\/g, '/'); // Normalize path for consistency
      }
    });

    const riderData = {
      ...req.body,
      images
    };

    const rider = new Rider(riderData);
    await rider.save();

    const token = jwt.sign({ phone, userId: rider._id }, process.env.JWT_SECRET, {
      expiresIn: '30d' // Token valid for 30 days
    });

    res.status(201).json({ rider, token });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateRider = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required for update' });
    }

    // Get existing rider to preserve current images
    const existingRider = await Rider.findOne({ phone });
    if (!existingRider) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    // Prepare update object
    const updateData = { ...req.body };

    // Handle new uploaded images - merge with existing images
    if (req.files && Object.keys(req.files).length > 0) {
      // Start with existing images
      updateData.images = existingRider.images || {};

      // Update only the new images that were uploaded
      [
        'vehicleimageFront',
        'vehicleimageBack',
        'vehicleRcFront',
        'vehicleRcBack',
        'vehicleInsurence',
        'drivingLicenseFront',
        'drivingLicenseBack'
      ].forEach((field) => {
        if (req.files[field]) {
          updateData.images[field] = req.files[field][0].path.replace(/\\/g, '/');
        }
      });
    }

    // Update rider using phone number
    const rider = await Rider.findOneAndUpdate({ phone }, { $set: updateData }, { new: true, runValidators: true });

    console.log('Rider updated successfully:', {
      phone: rider.phone,
      vehicleType: rider.vehicleType,
      vehicleregisterNumber: rider.vehicleregisterNumber,
      imagesUploaded: Object.keys(rider.images || {})
    });

    res.json({
      message: 'Rider updated successfully',
      rider: rider,
      success: true
    });
  } catch (err) {
    console.error('Error updating rider:', err);
    res.status(400).json({ error: err.message });
  }
};

// ...existing code...

// // Get a single rider by ID
exports.getRiderById = async (req, res) => {
  try {
    // For GET requests, use req.query
    const number = req.query.number || req.body?.number || req.params?.number || req.headers['number'];

    const rider = await Rider.findOne({ phone: number });

    if (!rider) return res.status(404).json({ error: 'Rider not found' });
    res.json(rider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// // Update a rider by ID
// exports.updateRider = async (req, res) => {
//   try {
//     const rider = await Rider.findByIdAndUpdate(req.params.id, req.body, {
//       new: true,
//     });
//     if (!rider) return res.status(404).json({ error: "Rider not found" });
//     res.json(rider);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// Get all riders
exports.getAllRiders = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, vehicleType, vehicleSubType, isBlocked, city, truckSize, fuelType } = req.query;

    console.log('📥 getAllRiders - Query params:', { vehicleType, vehicleSubType, fuelType, truckSize, city, isBlocked });

    // Build filter object
    const filter = {};

    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    if (vehicleType) filter.vehicleType = vehicleType;
    if (vehicleSubType) filter.vehicleSubType = vehicleSubType;
    if (city) filter.selectCity = { $regex: city, $options: 'i' };
    if (truckSize) filter.truckSize = truckSize;
    if (fuelType) filter.fueltype = { $regex: fuelType, $options: 'i' };

    console.log('🔍 Filter object:', filter);

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { driverName: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const riders = await Rider.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

    console.log('📦 Found', riders.length, 'riders');
    if (riders.length > 0) {
      console.log('🚗 First rider sample:', {
        name: riders[0].name,
        vehicleregisterNumber: riders[0].vehicleregisterNumber,
        vehicleType: riders[0].vehicleType,
        vehicleSubType: riders[0].vehicleSubType
      });
    }

    // Format riders for frontend compatibility
    const formattedRiders = riders.map((rider, index) => ({
      ...rider,
      id: rider._id,
      driverId: `DRV${rider._id.toString().slice(-6)}`,
      fullName: rider.name || 'Unknown Driver',
      altMobile: rider.phone,
      photo: rider.images?.profilePhoto ? `${req.protocol}://${req.get('host')}/${rider.images.profilePhoto}` : null,
      status: rider.isBlocked === 'true' ? 'Blocked' : 'Active',
      online: rider.isOnline || false, // Read from database
      isOnline: rider.isOnline || false, // Include both fields for compatibility
      lastSeen: rider.lastSeen || null,
      lastLocationUpdate: rider.lastLocationUpdate || null,
      rating: 0, // You can add rating logic here
      documentStatus: rider.images && Object.keys(rider.images).length > 2 ? 'Verified' : 'Pending'
    }));

    const total = await Rider.countDocuments(filter);

    res.json({
      riders: formattedRiders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get all riders error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Block a rider by ID
exports.blockRider = async (req, res) => {
  try {
    const { id } = req.params;
    let rider;

    console.log('🚫 Blocking rider with ID:', id);

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      rider = await Rider.findByIdAndUpdate(id, { isBlocked: 'true' }, { new: true });
    } else {
      // Assume it's a phone number
      rider = await Rider.findOneAndUpdate({ phone: id }, { isBlocked: 'true' }, { new: true });
    }

    if (!rider) {
      console.log('❌ Rider not found');
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    console.log('✅ Rider blocked successfully:', rider.phone);
    res.status(200).json({
      success: true,
      message: 'Rider blocked successfully',
      data: rider
    });
  } catch (error) {
    console.error('❌ Error in blockRider:', error);
    res.status(500).json({
      success: false,
      message: 'Error blocking rider',
      error: error.message
    });
  }
};

// Unblock a rider by ID
exports.unblockRider = async (req, res) => {
  try {
    const { id } = req.params;
    let rider;

    console.log('✅ Unblocking rider with ID:', id);

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      rider = await Rider.findByIdAndUpdate(id, { isBlocked: 'false' }, { new: true });
    } else {
      // Assume it's a phone number
      rider = await Rider.findOneAndUpdate({ phone: id }, { isBlocked: 'false' }, { new: true });
    }

    if (!rider) {
      console.log('❌ Rider not found');
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    console.log('✅ Rider unblocked successfully:', rider.phone);
    res.status(200).json({
      success: true,
      message: 'Rider unblocked successfully',
      data: rider
    });
  } catch (error) {
    console.error('❌ Error in unblockRider:', error);
    res.status(500).json({
      success: false,
      message: 'Error unblocking rider',
      error: error.message
    });
  }
};

// Delete a rider by ID
exports.deleteRider = async (req, res) => {
  try {
    const { id } = req.params;
    let rider;

    console.log('🗑️ Deleting rider with ID:', id);

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      rider = await Rider.findByIdAndDelete(id);
    } else {
      // Assume it's a phone number
      rider = await Rider.findOneAndDelete({ phone: id });
    }

    if (!rider) {
      console.log('❌ Rider not found');
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    console.log('✅ Rider deleted successfully:', rider.phone);
    res.status(200).json({
      success: true,
      message: 'Rider deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error in deleteRider:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting rider',
      error: error.message
    });
  }
};

// Update rider's online status and location (called when rider goes ON DUTY or updates location)
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { phone, isOnline, latitude, longitude } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const updateData = {
      lastSeen: new Date()
    };

    // Update isOnline status if provided
    if (typeof isOnline === 'boolean') {
      updateData.isOnline = isOnline;
      console.log(`📱 Setting rider ${phone} online status to:`, isOnline);
    }

    // Update location if provided
    if (latitude !== undefined && longitude !== undefined) {
      updateData.currentLocation = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
      updateData.lastLocationUpdate = new Date();
      console.log(`📍 Updating location for ${phone}:`, { latitude, longitude });
    }

    const rider = await Rider.findOneAndUpdate({ phone }, { $set: updateData }, { new: true });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    console.log('✅ Rider status updated:', {
      phone: rider.phone,
      isOnline: rider.isOnline,
      location: rider.currentLocation?.coordinates
    });

    res.status(200).json({
      success: true,
      message: 'Rider status updated successfully',
      data: {
        isOnline: rider.isOnline,
        lastSeen: rider.lastSeen,
        currentLocation: rider.currentLocation
      }
    });
  } catch (error) {
    console.error('❌ Error updating rider status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating rider status',
      error: error.message
    });
  }
};
