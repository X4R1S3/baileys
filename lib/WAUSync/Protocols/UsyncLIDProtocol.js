/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/UsyncLIDProtocol.js
 * About: UsyncLIDProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncLIDProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export class USyncLIDProtocol {
    constructor() {
        this.name = 'lid';
    }
    getQueryElement() {
        return {
            tag: 'lid',
            attrs: {}
        };
    }
    getUserElement(user) {
        if (user.lid) {
            return {
                tag: 'lid',
                attrs: { jid: user.lid }
            };
        }
        else {
            return null;
        }
    }
    parser(node) {
        if (node.tag === 'lid') {
            return node.attrs.val;
        }
        return null;
    }
}