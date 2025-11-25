// Web Crypto API + elliptic helpers for E2EE
// Deterministic key generation from passphrase + googleId

import { ec as EC } from 'elliptic';

const ec = new EC('p256'); // NIST P-256 curve (same as Web Crypto ECDH P-256)

// Convert string to ArrayBuffer
const str2ab = (str) => {
    const encoder = new TextEncoder();
    return encoder.encode(str);
};

// Convert ArrayBuffer to string
const ab2str = (buf) => {
    const decoder = new TextDecoder();
    return decoder.decode(buf);
};

// Convert ArrayBuffer to hex string
const ab2hex = (buf) => {
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

// Convert hex string to ArrayBuffer
const hex2ab = (hex) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
};

// Convert ArrayBuffer to Base64
const ab2base64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

// Convert Base64 to ArrayBuffer
const base642ab = (base64) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

const SALT_PREFIX = "chatapp-e2ee-v1-";
const ITERATIONS = 100000;

/**
 * Derive a deterministic seed from passphrase + googleId using PBKDF2
 */
async function deriveSeed(passphrase, googleId) {
    const salt = str2ab(SALT_PREFIX + googleId);
    
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        str2ab(passphrase),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    
    // Derive 256 bits (32 bytes) for use as private key seed
    const bits = await window.crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: ITERATIONS,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );
    
    return new Uint8Array(bits);
}

/**
 * Generate deterministic ECDH key pair from passphrase + googleId
 */
export async function generateAndStoreKeys(passphrase, googleId) {
    if (!googleId) {
        throw new Error("googleId is required for deterministic key generation");
    }
    
    // 1. Derive deterministic seed
    const seed = await deriveSeed(passphrase, googleId);
    
    // 2. Generate key pair from seed using elliptic
    const keyPair = ec.keyFromPrivate(seed);
    
    // 3. Export keys to a format we can store and use
    const privateKeyHex = keyPair.getPrivate('hex');
    const publicKeyHex = keyPair.getPublic('hex');
    
    // 4. Store in localStorage (we store the googleId to verify on load)
    const storageData = {
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        googleId: googleId
    };
    localStorage.setItem("chat_e2ee_keys", JSON.stringify(storageData));
    
    // 5. Import into Web Crypto for encryption/decryption operations
    const webCryptoKeys = await importEllipticKeysToWebCrypto(privateKeyHex, publicKeyHex);
    
    return webCryptoKeys;
}

/**
 * Load keys - with deterministic generation, we can regenerate from passphrase + googleId
 */
export async function loadKeys(passphrase, googleId) {
    const stored = localStorage.getItem("chat_e2ee_keys");
    
    if (!stored) {
        // No stored keys - generate new ones
        return await generateAndStoreKeys(passphrase, googleId);
    }
    
    const { googleId: storedGoogleId } = JSON.parse(stored);
    
    // Verify googleId matches
    if (storedGoogleId !== googleId) {
        throw new Error("Stored keys belong to a different user");
    }
    
    // Regenerate keys deterministically (this verifies the passphrase)
    const seed = await deriveSeed(passphrase, googleId);
    const keyPair = ec.keyFromPrivate(seed);
    const regeneratedPublicHex = keyPair.getPublic('hex');
    
    // Verify regenerated keys match stored keys
    const { publicKey: storedPublicKey } = JSON.parse(stored);
    if (regeneratedPublicHex !== storedPublicKey) {
        throw new Error("Invalid passphrase - keys do not match");
    }
    
    // Import into Web Crypto
    const privateKeyHex = keyPair.getPrivate('hex');
    return await importEllipticKeysToWebCrypto(privateKeyHex, regeneratedPublicHex);
}

/**
 * Convert elliptic keys to Web Crypto keys for encryption/decryption
 */
async function importEllipticKeysToWebCrypto(privateKeyHex, publicKeyHex) {
    // For P-256, the public key in uncompressed form is 65 bytes: 04 || x || y
    // elliptic gives us this format already
    const publicKeyBytes = new Uint8Array(hex2ab(publicKeyHex));
    
    // Extract x and y coordinates (skip the 0x04 prefix)
    const x = publicKeyBytes.slice(1, 33);
    const y = publicKeyBytes.slice(33, 65);
    
    // Private key is 32 bytes
    const privateKeyBytes = new Uint8Array(hex2ab(privateKeyHex.padStart(64, '0')));
    
    // Create JWK format for import
    const publicJwk = {
        kty: "EC",
        crv: "P-256",
        x: arrayBufferToBase64Url(x),
        y: arrayBufferToBase64Url(y),
    };
    
    const privateJwk = {
        ...publicJwk,
        d: arrayBufferToBase64Url(privateKeyBytes),
    };
    
    // Import as Web Crypto keys
    const publicKey = await window.crypto.subtle.importKey(
        "jwk",
        publicJwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
    
    const privateKey = await window.crypto.subtle.importKey(
        "jwk",
        privateJwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );
    
    return { publicKey, privateKey };
}

// Base64URL encoding (no padding, URL-safe)
function arrayBufferToBase64Url(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function base64UrlToArrayBuffer(base64url) {
    const base64 = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = window.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function clearKeys() {
    localStorage.removeItem("chat_e2ee_keys");
}

export async function exportPublicKey(key) {
    return await window.crypto.subtle.exportKey("jwk", key);
}

export async function importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        []
    );
}

// Derive shared secret and encrypt
export async function encryptMessage(text, myPrivateKey, theirPublicKey) {
    // 1. Derive Shared Secret (AES-GCM Key)
    const sharedKey = await window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: theirPublicKey
        },
        myPrivateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt"]
    );

    // 2. Encrypt
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = str2ab(text);

    const encrypted = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        sharedKey,
        encoded
    );

    return {
        iv: ab2base64(iv),
        data: ab2base64(encrypted)
    };
}

// Derive shared secret and decrypt
export async function decryptMessage(encryptedData, myPrivateKey, theirPublicKey) {
    const { iv, data } = encryptedData;

    // 1. Derive Shared Secret
    const sharedKey = await window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: theirPublicKey
        },
        myPrivateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["decrypt"]
    );

    // 2. Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base642ab(iv)
        },
        sharedKey,
        base642ab(data)
    );

    return ab2str(decrypted);
}
