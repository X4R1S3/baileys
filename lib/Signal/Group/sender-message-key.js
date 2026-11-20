/**
 * @X4R1S3
 *
 * File: lib/Signal/Group/sender-message-key.js
 * About: Sender message key module for the X4R1S3 WhatsApp protocol client.
 * Important exports: SenderMessageKey
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { deriveSecrets } from 'libsignal/src/crypto.js';
export class SenderMessageKey {
    constructor(iteration, seed) {
        const derivative = deriveSecrets(seed, Buffer.alloc(32), Buffer.from('WhisperGroup'));
        const keys = new Uint8Array(32);
        keys.set(new Uint8Array(derivative[0].slice(16)));
        keys.set(new Uint8Array(derivative[1].slice(0, 16)), 16);
        this.iv = Buffer.from(derivative[0].slice(0, 16));
        this.cipherKey = Buffer.from(keys.buffer);
        this.iteration = iteration;
        this.seed = seed;
    }
    getIteration() {
        return this.iteration;
    }
    getIv() {
        return this.iv;
    }
    getCipherKey() {
        return this.cipherKey;
    }
    getSeed() {
        return this.seed;
    }
}