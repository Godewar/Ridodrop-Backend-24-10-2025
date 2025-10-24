const express = require('express');
const router = express.Router();
const { sendStepNotification } = require('../controllers/notificationController');

router.post('/send-step', sendStepNotification);

module.exports = router; 