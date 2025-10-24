const Service = require('../models/Service');

// Get all services with filters
exports.getAllServices = async (req, res) => {
  try {
    const { page = 1, limit = 50, vehicleType, subType, city, isActive } = req.query;

    console.log('📥 getAllServices - Query params:', { vehicleType, subType, city, isActive });

    // Build filter object
    const filter = {};

    if (vehicleType) filter.vehicleType = vehicleType;
    if (subType) filter.subType = subType;
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    console.log('🔍 Filter object:', filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const services = await Service.find(filter).sort({ vehicleType: 1, subType: 1, city: 1 }).skip(skip).limit(parseInt(limit)).lean();

    console.log('📦 Found', services.length, 'services');

    const total = await Service.countDocuments(filter);

    res.json({
      services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get all services error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(service);
  } catch (err) {
    console.error('Get service by ID error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Create new service
exports.createService = async (req, res) => {
  try {
    const {
      vehicleType,
      subType,
      city,
      isActive = true,
      startTime,
      endTime,
      priceMultiplier,
      maxDistance,
      serviceFeatures,
      restrictions,
      contactNumber,
      serviceArea
    } = req.body;

    console.log('📝 Creating service:', req.body);

    // Validate required fields
    if (!vehicleType || !subType || !city) {
      return res.status(400).json({
        error: 'Missing required fields: vehicleType, subType, city'
      });
    }

    // Check if service already exists
    const existingService = await Service.findOne({
      vehicleType,
      subType,
      city
    });

    if (existingService) {
      return res.status(400).json({
        error: 'Service already exists for this combination'
      });
    }

    const service = new Service({
      vehicleType,
      subType,
      city,
      isActive,
      startTime,
      endTime,
      priceMultiplier,
      maxDistance,
      serviceFeatures,
      restrictions,
      contactNumber,
      serviceArea
    });

    await service.save();

    console.log('✅ Service created:', service);
    res.status(201).json(service);
  } catch (err) {
    console.error('Create service error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Update service
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('📝 Updating service:', id, updateData);

    const service = await Service.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    console.log('✅ Service updated:', service);
    res.json(service);
  } catch (err) {
    console.error('Update service error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete service
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting service:', id);

    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    console.log('✅ Service deleted');
    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Toggle service status
exports.toggleServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔄 Toggling service status:', id);

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    service.isActive = !service.isActive;
    await service.save();

    console.log('✅ Service status toggled to:', service.isActive);
    res.json(service);
  } catch (err) {
    console.error('Toggle service status error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get unique cities for a vehicle type and subtype
exports.getCitiesForService = async (req, res) => {
  try {
    const { vehicleType, subType } = req.query;

    console.log('📍 Getting cities for:', { vehicleType, subType });

    const filter = {};
    if (vehicleType) filter.vehicleType = vehicleType;
    if (subType) filter.subType = subType;

    const cities = await Service.distinct('city', filter);

    console.log('📍 Found cities:', cities);
    res.json({ cities });
  } catch (err) {
    console.error('Get cities error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Bulk create services
exports.bulkCreateServices = async (req, res) => {
  try {
    const { services } = req.body;

    if (!services || !Array.isArray(services)) {
      return res.status(400).json({ error: 'services array is required' });
    }

    console.log('📝 Bulk creating', services.length, 'services');

    const createdServices = await Service.insertMany(services, { ordered: false });

    console.log('✅', createdServices.length, 'services created');
    res.status(201).json({
      message: `${createdServices.length} services created successfully`,
      services: createdServices
    });
  } catch (err) {
    console.error('Bulk create services error:', err);
    res.status(500).json({ error: err.message });
  }
};
