/**
 * @X4R1S3
 *
 * File: lib/Utils/stanza-ack.js
 * About: Stanza ack module for the X4R1S3 WhatsApp protocol client.
 * Important exports: buildAckStanza
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * Builds an ACK stanza for a received node.
 * Pure function -- no I/O, no side effects.
 *
 * Mirrors WhatsApp Web's ACK construction:
 * - WAWebHandleMsgSendAck.sendAck / sendNack
 * - WAWebCreateNackFromStanza.createNackFromStanza
 */
export function buildAckStanza(node, errorCode, meId) {
    const { tag, attrs } = node;
    const stanza = {
        tag: 'ack',
        attrs: {
            id: attrs.id,
            to: attrs.from,
            class: tag
        }
    };
    if (errorCode) {
        stanza.attrs.error = errorCode.toString();
    }
    if (attrs.participant) {
        stanza.attrs.participant = attrs.participant;
    }
    if (attrs.recipient) {
        stanza.attrs.recipient = attrs.recipient;
    }
    // WA Web always includes type when present: `n.type || DROP_ATTR`
    if (attrs.type) {
        stanza.attrs.type = attrs.type;
    }
    // WA Web WAWebHandleMsgSendAck.sendAck/sendNack always include `from` for message-class ACKs
    if (tag === 'message' && meId) {
        stanza.attrs.from = meId;
    }
    return stanza;
}