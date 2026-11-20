/**
 * @X4R1S3
 *
 * File: lib/WAM/BinaryInfo.js
 * About: BinaryInfo module for the X4R1S3 WhatsApp protocol client.
 * Important exports: BinaryInfo
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export class BinaryInfo {
    constructor(options = {}) {
        this.protocolVersion = 5;
        this.sequence = 0;
        this.events = [];
        this.buffer = [];
        Object.assign(this, options);
    }
}