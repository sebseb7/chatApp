const webpush = require('web-push');

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    console.log('Push notifications configured');
} else {
    console.warn('VAPID keys not configured - push notifications disabled');
}

/**
 * Save a push subscription for a user
 */
async function saveSubscription(db, userId, subscription) {
    const { endpoint, keys } = subscription;
    
    try {
        // Delete any existing subscription with this endpoint
        await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
        
        // Insert the new subscription
        await db.run(
            `INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)`,
            userId,
            endpoint,
            keys.p256dh,
            keys.auth
        );
        
        return true;
    } catch (err) {
        console.error('Error saving push subscription:', err);
        return false;
    }
}

/**
 * Remove a push subscription
 */
async function removeSubscription(db, endpoint) {
    try {
        await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
        return true;
    } catch (err) {
        console.error('Error removing push subscription:', err);
        return false;
    }
}

/**
 * Get all subscriptions for a user
 */
async function getSubscriptionsForUser(db, userId) {
    try {
        return await db.all('SELECT * FROM push_subscriptions WHERE userId = ?', userId);
    } catch (err) {
        console.error('Error getting subscriptions:', err);
        return [];
    }
}

/**
 * Send a push notification to a specific user
 */
async function sendPushToUser(db, userId, payload) {
    if (!vapidPublicKey || !vapidPrivateKey) {
        console.warn('[Push] VAPID keys not configured');
        return { sent: 0, failed: 0, error: 'VAPID not configured' };
    }
    
    const subscriptions = await getSubscriptionsForUser(db, userId);
    
    if (subscriptions.length === 0) {
        console.log(`[Push] No subscriptions for user ${userId}`);
        return { sent: 0, failed: 0, noSubscriptions: true };
    }
    
    console.log(`[Push] Sending to ${subscriptions.length} subscription(s) for user ${userId}`);
    const payloadString = JSON.stringify(payload);
    
    let sent = 0;
    let failed = 0;
    
    const sendPromises = subscriptions.map(async (sub) => {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };
        
        try {
            const result = await webpush.sendNotification(pushSubscription, payloadString);
            console.log(`[Push] Success for user ${userId}, status: ${result.statusCode}`);
            sent++;
            return { success: true, statusCode: result.statusCode };
        } catch (err) {
            failed++;
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription expired or invalid, remove it
                console.log(`[Push] Removing expired subscription for user ${userId}: ${err.statusCode}`);
                await removeSubscription(db, sub.endpoint);
                return { success: false, expired: true, statusCode: err.statusCode };
            } else {
                console.error(`[Push] Error for user ${userId}:`, err.statusCode, err.body || err.message);
                return { success: false, error: err.message, statusCode: err.statusCode };
            }
        }
    });
    
    const results = await Promise.all(sendPromises);
    console.log(`[Push] Completed for user ${userId}: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };
}

/**
 * Get the public VAPID key for client subscription
 */
function getPublicVapidKey() {
    return vapidPublicKey;
}

module.exports = {
    saveSubscription,
    removeSubscription,
    getSubscriptionsForUser,
    sendPushToUser,
    getPublicVapidKey
};

