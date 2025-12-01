const Rider = require('../models/RiderSchema');
const Transaction = require('../models/Transaction');

// Get rider wallet balance
exports.getRiderBalance = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ message: 'Phone number required' });
    
    const rider = await Rider.findOne({ phone });
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    
    res.json({ balance: rider.walletBalance || 0, riderId: rider._id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Credit rider wallet
exports.creditRiderWallet = async (req, res) => {
  try {
    const { riderId, amount, bookingId, description } = req.body;
    if (!riderId || !amount) return res.status(400).json({ message: 'riderId and amount required' });
    
    // Update rider wallet
    const rider = await Rider.findById(riderId);
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    
    rider.walletBalance = (rider.walletBalance || 0) + Number(amount);
    await rider.save();
    
    // Create transaction
    const txn = await Transaction.create({
      userId: riderId,
      amount,
      type: 'credit',
      bookingId,
      description: description || 'Wallet top-up',
    });
    
    res.json({ 
      message: 'Rider wallet credited', 
      balance: rider.walletBalance,
      transaction: txn 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Debit rider wallet
exports.debitRiderWallet = async (req, res) => {
  try {
    const { riderId, amount, bookingId, description } = req.body;
    if (!riderId || !amount) return res.status(400).json({ message: 'riderId and amount required' });
    
    // Update rider wallet
    const rider = await Rider.findById(riderId);
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    
    if ((rider.walletBalance || 0) < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    rider.walletBalance = (rider.walletBalance || 0) - Number(amount);
    await rider.save();
    
    // Create transaction
    const txn = await Transaction.create({
      userId: riderId,
      amount,
      type: 'debit',
      bookingId,
      description: description || 'Wallet debit',
    });
    
    res.json({ 
      message: 'Rider wallet debited', 
      balance: rider.walletBalance,
      transaction: txn 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get rider wallet transaction history
exports.getRiderWalletHistory = async (req, res) => {
  try {
    const { riderId } = req.query;
    if (!riderId) return res.status(400).json({ message: 'riderId required' });
    
    const txns = await Transaction.find({ userId: riderId }).sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add money to rider wallet (for app usage)
exports.addMoneyToRider = async (req, res) => {
  try {
    const { riderId, amount } = req.body;
    if (!riderId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid riderId and amount required' });
    }
    
    const rider = await Rider.findById(riderId);
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    
    rider.walletBalance = (rider.walletBalance || 0) + Number(amount);
    await rider.save();
    
    const transaction = await Transaction.create({ 
      userId: riderId, 
      type: 'credit', 
      amount, 
      description: 'Wallet top-up' 
    });
    
    res.json({ 
      balance: rider.walletBalance,
      transaction 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
