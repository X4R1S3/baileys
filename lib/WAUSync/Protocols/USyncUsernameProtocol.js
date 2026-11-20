/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/USyncUsernameProtocol.js
 * About: USyncUsernameProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncUsernameProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { assertNodeErrorFree } from '../../WABinary/index.js';
export class USyncUsernameProtocol {
    constructor() {
        this.name = 'username';
    }
    getQueryElement() {
        return {
            tag: 'username',
            attrs: {}
        };
    }
    getUserElement(user) {
        void user;
        return null;
    }
    parser(node) {
        if (node.tag === 'username') {
            assertNodeErrorFree(node);
            const username = node.content != null ? node.content.toString() : null;
            return username && username.length > 0 ? username : null;
        }
        return null;
    }
}
