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
const XLSX = require('xlsx');

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

// // Get a single rider by ID or phone number
exports.getRiderById = async (req, res) => {
  try {
    // Support multiple ways to identify rider
    const identifier = req.query.number || req.body?.number || req.params?.id || req.params?.number || req.headers['number'];

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Rider ID or phone number is required'
      });
    }

    let rider;

    // Check if identifier looks like a MongoDB ObjectId (24 hex characters)
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('🔍 Fetching rider by MongoDB ID:', identifier);
      rider = await Rider.findById(identifier);
    } else {
      // Assume it's a phone number or customerId
      console.log('🔍 Fetching rider by phone/customerId:', identifier);
      rider = await Rider.findOne({
        $or: [{ phone: identifier }, { customerId: identifier }]
      });
    }

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    res.status(200).json({
      success: true,
      data: rider
    });
  } catch (err) {
    console.error('Error in getRiderById:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching rider',
      error: err.message
    });
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
        vehicleSubType: riders[0].vehicleSubType,
        documentStatus: riders[0].documentStatus,
        rejectionReason: riders[0].rejectionReason
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
      // Use actual documentStatus from database, or default based on images
      documentStatus: rider.documentStatus || (rider.images && Object.keys(rider.images).length > 2 ? 'Pending' : 'Pending'),
      rejectionReason: rider.rejectionReason || null,
      documentApprovals: rider.documentApprovals || {},
      documentRejectionReasons: rider.documentRejectionReasons || {},
      blockReason: rider.blockReason || null
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
    const { reason } = req.body;
    let rider;

    console.log('🚫 Blocking rider with ID:', id, 'Reason:', reason);

    const updateData = {
      isBlocked: 'true',
      blockReason: reason || 'No reason provided',
      blockedAt: new Date()
    };

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      rider = await Rider.findByIdAndUpdate(id, updateData, { new: true });
    } else {
      // Assume it's a phone number
      rider = await Rider.findOneAndUpdate({ phone: id }, updateData, { new: true });
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

    const updateData = {
      isBlocked: 'false',
      blockReason: null,
      unblockedAt: new Date()
    };

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      rider = await Rider.findByIdAndUpdate(id, updateData, { new: true });
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

// Approve individual document
exports.approveIndividualDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentField } = req.body;

    console.log('✅ Approving individual document:', { riderId: id, documentField });

    if (!documentField) {
      return res.status(400).json({
        success: false,
        message: 'Document field is required'
      });
    }

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Initialize documentApprovals if it doesn't exist
    if (!rider.documentApprovals) {
      rider.documentApprovals = {};
    }

    // Approve the specific document
    rider.documentApprovals[documentField] = 'approved';
    rider.markModified('documentApprovals');

    await rider.save();

    console.log('✅ Document approved successfully:', { riderId: id, documentField });

    res.status(200).json({
      success: true,
      message: 'Document approved successfully',
      data: {
        documentField,
        status: 'approved'
      }
    });
  } catch (error) {
    console.error('❌ Error approving document:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving document',
      error: error.message
    });
  }
};

// Reject individual document
exports.rejectIndividualDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentField, reason } = req.body;

    console.log('❌ Rejecting individual document:', { riderId: id, documentField, reason });

    if (!documentField) {
      return res.status(400).json({
        success: false,
        message: 'Document field is required'
      });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Initialize fields if they don't exist
    if (!rider.documentApprovals) {
      rider.documentApprovals = {};
    }
    if (!rider.documentRejectionReasons) {
      rider.documentRejectionReasons = {};
    }

    // Reject the specific document and store reason
    rider.documentApprovals[documentField] = 'rejected';
    rider.documentRejectionReasons[documentField] = reason;
    rider.markModified('documentApprovals');
    rider.markModified('documentRejectionReasons');

    await rider.save();

    console.log('✅ Document rejected successfully:', { riderId: id, documentField, reason });

    res.status(200).json({
      success: true,
      message: 'Document rejected successfully',
      data: {
        documentField,
        status: 'rejected',
        reason
      }
    });
  } catch (error) {
    console.error('❌ Error rejecting document:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting document',
      error: error.message
    });
  }
};

