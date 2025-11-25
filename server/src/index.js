const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const passport = require('passport');
const cookieSession = require('cookie-session');
const multer = require('multer');
const dotenv = require('dotenv');
const { initDB } = require('./db');
const configureAuth = require('./auth');

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
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

dotenv.config();

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

    // Serve uploaded files
    app.use('/uploads', express.static(uploadsDir));

    configureAuth(passport, db);

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
        res.send(req.user);
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

            res.json(updatedUser);
        } catch (err) {
            console.error('Error updating profile:', err);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });

    const configureSocket = require('./socket');

    configureSocket(io, db);

    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
