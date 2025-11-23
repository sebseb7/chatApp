const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

module.exports = function (passport, db) {
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await db.get('SELECT * FROM users WHERE googleId = ?', profile.id);
                if (!user) {
                    const result = await db.run(
                        'INSERT INTO users (googleId, email, name, avatar) VALUES (?, ?, ?, ?)',
                        profile.id,
                        profile.emails[0].value,
                        profile.displayName,
                        profile.photos[0].value
                    );
                    user = await db.get('SELECT * FROM users WHERE id = ?', result.lastID);
                }
                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }));
};
