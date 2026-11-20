/**
 * @X4R1S3
 *
 * File: lib/Utils/voip-rekey.js
 * About: Voip rekey module for the X4R1S3 WhatsApp protocol client.
 * Important exports: decodeE2eRekeyPayload
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';

const REKEY_TYPE_NAMES = {
    [proto.RekeyKeyType.REKEY_KEY_AUDIO]: 'REKEY_KEY_AUDIO',
    [proto.RekeyKeyType.REKEY_KEY_VIDEO]: 'REKEY_KEY_VIDEO',
    [proto.RekeyKeyType.REKEY_KEY_APPDATA]: 'REKEY_KEY_APPDATA'
};

export const decodeE2eRekeyPayload = (buffer) => {
    if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
        throw new TypeError('decodeE2eRekeyPayload: buffer must be Buffer or Uint8Array');
    }
    const decoded = proto.E2eRekeyPayload.decode(buffer);
    return {
        keys: (decoded.keys || []).map(entry => ({
            type: REKEY_TYPE_NAMES[entry.type] ?? entry.type,
            key: entry.key ? Buffer.from(entry.key) : Buffer.alloc(0)
        }))
    };
};
