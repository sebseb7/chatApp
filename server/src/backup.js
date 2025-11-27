const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const schedule = require('node-schedule');
const archiver = require('archiver');

class BackupService {
    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.bucketName = process.env.S3_BACKUP_BUCKET;
        this.retention = {
            daily: parseInt(process.env.DAILYBACKUPS || '7'),
            weekly: parseInt(process.env.WEEKLYBACKUPS || '4'),
            monthly: parseInt(process.env.MONTHLYBACKUPS || '12')
        };
        this.uploadsDir = path.join(__dirname, '..', 'uploads');
        this.dbPath = path.join(__dirname, '..', 'chat.db');
        this.envPath = path.join(__dirname, '..', '.env');
    }

    async createBackup(type = 'daily') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${type}-${timestamp}.zip`;
        const outputPath = path.join(__dirname, '..', filename);

        console.log(`[Backup] Starting ${type} backup: ${filename}`);

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', async () => {
                console.log(`[Backup] Archive created: ${archive.pointer()} total bytes`);
                try {
                    await this.uploadToS3(outputPath, filename);
                    fs.unlinkSync(outputPath); // Clean up local file
                    await this.rotateBackups(type);
                    console.log(`[Backup] ${type} backup completed successfully`);
                    resolve();
                } catch (err) {
                    console.error('[Backup] Upload/Rotation failed:', err);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    reject(err);
                }
            });

            archive.on('error', (err) => {
                console.error('[Backup] Archive error:', err);
                reject(err);
            });

            archive.pipe(output);

            // Add database
            if (fs.existsSync(this.dbPath)) {
                archive.file(this.dbPath, { name: 'chat.db' });
            }

            // Add uploads directory
            if (fs.existsSync(this.uploadsDir)) {
                archive.directory(this.uploadsDir, 'uploads');
            }

            // Add .env file
            if (fs.existsSync(this.envPath)) {
                archive.file(this.envPath, { name: '.env' });
            }

            archive.finalize();
        });
    }

    async uploadToS3(filePath, key) {
        const fileStream = fs.createReadStream(filePath);
        const uploadParams = {
            Bucket: this.bucketName,
            Key: key,
            Body: fileStream,
        };
        await this.s3Client.send(new PutObjectCommand(uploadParams));
        console.log(`[Backup] Uploaded to S3: ${key}`);
    }

    async rotateBackups(type) {
        if (this.retention[type] < 0) return; // Infinite retention

        const command = new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: `backup-${type}-`
        });

        const response = await this.s3Client.send(command);
        if (!response.Contents) return;

        // Sort by date (newest first)
        const backups = response.Contents.sort((a, b) => b.LastModified - a.LastModified);

        if (backups.length > this.retention[type]) {
            const toDelete = backups.slice(this.retention[type]).map(b => ({ Key: b.Key }));
            console.log(`[Backup] Pruning ${toDelete.length} old ${type} backups`);

            await this.s3Client.send(new DeleteObjectsCommand({
                Bucket: this.bucketName,
                Delete: { Objects: toDelete }
            }));
        }
    }

    scheduleBackups() {
        // Daily backup at 02:00
        schedule.scheduleJob('0 2 * * *', () => this.createBackup('daily'));

        // Weekly backup on Sunday at 03:00
        schedule.scheduleJob('0 3 * * 0', () => this.createBackup('weekly'));

        // Monthly backup on the 1st at 04:00
        schedule.scheduleJob('0 4 1 * *', () => this.createBackup('monthly'));

        console.log('[Backup] Schedules initialized');
    }
}

module.exports = new BackupService();
