const { Expo } = require('expo-server-sdk');
const Booking = require('../models/Booking');
const User = require('../models/User');

exports.sendStepNotification = async (req, res) => {
    try {
        const { bookingId, stepText } = req.body;
        if (!bookingId || !stepText) return res.status(400).json({ message: 'bookingId and stepText required' });
        // Find the booking and customer
        const booking = await Booking.findById(bookingId).populate('customer');
        if (!booking || !booking.customer) return res.status(404).json({ message: 'Booking or customer not found' });
        const pushToken = booking.customer.expoPushToken;
        if (!pushToken || !Expo.isExpoPushToken(pushToken)) return res.status(404).json({ message: 'Customer push token not found or invalid' });
        const expo = new Expo();
        const messages = [{
            to: pushToken,
            sound: 'default',
            body: stepText,
            data: { bookingId, stepText }
        }];
        await expo.sendPushNotificationsAsync(messages);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}; 