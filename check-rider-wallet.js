const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Rider = require('./models/RiderSchema');
  const Transaction = require('./models/Transaction');
  
  const riderId = '6915ada3121b0beb7ac02c02';
  
  // Check rider wallet balance
  const rider = await Rider.findById(riderId);
  console.log('Rider wallet balance:', rider?.walletBalance);
  
  // Check recent transactions
  const transactions = await Transaction.find({ userId: riderId })
    .sort({ createdAt: -1 })
    .limit(5);
  
  console.log('\nRecent transactions:');
  transactions.forEach(txn => {
    console.log(`- ${txn.type}: ₹${txn.amount} - ${txn.description} (${txn.createdAt})`);
  });
  
  await mongoose.connection.close();
}).catch(err => console.error('Error:', err.message));
