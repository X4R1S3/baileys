/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/USyncSidelistProtocol.js
 * About: USyncSidelistProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncSidelistProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { assertNodeErrorFree } from '../../WABinary/index.js';
export class USyncSidelistProtocol {
    constructor(useLidAddressing = true) {
        this.name = 'sidelist';
        // When true, sends addressing_mode="lid" — required for interop/LID-mode contacts
        this.useLidAddressing = useLidAddressing;
    }
    getQueryElement() {
        const attrs = {};
        if (this.useLidAddressing) attrs.addressing_mode = 'lid';
        return { tag: 'sidelist', attrs };
    }
    getUserElement(user) {
        if (user.sidelistDelete) {
            return { tag: 'sidelist', attrs: { type: 'delete' } };
        }
        return null;
    }
    parser(node) {
        if (node.tag !== 'sidelist' && node.tag !== 'side_list') return null;
        assertNodeErrorFree(node);
        // Returns minimal parsed data; the full side_list is parsed in USyncQuery
        return { type: node.attrs?.type ?? null };
    }
}
