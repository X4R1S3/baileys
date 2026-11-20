/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/USyncDisappearingModeProtocol.js
 * About: USyncDisappearingModeProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncDisappearingModeProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { assertNodeErrorFree } from '../../WABinary/index.js';
export class USyncDisappearingModeProtocol {
    constructor() {
        this.name = 'disappearing_mode';
    }
    getQueryElement() {
        return {
            tag: 'disappearing_mode',
            attrs: {}
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag === 'disappearing_mode') {
            assertNodeErrorFree(node);
            const duration = +node?.attrs.duration;
            const setAt = new Date(+(node?.attrs.t || 0) * 1000);
            return {
                duration,
                setAt
            };
        }
    }
}