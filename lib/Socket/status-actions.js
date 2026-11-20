import { Boom } from '@hapi/boom';
import { downloadMediaMessage, generateWAMessageContent } from '../Utils/messages.js';
import { isJidGroup, isJidStatusBroadcast, isLidUser, isPnUser, jidDecode, jidNormalizedUser } from '../WABinary/index.js';

const STATUS_JID = 'status@broadcast';
const GROUP_STATUS_FIELDS = new Set(['groupStatusMessage', 'groupStatusMessageV2']);
const MESSAGE_WRAPPERS = new Set([
    'deviceSentMessage',
    'documentWithCaptionMessage',
    'editedMessage',
    'ephemeralMessage',
    'groupMentionedMessage',
    'message',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension'
]);
const NON_STORY_INTERACTIONS = new Set(['reactionMessage', 'protocolMessage']);

export const getStatusKey = (status) => {
    const key = status?.key || status?.fakeObj?.key || status;
    if (!key || typeof key !== 'object' || typeof key.id !== 'string' || !key.id.trim()) {
        throw new Boom('A status message or message key with an id is required', { statusCode: 400 });
    }
    return key;
};

const findGroupStatusEnvelope = (status) => {
    const roots = [status?.message, status?.fakeObj?.message, status?.message?.message];
    const queue = roots.filter(value => value && typeof value === 'object');
    const visited = new WeakSet();
    let inspected = 0;
    while (queue.length && inspected < 160) {
        const current = queue.shift();
        if (!current || typeof current !== 'object' || visited.has(current)) continue;
        visited.add(current);
        inspected += 1;
        for (const [field, value] of Object.entries(current)) {
            if (GROUP_STATUS_FIELDS.has(field)) return { field, value };
            if (MESSAGE_WRAPPERS.has(field) && value && typeof value === 'object') queue.push(value);
        }
    }
    return undefined;
};

const isStatusInteraction = (status) => {
    const roots = [status?.message, status?.fakeObj?.message, status?.message?.message];
    const queue = roots.filter(value => value && typeof value === 'object');
    const visited = new WeakSet();
    let inspected = 0;
    while (queue.length && inspected < 160) {
        const current = queue.shift();
        if (!current || typeof current !== 'object' || visited.has(current)) continue;
        visited.add(current);
        inspected += 1;
        for (const [field, value] of Object.entries(current)) {
            if (NON_STORY_INTERACTIONS.has(field)) return true;
            if (MESSAGE_WRAPPERS.has(field) && value && typeof value === 'object') queue.push(value);
        }
    }
    return false;
};

export const getStatusKind = (status) => {
    if (findGroupStatusEnvelope(status)) return 'group';
    const key = status?.key || status?.fakeObj?.key || status;
    if ((isJidStatusBroadcast(key?.remoteJid) || isJidStatusBroadcast(key?.remoteJidAlt)) && !isStatusInteraction(status)) return 'status';
    return undefined;
};

export const getStatusAuthorJid = (status) => {
    const key = status?.key || status?.fakeObj?.key || status;
    const isPrimaryRemoteStatus = isJidStatusBroadcast(key?.remoteJid);
    const candidates = isPrimaryRemoteStatus
        ? [key?.participant, key?.participantAlt, key?.remoteJidAlt, key?.remoteJid, status?.sender, status?.from]
        : [key?.participant, key?.remoteJid, key?.participantAlt, key?.remoteJidAlt, status?.sender, status?.from];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string' || !candidate) continue;
        const normalized = jidNormalizedUser(candidate);
        if (isPnUser(normalized) || isLidUser(normalized)) return normalized;
    }
    return undefined;
};

const assertReactionText = (emoji) => {
    if (typeof emoji !== 'string' || !emoji.trim()) {
        throw new Boom('Reaction text must be a non-empty emoji/string; pass an empty string only through a dedicated remove-reaction API', { statusCode: 400 });
    }
    return emoji;
};

