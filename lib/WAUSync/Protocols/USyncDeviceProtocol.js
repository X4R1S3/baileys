/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/USyncDeviceProtocol.js
 * About: USyncDeviceProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncDeviceProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { assertNodeErrorFree, getBinaryNodeChild } from '../../WABinary/index.js';
export class USyncDeviceProtocol {
    constructor() {
        this.name = 'devices';
    }
    getQueryElement() {
        return {
            tag: 'devices',
            attrs: {
                version: '2'
            }
        };
    }
    getUserElement( /* user: USyncUser */) {
        //TODO: Implement device phashing, ts and expectedTs
        //TODO: if all are not present, return null <- current behavior
        //TODO: otherwise return a node w tag 'devices' w those as attrs
        return null;
    }
    parser(node) {
        const deviceList = [];
        let keyIndex = undefined;
        if (node.tag === 'devices') {
            assertNodeErrorFree(node);
            const deviceListNode = getBinaryNodeChild(node, 'device-list');
            const keyIndexNode = getBinaryNodeChild(node, 'key-index-list');
            if (Array.isArray(deviceListNode?.content)) {
                for (const { tag, attrs } of deviceListNode.content) {
                    const id = +attrs.id;
                    const keyIndex = +attrs['key-index'];
                    if (tag === 'device') {
                        deviceList.push({
                            id,
                            keyIndex,
                            isHosted: !!(attrs['is_hosted'] && attrs['is_hosted'] === 'true')
                        });
                    }
                }
            }
            if (keyIndexNode?.tag === 'key-index-list') {
                keyIndex = {
                    timestamp: +keyIndexNode.attrs['ts'],
                    signedKeyIndex: keyIndexNode?.content,
                    expectedTimestamp: keyIndexNode.attrs['expected_ts'] ? +keyIndexNode.attrs['expected_ts'] : undefined
                };
            }
        }
        return {
            deviceList,
            keyIndex
        };
    }
}