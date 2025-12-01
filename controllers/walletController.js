const User = require('../models/User');
const Transaction = require('../models/Transaction');

exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Initialize walletBalance if it doesn't exist
    if (user.walletBalance === null || user.walletBalance === undefined) {
      user.walletBalance = 0;
      await user.save();
    }
    
    res.json({ balance: user.walletBalance || 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.addMoney = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    const user = await User.findById(req.user._id);
    user.walletBalance += amount;
    await user.save();
    const transaction = new Transaction({ userId: user._id, type: 'credit', amount, description: 'Wallet top-up' });
    await transaction.save();
    res.json({ balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Credit wallet
exports.creditWallet = async (req, res) => {
  try {
    const { userId, amount, bookingId, description } = req.body;
    if (!userId || !amount) return res.status(400).json({ message: 'userId and amount required' });
    // Update user wallet
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();
    // Create transaction
    const txn = await Transaction.create({
      userId,
      amount,
      type: 'credit',
      bookingId,
      description: description || 'Order completed credit',
    });
    res.json({ message: 'Wallet credited', txn });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Debit wallet
exports.debitWallet = async (req, res) => {
  try {
    const { userId, amount, bookingId, description } = req.body;
    if (!userId || !amount) return res.status(400).json({ message: 'userId and amount required' });
    // Update user wallet
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if ((user.walletBalance || 0) < amount) return res.status(400).json({ message: 'Insufficient balance' });
    user.walletBalance = (user.walletBalance || 0) - Number(amount);
    await user.save();
    // Create transaction
    const txn = await Transaction.create({
      userId,
      amount,
      type: 'debit',
      bookingId,
      description: description || 'Order debit',
    });
    res.json({ message: 'Wallet debited', txn });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get wallet transaction history
exports.getWalletHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const txns = await Transaction.find({ userId }).sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}; 