export const makeStatusActionMethods = ({
    socket,
    ev,
    readMessages,
    resolveStatusRecipients,
    authState,
    logger,
    upload,
    lidMapping,
    downloadMedia = downloadMediaMessage,
    generateContent = generateWAMessageContent
}) => {
    const getAliases = async (jid) => {
        const normalized = jidNormalizedUser(jid);
        const aliases = new Set([normalized]);
        const mapping = lidMapping || {};
        try {
            const mapped = isLidUser(normalized)
                ? await mapping.getPNForLID?.(normalized)
                : isPnUser(normalized)
                    ? await mapping.getLIDForPN?.(normalized)
                    : undefined;
            if (typeof mapped === 'string' && mapped) aliases.add(jidNormalizedUser(mapped));
        }
        catch {
            // Preserve exact-JID matching if this account has not learned the PN/LID mapping yet.
        }
        return aliases;
    };

    const ownJids = [
        authState?.creds?.me?.id,
        authState?.creds?.me?.lid,
        authState?.creds?.me?.jid
    ].filter(jid => typeof jid === 'string' && jid);

    const isOwnStatusAuthor = async authorJid => {
        if (!authorJid || !ownJids.length) return false;
        const authorAliases = await getAliases(authorJid);
        for (const ownJid of ownJids) {
            const ownAliases = await getAliases(ownJid);
            if ([...authorAliases].some(alias => ownAliases.has(alias))) return true;
        }
        return false;
    };

    const actionKeyFor = async (status, expectedKind) => {
        const kind = getStatusKind(status);
        if (kind !== expectedKind) {
            throw new Boom(`Expected a ${expectedKind === 'group' ? 'group status' : 'personal status'} message`, { statusCode: 400 });
        }
        const key = getStatusKey(status);
        const authorJid = getStatusAuthorJid(status);
        if (!authorJid) {
            throw new Boom('Could not resolve the status author from its JID/LID key fields', { statusCode: 400 });
        }
        if (await isOwnStatusAuthor(authorJid)) {
            throw new Boom('Status actions require a status sent by another account', { statusCode: 400 });
        }
        if (key.fromMe && !ownJids.length) {
            throw new Boom('Cannot safely verify the author of a status marked fromMe without the connected account identity', { statusCode: 400 });
        }
        if (expectedKind === 'group') {
            if (!isJidGroup(key.remoteJid)) {
                throw new Boom('Group status message key must contain its @g.us remoteJid', { statusCode: 400 });
            }
            return {
                ...key,
                fromMe: false,
                remoteJid: key.remoteJid,
                participant: key.participant || authorJid
            };
        }
        const statusRemoteJid = [key.remoteJid, key.remoteJidAlt].find(isJidStatusBroadcast) || STATUS_JID;
        return {
            ...key,
            fromMe: false,
            remoteJid: statusRemoteJid,
            participant: key.participant || authorJid
        };
    };

    const matchesTargets = async (status, selectors) => {
        if (selectors == null || selectors === 'all' || selectors === '*') return true;
        const list = Array.isArray(selectors) ? selectors : [selectors];
        if (!list.length || list.some(value => typeof value !== 'string' || !value.trim())) {
            throw new Boom('Status author filter must be "all", "*", or one or more JID/LID strings', { statusCode: 400 });
        }
        const key = status?.key || status?.fakeObj?.key || status;
        const targets = new Set();
        for (const selector of list) {
            const aliases = await getAliases(selector);
            for (const alias of aliases) targets.add(alias);
        }
        const candidates = [getStatusAuthorJid(status), key?.remoteJid, key?.remoteJidAlt]
            .filter(candidate => typeof candidate === 'string' && candidate && !isJidStatusBroadcast(candidate))
            .map(jidNormalizedUser);
        for (const candidate of candidates) {
            const aliases = await getAliases(candidate);
            for (const alias of aliases) if (targets.has(alias)) return true;
        }
        return false;
    };

    const onStatusMessage = (listener, options = {}) => {
        if (typeof listener !== 'function') {
            throw new Boom('onStatusMessage requires a listener function', { statusCode: 400 });
        }
        if (!ev?.on || !ev?.off) {
            throw new Boom('The socket event emitter does not support on/off subscriptions', { statusCode: 501 });
        }
        const selectors = options.from ?? 'all';
        const includeGroupStatus = options.includeGroupStatus !== false;
        const handler = ({ messages = [], type } = {}) => {
            for (const message of messages) {
                const kind = getStatusKind(message);
                if (!kind || (kind === 'group' && !includeGroupStatus)) continue;
                void (async () => {
                    if (!(await matchesTargets(message, selectors))) return;
                    const authorJid = getStatusAuthorJid(message);
                    await listener({ message, authorJid, kind, type });
                })().catch(error => logger?.error?.({ error }, 'status listener failed'));
            }
        };
        ev.on('messages.upsert', handler);
        return () => ev.off('messages.upsert', handler);
    };

    const likeStatus = async (status, emoji, options = {}) => {
        const key = await actionKeyFor(status, 'status');
        const authorJid = getStatusAuthorJid(status);
        const statusJidList = await resolveStatusRecipients([authorJid]);
        return socket.sendMessage(STATUS_JID, {
            react: { text: assertReactionText(emoji), key }
        }, { ...options, statusJidList });
    };

    const viewStatus = async (status) => {
        const key = await actionKeyFor(status, 'status');
        return readMessages([key]);
    };

    const commentStatus = async (status, comment, options = {}) => {
        const key = await actionKeyFor(status, 'status');
        const authorJid = getStatusAuthorJid(status);
        if (!(typeof comment === 'string' || (comment && typeof comment === 'object' && !Array.isArray(comment)))) {
            throw new Boom('commentStatus content must be a string or message-content object', { statusCode: 400 });
        }
        const messageContent = typeof comment === 'string'
            ? { text: comment }
            : comment.message && typeof comment.message === 'object'
                ? undefined
                : comment;
        if (typeof comment === 'string' && !comment.trim()) {
            throw new Boom('commentStatus text cannot be empty', { statusCode: 400 });
        }
        const innerMessage = comment.message && typeof comment.message === 'object'
            ? comment.message
            : await generateContent(messageContent, {
                logger,
                userJid: authState?.creds?.me?.id,
                upload
            });
        return socket.sendMessage(authorJid, {
            comment: { message: innerMessage, targetMessageKey: key }
        }, options);
    };

    const downloadStatus = async (status, type = 'buffer', options = {}) => {
        const kind = getStatusKind(status);
        if (!kind) throw new Boom('downloadStatus requires a personal or group status message', { statusCode: 400 });
        return downloadMedia(status, type, options);
    };

    const likeGroupStatus = async (status, emoji, options = {}) => {
        const key = await actionKeyFor(status, 'group');
        return socket.sendMessage(key.remoteJid, {
            react: { text: assertReactionText(emoji), key }
        }, options);
    };

    const viewGroupStatus = async (status) => {
        const key = await actionKeyFor(status, 'group');
        return readMessages([key]);
    };

    return {
        onStatusMessage,
        likeStatus,
        viewStatus,
        commentStatus,
        downloadStatus,
        likeGroupStatus,
        viewGroupStatus
    };
};
