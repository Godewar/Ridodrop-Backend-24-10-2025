const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  
  // Find a completed or ongoing booking with rider assigned
  const booking = await Booking.findOne({ 
    rider: { $exists: true, $ne: null },
    bookingStatus: { $in: ['Ongoing', 'Completed'] }
  }).sort({ createdAt: -1 });
  
  if (booking) {
    console.log('Booking ID:', booking._id);
    console.log('Vehicle Type:', booking.vehicleType);
    console.log('Price:', booking.price);
    console.log('Has feeBreakdown:', !!booking.feeBreakdown);
    console.log('feeBreakdown:', JSON.stringify(booking.feeBreakdown, null, 2));
    console.log('Rider:', booking.rider);
  } else {
    console.log('No booking found with rider assigned');
  }
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
