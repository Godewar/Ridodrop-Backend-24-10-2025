// Quick script to check active bookings for a rider
const mongoose = require('mongoose');

// MongoDB connection string - update if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mukthapavankumar22:Aiplex2024@cluster0.xoqzj.mongodb.net/ridodrop?retryWrites=true&w=majority';

// Booking Schema
const bookingSchema = new mongoose.Schema({}, { strict: false });
const Booking = mongoose.model('Booking', bookingSchema);

// Rider Schema
const riderSchema = new mongoose.Schema({}, { strict: false });
const Rider = mongoose.model('Rider', riderSchema);

async function checkActiveBookings(phone) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find rider
    const rider = await Rider.findOne({ phone });
    if (!rider) {
      console.log('❌ Rider not found for phone:', phone);
      process.exit(1);
    }

    console.log('\n👤 Rider Info:');
    console.log('   ID:', rider._id);
    console.log('   Name:', rider.name);
    console.log('   Phone:', rider.phone);

    // Find all active bookings
    const activeStatuses = ['accepted', 'in_progress', 'picked_up', 'on_way'];
    const activeBookings = await Booking.find({
      rider: rider._id,
      status: { $in: activeStatuses }
    }).select('_id bookingId status createdAt updatedAt riderAcceptTime price');

    console.log('\n📊 Active Bookings Count:', activeBookings.length);
    
    if (activeBookings.length > 0) {
      console.log('\n📋 Active Bookings Details:');
      activeBookings.forEach((booking, index) => {
        console.log(`\n${index + 1}. Booking ID: ${booking._id}`);
        console.log(`   Status: ${booking.status}`);
        console.log(`   Created: ${booking.createdAt}`);
        console.log(`   Updated: ${booking.updatedAt}`);
        console.log(`   Accepted: ${booking.riderAcceptTime || 'Not accepted yet'}`);
        console.log(`   Price: ₹${booking.price || 0}`);
      });

      if (activeBookings.length > 1) {
        console.log('\n⚠️  WARNING: Multiple active bookings detected!');
        console.log('   This rider should not have more than 1 active booking at a time.');
      }
    } else {
      console.log('\n✅ No active bookings found for this rider.');
    }

    // Check all bookings (any status)
    const allBookingsCount = await Booking.countDocuments({ rider: rider._id });
    const completedCount = await Booking.countDocuments({ 
      rider: rider._id, 
      status: 'completed' 
    });
    
    console.log('\n📈 Overall Statistics:');
    console.log('   Total Bookings:', allBookingsCount);
    console.log('   Completed:', completedCount);
    console.log('   Active:', activeBookings.length);

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get phone from command line argument
const phone = process.argv[2] || '9552567681';
console.log('🔍 Checking active bookings for phone:', phone);
checkActiveBookings(phone);
