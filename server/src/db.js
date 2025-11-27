const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function initDB() {
  const db = await open({
    filename: './chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      googleId TEXT UNIQUE,
      email TEXT,
      name TEXT,
      avatar TEXT,
      customName TEXT,
      customAvatar TEXT,
      isAdmin INTEGER DEFAULT 0,
      isInvisible INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senderId INTEGER,
      receiverId INTEGER,
      groupId INTEGER,
      content TEXT,
      type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      avatar TEXT,
      isPublic INTEGER DEFAULT 0,
      isEncrypted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS group_members (
      groupId INTEGER,
      userId INTEGER,
      isMuted INTEGER DEFAULT 0,
      PRIMARY KEY (groupId, userId)
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      messageId INTEGER,
      userId INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (messageId, userId)
    );

    CREATE TABLE IF NOT EXISTS message_deliveries (
      messageId INTEGER,
      userId INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (messageId, userId)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migration for existing tables
  try {
    await db.exec('ALTER TABLE groups ADD COLUMN isPublic INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  try {
    await db.exec('ALTER TABLE groups ADD COLUMN isEncrypted INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  try {
    await db.exec('ALTER TABLE group_members ADD COLUMN isMuted INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  // Migration for custom profile fields
  try {
    await db.exec('ALTER TABLE users ADD COLUMN customName TEXT');
  } catch (e) { /* Column likely exists */ }

  try {
    await db.exec('ALTER TABLE users ADD COLUMN customAvatar TEXT');
  } catch (e) { /* Column likely exists */ }

  // Migration for E2EE public key storage
  try {
    await db.exec('ALTER TABLE users ADD COLUMN publicKey TEXT');
  } catch (e) { /* Column likely exists */ }

  // Migration for storing senderPublicKey with messages (for E2EE history decryption)
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN senderPublicKey TEXT');
  } catch (e) { /* Column likely exists */ }

  // Migration for storing receiverPublicKey (so sender can decrypt their own sent messages in history)
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN receiverPublicKey TEXT');
  } catch (e) { /* Column likely exists */ }

  // Migration for tracking message delivery status
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN delivered INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  return db;
}

module.exports = { initDB };
