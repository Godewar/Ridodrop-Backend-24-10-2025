const Vehicle = require('../models/Vehicle');
const path = require('path');
const fs = require('fs');

// Get all vehicles with filters
exports.getAllVehicles = async (req, res) => {
  try {
    const { vehicleType, isActive } = req.query;

    console.log('📥 getAllVehicles - Query params:', { vehicleType, isActive });

    // Build filter object
    const filter = {};
    if (vehicleType) filter.vehicleType = vehicleType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    console.log('🔍 Filter object:', filter);

    // Execute query with sorting
    const vehicles = await Vehicle.find(filter).sort({ sortOrder: 1, vehicleType: 1, subType: 1 }).lean();

    console.log('📦 Found', vehicles.length, 'vehicles');

    // Add full image URL
    const vehiclesWithFullUrl = vehicles.map((vehicle) => ({
      ...vehicle,
      imageUrl: vehicle.image ? `${req.protocol}://${req.get('host')}/${vehicle.image}` : null
    }));

    res.json({
      success: true,
      vehicles: vehiclesWithFullUrl
    });
  } catch (err) {
    console.error('Get all vehicles error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get vehicle by ID
exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Add full image URL
    const vehicleWithFullUrl = {
      ...vehicle.toObject(),
      imageUrl: vehicle.image ? `${req.protocol}://${req.get('host')}/${vehicle.image}` : null
    };

    res.json({
      success: true,
      vehicle: vehicleWithFullUrl
    });
  } catch (err) {
    console.error('Get vehicle by ID error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Create new vehicle
exports.createVehicle = async (req, res) => {
  try {
    const { vehicleType, subType, displayName, description, capacity, features } = req.body;

    console.log('📝 Creating vehicle:', req.body);
    console.log('📎 File:', req.file);

    // Validate required fields
    if (!vehicleType || !subType || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: vehicleType, subType, displayName'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Vehicle image is required'
      });
    }

    // Check if vehicle with same subType already exists
    const existingVehicle = await Vehicle.findOne({ subType });
    if (existingVehicle) {
      // Delete uploaded file
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: 'Vehicle with this subType already exists'
      });
    }

    // Parse features if it's a string
    let parsedFeatures = [];
    if (features) {
      parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
    }

    const vehicle = new Vehicle({
      vehicleType,
      subType,
      displayName,
      description,
      image: req.file.path.replace(/\\/g, '/'), // Store path with forward slashes
      capacity,
      features: parsedFeatures,
      isActive: true
    });

    await vehicle.save();

    console.log('✅ Vehicle created:', vehicle);

    // Add full image URL
    const vehicleWithFullUrl = {
      ...vehicle.toObject(),
      imageUrl: `${req.protocol}://${req.get('host')}/${vehicle.image}`
    };

    res.status(201).json({
      success: true,
      vehicle: vehicleWithFullUrl
    });
  } catch (err) {
    console.error('Create vehicle error:', err);

    // Delete uploaded file if error occurs
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Update vehicle
exports.updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleType, subType, displayName, description, capacity, features, isActive, sortOrder } = req.body;

    console.log('📝 Updating vehicle:', id, req.body);
    console.log('📎 New file:', req.file);

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      // Delete uploaded file if vehicle not found
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Parse features if it's a string
    let parsedFeatures = features;
    if (features && typeof features === 'string') {
      parsedFeatures = JSON.parse(features);
    }

    // Update fields
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (subType) vehicle.subType = subType;
    if (displayName) vehicle.displayName = displayName;
    if (description !== undefined) vehicle.description = description;
    if (capacity !== undefined) vehicle.capacity = capacity;
    if (parsedFeatures) vehicle.features = parsedFeatures;
    if (isActive !== undefined) vehicle.isActive = isActive;
    if (sortOrder !== undefined) vehicle.sortOrder = sortOrder;

    // If new image is uploaded, delete old image and update
    if (req.file) {
      // Delete old image file
      if (vehicle.image && fs.existsSync(vehicle.image)) {
        fs.unlinkSync(vehicle.image);
      }
      vehicle.image = req.file.path.replace(/\\/g, '/');
    }

    await vehicle.save();

    console.log('✅ Vehicle updated:', vehicle);

    // Add full image URL
    const vehicleWithFullUrl = {
      ...vehicle.toObject(),
      imageUrl: `${req.protocol}://${req.get('host')}/${vehicle.image}`
    };

    res.json({
      success: true,
      vehicle: vehicleWithFullUrl
    });
  } catch (err) {
    console.error('Update vehicle error:', err);

    // Delete uploaded file if error occurs
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Delete vehicle
exports.deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting vehicle:', id);

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Delete image file
    if (vehicle.image && fs.existsSync(vehicle.image)) {
      fs.unlinkSync(vehicle.image);
    }

    await Vehicle.findByIdAndDelete(id);

    console.log('✅ Vehicle deleted');
    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get vehicles by type (for customer app)
exports.getVehiclesByType = async (req, res) => {
  try {
    const { vehicleType } = req.params;

    console.log('📥 getVehiclesByType:', vehicleType);

    const vehicles = await Vehicle.find({
      vehicleType,
      isActive: true
    })
      .sort({ sortOrder: 1, subType: 1 })
      .lean();

    console.log('📦 Found', vehicles.length, 'vehicles for type:', vehicleType);

    // Add full image URL
    const vehiclesWithFullUrl = vehicles.map((vehicle) => ({
      ...vehicle,
      imageUrl: vehicle.image ? `${req.protocol}://${req.get('host')}/${vehicle.image}` : null
    }));

    res.json({
      success: true,
      vehicles: vehiclesWithFullUrl
    });
  } catch (err) {
    console.error('Get vehicles by type error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
