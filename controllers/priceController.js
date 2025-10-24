const Price = require('../models/Price');

// Get all prices with filters
exports.getAllPrices = async (req, res) => {
  try {
    const { page = 1, limit = 50, vehicleType, subType } = req.query;

    console.log('📥 getAllPrices - Query params:', { vehicleType, subType });

    // Build filter object
    const filter = {};

    if (vehicleType) filter.vehicleType = vehicleType;
    if (subType) filter.subType = subType;

    console.log('🔍 Filter object:', filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const prices = await Price.find(filter).sort({ vehicleType: 1, subType: 1, kmRange: 1 }).skip(skip).limit(parseInt(limit)).lean();

    console.log('📦 Found', prices.length, 'prices');

    const total = await Price.countDocuments(filter);

    res.json({
      prices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get all prices error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get price by ID
exports.getPriceById = async (req, res) => {
  try {
    const price = await Price.findById(req.params.id);

    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }

    res.json(price);
  } catch (err) {
    console.error('Get price by ID error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Create new price
exports.createPrice = async (req, res) => {
  try {
    const { vehicleType, subType, kmRange, rate, timeSlot } = req.body;

    console.log('📝 Creating price:', req.body);

    // Validate required fields
    if (!vehicleType || !subType || !kmRange || !rate || !timeSlot) {
      return res.status(400).json({
        error: 'Missing required fields: vehicleType, subType, kmRange, rate, timeSlot'
      });
    }

    // Check if price entry already exists
    const existingPrice = await Price.findOne({
      vehicleType,
      subType,
      kmRange,
      timeSlot
    });

    if (existingPrice) {
      return res.status(400).json({
        error: 'Price entry already exists for this combination'
      });
    }

    const price = new Price({
      vehicleType,
      subType,
      kmRange,
      rate,
      timeSlot,
      isActive: true
    });

    await price.save();

    console.log('✅ Price created:', price);
    res.status(201).json(price);
  } catch (err) {
    console.error('Create price error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Update price
exports.updatePrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleType, subType, kmRange, rate, timeSlot, isActive } = req.body;

    console.log('📝 Updating price:', id, req.body);

    const price = await Price.findByIdAndUpdate(
      id,
      {
        vehicleType,
        subType,
        kmRange,
        rate,
        timeSlot,
        isActive
      },
      { new: true, runValidators: true }
    );

    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }

    console.log('✅ Price updated:', price);
    res.json(price);
  } catch (err) {
    console.error('Update price error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete price
exports.deletePrice = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting price:', id);

    const price = await Price.findByIdAndDelete(id);

    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }

    console.log('✅ Price deleted');
    res.json({ message: 'Price deleted successfully' });
  } catch (err) {
    console.error('Delete price error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Bulk create prices
exports.bulkCreatePrices = async (req, res) => {
  try {
    const { prices } = req.body;

    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'prices array is required' });
    }

    console.log('📝 Bulk creating', prices.length, 'prices');

    const createdPrices = await Price.insertMany(prices, { ordered: false });

    console.log('✅', createdPrices.length, 'prices created');
    res.status(201).json({
      message: `${createdPrices.length} prices created successfully`,
      prices: createdPrices
    });
  } catch (err) {
    console.error('Bulk create prices error:', err);
    res.status(500).json({ error: err.message });
  }
};
