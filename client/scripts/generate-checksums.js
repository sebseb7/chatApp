#!/usr/bin/env node
/**
 * Generate SHA256 checksums for all build artifacts in dist/
 * Outputs both hex (for sha256sum) and base64 (for SRI/srihash.org)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const CHECKSUM_FILE = path.join(DIST_DIR, 'checksums.sha256');
const CHECKSUM_JSON = path.join(DIST_DIR, 'checksums.json');

function sha256File(filePath) {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content);
    return {
        hex: hash.copy().digest('hex'),
        base64: hash.digest('base64')
    };
}

function getAllFiles(dir, baseDir = dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllFiles(fullPath, baseDir));
        } else if (!entry.name.startsWith('checksums.')) {
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
    
    const checksums = {};
    const checksumLines = [];
    
    for (const { fullPath, relativePath } of files) {
        const { hex, base64 } = sha256File(fullPath);
        // Use forward slashes for cross-platform compatibility
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        checksums[normalizedPath] = {
            hex,
            base64,
            sri: `sha256-${base64}`
        };
        
        // sha256sum compatible format
        checksumLines.push(`${hex}  ${normalizedPath}`);
    }

    // Write sha256sum compatible file
    const checksumContent = checksumLines.join('\n') + '\n';
    fs.writeFileSync(CHECKSUM_FILE, checksumContent);
    
    // Write JSON with both formats
    fs.writeFileSync(CHECKSUM_JSON, JSON.stringify(checksums, null, 2) + '\n');
    
    console.log('Generated checksums:\n');
    console.log('File'.padEnd(25) + 'SRI Hash (for comparison with srihash.org)');
    console.log('-'.repeat(80));
    for (const [file, { sri }] of Object.entries(checksums)) {
        console.log(file.padEnd(25) + sri);
    }
    console.log('\nFiles written:');
    console.log(`  ${CHECKSUM_FILE} (sha256sum format)`);
    console.log(`  ${CHECKSUM_JSON} (JSON with hex, base64, sri)`);
}

main();
