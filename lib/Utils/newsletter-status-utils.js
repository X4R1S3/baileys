import { randomBytes } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { isJidNewsletter } from '../WABinary/index.js';
import { encodeNewsletterMessage } from './generics.js';
import { normalizeMessageContent } from './messages.js';

const NEWSLETTER_STATUS_MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const DEFAULT_NEWSLETTER_STATUS_AUDIO_BACKGROUND = 0xff1e88e5;

export const withNewsletterStatusAttribution = content => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new TypeError('Newsletter status content must be an object');
    }
    if (content.contextInfo != null && (typeof content.contextInfo !== 'object' || Array.isArray(content.contextInfo))) {
        throw new TypeError('Newsletter status contextInfo must be an object');
    }
    if (content.messageContextInfo != null && (typeof content.messageContextInfo !== 'object' || Array.isArray(content.messageContextInfo))) {
        throw new TypeError('Newsletter status messageContextInfo must be an object');
    }

    return {
        ...content,
        messageContextInfo: {
            ...(content.messageContextInfo || {}),
            messageSecret: content.messageContextInfo?.messageSecret ?? randomBytes(32)
        },
        contextInfo: {
            ...(content.contextInfo || {}),
            statusAttributions: [{ type: proto.StatusAttribution.Type.NEWSLETTER_STATUS }],
            featureEligibilities: {
                ...(content.contextInfo?.featureEligibilities || {}),
                canBeReshared: true
            }
        }
    };
};

export const withNewsletterStatusAudioMetadata = (message, backgroundArgb) => {
    const normalized = normalizeMessageContent(message);
    const audio = normalized?.audioMessage;
    if (!audio?.ptt) {
        throw new TypeError('Newsletter audio status requires a push-to-talk voice note');
    }
    const resolvedBackgroundArgb = backgroundArgb ?? DEFAULT_NEWSLETTER_STATUS_AUDIO_BACKGROUND;
    if (!Number.isInteger(resolvedBackgroundArgb) || resolvedBackgroundArgb < 0 || resolvedBackgroundArgb > 0xffffffff) {
        throw new TypeError('Newsletter voice-note backgroundArgb must be an unsigned 32-bit integer');
    }
    audio.backgroundArgb = resolvedBackgroundArgb >>> 0;
    audio.contextInfo = {
        ...(audio.contextInfo || {}),
        statusSourceType: proto.ContextInfo.StatusSourceType.AUDIO
    };
    return message;
};
export const getNewsletterStatusMediaType = message => {
    const normalized = normalizeMessageContent(message);
    if (normalized?.imageMessage) return 'image';
    if (normalized?.videoMessage) return normalized.videoMessage.gifPlayback ? 'gif' : 'video';
    if (normalized?.audioMessage?.ptt) return 'audio';
    return undefined;
};

export const waitForNewsletterStatusServerId = (sock, { jid, messageId }) => {
    if (!sock?.ws || typeof sock.ws.on !== 'function' || typeof sock.ws.off !== 'function') {
        throw new TypeError('Newsletter status server-ID lookup requires a socket event emitter');
    }

    let settle;
    let timer;
    let finished = false;
    let resolvePromise;
    const promise = new Promise(resolve => {
        resolvePromise = resolve;
    });
    const finish = value => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        sock.ws.off('CB:status', onStatus);
        resolvePromise(value);
    };
    const onStatus = node => {
        if (node?.tag !== 'status') return;
        const attrs = node.attrs || {};
        if (attrs.from && attrs.from !== jid) return;
        if (attrs.id && attrs.id !== messageId) return;
        const serverId = Number.parseInt(String(attrs.server_id), 10);
        if (Number.isFinite(serverId)) finish(serverId);
    };
    sock.ws.on('CB:status', onStatus);
    settle = finish;

    return {
        promise,
        startTimeout: (timeoutMs = 8000) => {
            if (finished) return;
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                throw new TypeError('Newsletter status server-ID timeout must be a positive number');
            }
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => finish(undefined), timeoutMs);
        },
        cancel: () => settle?.(undefined)
    };
};

export const buildNewsletterStatusNode = ({ jid, message, messageId, mediaType, mediaHandle }) => {
    if (!isJidNewsletter(jid)) {
        throw new TypeError('Newsletter status target must be a @newsletter JID');
    }
    if (typeof messageId !== 'string' || !messageId) {
        throw new TypeError('Newsletter status messageId is required');
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new TypeError('Newsletter status message is required');
    }
    if (mediaType !== undefined && !NEWSLETTER_STATUS_MEDIA_TYPES.has(mediaType)) {
        throw new TypeError(`Unsupported newsletter status media type: ${mediaType}`);
    }

    const normalized = normalizeMessageContent(message);
    const detectedMediaType = getNewsletterStatusMediaType(message);
    if (mediaType !== detectedMediaType) {
        throw new TypeError('Newsletter status media type does not match the encoded message');
    }
    if (!mediaType && typeof normalized?.conversation !== 'string' && typeof normalized?.extendedTextMessage?.text !== 'string') {
        throw new TypeError('Newsletter status supports text, image, video, and push-to-talk voice-note content');
    }
    if (mediaType && (mediaHandle === undefined || mediaHandle === null || mediaHandle === '')) {
        throw new TypeError('Media newsletter status requires the handle returned by the newsletter upload');
    }
    if (!mediaType && mediaHandle !== undefined && mediaHandle !== null && mediaHandle !== '') {
        throw new TypeError('A media handle can only be used with an image or video newsletter status');
    }

    const attrs = {
        to: jid,
        id: messageId,
        type: mediaType === 'audio' ? 'text' : mediaType ? 'media' : 'text'
    };
    if (mediaType && mediaType !== 'audio') attrs.media_id = String(mediaHandle);

    return {
        tag: 'status',
        attrs,
        content: [{
            tag: 'plaintext',
            attrs: mediaType && mediaType !== 'audio' ? { mediatype: mediaType } : {},
            content: encodeNewsletterMessage(message)
        }]
    };
};
