import { createCipheriv, randomBytes } from 'crypto';
import { proto } from '../../WAProto/index.js';

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

/** Attach the native parent-key association to a generated paired child message. */
export const associateScheduledMessages = (parent, child, associationType = proto.MessageAssociation.AssociationType.MOTION_PHOTO) => {
    if (!parent?.key || !child?.message) {
        throw new TypeError('A generated parent and child message are required');
    }
    child.message.messageContextInfo = {
        ...(child.message.messageContextInfo || {}),
        messageAssociation: {
            associationType,
            parentMessageKey: parent.key
        }
    };
    return { parent, child };
};

/**
 * Normalize an explicit schedule time to Unix seconds.
 * Numeric values below 1e11 are interpreted as Unix seconds; larger values are
 * interpreted as Unix milliseconds. Date and ISO-8601 strings are also accepted.
 */
export const normalizeScheduledTime = (scheduledAt, now = Date.now()) => {
    let timestampMs;

    if (scheduledAt instanceof Date) {
        timestampMs = scheduledAt.getTime();
    }
    else if (isFiniteNumber(scheduledAt)) {
        timestampMs = Math.abs(scheduledAt) < 1e11 ? scheduledAt * 1000 : scheduledAt;
    }
    else if (typeof scheduledAt === 'string' && scheduledAt.trim()) {
        const value = scheduledAt.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(value)) {
            const numeric = Number(value);
            timestampMs = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
        }
        else {
            timestampMs = Date.parse(value);
        }
    }
    else {
        throw new TypeError('scheduledAt must be a Date, an ISO-8601 string, or a Unix timestamp in seconds/milliseconds');
    }

    if (!Number.isFinite(timestampMs) || Math.abs(timestampMs) > 8.64e15) {
        throw new RangeError('scheduledAt is not a valid timestamp');
    }

    const scheduledTime = Math.floor(timestampMs / 1000);
    if (!Number.isSafeInteger(scheduledTime)) {
        throw new RangeError('scheduledAt is outside the supported timestamp range');
    }
    if (scheduledTime <= Math.floor(now / 1000)) {
        throw new RangeError('scheduledAt must be in the future');
    }

    return scheduledTime;
};

/**
 * Encrypt a generated WhatsApp Message for the native conditional-reveal
 * scheduled-message envelope. The matching reveal key is carried separately in
 * the scheduled-message metadata node and in the sender-side WebMessageInfo.
 */
export const createScheduledMessageEnvelope = (message, scheduledAt, { now = Date.now() } = {}) => {
    const scheduledTime = normalizeScheduledTime(scheduledAt, now);
    const revealKey = randomBytes(32);
    const encIv = randomBytes(12);
    const revealKeyId = randomBytes(16).toString('hex').toUpperCase();
    const plaintext = proto.Message.encode(message).finish();
    const cipher = createCipheriv('aes-256-gcm', revealKey, encIv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

    const content = proto.Message.create({
        conditionalRevealMessage: {
            encPayload: ciphertext,
            encIv,
            conditionalRevealMessageType: proto.Message.ConditionalRevealMessage.ConditionalRevealMessageType.SCHEDULED_MESSAGE,
            revealKeyId
        }
    });

    const additionalNode = {
        tag: 'meta',
        attrs: {
            type: 'scheduled_message',
            st: String(scheduledTime)
        },
        content: [{
            tag: 'key',
            attrs: { rkid: revealKeyId },
            content: revealKey
        }]
    };

    return {
        content,
        scheduledTime,
        revealKey,
        revealKeyId,
        additionalNode
    };
};
