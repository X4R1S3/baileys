/**
 * @X4R1S3
 *
 * File: lib/Socket/Client/types.js
 * About: Types module for the X4R1S3 WhatsApp protocol client.
 * Important exports: AbstractSocketClient
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { EventEmitter } from 'events';
import { URL } from 'url';
export class AbstractSocketClient extends EventEmitter {
    constructor(url, config) {
        super();
        this.url = url;
        this.config = config;
        this.setMaxListeners(0);
    }
}