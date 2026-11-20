/**
 * @X4R1S3
 *
 * File: lib/Utils/sync-action-utils.js
 * About: Sync action utils module for the X4R1S3 WhatsApp protocol client.
 * Important exports: processContactAction, emitSyncActionResults
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';
import { isLidUser, isPnUser } from '../WABinary/index.js';
/**
 * Process contactAction and return events to emit.
 * Pure function - no side effects.
 */
export const processContactAction = (action, id, logger) => {
    const results = [];
    if (!id) {
        logger?.warn({ hasFullName: !!action.fullName, hasLidJid: !!action.lidJid, hasPnJid: !!action.pnJid }, 'contactAction sync: missing id in index');
        return results;
    }
    const lidJid = action.lidJid;
    const idIsPn = isPnUser(id);
    // PN is in index[1], not in contactAction.pnJid which is usually null
    const phoneNumber = idIsPn ? id : action.pnJid || undefined;
    // Always emit contacts.upsert
    results.push({
        event: 'contacts.upsert',
        data: [
            {
                id,
                name: action.fullName || action.firstName || action.username || undefined,
                lid: lidJid || undefined,
                phoneNumber
            }
        ]
    });
    // Emit lid-mapping.update if we have valid LID-PN pair
    if (lidJid && isLidUser(lidJid) && idIsPn) {
        results.push({
            event: 'lid-mapping.update',
            data: { lid: lidJid, pn: id }
        });
    }
    return results;
};
export const emitSyncActionResults = (ev, results) => {
    for (const result of results) {
        if (result.event === 'contacts.upsert') {
            ev.emit('contacts.upsert', result.data);
        }
        else {
            ev.emit('lid-mapping.update', result.data);
        }
    }
};