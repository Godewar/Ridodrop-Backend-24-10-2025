const express = require('express');
const router = express.Router();
const {
  createBooking,
  getAllOrders,
  getAvailableBookingsForDriver,
  assignOrder,
  getOngoingBookingForRider,
  getBooking,
  getBookingWithRiderDetails,
  saveFromAddress,
  uploadBookingImage,
  updateBookingStep,
  completeBooking,
  getOrderHistory,
  collectCash,
  saveDropLocation
} = require('../controllers/bookingController');
const multer = require('../utils/multerConfig');
const { auth } = require('../middlewares/auth');

// const { authMiddle } = require('../middlewares/auth');
router.post('/create-with-details', auth, multer.fields([{ name: 'productImages', maxCount: 4 }]), createBooking);
// router.get("/:id", auth, getBooking);
// router.put("/:id", auth, updateBooking);
// router.get("/", auth, listBookings);

// Create booking without auth
router.post('/create', multer.fields([{ name: 'productImages', maxCount: 4 }]), createBooking);

// Get all orders/bookings with filters
router.get('/all', getAllOrders);

// // Save from address before order
router.post('/save-from-address', saveFromAddress);

// // Save drop address before order
// router.post("/save-drop-address", saveDropAddress);

// // Comprehensive booking creation with all details
// router.post("/create-with-details", createBookingWithDetails);

// // Get bookings by user and status
// router.get("/user/:userId/status/:bookingStatus", getBookingsByUserAndStatus);

// // Get all bookings for a user (grouped by status)
// router.get("/user/:userId", getUserBookings);

// // Update booking status
// router.put("/:bookingId/status", updateBookingStatus);

router.post('/get/bookings', getAvailableBookingsForDriver);
router.post('/assign-order', assignOrder);
router.get('/ongoing-booking', getOngoingBookingForRider);
router.get('/booking/:id', getBooking);
router.get('/booking-with-rider/:id', getBookingWithRiderDetails);
router.patch('/update-step/:id', updateBookingStep);
router.patch('/complete/:id', completeBooking);
router.get('/order-history', getOrderHistory);

// Add this route for image upload
router.post('/upload-image/:id', multer.single('image'), uploadBookingImage);
router.patch('/collect-cash/:id', collectCash);

// Drop location route
router.post('/drop-location', auth, saveDropLocation);

module.exports = router;
