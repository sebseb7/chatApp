const dotenv = require('dotenv');
dotenv.config(); // Load env vars FIRST before any modules that use them

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const passport = require('passport');
const cookieSession = require('cookie-session');
const multer = require('multer');
const { initDB } = require('./db');
const configureAuth = require('./auth');
const { saveSubscription, removeSubscription, getPublicVapidKey, sendPushToUser, getSubscriptionsForUser } = require('./push');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${req.user.id}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|avif/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

const app = express();
app.set('trust proxy', 1); // trust first proxy
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3881",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3001;

// Initialize DB and Auth
initDB().then(db => {
    app.use(cookieSession({
        name: 'session',
        keys: [process.env.COOKIE_KEY || 'secret'],
        maxAge: 24 * 60 * 60 * 1000
    }));

    // Polyfill for passport 0.6.0+ with cookie-session
    app.use(function (req, res, next) {
        if (req.session && !req.session.regenerate) {
            req.session.regenerate = (cb) => {
                cb();
            };
        }
        if (req.session && !req.session.save) {
            req.session.save = (cb) => {
                cb();
            };
        }
        next();
    });

    app.use(passport.initialize());
    app.use(passport.session());

    // JSON body parser
    app.use(express.json());
    
    // Disable caching for API routes
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        next();
    });

    // Serve uploaded files with caching
    app.use('/uploads', express.static(uploadsDir, {
        etag: true,
        lastModified: true,
        maxAge: '7d',
        immutable: true
    }));
    
    // Serve frontend build in production
    if (process.env.NODE_ENV === 'production') {
        const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
        
        // Cache JS/CSS bundles (immutable content-hashed files)
        app.use('/bundle.js', express.static(path.join(clientDist, 'bundle.js'), {
            etag: true,
            lastModified: true,
            maxAge: '1y',
            immutable: true
        }));
        
        // Serve index.html with shorter cache (allows updates)
        app.use(express.static(clientDist, {
            etag: true,
            lastModified: true,
            maxAge: '1h',
            index: 'index.html'
        }));
        
        // SPA fallback - serve index.html for all non-API routes
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
                return next();
            }
            res.sendFile(path.join(clientDist, 'index.html'));
        });
    }

    configureAuth(passport, db);

    // Helper to transform user with effective name/avatar
    function transformUser(user) {
        if (!user) return null;
        return {
            ...user,
            // Effective values (custom if set, else Google)
            name: user.customName || user.name,
            avatar: user.customAvatar || user.avatar,
            // Preserve Google values for reset functionality
            googleName: user.name,
            googleAvatar: user.avatar,
            // Flag to show if custom profile is set
            hasCustomProfile: !!(user.customName || user.customAvatar)
        };
    }

    app.get('/auth/google',
        passport.authenticate('google', { scope: ['profile', 'email'] })
    );

    app.get('/auth/google/callback',
        passport.authenticate('google', { failureRedirect: '/' }),
        (req, res) => {
            res.redirect('/');
        }
    );

    app.get('/api/current_user', (req, res) => {
        res.send(transformUser(req.user));
    });

    app.get('/api/logout', (req, res, next) => {
        req.logout((err) => {
            if (err) { return next(err); }
            res.redirect('/');
        });
    });

    // Profile update endpoint
    app.post('/api/profile', upload.single('avatar'), async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const { customName, resetToGoogle } = req.body;
            const userId = req.user.id;

            if (resetToGoogle === 'true' || resetToGoogle === true) {
                // Delete old custom avatar file if exists
                const user = await db.get('SELECT customAvatar FROM users WHERE id = ?', userId);
                if (user && user.customAvatar) {
                    const oldAvatarPath = path.join(uploadsDir, path.basename(user.customAvatar));
                    if (fs.existsSync(oldAvatarPath)) {
                        fs.unlinkSync(oldAvatarPath);
                    }
                }

                // Reset to Google profile
                await db.run(
                    'UPDATE users SET customName = NULL, customAvatar = NULL WHERE id = ?',
                    userId
                );
            } else {
                // Update custom name if provided
                if (customName !== undefined) {
                    await db.run(
                        'UPDATE users SET customName = ? WHERE id = ?',
                        customName || null,
                        userId
                    );
                }

                // Update avatar if file was uploaded
                if (req.file) {
                    // Delete old custom avatar if exists
                    const user = await db.get('SELECT customAvatar FROM users WHERE id = ?', userId);
                    if (user && user.customAvatar) {
                        const oldAvatarPath = path.join(uploadsDir, path.basename(user.customAvatar));
                        if (fs.existsSync(oldAvatarPath)) {
                            fs.unlinkSync(oldAvatarPath);
                        }
                    }

                    const avatarPath = `/uploads/${req.file.filename}`;
                    await db.run(
                        'UPDATE users SET customAvatar = ? WHERE id = ?',
                        avatarPath,
                        userId
                    );
                }
            }

            // Fetch updated user
            const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', userId);

            // Notify connected clients about profile update
            io.emit('profile_updated', { userId });

            res.json(transformUser(updatedUser));
        } catch (err) {
            console.error('Error updating profile:', err);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });

    // Delete account endpoint
    app.delete('/api/account', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const userId = req.user.id;

            // Delete custom avatar file if exists
            const user = await db.get('SELECT customAvatar FROM users WHERE id = ?', userId);
            if (user && user.customAvatar) {
                const avatarPath = path.join(uploadsDir, path.basename(user.customAvatar));
                if (fs.existsSync(avatarPath)) {
                    fs.unlinkSync(avatarPath);
                }
            }

            // Delete user's group memberships
            await db.run('DELETE FROM group_members WHERE userId = ?', userId);

            // Delete user's undelivered messages
            await db.run('DELETE FROM messages WHERE senderId = ? OR receiverId = ?', userId, userId);

            // Delete message reads by this user
            await db.run('DELETE FROM message_reads WHERE userId = ?', userId);

            // Delete message deliveries for this user
            await db.run('DELETE FROM message_deliveries WHERE userId = ?', userId);

            // Delete the user
            await db.run('DELETE FROM users WHERE id = ?', userId);

            // Notify connected clients
            io.emit('user_deleted', { userId });

            // Logout
            req.logout((err) => {
                if (err) {
                    console.error('Error logging out after delete:', err);
                }
                res.json({ success: true });
            });

        } catch (err) {
            console.error('Error deleting account:', err);
            res.status(500).json({ error: 'Failed to delete account' });
        }
    });

    // Push notification endpoints
    app.get('/api/push/vapid-public-key', (req, res) => {
        const publicKey = getPublicVapidKey();
        if (publicKey) {
            res.json({ publicKey });
        } else {
            res.status(503).json({ error: 'Push notifications not configured' });
        }
    });

    app.post('/api/push/subscribe', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        try {
            const success = await saveSubscription(db, req.user.id, subscription);
            if (success) {
                res.json({ success: true });
            } else {
                res.status(500).json({ error: 'Failed to save subscription' });
            }
        } catch (err) {
            console.error('Error saving subscription:', err);
            res.status(500).json({ error: 'Failed to save subscription' });
        }
    });

    app.post('/api/push/unsubscribe', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint required' });
        }

        try {
            const success = await removeSubscription(db, endpoint);
            res.json({ success });
        } catch (err) {
            console.error('Error removing subscription:', err);
            res.status(500).json({ error: 'Failed to remove subscription' });
        }
    });

    // Test push notification endpoint - sends a test notification to the current user
    app.post('/api/push/test', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const subscriptions = await getSubscriptionsForUser(db, req.user.id);
            console.log(`[Push Test] User ${req.user.id} has ${subscriptions.length} subscription(s)`);
            
            if (subscriptions.length === 0) {
                return res.status(400).json({ 
                    error: 'No push subscriptions found',
                    hint: 'Enable notifications in Profile Settings first'
                });
            }

            const result = await sendPushToUser(db, req.user.id, {
                title: 'Test Notification',
                body: 'If you see this, push notifications are working! 🎉',
                icon: '/favicon.ico',
                tag: 'test-notification',
                data: {
                    type: 'test',
                    timestamp: Date.now()
                }
            });

            console.log(`[Push Test] Notification sent to user ${req.user.id}`);
            res.json({ 
                success: true, 
                message: 'Test notification sent',
                subscriptionCount: subscriptions.length
            });
        } catch (err) {
            console.error('[Push Test] Error:', err);
            res.status(500).json({ error: 'Failed to send test notification', details: err.message });
        }
    });

    // Debug endpoint to check push subscription status
    app.get('/api/push/status', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const subscriptions = await getSubscriptionsForUser(db, req.user.id);
            res.json({
                userId: req.user.id,
                subscriptionCount: subscriptions.length,
                subscriptions: subscriptions.map(s => ({
                    id: s.id,
                    endpoint: s.endpoint.substring(0, 50) + '...',
                    createdAt: s.createdAt
                }))
            });
        } catch (err) {
            console.error('Error getting push status:', err);
            res.status(500).json({ error: 'Failed to get subscription status' });
        }
    });

    const configureSocket = require('./socket');

    configureSocket(io, db);

    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
