const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');

// Get all coupons (with filters)
router.get('/all', couponController.getAllCoupons);

// Get coupon statistics
router.get('/stats', couponController.getCouponStats);

// Get coupon by ID
router.get('/:id', couponController.getCouponById);

// Get coupon by code
router.get('/code/:code', couponController.getCouponByCode);

// Create new coupon
router.post('/create', couponController.createCoupon);

// Update coupon
router.put('/:id', couponController.updateCoupon);

// Delete coupon
router.delete('/:id', couponController.deleteCoupon);

// Apply coupon (for usage tracking)
router.post('/apply/:code', couponController.applyCoupon);

module.exports = router;
