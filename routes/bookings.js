const express = require('express');
const router = express.Router();
const {
  createBooking,
  getAllOrders,
  getAvailableBookingsForDriver,
  assignOrder,
  cancelBooking,
  declineBooking,
  getOngoingBookingForRider,
  getBooking,
  getBookingWithRiderDetails,
  saveFromAddress,
  uploadBookingImage,
  updateBooking,
  updateBookingStep,
  completeBooking,
  getOrderHistory,
  collectCash,
  saveDropLocation,
  exportOrderDetailsToExcel,
  exportCancelDetailsToExcel
} = require('../controllers/bookingController');
const multer = require('../utils/multerConfig');
const { auth } = require('../middlewares/auth');

// Export routes - MUST be before any routes with :id parameter
router.get('/export/order-details', exportOrderDetailsToExcel);
router.get('/export/cancel-details', exportCancelDetailsToExcel);

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
router.post('/cancel-booking', cancelBooking); // ✅ Customer cancel booking
router.post('/decline-booking', declineBooking); // ✅ Decline/reject booking
router.get('/ongoing-booking', getOngoingBookingForRider);
router.get('/booking/:id', getBooking);
router.get('/booking-with-rider/:id', getBookingWithRiderDetails);
router.patch('/booking/:id', updateBooking); // Update booking including quick fee
router.patch('/update-step/:id', updateBookingStep);
router.patch('/complete/:id', completeBooking);
router.get('/order-history', getOrderHistory);

// Add this route for image upload
router.post('/upload-image/:id', multer.single('image'), uploadBookingImage);
router.patch('/collect-cash/:id', collectCash);

// Drop location route
router.post('/drop-location', auth, saveDropLocation);

module.exports = router;
