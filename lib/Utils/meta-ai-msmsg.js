/**
 * @X4R1S3
 *
 * File: lib/Utils/meta-ai-msmsg.js
 * About: Meta ai msmsg module for the X4R1S3 WhatsApp protocol client.
 * Important exports: decryptMsmsgBotMessage, parseUnifiedResponseData, textFromUnifiedResponse, textFromRichResponse, extractMetaAiText, decodeUnifiedResponseInPlace, decodeDecryptedMsmsgMessage
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';
import { aesDecryptGCM, hkdf } from './crypto.js';

const BOT_MESSAGE_INFO = 'Bot Message';
const KEY_LENGTH = 32;

const unpadRandomMax16 = (value) => {
    const bytes = new Uint8Array(value);
    if (!bytes.length) {
        throw new Error('unpadPkcs7 given empty bytes');
    }
    const padLength = bytes[bytes.length - 1];
    if (padLength > bytes.length) {
        throw new Error(`unpad given ${bytes.length} bytes, but pad is ${padLength}`);
    }
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length - padLength);
};

const toBuffer = (value) => {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return Buffer.from(value);
};

// Strips device suffix from LID JIDs: "user:device@lid" → "user@lid".
// jidEncode includes ":0" even for device=0 (user/non-AD form), so normalize both meId and meLid.
const normalizeLidJid = (jid) => {
    if (!jid || !jid.endsWith('@lid') || !jid.includes(':')) return jid;
    return `${jid.split(':')[0]}@lid`;
};

// Ordered msgId candidates per the Rust BotMessageContext:
//   botEditTargetId when editing, stanzaId for the normal full response, metaTargetId as fallback.
const selectMsgIdCandidates = (messageKey) => {
    const seen = new Set();
    const result = [];
    for (const id of [messageKey?.botEditTargetId, messageKey?.stanzaId, messageKey?.metaTargetId]) {
        const s = id ? String(id) : '';
        if (s && !seen.has(s)) {
            seen.add(s);
            result.push(s);
        }
    }
    return result;
};

// Ordered target_sender_user_jid candidates per Rust spec (non-AD user JID = no device suffix).
// jidEncode produces "user:0@lid" for device=0 LID JIDs, so normalize both meId and meLid.
const selectTargetJidCandidates = (messageKey) => {
    const seen = new Set();
    const result = [];
    for (const jid of [normalizeLidJid(messageKey?.meId), normalizeLidJid(messageKey?.meLid)]) {
        const s = jid ? String(jid) : '';
        if (s && !seen.has(s)) {
            seen.add(s);
            result.push(s);
        }
    }
    return result;
};

const decodeDecryptedMsmsgMessage = (decrypted) => {
    const buf = toBuffer(decrypted);
    try {
        const unpadded = Buffer.from(unpadRandomMax16(buf));
        const decoded = proto.Message.decode(unpadded);
        const hasContent = Object.keys(decoded).some(k => k !== 'messageContextInfo' && decoded[k] != null);
        if (hasContent) return decodeUnifiedResponseInPlace(decoded);
    }
    catch {}
    return decodeUnifiedResponseInPlace(proto.Message.decode(buf));
};

/**
 * Decrypts <enc type="msmsg"> bot messages.
 *
 * Two-pass HKDF — algorithm from bot_message.rs (BotMessageContext):
 *   k1    = HKDF(messageSecret, salt=∅, info="Bot Message",                     32)
 *   k2    = HKDF(k1,            salt=∅, info=msgID||target_sender_jid||bot_jid, 32)
 *   AAD   = msgID || 0x00 || bot_user_jid
 *   plain = AES-256-GCM.Decrypt(k2, encIv, encPayload, AAD)
 *
 * k1 is shared across all candidates and derived once.
 * AAD always uses bot_user_jid, never target_sender_jid.
 */
