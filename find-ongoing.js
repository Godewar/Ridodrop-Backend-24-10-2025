const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  
  // Find an ongoing booking (not completed yet)
  const booking = await Booking.findOne({ 
    rider: { $exists: true, $ne: null },
    bookingStatus: 'Ongoing'
  }).sort({ createdAt: -1 });
  
  if (booking) {
    console.log('Found ongoing booking:');
    console.log('ID:', booking._id);
    console.log('Status:', booking.bookingStatus);
    console.log('Platform Fee:', booking.feeBreakdown?.platformFee);
    console.log('Rider:', booking.rider);
  } else {
    console.log('No ongoing booking found');
  }
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
