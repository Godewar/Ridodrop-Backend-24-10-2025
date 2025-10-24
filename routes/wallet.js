const express = require('express');
const router = express.Router();
const { getBalance, addMoney, getTransactions, creditWallet, debitWallet, getWalletHistory } = require('../controllers/walletController');
// const auth = require('../middlewares/auth');
const { auth } = require("../middlewares/auth");

router.get('/balance', auth, getBalance);
router.post('/add', auth, addMoney);
router.get('/transactions', auth, getTransactions);
router.post('/credit', creditWallet);
router.post('/debit', debitWallet);
router.get('/history', getWalletHistory);

module.exports = router; 