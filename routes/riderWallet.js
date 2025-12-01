const express = require('express');
const router = express.Router();
const { 
  getRiderBalance, 
  creditRiderWallet, 
  debitRiderWallet, 
  getRiderWalletHistory,
  addMoneyToRider 
} = require('../controllers/riderWalletController');

// Rider wallet routes
router.get('/balance', getRiderBalance);
router.post('/add', addMoneyToRider);
router.post('/credit', creditRiderWallet);
router.post('/debit', debitRiderWallet);
router.get('/history', getRiderWalletHistory);

module.exports = router;
