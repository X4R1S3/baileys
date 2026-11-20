/**
 * @X4R1S3
 *
 * File: lib/Signal/Group/ciphertext-message.js
 * About: Ciphertext message module for the X4R1S3 WhatsApp protocol client.
 * Important exports: CiphertextMessage
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export class CiphertextMessage {
    constructor() {
        this.UNSUPPORTED_VERSION = 1;
        this.CURRENT_VERSION = 3;
        this.WHISPER_TYPE = 2;
        this.PREKEY_TYPE = 3;
        this.SENDERKEY_TYPE = 4;
        this.SENDERKEY_DISTRIBUTION_TYPE = 5;
        this.ENCRYPTED_MESSAGE_OVERHEAD = 53;
    }
}