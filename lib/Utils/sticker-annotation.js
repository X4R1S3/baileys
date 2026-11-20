/**
 * Copyright (c) 2026 X4R1S3x — @X4R1S3/baileys
 */
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';

const MAX_STICKER_ANNOTATION_COUNT = 20;
const MAX_STICKER_ANNOTATION_INTERVAL_MS = 60_000;

export const normalizeStickerAnnotationOptions = ({ count = 1, intervalMs = 1000 } = {}) => {
    if (!Number.isInteger(count) || count < 1 || count > MAX_STICKER_ANNOTATION_COUNT) {
        throw new Boom(`sticker annotation count must be an integer between 1 and ${MAX_STICKER_ANNOTATION_COUNT}`, { statusCode: 400 });
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > MAX_STICKER_ANNOTATION_INTERVAL_MS) {
        throw new Boom(`sticker annotation intervalMs must be an integer between 0 and ${MAX_STICKER_ANNOTATION_INTERVAL_MS}`, { statusCode: 400 });
    }
    return { count, intervalMs };
};

export const prepareStickerAnnotationMessage = ({ parentMessageKey, stickerMessage } = {}, { now = Date.now() } = {}) => {
    if (!parentMessageKey || typeof parentMessageKey !== 'object' || typeof parentMessageKey.id !== 'string' || !parentMessageKey.id.trim()) {
        throw new Boom('sendStickerAnnotation requires a parentMessageKey with a message id', { statusCode: 400 });
    }
    if (!stickerMessage || typeof stickerMessage !== 'object' || Array.isArray(stickerMessage)) {
        throw new Boom('sendStickerAnnotation requires a stickerMessage payload', { statusCode: 400 });
    }
    if (!(typeof stickerMessage.url === 'string' && stickerMessage.url) && !(typeof stickerMessage.directPath === 'string' && stickerMessage.directPath)) {
        throw new Boom('stickerMessage requires a media url or directPath', { statusCode: 400 });
    }
    if (!Number.isFinite(now) || now < 0) {
        throw new Boom('sticker annotation timestamp must be a non-negative number', { statusCode: 400 });
    }

    return proto.Message.fromObject({
        messageContextInfo: {
            messageAssociation: {
                associationType: proto.MessageAssociation.AssociationType.STICKER_ANNOTATION,
                parentMessageKey
            }
        },
        stickerMessage: {
            ...stickerMessage,
            isAnimated: stickerMessage.isAnimated ?? true,
            stickerSentTs: stickerMessage.stickerSentTs ?? now
        }
    });
};

/** Relay one associated sticker repeatedly, using an independent message id for every send. */
export const sendStickerAnnotationBatch = async ({
    jid,
    parentMessageKey,
    stickerMessage,
    count = 1,
    intervalMs = 1000,
    relay,
    createMessageId,
    relayOptions = {},
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
} = {}) => {
    if (!jid || typeof jid !== 'string') {
        throw new Boom('sendStickerAnnotation requires a target JID', { statusCode: 400 });
    }
    if (typeof relay !== 'function' || typeof createMessageId !== 'function' || typeof sleep !== 'function') {
        throw new Boom('sendStickerAnnotation requires relay and message-id functions', { statusCode: 400 });
    }
    const normalized = normalizeStickerAnnotationOptions({ count, intervalMs });
    const messageIds = [];

    for (let index = 0; index < normalized.count; index += 1) {
        const messageId = index === 0 && typeof relayOptions.messageId === 'string' && relayOptions.messageId
            ? relayOptions.messageId
            : createMessageId();
        if (typeof messageId !== 'string' || !messageId) {
            throw new Boom('sendStickerAnnotation could not create a message id', { statusCode: 500 });
        }
        const message = prepareStickerAnnotationMessage({ parentMessageKey, stickerMessage });
        await relay(jid, message, { ...relayOptions, messageId });
        messageIds.push(messageId);

        if (index + 1 < normalized.count && normalized.intervalMs > 0) {
            await sleep(normalized.intervalMs);
        }
    }

    return { sent: messageIds.length, messageIds };
};
