const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  
  // Find the booking we tested earlier
  const bookingId = '69244f6207512907c11ef9f3';
  
  const booking = await Booking.findByIdAndUpdate(
    bookingId,
    { 
      status: 'in_progress',
      bookingStatus: 'Ongoing',
      currentStep: 3
    },
    { new: true }
  );
  
  if (booking) {
    console.log('✅ Booking reset to Ongoing status');
    console.log('Booking ID:', booking._id);
    console.log('Status:', booking.bookingStatus);
    console.log('Rider:', booking.rider);
    console.log('Platform Fee:', booking.feeBreakdown?.platformFee);
    console.log('Vehicle Type:', booking.vehicleType);
  } else {
    console.log('❌ Booking not found');
  }
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
