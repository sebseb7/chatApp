/**
 * Push Notification Service
 * Handles service worker registration and push subscription
 */

// Check if push notifications are supported
export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Check if notifications are permitted
export function getNotificationPermission() {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    
    const permission = await Notification.requestPermission();
    return permission;
}

// Convert URL-safe base64 to Uint8Array (for VAPID key)
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Register service worker
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers not supported');
    }
    
    // Force update by adding cache-busting and updateViaCache option
    const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none'
    });
    console.log('Service Worker registered:', registration.scope);
    
    // Check for updates
    await registration.update();
    console.log('Service Worker update check completed');
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    
    return registration;
}

// Force update the service worker
export async function forceUpdateServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return { success: false, error: 'Service workers not supported' };
    }
    
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
            await registration.unregister();
            console.log('Unregistered service worker:', registration.scope);
        }
        
        // Re-register
        const newReg = await navigator.serviceWorker.register('/sw.js', {
            updateViaCache: 'none'
        });
        console.log('Re-registered service worker:', newReg.scope);
        
        return { success: true };
    } catch (err) {
        console.error('Error updating service worker:', err);
        return { success: false, error: err.message };
    }
}

// Get or create push subscription
async function getOrCreateSubscription(registration, vapidPublicKey) {
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
        console.log('Existing push subscription found');
        return subscription;
    }
    
    // Create new subscription
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    
    subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
    });
    
    console.log('New push subscription created');
    return subscription;
}

// Subscribe to push notifications
export async function subscribeToPush() {
    if (!isPushSupported()) {
        console.warn('Push notifications not supported');
        return { success: false, error: 'Push notifications not supported' };
    }
    
    try {
        // Request permission if not already granted
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return { success: false, error: 'Permission denied' };
        }
        
        // Get VAPID public key from server
        const vapidResponse = await fetch('/api/push/vapid-public-key');
        if (!vapidResponse.ok) {
            throw new Error('Failed to get VAPID key');
        }
        const { publicKey } = await vapidResponse.json();
        
        // Register service worker
        const registration = await registerServiceWorker();
        
        // Get or create subscription
        const subscription = await getOrCreateSubscription(registration, publicKey);
        
        // Send subscription to server
        const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subscription: subscription.toJSON() })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save subscription on server');
        }
        
        console.log('Push subscription successful');
        return { success: true, subscription };
        
    } catch (err) {
        console.error('Error subscribing to push:', err);
        return { success: false, error: err.message };
    }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            // Unsubscribe locally
            await subscription.unsubscribe();
            
            // Remove from server
            await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            
            console.log('Push subscription removed');
        }
        
        return { success: true };
    } catch (err) {
        console.error('Error unsubscribing from push:', err);
        return { success: false, error: err.message };
    }
}

// Check current subscription status
export async function getSubscriptionStatus() {
    if (!isPushSupported()) {
        return { subscribed: false, supported: false };
    }
    
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        return {
            subscribed: !!subscription,
            supported: true,
            permission: getNotificationPermission()
        };
    } catch (err) {
        console.error('Error checking subscription status:', err);
        return { subscribed: false, supported: true, error: err.message };
    }
}

