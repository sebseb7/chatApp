const { initDB } = require('../db');

async function toggleAdmin(email) {
    const db = await initDB();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);

    if (!user) {
        console.log(`User with email ${email} not found.`);
        return;
    }

    const newStatus = user.isAdmin ? 0 : 1;
    await db.run('UPDATE users SET isAdmin = ? WHERE id = ?', newStatus, user.id);
    console.log(`User ${email} is now ${newStatus ? 'Admin' : 'User'}`);
}

const email = process.argv[2];
if (!email) {
    console.log('Usage: npm run toggle-admin <email>');
    process.exit(1);
}

toggleAdmin(email);
