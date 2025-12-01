// Script to check if a user exists in the database
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const MONGO_URI = process.env.MONGO_URI;

// Pass the token as command line argument
const token = process.argv[2];

if (!token) {
  console.error('❌ Please provide a token as argument');
  console.log('Usage: node check-user.js <YOUR_TOKEN>');
  process.exit(1);
}

async function checkUser() {
  try {
    console.log('\n=== USER TOKEN VERIFICATION ===\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Decode token
    console.log('📋 Decoding token...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token payload:', JSON.stringify(decoded, null, 2));
    
    const userId = decoded.number || decoded.userId || decoded.user_id || decoded.id || decoded._id;
    console.log('\n🔍 Extracted userId:', userId);
    console.log('Type:', typeof userId);

    // Try to find user by ID
    let user;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      console.log('\n✅ Valid ObjectId - Searching by _id...');
      user = await User.findById(userId);
    } else {
      console.log('\n📱 Not a valid ObjectId - Searching by phone number...');
      user = await User.findOne({ phone: userId });
    }

    if (user) {
      console.log('\n✅ USER FOUND!');
      console.log('\nUser Details:');
      console.log('- ID:', user._id);
      console.log('- Name:', user.name);
      console.log('- Phone:', user.phone);
      console.log('- Role:', user.role);
      console.log('- Wallet Balance:', user.walletBalance);
      console.log('- Status:', user.status);
      console.log('- Created:', user.createdAt);
    } else {
      console.log('\n❌ USER NOT FOUND IN DATABASE');
      console.log('\nPossible reasons:');
      console.log('1. User was deleted from database');
      console.log('2. Token contains invalid user ID');
      console.log('3. Database connection issue');
      
      // Try to find any users to verify DB connection
      console.log('\n🔍 Checking if there are any users in database...');
      const userCount = await User.countDocuments();
      console.log(`Total users in database: ${userCount}`);
      
      if (userCount > 0) {
        console.log('\n📋 Sample users (first 3):');
        const sampleUsers = await User.find().limit(3).select('_id name phone role');
        sampleUsers.forEach((u, i) => {
          console.log(`${i + 1}. ID: ${u._id}, Name: ${u.name}, Phone: ${u.phone}, Role: ${u.role}`);
        });
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB\n');
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.name === 'JsonWebTokenError') {
      console.log('\nToken is invalid or malformed');
    } else if (error.name === 'TokenExpiredError') {
      console.log('\nToken has expired');
    }
    await mongoose.disconnect();
  }
}

checkUser();
