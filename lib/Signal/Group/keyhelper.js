/**
 * @X4R1S3
 *
 * File: lib/Signal/Group/keyhelper.js
 * About: Keyhelper module for the X4R1S3 WhatsApp protocol client.
 * Important exports: generateSenderKey, generateSenderKeyId, generateSenderSigningKey
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import * as nodeCrypto from 'crypto';
import { generateKeyPair } from 'libsignal/src/curve.js';
export function generateSenderKey() {
    return nodeCrypto.randomBytes(32);
}
export function generateSenderKeyId() {
    return nodeCrypto.randomInt(2147483647);
}
export function generateSenderSigningKey(key) {
    if (!key) {
        key = generateKeyPair();
    }
    return {
        public: Buffer.from(key.pubKey),
        private: Buffer.from(key.privKey)
    };
}