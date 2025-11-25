#!/usr/bin/env node
/**
 * Generate SHA256 checksums for all build artifacts in dist/
 * Output format is compatible with sha256sum for easy verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const CHECKSUM_FILE = path.join(DIST_DIR, 'checksums.sha256');

function sha256File(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

function getAllFiles(dir, baseDir = dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllFiles(fullPath, baseDir));
        } else if (entry.name !== 'checksums.sha256') {
            // Relative path from dist dir for the checksum file
            const relativePath = path.relative(baseDir, fullPath);
            files.push({ fullPath, relativePath });
        }
    }
    
    return files;
}

function main() {
    if (!fs.existsSync(DIST_DIR)) {
        console.error('Error: dist/ directory does not exist. Run build first.');
        process.exit(1);
    }

    const files = getAllFiles(DIST_DIR);
    
    // Sort for reproducible output
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    
    const checksumLines = files.map(({ fullPath, relativePath }) => {
        const hash = sha256File(fullPath);
        // Use forward slashes for cross-platform compatibility
        const normalizedPath = relativePath.replace(/\\/g, '/');
        return `${hash}  ${normalizedPath}`;
    });

    const checksumContent = checksumLines.join('\n') + '\n';
    
    fs.writeFileSync(CHECKSUM_FILE, checksumContent);
    
    console.log('Generated checksums.sha256:');
    console.log(checksumContent);
    console.log(`Checksums written to: ${CHECKSUM_FILE}`);
}

main();

