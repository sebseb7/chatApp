require('dotenv').config();
const backupService = require('../backup');

async function runBackup() {
    const type = process.argv[2] || 'manual';
    console.log(`Starting ${type} backup...`);

    try {
        await backupService.createBackup(type);
        console.log('Backup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Backup failed:', error);
        process.exit(1);
    }
}

runBackup();
