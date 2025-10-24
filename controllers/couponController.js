const Coupon = require('../models/Coupon');

// Get all coupons with filters
exports.getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, discountType, createdBy, search } = req.query;

    console.log('📥 getAllCoupons - Query params:', { status, discountType, createdBy, search });

    // Build filter object
    const filter = {};

    if (status) filter.status = status;
    if (discountType) filter.discountType = discountType;
    if (createdBy) filter.createdBy = { $regex: createdBy, $options: 'i' };

    // Search filter
    if (search) {
      filter.$or = [{ couponCode: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    }

    console.log('🔍 Filter object:', filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

    console.log('📦 Found', coupons.length, 'coupons');

    // Update expired coupons
    await Coupon.updateMany({ validityEnd: { $lt: new Date() }, status: { $ne: 'Expired' } }, { status: 'Expired', isActive: false });

    const total = await Coupon.countDocuments(filter);

    res.json({
      coupons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get all coupons error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get coupon by ID
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json(coupon);
  } catch (err) {
    console.error('Get coupon by ID error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get coupon by code
exports.getCouponByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const coupon = await Coupon.findOne({ couponCode: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    // Check if coupon is valid
    const now = new Date();
    if (now > coupon.validityEnd) {
      coupon.status = 'Expired';
      coupon.isActive = false;
      await coupon.save();
      return res.status(400).json({ error: 'Coupon has expired' });
    }

    if (!coupon.isActive || coupon.status !== 'Active') {
      return res.status(400).json({ error: 'Coupon is not active' });
    }

    res.json(coupon);
  } catch (err) {
    console.error('Get coupon by code error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Create new coupon
exports.createCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      description,
      discountType,
      value,
      usageLimit,
      usageLimitNumber,
      validityStart,
      validityEnd,
      createdBy,
      minOrderAmount,
      maxDiscountAmount,
      applicableFor,
      vehicleTypes,
      isFirstTimeUser
    } = req.body;

    console.log('📝 Creating coupon:', req.body);

    // Validate required fields
    if (!couponCode || !description || !discountType || !value || !validityStart || !validityEnd) {
      return res.status(400).json({
        error: 'Missing required fields: couponCode, description, discountType, value, validityStart, validityEnd'
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase()
    });

    if (existingCoupon) {
      return res.status(400).json({
        error: 'Coupon code already exists'
      });
    }

    // Validate dates
    if (new Date(validityStart) >= new Date(validityEnd)) {
      return res.status(400).json({
        error: 'Validity start date must be before end date'
      });
    }

    const coupon = new Coupon({
      couponCode: couponCode.toUpperCase(),
      description,
      discountType,
      value,
      usageLimit,
      usageLimitNumber: usageLimit !== 'Unlimited' ? usageLimitNumber : null,
      validityStart: new Date(validityStart),
      validityEnd: new Date(validityEnd),
      createdBy: createdBy || 'Admin',
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount,
      applicableFor: applicableFor || ['all'],
      vehicleTypes: vehicleTypes || ['All'],
      isFirstTimeUser: isFirstTimeUser || false
    });

    await coupon.save();

    console.log('✅ Coupon created:', coupon);
    res.status(201).json(coupon);
  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    console.log('📝 Updating coupon:', id, updateData);

    // If couponCode is being updated, check for duplicates
    if (updateData.couponCode) {
      updateData.couponCode = updateData.couponCode.toUpperCase();
      const existingCoupon = await Coupon.findOne({
        couponCode: updateData.couponCode,
        _id: { $ne: id }
      });

      if (existingCoupon) {
        return res.status(400).json({
          error: 'Coupon code already exists'
        });
      }
    }

    // Validate dates if being updated
    if (updateData.validityStart && updateData.validityEnd) {
      if (new Date(updateData.validityStart) >= new Date(updateData.validityEnd)) {
        return res.status(400).json({
          error: 'Validity start date must be before end date'
        });
      }
    }

    const coupon = await Coupon.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    console.log('✅ Coupon updated:', coupon);
    res.json(coupon);
  } catch (err) {
    console.error('Update coupon error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting coupon:', id);

    const coupon = await Coupon.findByIdAndDelete(id);

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    console.log('✅ Coupon deleted');
    res.json({ message: 'Coupon deleted successfully' });
  } catch (err) {
    console.error('Delete coupon error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Apply coupon (for usage tracking)
exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.params;
    const { orderAmount, userId, userType } = req.body;

    console.log('🎟️ Applying coupon:', code, { orderAmount, userId, userType });

    const coupon = await Coupon.findOne({ couponCode: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    // Check if coupon is valid
    const now = new Date();
    if (now > coupon.validityEnd || now < coupon.validityStart) {
      return res.status(400).json({ error: 'Coupon is not valid at this time' });
    }

    if (!coupon.isActive || coupon.status !== 'Active') {
      return res.status(400).json({ error: 'Coupon is not active' });
    }

    // Check usage limit
    if (coupon.usageLimit !== 'Unlimited' && coupon.used >= coupon.usageLimitNumber) {
      return res.status(400).json({ error: 'Coupon usage limit reached' });
    }

    // Check minimum order amount
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        error: `Minimum order amount is ₹${coupon.minOrderAmount}`
      });
    }

    // Check if applicable for user type
    if (!coupon.applicableFor.includes('all') && !coupon.applicableFor.includes(userType)) {
      return res.status(400).json({ error: 'Coupon not applicable for this user type' });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'Percentage') {
      discountAmount = (orderAmount * coupon.value) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = coupon.value;
    }

    // Increment usage count
    coupon.used += 1;
    await coupon.save();

    console.log('✅ Coupon applied successfully');
    res.json({
      message: 'Coupon applied successfully',
      discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
      couponCode: coupon.couponCode
    });
  } catch (err) {
    console.error('Apply coupon error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get coupon statistics
exports.getCouponStats = async (req, res) => {
  try {
    const totalCoupons = await Coupon.countDocuments();
    const activeCoupons = await Coupon.countDocuments({ status: 'Active', isActive: true });
    const expiredCoupons = await Coupon.countDocuments({ status: 'Expired' });
    const inactiveCoupons = await Coupon.countDocuments({ status: 'Inactive' });

    // Update expired coupons
    await Coupon.updateMany({ validityEnd: { $lt: new Date() }, status: { $ne: 'Expired' } }, { status: 'Expired', isActive: false });

    res.json({
      total: totalCoupons,
      active: activeCoupons,
      expired: expiredCoupons,
      inactive: inactiveCoupons
    });
  } catch (err) {
    console.error('Get coupon stats error:', err);
    res.status(500).json({ error: err.message });
  }
};
