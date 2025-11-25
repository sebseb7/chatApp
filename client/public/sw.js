// Service Worker for Push Notifications

const CACHE_NAME = 'chat-app-v3';

// Handle push events
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    let data = {
        title: 'New Message',
        body: 'You have a new message',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'chat-notification',
        renotify: true,
        requireInteraction: false
    };
    
    if (event.data) {
        try {
            const payload = event.data.json();
            console.log('[SW] Push payload:', payload);
            data = {
                ...data,
                ...payload
            };
        } catch (e) {
            console.log('[SW] Push data as text:', event.data.text());
            data.body = event.data.text();
        }
    }
    
    // Use unique tag with timestamp to prevent notification batching on Android
    const uniqueTag = data.tag ? `${data.tag}-${Date.now()}` : `chat-${Date.now()}`;
    
    const options = {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: uniqueTag,
        renotify: true, // Always renotify
        requireInteraction: true, // Keep notification visible until user interacts
        silent: false,
        vibrate: [200, 100, 200, 100, 200], // Longer vibration pattern
        actions: [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        data: {
            url: data.url || '/',
            ...data.data
        }
    };
    
    console.log('[SW] Showing notification:', data.title, options);
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
            .then(() => console.log('[SW] Notification shown successfully'))
            .catch(err => console.error('[SW] Error showing notification:', err))
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action, event);
    
    event.notification.close();
    
    // If dismiss action, just close
    if (event.action === 'dismiss') {
        return;
    }
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if there's already a window open
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If no window is open, open a new one
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification closed:', event);
});

// Service worker install
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker installing, version:', CACHE_NAME);
    self.skipWaiting();
});

// Service worker activate
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activated, version:', CACHE_NAME);
    event.waitUntil(clients.claim());
});