export const decryptMsmsgBotMessage = async (messageSecret, messageKey, msMsg) => {
    if (!messageSecret || (messageSecret instanceof Uint8Array && !messageSecret.byteLength)) {
        throw new Error('Missing required messageSecret for msmsg decryption');
    }
    if (!messageKey?.participant) throw new Error('Missing required participant for msmsg decryption');
    if (!messageKey?.meId) throw new Error('Missing required meId for msmsg decryption');
    if (!msMsg?.encIv) throw new Error('Missing required encIv for msmsg decryption');
    if (!msMsg?.encPayload) throw new Error('Missing required encPayload for msmsg decryption');

    const msgIdCandidates = selectMsgIdCandidates(messageKey);
    if (!msgIdCandidates.length) throw new Error('Missing required target message id for msmsg decryption');

    const targetJidCandidates = selectTargetJidCandidates(messageKey);
    if (!targetJidCandidates.length) throw new Error('Missing required target JID for msmsg decryption');

    const botJidBuf = Buffer.from(String(messageKey.participant));
    const payload = toBuffer(msMsg.encPayload);
    const iv = toBuffer(msMsg.encIv);

    // k1 depends only on messageSecret — derive once and reuse across all candidates
    const baseKey = Buffer.from(hkdf(toBuffer(messageSecret), KEY_LENGTH, { info: BOT_MESSAGE_INFO }));

    let lastError;
    for (const msgId of msgIdCandidates) {
        // msg_id is always passed as ASCII bytes per Rust spec (msg_id.as_bytes())
        const idBuf = Buffer.from(msgId);
        for (const targetJid of targetJidCandidates) {
            const info = Buffer.concat([idBuf, Buffer.from(targetJid), botJidBuf]);
            const key = Buffer.from(hkdf(baseKey, KEY_LENGTH, { info }));
            const aad = Buffer.concat([idBuf, Buffer.from([0x00]), botJidBuf]);
            try {
                return Buffer.from(aesDecryptGCM(payload, key, iv, aad));
            }
            catch (e) {
                lastError = e;
            }
        }
    }

    const err = new Error('msmsg decryption failed: all key derivation candidates exhausted');
    err.cause = lastError;
    throw err;
};

// unifiedResponse.data is base64/bytes-wrapped JSON, not encrypted. Keep the
// original data and expose both the decoded object and flattened text.
export const parseUnifiedResponseData = (data) => {
    if (!data)
        return null;
    try {
        let buf;
        if (Buffer.isBuffer(data))
            buf = data;
        else if (data instanceof Uint8Array)
            buf = Buffer.from(data);
        else if (typeof data === 'string')
            buf = Buffer.from(data, 'base64');
        else if (data.type === 'Buffer' && Array.isArray(data.data))
            buf = Buffer.from(data.data);
        else
            return null;
        return JSON.parse(buf.toString('utf8'));
    }
    catch {
        return null;
    }
};
export const textFromUnifiedResponse = (data) => {
    const json = parseUnifiedResponseData(data);
    if (!json)
        return null;
    const parts = [];
    for (const section of json.sections || []) {
        const text = section?.view_model?.primitive?.text;
        if (text)
            parts.push(text);
    }
    return parts.length ? parts.join('\n') : null;
};
export const textFromRichResponse = (richResponse) => {
    if (!richResponse)
        return null;
    if (Array.isArray(richResponse.submessages)) {
        const parts = richResponse.submessages
            .map(submessage => submessage?.messageText)
            .filter(text => typeof text === 'string' && text.length);
        if (parts.length)
            return parts.join('\n');
    }
    return textFromUnifiedResponse(richResponse.unifiedResponse?.data);
};
export const extractMetaAiText = (message) => {
    if (!message)
        return null;
    const body = message.protocolMessage?.editedMessage || message;
    return body.extendedTextMessage?.text ?? body.conversation ?? textFromRichResponse(body.richResponseMessage) ?? null;
};
export const decodeUnifiedResponseInPlace = (message) => {
    if (!message || typeof message !== 'object')
        return message;
    const bodies = [
        message,
        message.protocolMessage?.editedMessage,
        message.editedMessage
    ].filter(Boolean);
    for (const body of bodies) {
        const unifiedResponse = body.richResponseMessage?.unifiedResponse;
        if (unifiedResponse && unifiedResponse.data != null && unifiedResponse.decodedData === undefined) {
            unifiedResponse.decodedData = parseUnifiedResponseData(unifiedResponse.data);
            const text = textFromUnifiedResponse(unifiedResponse.data);
            if (text != null)
                unifiedResponse.text = text;
        }
    }
    return message;
};

export { decodeDecryptedMsmsgMessage };
