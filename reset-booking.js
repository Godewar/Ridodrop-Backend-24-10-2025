const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  const Rider = require('./models/RiderSchema');
  
  const bookingId = '69244f6207512907c11ef9f3';
  const riderId = '6915ada3121b0beb7ac02c02';
  
  // Get rider's current balance
  const rider = await Rider.findById(riderId);
  console.log('Current rider wallet balance:', rider?.walletBalance);
  
  // Reset booking to Ongoing
  await Booking.findByIdAndUpdate(bookingId, {
    bookingStatus: 'Ongoing',
    status: 'in_progress'
  });
  
  console.log('Booking reset to Ongoing. Now complete it via API to test platform fee deduction');
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
