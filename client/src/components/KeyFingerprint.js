import React, { Component } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import * as jdenticon from 'jdenticon';

/**
 * Generates a visual fingerprint from a public key using jdenticon
 * Creates a unique geometric pattern that's easy to visually compare
 */
class KeyFingerprint extends Component {
    // Generate a fingerprint string (hex) for text display
    generateFingerprintHex(publicKey) {
        const normalized = this.normalizeKey(publicKey);
        const keyStr = typeof normalized === 'string' ? normalized : JSON.stringify(normalized);

        // Simple hash to create fingerprint segments
        const hashString = (str, salt = 0) => {
            let hash = salt;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash);
        };

        // Generate a longer fingerprint by hashing multiple times
        const parts = [];
        for (let i = 0; i < 8; i++) {
            const hash = hashString(keyStr, i * 12345);
            parts.push(hash.toString(16).padStart(4, '0').slice(0, 4).toUpperCase());
        }

        return parts.join(' ');
    }

    // Normalize the public key to ensure consistent fingerprinting
    // Only use the essential EC key components in a consistent order
    normalizeKey(publicKey) {
        if (!publicKey || typeof publicKey === 'string') return publicKey;
        // For EC keys, only use kty, crv, x, y in consistent order
        if (publicKey.kty === 'EC' && publicKey.x && publicKey.y) {
            return {
                kty: publicKey.kty,
                crv: publicKey.crv,
                x: publicKey.x,
                y: publicKey.y
            };
        }
        return publicKey;
    }

    // Get the key string for jdenticon
    getKeyString(publicKey) {
        if (!publicKey) return '';
        const normalized = this.normalizeKey(publicKey);
        return typeof normalized === 'string' ? normalized : JSON.stringify(normalized);
    }

    render() {
        const {
            publicKey,
            size = 80,
            showHex = false,
            label = null,
            sx = {}
        } = this.props;

        if (!publicKey) {
            return null;
        }

        const keyString = this.getKeyString(publicKey);
        const fingerprint = this.generateFingerprintHex(publicKey);

        // Generate SVG using jdenticon
        const svgString = jdenticon.toSvg(keyString, size);

        return (
            <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', ...sx }}>
                {label && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                        {label}
                    </Typography>
                )}
                <Tooltip title={`Schlüssel-Fingerabdruck: ${fingerprint}`} arrow>
                    <Box
                        sx={{
                            borderRadius: 2,
                            overflow: 'hidden',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                            border: '2px solid rgba(0, 217, 255, 0.3)',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                transform: 'scale(1.05)',
                                boxShadow: '0 4px 20px rgba(0, 217, 255, 0.3)',
                            }
                        }}
                        dangerouslySetInnerHTML={{ __html: svgString }}
                    />
                </Tooltip>
                {showHex && (
                    <Typography
                        variant="caption"
                        sx={{
                            mt: 1.5,
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            wordBreak: 'break-all',
                            textAlign: 'center',
                            maxWidth: size * 2,
                            userSelect: 'all',
                            padding: '4px 8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: 1
                        }}
                    >
                        {fingerprint}
                    </Typography>
                )}
            </Box>
        );
    }
}

export default KeyFingerprint;
