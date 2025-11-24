const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('passport');
const cookieSession = require('cookie-session');
const dotenv = require('dotenv');
const { initDB } = require('./db');
const configureAuth = require('./auth');

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

    const configureSocket = require('./socket');

    configureSocket(io, db);

    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