// Reject all documents for a rider
exports.rejectAllDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    console.log('❌ Rejecting all documents for rider:', id, 'Reason:', reason);

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Store the overall rejection reason
    rider.rejectionReason = reason;
    rider.documentStatus = 'Rejected';

    await rider.save();

    console.log('✅ All documents rejected successfully for rider:', id);

    res.status(200).json({
      success: true,
      message: 'All documents rejected successfully',
      data: {
        riderId: id,
        rejectionReason: reason,
        documentStatus: 'Rejected'
      }
    });
  } catch (error) {
    console.error('❌ Error rejecting all documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting all documents',
      error: error.message
    });
  }
};

// Approve all documents for a rider
exports.approveAllDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('✅ Approving all documents for rider:', id);

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Update document status to Approved and clear any rejection reason
    rider.documentStatus = 'Approved';
    rider.rejectionReason = null;

    await rider.save();

    console.log('✅ All documents approved successfully for rider:', id);

    res.status(200).json({
      success: true,
      message: 'All documents approved successfully',
      data: {
        riderId: id,
        documentStatus: 'Approved'
      }
    });
  } catch (error) {
    console.error('❌ Error approving all documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving all documents',
      error: error.message
    });
  }
};

// Export drivers data to Excel
exports.exportDriversToExcel = async (req, res) => {
  try {
    console.log('📊 Exporting drivers to Excel...');

    const { vehicleType, city, isBlocked } = req.query;
    const query = {};

    if (vehicleType) query.vehicleType = vehicleType;
    if (city) query.selectCity = city;
    if (isBlocked !== undefined) query.isBlocked = isBlocked === 'true';

    const riders = await Rider.find(query)
      .select('name phone email driverId vehicleType selectCity isBlocked documentStatus createdAt images vehiclenumber')
      .lean();

    console.log(`📊 Found ${riders.length} drivers to export`);

    // Check if there are riders to export
    if (riders.length === 0) {
      console.log('⚠️ No drivers found to export');
      // Still create an Excel file with headers only
      const excelData = [
        {
          'S.No': '',
          'Driver ID': '',
          Name: '',
          Phone: '',
          Email: '',
          'Vehicle Type': '',
          'Vehicle Number': '',
          City: '',
          Status: '',
          'Document Status': '',
          'Registration Date': '',
          'Aadhar Front': '',
          'Aadhar Back': '',
          'PAN Card': '',
          'Driving License': '',
          'Vehicle RC': '',
          'Vehicle Insurance': ''
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=drivers_data_${new Date().toISOString().split('T')[0]}.xlsx`);
      return res.send(excelBuffer);
    }

    // Transform data for Excel export
    const excelData = riders.map((rider, index) => ({
      'S.No': index + 1,
      'Driver ID': rider.driverId || 'N/A',
      Name: rider.name || 'N/A',
      Phone: rider.phone || 'N/A',
      Email: rider.email || 'N/A',
      'Vehicle Type': rider.vehicleType || 'N/A',
      'Vehicle Number': rider.vehiclenumber || 'N/A',
      City: rider.selectCity || 'N/A',
      Status: rider.isBlocked ? 'Blocked' : 'Active',
      'Document Status': rider.documentStatus || 'Pending',
      'Registration Date': rider.createdAt ? new Date(rider.createdAt).toLocaleDateString() : 'N/A',
      'Aadhar Front': rider.images?.FrontaadharCard ? 'Yes' : 'No',
      'Aadhar Back': rider.images?.BackaadharCard ? 'Yes' : 'No',
      'PAN Card': rider.images?.panCard ? 'Yes' : 'No',
      'Driving License': rider.images?.drivingLicenseFront ? 'Yes' : 'No',
      'Vehicle RC': rider.images?.vehicleRcFront ? 'Yes' : 'No',
      'Vehicle Insurance': rider.images?.vehicleInsurence ? 'Yes' : 'No'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=drivers_data_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send the Excel file
    res.send(excelBuffer);
    console.log(`✅ Excel file sent successfully with ${excelData.length} drivers`);
  } catch (error) {
    console.error('❌ Error exporting drivers to Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting drivers data',
      error: error.message
    });
  }
};

// Export drivers documents data
exports.exportDriversDocuments = async (req, res) => {
  try {
    console.log('📄 Exporting drivers documents...');

    const { vehicleType, city, documentStatus } = req.query;
    const query = {};

    if (vehicleType) query.vehicleType = vehicleType;
    if (city) query.selectCity = city;
    if (documentStatus) query.documentStatus = documentStatus;

    const riders = await Rider.find(query).select('name phone driverId vehicleType selectCity documentStatus images createdAt').lean();

    console.log(`📄 Found ${riders.length} drivers with documents to export`);

    // Check if there are riders to export
    if (riders.length === 0) {
      console.log('⚠️ No drivers found to export documents');
      // Still create an Excel file with headers only
      const documentsData = [
        {
          'S.No': '',
          'Driver ID': '',
          Name: '',
          Phone: '',
          'Vehicle Type': '',
          City: '',
          'Document Status': '',
          'Registration Date': '',
          'Aadhar Front': '',
          'Aadhar Back': '',
          'PAN Card': '',
          'Driving License Front': '',
          'Driving License Back': '',
          'Vehicle RC Front': '',
          'Vehicle RC Back': '',
          'Vehicle Image Front': '',
          'Vehicle Image Back': '',
          'Vehicle Insurance': '',
          'Bank Passbook': '',
          'Owner Selfie': ''
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(documentsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Driver Documents');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=drivers_documents_${new Date().toISOString().split('T')[0]}.xlsx`);
      return res.send(excelBuffer);
    }

    // Transform data for document export
    const documentsData = riders.map((rider, index) => ({
      'S.No': index + 1,
      'Driver ID': rider.driverId || 'N/A',
      Name: rider.name || 'N/A',
      Phone: rider.phone || 'N/A',
      'Vehicle Type': rider.vehicleType || 'N/A',
      City: rider.selectCity || 'N/A',
      'Document Status': rider.documentStatus || 'Pending',
      'Registration Date': rider.createdAt ? new Date(rider.createdAt).toLocaleDateString() : 'N/A',
      'Aadhar Front': rider.images?.FrontaadharCard || 'Not Uploaded',
      'Aadhar Back': rider.images?.BackaadharCard || 'Not Uploaded',
      'PAN Card': rider.images?.panCard || 'Not Uploaded',
      'Driving License Front': rider.images?.drivingLicenseFront || 'Not Uploaded',
      'Driving License Back': rider.images?.drivingLicenseBack || 'Not Uploaded',
      'Vehicle RC Front': rider.images?.vehicleRcFront || 'Not Uploaded',
      'Vehicle RC Back': rider.images?.vehicleRcBack || 'Not Uploaded',
      'Vehicle Image Front': rider.images?.vehicleimageFront || 'Not Uploaded',
      'Vehicle Image Back': rider.images?.vehicleimageBack || 'Not Uploaded',
      'Vehicle Insurance': rider.images?.vehicleInsurence || 'Not Uploaded',
      'Bank Passbook': rider.images?.bankPassbook || 'Not Uploaded',
      'Owner Selfie': rider.images?.ownerSelfie || 'Not Uploaded'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(documentsData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Driver Documents');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=drivers_documents_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send the Excel file
    res.send(excelBuffer);
    console.log(`✅ Documents Excel file sent successfully with ${documentsData.length} drivers`);
  } catch (error) {
    console.error('❌ Error exporting drivers documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting drivers documents',
      error: error.message
    });
  }
};
