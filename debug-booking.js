const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  
  const bookingId = '69244f6207512907c11ef9f3';
  
  const booking = await Booking.findById(bookingId).populate('rider', 'phone vehicleType');
  
  console.log('=== BOOKING DEBUG ===');
  console.log('Booking ID:', booking._id);
  console.log('Has rider:', !!booking.rider);
  console.log('Rider value:', booking.rider);
  console.log('Has feeBreakdown:', !!booking.feeBreakdown);
  console.log('feeBreakdown:', booking.feeBreakdown);
  console.log('platformFee:', booking.feeBreakdown?.platformFee);
  console.log('Condition check:');
  console.log('  - booking.rider:', !!booking.rider);
  console.log('  - booking.feeBreakdown:', !!booking.feeBreakdown);
  console.log('  - booking.feeBreakdown.platformFee:', booking.feeBreakdown?.platformFee);
  console.log('  - booking.feeBreakdown.platformFee > 0:', booking.feeBreakdown?.platformFee > 0);
  console.log('All conditions met:', !!(booking.rider && booking.feeBreakdown && booking.feeBreakdown.platformFee && booking.feeBreakdown.platformFee > 0));
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
