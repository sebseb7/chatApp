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
      isAdmin INTEGER DEFAULT 0,
      isInvisible INTEGER DEFAULT 0
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
      isPublic INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS group_members (
      groupId INTEGER,
      userId INTEGER,
      isMuted INTEGER DEFAULT 0,
      PRIMARY KEY (groupId, userId)
    );
  `);

  // Migration for existing tables
  try {
    await db.exec('ALTER TABLE groups ADD COLUMN isPublic INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  try {
    await db.exec('ALTER TABLE group_members ADD COLUMN isMuted INTEGER DEFAULT 0');
  } catch (e) { /* Column likely exists */ }

  return db;
}

module.exports = { initDB };
