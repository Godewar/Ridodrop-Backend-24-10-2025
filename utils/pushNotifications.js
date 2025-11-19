const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a rider
 * @param {string} expoPushToken - Expo push token of the rider
 * @param {object} notification - Notification data
 * @returns {Promise<object>} - Send receipt
 */
async function sendPushNotification(expoPushToken, notification) {
    try {
        // Check if the token is valid
        if (!Expo.isExpoPushToken(expoPushToken)) {
            console.error(`[Push] Invalid Expo push token: ${expoPushToken}`);
            return { success: false, error: 'Invalid token' };
        }

        const message = {
            to: expoPushToken,
            sound: 'default',
            title: notification.title || 'New Notification',
            body: notification.body || '',
            data: notification.data || {},
            priority: notification.priority || 'high',
            channelId: notification.channelId || 'default',
        };

        // Add badge count if provided
        if (notification.badge) {
            message.badge = notification.badge;
        }

        console.log('[Push] Sending notification:', {
            to: expoPushToken,
            title: message.title,
            body: message.body
        });

        const chunks = expo.chunkPushNotifications([message]);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('[Push] Error sending chunk:', error);
            }
        }

        console.log('[Push] ✅ Notification sent successfully');
        return { success: true, tickets };
    } catch (error) {
        console.error('[Push] ❌ Error sending push notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send push notification to multiple riders
 * @param {Array<string>} expoPushTokens - Array of Expo push tokens
 * @param {object} notification - Notification data
 * @returns {Promise<object>} - Send receipts
 */
async function sendPushNotificationToMultiple(expoPushTokens, notification) {
    try {
        const validTokens = expoPushTokens.filter(token => Expo.isExpoPushToken(token));

        if (validTokens.length === 0) {
            console.log('[Push] No valid tokens provided');
            return { success: false, error: 'No valid tokens' };
        }

        const messages = validTokens.map(token => ({
            to: token,
            sound: 'default',
            title: notification.title || 'New Notification',
            body: notification.body || '',
            data: notification.data || {},
            priority: notification.priority || 'high',
            channelId: notification.channelId || 'default',
        }));

        console.log(`[Push] Sending notifications to ${messages.length} riders`);

        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('[Push] Error sending chunk:', error);
            }
        }

        console.log(`[Push] ✅ Sent ${tickets.length} notifications`);
        return { success: true, tickets };
    } catch (error) {
        console.error('[Push] ❌ Error sending push notifications:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send new booking notification to nearby riders
 * @param {Array<object>} riders - Array of rider objects with expoPushToken and distance
 * @param {object} booking - Booking data
 * @returns {Promise<object>} - Send results
 */
async function sendNewBookingNotification(riders, booking) {
    try {
        const validRiders = riders.filter(r => r.expoPushToken && Expo.isExpoPushToken(r.expoPushToken));

        if (validRiders.length === 0) {
            console.log('[Push] No riders with valid push tokens');
            return { success: false, sent: 0 };
        }

        const notification = {
            title: '🎉 New Booking Available!',
            body: `${booking.driverToFromKm}km away • ₹${booking.price || booking.amountPay}`,
            data: {
                type: 'new_booking',
                bookingId: booking._id || booking.bookingId,
                distance: booking.driverToFromKm,
                price: booking.price || booking.amountPay,
                from: booking.from || booking.fromAddress,
                to: booking.to || booking.dropLocation?.[0]
            },
            priority: 'high',
            channelId: 'new_bookings',
            badge: 1
        };

        const tokens = validRiders.map(r => r.expoPushToken);
        const result = await sendPushNotificationToMultiple(tokens, notification);

        console.log(`[Push] 📢 New booking notification sent to ${tokens.length} riders`);
        return { success: true, sent: tokens.length, ...result };
    } catch (error) {
        console.error('[Push] ❌ Error sending new booking notification:', error);
        return { success: false, error: error.message, sent: 0 };
    }
}

module.exports = {
    sendPushNotification,
    sendPushNotificationToMultiple,
    sendNewBookingNotification
};
