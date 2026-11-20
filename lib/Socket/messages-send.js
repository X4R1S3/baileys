/**
 * @X4R1S3
 *
 * File: lib/Socket/messages-send.js
 * About: Messages send module for the X4R1S3 WhatsApp protocol client.
 * Important exports: normalizeStatusJidList, makeMessagesSocket
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import NodeCache from '@cacheable/node-cache';
import { Boom } from '@hapi/boom';
import { randomBytes, randomUUID } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { BIZ_BOT_SUPPORT_PAYLOAD, DEFAULT_CACHE_TTLS, WA_DEFAULT_EPHEMERAL } from '../Defaults/index.js';
import { aggregateMessageKeysNotFromMe, assertMediaContent, assertMeId, bindWaitForEvent, buildLinkPreview, decryptMediaRetryData, DEF_MEDIA_HOST, delay, encodeNewsletterMessage, encodeSignedDeviceIdentity, encodeWAMessage, encryptMediaRetryRequest, extractDeviceJids, extractImageThumb, generateMessageIDV2, generateParticipantHashV2, generateWAMessage, generateWAMessageFromContent, generateWAMessageFromImagePoll, generateWAMessageFromLivePhoto, getStatusCodeForMediaRetry, makeWhatsAppFlowButton, getUrlFromDirectPath, getWAUploadToServer, MessageRetryManager, normalizeMessageContent, parseAndInjectE2ESessions, prepareWAMessageMedia, shouldIncludeBizBinaryNode, unixTimestampSeconds, normalizeScheduledTime, createScheduledMessageEnvelope, associateScheduledMessages } from '../Utils/index.js';
import { getUrlInfo } from '../Utils/link-preview.js';
import { buildNewsletterStatusNode, getNewsletterStatusMediaType, waitForNewsletterStatusServerId, withNewsletterStatusAttribution } from '../Utils/newsletter-status-utils.js';
import { prepareRichMenuMessage, prepareInteractiveContactCardMessage, prepareLocationButtonCardMessage, prepareMenuButtonCardMessage, normalizeLocationButtonCardThumbnail, prepareA2UIMessage, prepareA2UICommandMenu, prepareAIRichCommandMenu, prepareSocialEntityMessage, prepareInstagramProfileMessage, prepareRichResponseMessage, prepareRichGenerationMessage, prepareCopyToClipboardMessage, prepareRichTextMessage, prepareRichQuoteMessage, prepareRichImageMessage, prepareRichLinkMessage, prepareSocialProfileMessage, prepareUnifiedResponseMessage, prepareRichMapMessage, prepareBotPromptSuggestionsMessage, prepareBotSourcesMessage, prepareRichDynamicMediaMessage, prepareBotPttTranscriptMessage, prepareGridImageMessage, prepareVerticalAlbumMessage, prepareVideoGridMessage, prepareHtmlMessage, prepareRichHtmlMessage, prepareRichMediaMessage, buildRichLabelMessage, attachBotVerificationProofs, hasVerifiableProofs, normalizeUnifiedThemedMessageContent } from '../Utils/rich-message-utils.js';
import { sendStickerAnnotationBatch } from '../Utils/sticker-annotation.js';
import { X4R1S3 as runX4R1S3 } from '../Utils/X4R1S3.js';
import { generateSlotMachineHtml } from '../Utils/games/slot-machine.js';
import { generateMiniAppHtml } from '../Utils/games/miniapp.js';
import { generateWebsitePreviewHtml, generateLinkPreviewHtml } from '../Utils/games/website-preview.js';
import { isViewOnceMessage, extractViewOnceContent, getViewOnceMediaType, getViewOnceMediaContent, downloadViewOnceMedia, createRegularMessageFromViewOnce, parseViewOnceInfo } from '../Utils/view-once-utils.js';
import { makeKeyedMutex, makeMutex } from '../Utils/make-mutex.js';
import { getMessageReportingToken, shouldIncludeReportingToken } from '../Utils/reporting-utils.js';
import { buildMergedTcTokenIndexWrite, isTcTokenExpired, resolveIssuanceJid, resolveTcTokenJid, shouldSendNewTcToken, storeTcTokensFromIqResult } from '../Utils/tc-token-utils.js';
import { areJidsSameUser, getBinaryNodeChild, getBinaryNodeChildren, getBizBinaryNode, isHostedLidUser, isHostedPnUser, isJidBot, isJidGroup, isJidMetaAI, isJidNewsletter, isLidUser, isPnUser, jidDecode, jidEncode, jidNormalizedUser, PSA_WID, S_WHATSAPP_NET } from '../WABinary/index.js';
import { USyncQuery, USyncUser } from '../WAUSync/index.js';
import { captureUnifiedResponse, generateCodeBlockContent, generateLatexContent, generateListContent, generateRichAIResponseContent, generateTableContent, generateUnifiedResponseContent } from '../Utils/message-composer.js';
import { BotCapabilityType, buildBotRichResponse } from '../Utils/bot-capabilities.js';
import { Baron } from './interactive-handler.js';
import { collectMetaAIBotParticipantJids, isMetaAIBotResponse, META_AI_BOT_JID } from './aigroups.js';
import { makeUsernameSocket } from './username.js';
import { grepSource } from '../Utils/source-grep.js';
import { C2582 } from '../Utils/c2582.js';
import { makeStatusActionMethods } from './status-actions.js';

const STATUS_JID = 'status@broadcast';
export const normalizeStatusJidList = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Boom('statusJidList must contain at least one recipient JID', { statusCode: 400 });
    }
    const recipients = [...new Set(value.map(jidNormalizedUser).filter(jid => isPnUser(jid) || isLidUser(jid)))];
    if (recipients.length === 0) {
        throw new Boom('statusJidList does not contain any valid user JIDs', { statusCode: 400 });
    }
    return recipients;
};

export const makeMessagesSocket = (config) => {
    const { logger, linkPreviewImageThumbnailWidth, generateHighQualityLinkPreview, options: httpRequestOptions, patchMessageBeforeSending, cachedGroupMetadata, enableRecentMessageCache, maxMsgRetryCount } = config;
    const sock = makeUsernameSocket(config);
    let socket;
    const { ev, authState, messageMutex, signalRepository, upsertMessage, query, fetchPrivacySettings, sendNode, groupMetadata, groupToggleEphemeral, registerSocketEndHandler } = sock;
    const getLIDForPN = signalRepository.lidMapping.getLIDForPN.bind(signalRepository.lidMapping);

    const inFlightTcTokenIssuance = new Set();
    const userDevicesCache = config.userDevicesCache ||
        new NodeCache({
            stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES,
            useClones: false
        });
    const devicesMutex = makeMutex();
    const messageRetryManager = enableRecentMessageCache ? new MessageRetryManager(logger, maxMsgRetryCount) : null;
    const encryptionMutex = makeKeyedMutex();
    const mediaConnMutex = makeKeyedMutex();

    let mediaConn;
    let mediaHost = DEF_MEDIA_HOST;

    // ── BULK REACTION HELPER (NEW) ──
    const sendBulkReactions = async (jid, messageId, emoji, count = 1, fake = false) => {
        const maxReactions = Math.min(Math.max(Number(count) || 1, 1), 1000);
        if (isJidNewsletter(jid)) {
            if (typeof socket.newsletterReactMessage !== 'function') {
                throw new Boom('newsletter reaction API is unavailable', { statusCode: 501 });
            }
            await socket.newsletterReactMessage(jid, messageId, String(emoji || ''));
            return { sent: 1, requested: maxReactions, fake: false, channel: true, jid };
        }
        const makeReaction = () => ({
            react: {
                text: String(emoji || ''),
                key: {
                    remoteJid: jid,
                    fromMe: false,
                    id: messageId
                }
            }
        });
        let sent = 0;
        const batchSize = 10;

        // sendMessage accepts one content object, not an array of messages.
        // Also, fake inbound reaction records cannot be serialized as outgoing
        // WhatsApp messages or impersonate other users. Keep the flag for API
        // compatibility, but always send a valid reaction from this account.
        if (fake) {
            logger.warn('[BULK_REACT] fake=true cannot impersonate other WhatsApp users; sending valid reactions from this account');
        }
        for (let i = 0; i < maxReactions; i += batchSize) {
            const batch = Array.from({ length: Math.min(batchSize, maxReactions - i) }, () =>
                socket.sendMessage(jid, makeReaction(), { ephemeralExpiration: 86400 })
                    .then(() => { sent += 1; })
                    .catch(error => logger.warn(`[BULK_REACT] Reaction failed: ${error.message}`))
            );
            await Promise.all(batch);
            if (i + batchSize < maxReactions) await delay(100);
        }

        return { sent, requested: maxReactions, fake: false, jid };
    };

    // ── MIMIC HELPER ──
    const sendAsMimic = async (jid, content, mimicJid, options = {}) => {
        const hasPermission = options.admin === true || options.mimicPermission === true;
        if (!hasPermission) {
            throw new Boom('Mimic requires admin permission', { statusCode: 403 });
        }

        const msgId = generateMessageIDV2(authState.creds.me.id);

        const fakeKey = {
            remoteJid: jid,
            fromMe: false,
            id: msgId,
            participant: mimicJid
        };

        const fullMsg = await generateWAMessageFromContent(jid, content, {
            userJid: authState.creds.me.id,
            ...options
        });

        fullMsg.key = fakeKey;

        await relayMessage(jid, fullMsg.message, {
            messageId: msgId,
            additionalAttributes: options.additionalAttributes || {},
            additionalNodes: options.additionalNodes || []
        });

        return fullMsg;
    };

    const refreshMediaConn = async (forceGet = false) => {
        return mediaConnMutex.mutex('media-conn', async () => {
            const media = await mediaConn;
            if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
                mediaConn = (async () => {
                    const result = await query({
                        tag: 'iq',
                        attrs: {
                            type: 'set',
                            xmlns: 'w:m',
                            to: S_WHATSAPP_NET
                        },
                        content: [{ tag: 'media_conn', attrs: {} }]
                    });
                    const mediaConnNode = getBinaryNodeChild(result, 'media_conn');
                    const node = {
                        hosts: getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
                            hostname: attrs.hostname,
                            maxContentLengthBytes: +attrs.maxContentLengthBytes
                        })),
                        auth: mediaConnNode.attrs.auth,
                        ttl: +mediaConnNode.attrs.ttl,
                        fetchDate: new Date()
                    };
                    logger.debug('fetched media conn');
                    if (node.hosts[0]) {
                        mediaHost = node.hosts[0].hostname;
                    }
                    return node;
                })();
            }
            return mediaConn;
        });
    };

    const sendReceipt = async (jid, participant, messageIds, type) => {
        if (!messageIds || messageIds.length === 0) {
            throw new Boom('missing ids in receipt');
        }
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0]
            }
        };
        const isReadReceipt = type === 'read' || type === 'read-self';
        if (isReadReceipt) {
            node.attrs.t = unixTimestampSeconds().toString();
        }
        if (type === 'sender' && (isPnUser(jid) || isLidUser(jid))) {
            node.attrs.recipient = jid;
            node.attrs.to = participant;
        }
        else {
            node.attrs.to = jid;
            if (participant) {
                node.attrs.participant = participant;
            }
        }
        if (type) {
            node.attrs.type = type;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages');
        await sendNode(node);
    };

    const sendReceipts = async (keys, type) => {
        const recps = aggregateMessageKeysNotFromMe(keys);
        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type);
        }
    };

    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings();
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
        await sendReceipts(keys, readType);
    };

    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        const deviceResults = [];
        if (!useCache) {
            logger.debug('not using cache for devices');
        }
        const toFetch = [];
        const jidsWithUser = jids
            .map(jid => {
            const decoded = jidDecode(jid);
            const user = decoded?.user;
            const device = decoded?.device;
            // Meta AI/bot JIDs are single device-0 endpoints. USync does not
            // enumerate them, so inject the endpoint instead of dropping it.
            if (user && (isJidMetaAI(jid) || isJidBot(jid))) {
                deviceResults.push({
                    user,
                    device: typeof device === 'number' ? device : 0,
                    jid
                });
                return null;
            }
            const isExplicitDevice = typeof device === 'number' && device >= 0;
            if (isExplicitDevice && user) {
                deviceResults.push({
                    user,
                    device,
                    jid
                });
                return null;
            }
            jid = jidNormalizedUser(jid);
            return { jid, user };
        })
            .filter(jid => jid !== null);
        let mgetDevices;
        if (useCache && userDevicesCache.mget) {
            const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean);
            mgetDevices = await userDevicesCache.mget(usersToFetch);
        }
        for (const { jid, user } of jidsWithUser) {
            if (useCache) {
                const devices = mgetDevices?.[user] ||
                    (userDevicesCache.mget ? undefined : (await userDevicesCache.get(user)));
                if (devices) {
                    const devicesWithJid = devices.map(d => ({
                        ...d,
                        jid: jidEncode(d.user, d.server, d.device)
                    }));
                    deviceResults.push(...devicesWithJid);
                    logger.trace({ user }, 'using cache for devices');
                }
                else {
                    toFetch.push(jid);
                }
            }
            else {
                toFetch.push(jid);
            }
        }
        if (!toFetch.length) {
            return deviceResults;
        }
        const requestedLidUsers = new Set();
        for (const jid of toFetch) {
            if (isLidUser(jid) || isHostedLidUser(jid)) {
                const user = jidDecode(jid)?.user;
                if (user)
                    requestedLidUsers.add(user);
            }
        }
        const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol();
        for (const jid of toFetch) {
            query.withUser(new USyncUser().withId(jid));
        }
        const result = await sock.executeUSyncQuery(query);
        if (result) {
            const lidResults = result.list.filter(a => !!a.lid);
            if (lidResults.length > 0) {
                logger.trace('Storing LID maps from device call');
                await signalRepository.lidMapping.storeLIDPNMappings(lidResults.map(a => ({ lid: a.lid, pn: a.id })));
                try {
                    const lids = lidResults.map(a => a.lid);
                    if (lids.length) {
                        await assertSessions(lids, true);
                    }
                }
                catch (e) {
                    logger.warn({ e, count: lidResults.length }, 'failed to assert sessions for newly mapped LIDs');
                }
            }
            const extracted = extractDeviceJids(result?.list, authState.creds.me.id, authState.creds.me.lid, ignoreZeroDevices);
            const deviceMap = {};
            for (const item of extracted) {
                deviceMap[item.user] = deviceMap[item.user] || [];
                deviceMap[item.user]?.push(item);
            }
            for (const [user, userDevices] of Object.entries(deviceMap)) {
                const isLidUser = requestedLidUsers.has(user);
                for (const item of userDevices) {
                    const finalJid = isLidUser
                        ? jidEncode(user, item.server, item.device)
                        : jidEncode(item.user, item.server, item.device);
                    deviceResults.push({
                        ...item,
                        jid: finalJid
                    });
                    logger.debug({
                        user: item.user,
                        device: item.device,
                        finalJid,
                        usedLid: isLidUser
                    }, 'Processed device with LID priority');
                }
            }
            await devicesMutex.mutex(async () => {
                if (userDevicesCache.mset) {
                    await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })));
                }
                else {
                    for (const key in deviceMap) {
                        if (deviceMap[key])
                            await userDevicesCache.set(key, deviceMap[key]);
                    }
                }
            });
            const userDeviceUpdates = {};
            for (const [userId, devices] of Object.entries(deviceMap)) {
                if (devices && devices.length > 0) {
                    userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0');
                }
            }
            if (Object.keys(userDeviceUpdates).length > 0) {
                try {
                    await authState.keys.set({ 'device-list': userDeviceUpdates });
                    logger.debug({ userCount: Object.keys(userDeviceUpdates).length }, 'stored user device lists for bulk migration');
                }
                catch (error) {
                    logger.warn({ error }, 'failed to store user device lists');
                }
            }
        }
        return deviceResults;
    };

    const updateMemberLabel = (jid, memberLabel) => {
        return relayMessage(jid, {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE,
                memberLabel: {
                    label: memberLabel?.slice(0, 30),
                    labelTimestamp: unixTimestampSeconds()
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {
                        tag_reason: 'user_update',
                        appdata: 'member_tag'
                    },
                    content: undefined
                }
            ]
        });
    };

    const assertSessions = async (jids, force) => {
        let didFetchNewSession = false;
        const uniqueJids = [...new Set(jids)];
        const jidsRequiringFetch = [];
        logger.debug({ jids }, 'assertSessions call with jids');
        for (const jid of uniqueJids) {
            if (!force) {
                const sessionValidation = await signalRepository.validateSession(jid);
                if (sessionValidation.exists) {
                    continue;
                }
            }
            jidsRequiringFetch.push(jid);
        }
        if (jidsRequiringFetch.length) {
            const wireJids = [
                ...jidsRequiringFetch.filter(jid => !!isLidUser(jid) || !!isHostedLidUser(jid)),
                ...((await signalRepository.lidMapping.getLIDsForPNs(jidsRequiringFetch.filter(jid => !!isPnUser(jid) || !!isHostedPnUser(jid)))) || []).map(a => a.lid),
                // @bot endpoints are not represented by LID/PN USync results,
                // but still require a pre-key fetch to build the Signal session.
                ...jidsRequiringFetch.filter(jid => isJidMetaAI(jid) || isJidBot(jid))
            ];
            logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions');
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: S_WHATSAPP_NET
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: wireJids.map(jid => {
                            const attrs = { jid };
                            if (force)
                                attrs.reason = 'identity';
                            return { tag: 'user', attrs };
                        })
                    }
                ]
            });
            await parseAndInjectE2ESessions(result, signalRepository);
            didFetchNewSession = true;
        }
        return didFetchNewSession;
    };

    const sendPeerDataOperationMessage = async (pdoMessage) => {
        if (!authState.creds.me?.id) {
            throw new Boom('Not authenticated');
        }
        const protocolMessage = {
            protocolMessage: {
                peerDataOperationRequestMessage: pdoMessage,
                type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
            }
        };
        const meJid = jidNormalizedUser(authState.creds.me.id);
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                push_priority: 'high_force'
            },
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: { appdata: 'default' }
                }
            ]
        });
        return msgId;
    };

    const createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
        if (!recipientJids.length) {
            return { nodes: [], shouldIncludeDeviceIdentity: false };
        }
        const patched = await patchMessageBeforeSending(message, recipientJids);
        const patchedMessages = Array.isArray(patched)
            ? patched
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));
        let shouldIncludeDeviceIdentity = false;
        const meId = authState.creds.me.id;
        const meLid = authState.creds.me?.lid;
        const meLidUser = meLid ? jidDecode(meLid)?.user : null;
        const encryptionPromises = patchedMessages.map(async ({ recipientJid: jid, message: patchedMessage }) => {
            try {
                if (!jid)
                    return null;
                let msgToEncrypt = patchedMessage;
                if (dsmMessage) {
                    const { user: targetUser } = jidDecode(jid);
                    const { user: ownPnUser } = jidDecode(meId);
                    const ownLidUser = meLidUser;
                    const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser);
                    const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                    if (isOwnUser && !isExactSenderDevice) {
                        msgToEncrypt = dsmMessage;
                        logger.debug({ jid, targetUser }, 'Using DSM for own device');
                    }
                }
                const bytes = encodeWAMessage(msgToEncrypt);
                const mutexKey = jid;
                const node = await encryptionMutex.mutex(mutexKey, async () => {
                    const { type, ciphertext } = await signalRepository.encryptMessage({ jid, data: bytes });
                    if (type === 'pkmsg') {
                        shouldIncludeDeviceIdentity = true;
                    }
                    return {
                        tag: 'to',
                        attrs: { jid },
                        content: [
                            {
                                tag: 'enc',
                                attrs: { v: '2', type, ...(extraAttrs || {}) },
                                content: ciphertext
                            }
                        ]
                    };
                });
                return node;
            }
            catch (err) {
                logger.error({ jid, err }, 'Failed to encrypt for recipient');
                return null;
            }
        });
        const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null);
        if (recipientJids.length > 0 && nodes.length === 0) {
            throw new Boom('All encryptions failed', { statusCode: 500 });
        }
        return { nodes, shouldIncludeDeviceIdentity };
    };

        const relayMessage = async (jid, message, { messageId: msgId, participant, participants: retryParticipantsOption, retryParticipants: retryParticipantsExplicit, isSecret = false, protected: protectedSend = false, me: meOnly = false, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, addBizAttributes, statusJidList, statusPrivacy, mediaTypeOverride }) => {
        const meId = assertMeId(authState.creds);
        const meLid = authState.creds.me?.lid;
        const retryParticipants = retryParticipantsExplicit || retryParticipantsOption || (participant?.count != null ? participant : undefined);
        const isRetryResend = Boolean(retryParticipants?.jid && retryParticipants?.count != null);
        const isRecipientOnly = Boolean(participant?.jid && !isRetryResend);
        let shouldIncludeDeviceIdentity = isRetryResend;
        const statusJid = 'status@broadcast';
        const { user, server } = jidDecode(jid);
        const isGroup = server === 'g.us';
        const isStatus = jid === statusJid;
        const isLid = server === 'lid';
        const isNewsletter = server === 'newsletter';
        const isGroupOrStatus = isGroup || isStatus;
        const finalJid = jid;
        msgId = msgId || generateMessageIDV2(meId);
        useUserDevicesCache = useUserDevicesCache !== false;
        useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus;
        const participants = [];
        const destinationJid = !isStatus ? finalJid : statusJid;
        const binaryNodeContent = [];
        const devices = [];
        let reportingMessage;
        const requiresViewOnce = !!(message.buttonsMessage || message.templateMessage || message.listMessage || message.interactiveMessage);
        if (requiresViewOnce) {
            message = {
                viewOnceMessage: {
                    message: { ...message }
                }
            };
        }
        const applyForwarded = m => {
            // Auto-inject trusted verification proofs configured once on the socket
            // (config.metaAiRendering.verificationMetadata). Per-message proofs win:
            // an envelope that already carries verificationMetadata is left untouched.
            // The second target covers edited rich envelopes (protocolMessage.editedMessage,
            // used by updateRichGeneration) so an in-place rich update keeps its proofs too.
            const edited = m?.botForwardedMessage?.message?.protocolMessage?.editedMessage;
            const rich = m?.botForwardedMessage?.message?.richResponseMessage || m?.richResponseMessage;
            if (!rich && !edited) return m;
            if (hasVerifiableProofs(config?.metaAiRendering?.verificationMetadata)) {
                attachBotVerificationProofs(m, config.metaAiRendering.verificationMetadata);
                attachBotVerificationProofs(edited, config.metaAiRendering.verificationMetadata);
            }
            if (!rich) return m;
            rich.contextInfo = { ...rich.contextInfo, isForwarded: true, forwardOrigin: 4 };
            return m.botForwardedMessage ? m : { botForwardedMessage: { message: m } };
        };
        if (message?.deviceSentMessage?.message) {
            message.deviceSentMessage.message = applyForwarded(message.deviceSentMessage.message);
        }
        else {
            message = applyForwarded(message);
        }
        const meMsg = {
            deviceSentMessage: {
                destinationJid,
                message
            },
            messageContextInfo: message.messageContextInfo
        };
        const extraAttrs = {};
        if (isRetryResend) {
            if (!isGroup && !isStatus) {
                additionalAttributes = { ...additionalAttributes, device_fanout: 'false' };
            }
            const { user, device } = jidDecode(retryParticipants.jid);
            devices.push({ user, device, jid: retryParticipants.jid });
        }
        if ((isRecipientOnly || isSecret || protectedSend || meOnly) && !isGroup && !isStatus) {
            additionalAttributes = { ...additionalAttributes, device_fanout: 'false' };
        }
        await authState.keys.transaction(async () => {
            const innerMessage = normalizeMessageContent(message);
            const mediaType = getMediaType(innerMessage) || mediaTypeOverride;
            if (mediaType) {
                extraAttrs['mediatype'] = mediaType;
            }
            if (isNewsletter) {
                const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message;
                const bytes = encodeNewsletterMessage(patched);
                if (additionalNodes && additionalNodes.length > 0) {
                    binaryNodeContent.push(...additionalNodes);
                }
                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: extraAttrs,
                    content: bytes
                });
                const stanza = {
                    tag: 'message',
                    attrs: {
                        to: jid,
                        id: msgId,
                        type: getMessageType(innerMessage),
                        ...(additionalAttributes || {})
                    },
                    content: binaryNodeContent
                };
                logger.debug({ msgId }, `sending newsletter message to ${jid}`);
                await sendNode(stanza);
                return;
            }
            const isNeedMetaAttrs = innerMessage?.pinInChatMessage || innerMessage?.keepInChatMessage || innerMessage?.reactionMessage;
            const isGroupStatus = message?.groupStatusMessage || message?.groupStatusMessageV2;
            const isPollUpdate = innerMessage?.pollUpdateMessage;
            if (isNeedMetaAttrs || isGroupStatus || isPollUpdate) {
                const metaAttrs = {};
                if (isNeedMetaAttrs) {
                    metaAttrs.content_type = 'add_on';
                }
                if (isPollUpdate && !isGroupStatus) {
                    metaAttrs.polltype = 'vote';
                }
                if (isGroupStatus) {
                    metaAttrs.is_group_status = 'true';
                }
                binaryNodeContent.push({
                    tag: 'meta',
                    attrs: metaAttrs,
                    content: undefined
                });
            }
            if (isStatus && statusPrivacy && !additionalAttributes?.edit) {
                binaryNodeContent.push({
                    tag: 'meta',
                    attrs: { status_setting: statusPrivacy, session_scope: 'status' }
                });
            }
            if (isNeedMetaAttrs || innerMessage?.protocolMessage?.memberLabel || innerMessage?.protocolMessage?.editedMessage || innerMessage?.protocolMessage?.mediaNotifyMessage) {
                extraAttrs['decrypt-fail'] = 'hide';
            }
            if (innerMessage?.interactiveResponseMessage?.nativeFlowResponseMessage) {
                extraAttrs['native_flow_name'] = innerMessage.interactiveResponseMessage.nativeFlowResponseMessage.name;
            }
            if (isGroupOrStatus && !isRetryResend) {
                const [groupData, senderKeyMap] = await Promise.all([
                    (async () => {
                        let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined;
                        if (groupData && Array.isArray(groupData?.participants)) {
                            logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata');
                        }
                        else if (!isStatus) {
                            groupData = await groupMetadata(jid);
                        }
                        return groupData;
                    })(),
                    (async () => {
                        if (!participant && !isStatus) {
                            const result = await authState.keys.get('sender-key-memory', [jid]);
                            return result[jid] || {};
                        }
                        return {};
                    })()
                ]);
                const participantsList = groupData ? groupData.participants.map(p => p.id) : [];
                if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
                    additionalAttributes = {
                        ...additionalAttributes,
                        expiration: groupData.ephemeralDuration.toString()
                    };
                }
                if (isStatus && statusJidList) {
                    participantsList.push(...statusJidList);
                }
                // Bots invoked through botGroupMetadata are not group members,
                // so include their @bot endpoints in sender-key distribution.
                const botGroupParticipants = message?.messageContextInfo?.botMetadata?.botGroupMetadata?.participantsMetadata || [];
                for (const participant of botGroupParticipants) {
                    if (!participant?.botFbid)
                        continue;
                    const botJid = `${participant.botFbid}@bot`;
                    if (!participantsList.includes(botJid))
                        participantsList.push(botJid);
                }
                const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                devices.push(...additionalDevices);
                if (isGroup) {
                    additionalAttributes = {
                        ...additionalAttributes,
                        addressing_mode: groupData?.addressingMode || 'lid'
                    };
                }
                const patched = await patchMessageBeforeSending(message);
                if (Array.isArray(patched)) {
                    throw new Boom('Per-jid patching is not supported in groups');
                }
                const bytes = encodeWAMessage(patched);
                reportingMessage = patched;
                const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid';
                const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId;
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId: groupSenderIdentity
                });
                const senderKeyRecipients = [];
                for (const device of devices) {
                    const deviceJid = device.jid;
                    const hasKey = !!senderKeyMap[deviceJid];
                    const isBotRecipient = isJidMetaAI(deviceJid) || isJidBot(deviceJid);
                    if ((!hasKey || !!participant || isBotRecipient) &&
                        !isHostedLidUser(deviceJid) &&
                        !isHostedPnUser(deviceJid) &&
                        device.device !== 99) {
                        senderKeyRecipients.push(deviceJid);
                        senderKeyMap[deviceJid] = true;
                    }
                }
                if (senderKeyRecipients.length) {
                    logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key');
                    const senderKeyMsg = {
                        senderKeyDistributionMessage: {
                            axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                            groupId: destinationJid
                        }
                    };
                    const senderKeySessionTargets = senderKeyRecipients;
                    await assertSessions(senderKeySessionTargets);
                    const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs);
                    shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity;
                    participants.push(...result.nodes);
                }
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: { v: '2', type: 'skmsg', ...extraAttrs },
                    content: ciphertext
                });
                await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } });
            }
            else {
                let ownId = meId;
                if (isLid && meLid) {
                    ownId = meLid;
                    logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation');
                }
                else {
                    logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation');
                }
                const { user: ownUser } = jidDecode(ownId);
                if (!participant) {
                    const patchedForReporting = await patchMessageBeforeSending(message, [jid]);
                    reportingMessage = Array.isArray(patchedForReporting)
                        ? patchedForReporting.find(item => item.recipientJid === jid) || patchedForReporting[0]
                        : patchedForReporting;
                }
                if (!isRetryResend) {
                    const targetUserServer = isLid ? 'lid' : 's.whatsapp.net';
                    devices.push({
                        user,
                        device: 0,
                        jid: jidEncode(user, targetUserServer, 0)
                    });
                    if (user !== ownUser) {
                        const ownUserServer = isLid ? 'lid' : 's.whatsapp.net';
                        const ownUserForAddressing = isLid && meLid ? jidDecode(meLid).user : jidDecode(meId).user;
                        devices.push({
                            user: ownUserForAddressing,
                            device: 0,
                            jid: jidEncode(ownUserForAddressing, ownUserServer, 0)
                        });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        devices.length = 0;
                        const senderIdentity = isLid && meLid
                            ? jidEncode(jidDecode(meLid)?.user, 'lid', undefined)
                            : jidEncode(jidDecode(meId)?.user, 's.whatsapp.net', undefined);
                        const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false);
                        devices.push(...sessionDevices);
                        logger.debug({
                            deviceCount: devices.length,
                            devices: devices.map(d => `${d.user}:${d.device}@${jidDecode(d.jid)?.server}`)
                        }, 'Device enumeration complete with unified addressing');
                    }
                }
                const allRecipients = [];
                const meRecipients = [];
                const otherRecipients = [];
                const { user: mePnUser } = jidDecode(meId);
                const { user: meLidUser } = meLid ? jidDecode(meLid) : { user: null };
                for (const { user, jid } of devices) {
                    const isExactSenderDevice = jid === meId || (meLid && jid === meLid);
                    if (isExactSenderDevice) {
                        logger.debug({ jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)');
                        continue;
                    }
                    const isMe = user === mePnUser || user === meLidUser;
                    const hasDevice = jid.includes(':');
                    if (isRecipientOnly && isMe) continue;
                    if (isSecret && !(!isMe && !hasDevice)) continue;
                    if (protectedSend && !isMe && hasDevice) continue;
                    if (meOnly && !isMe) continue;
                    if (isMe) {
                        meRecipients.push(jid);
                    }
                    else {
                        otherRecipients.push(jid);
                    }
                    allRecipients.push(jid);
                }
                await assertSessions(allRecipients);
                const [{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 }, { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }] = await Promise.all([
                    createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
                    createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
                ]);
                participants.push(...meNodes);
                participants.push(...otherNodes);
                if (meRecipients.length > 0 || otherRecipients.length > 0) {
                    extraAttrs['phash'] = generateParticipantHashV2([...meRecipients, ...otherRecipients]);
                }
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2;
            }
            if (isRetryResend) {
                const isParticipantLid = isLidUser(retryParticipants.jid);
                const isMe = areJidsSameUser(retryParticipants.jid, isParticipantLid ? meLid : meId);
                let messageToSend = message;
                if (isGroupOrStatus) {
                    let groupSenderIdentity;
                    if (meLid && (await signalRepository.hasSenderKey({ group: destinationJid, meId: meLid }))) {
                        groupSenderIdentity = meLid;
                    }
                    else if (await signalRepository.hasSenderKey({ group: destinationJid, meId })) {
                        groupSenderIdentity = meId;
                    }
                    if (groupSenderIdentity) {
                        try {
                            const skdm = await signalRepository.getSenderKeyDistributionMessage({
                                group: destinationJid,
                                meId: groupSenderIdentity
                            });
                            messageToSend = {
                                ...message,
                                senderKeyDistributionMessage: {
                                    groupId: destinationJid,
                                    axolotlSenderKeyDistributionMessage: skdm
                                }
                            };
                        }
                        catch (err) {
                            logger.warn({ err, jid: destinationJid }, 'failed to build SKDM for retry, sending without it');
                        }
                    }
                }
                const encodedMessageToSend = isMe
                    ? encodeWAMessage({
                        deviceSentMessage: {
                            destinationJid,
                            message: messageToSend
                        }
                    })
                    : encodeWAMessage(messageToSend);
                const { type, ciphertext: encryptedContent } = await signalRepository.encryptMessage({
                    data: encodedMessageToSend,
                    jid: retryParticipants.jid
                });
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: {
                        v: '2',
                        type,
                            count: retryParticipants.count.toString()
                    },
                    content: encryptedContent
                });
            }
            if (participants.length) {
                if (additionalAttributes?.['category'] === 'peer') {
                    const peerNode = participants[0]?.content?.[0];
                    if (peerNode) {
                        binaryNodeContent.push(peerNode);
                    }
                }
                else {
                    binaryNodeContent.push({
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    });
                }
            }
            const stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    to: destinationJid,
                    type: getMessageType(innerMessage),
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            };
            if (isRetryResend) {
                if (isJidGroup(destinationJid)) {
                    stanza.attrs.to = destinationJid;
                    stanza.attrs.participant = retryParticipants.jid;
                }
                else if (areJidsSameUser(retryParticipants.jid, meId)) {
                    stanza.attrs.to = retryParticipants.jid;
                    stanza.attrs.recipient = destinationJid;
                }
                else {
                    stanza.attrs.to = retryParticipants.jid;
                }
            }
            else {
                stanza.attrs.to = destinationJid;
            }
            if (shouldIncludeDeviceIdentity) {
                stanza.content.push({
                    tag: 'device-identity',
                    attrs: {},
                    content: encodeSignedDeviceIdentity(authState.creds.account, true)
                });
                logger.debug({ jid }, 'adding device identity');
            }
            if (!isNewsletter &&
                !isRetryResend &&
                reportingMessage?.messageContextInfo?.messageSecret &&
                shouldIncludeReportingToken(reportingMessage)) {
                try {
                    const encoded = encodeWAMessage(reportingMessage);
                    const reportingKey = {
                        id: msgId,
                        fromMe: true,
                        remoteJid: destinationJid,
                        participant: retryParticipants?.jid
                    };
                    const reportingNode = await getMessageReportingToken(encoded, reportingMessage, reportingKey);
                    if (reportingNode) {
                        stanza.content.push(reportingNode);
                        logger.trace({ jid }, 'added reporting token to message');
                    }
                }
                catch (error) {
                    logger.warn({ jid, trace: error?.stack }, 'failed to attach reporting token');
                }
            }
            const isPeerMessage = additionalAttributes?.['category'] === 'peer';
            const is1on1Send = !isGroup && !isRetryResend && !isStatus && !isNewsletter && !isPeerMessage;
            const tcTokenJid = is1on1Send ? await resolveTcTokenJid(destinationJid, getLIDForPN) : destinationJid;
            const contactTcTokenData = is1on1Send ? await authState.keys.get('tctoken', [tcTokenJid]) : {};
            const existingTokenEntry = contactTcTokenData[tcTokenJid];
            let tcTokenBuffer = existingTokenEntry?.token;
            if (tcTokenBuffer?.length && isTcTokenExpired(existingTokenEntry?.timestamp)) {
                logger.debug({ jid: destinationJid, timestamp: existingTokenEntry?.timestamp }, 'tctoken expired, clearing');
                tcTokenBuffer = undefined;
                const cleared = existingTokenEntry?.senderTimestamp !== undefined
                    ? { token: Buffer.alloc(0), senderTimestamp: existingTokenEntry.senderTimestamp }
                    : null;
                try {
                    await authState.keys.set({ tctoken: { [tcTokenJid]: cleared } });
                }
                catch (err) {
                    logger.debug({ jid: destinationJid, err: err?.message }, 'failed to persist tctoken expiry cleanup');
                }
            }
            if (tcTokenBuffer?.length && sock.serverProps.privacyTokenOn1to1) {
                stanza.content.push({
                    tag: 'tctoken',
                    attrs: {},
                    content: tcTokenBuffer
                });
            }
            let alreadyHasBizNode = false;
            if (additionalNodes && additionalNodes.length > 0) {
                stanza.content.push(...additionalNodes);
                alreadyHasBizNode = !addBizAttributes &&
                    additionalNodes.some(node => node.tag === 'biz');
            }
            if ((!alreadyHasBizNode && shouldIncludeBizBinaryNode(innerMessage)) || addBizAttributes) {
                const bizNode = getBizBinaryNode(innerMessage, addBizAttributes);
                stanza.content.push(bizNode);
            }
            logger.debug({ msgId }, `sending message to ${participants.length} devices`);
            await sendNode(stanza);
            const isProtocolMsg = !!innerMessage?.protocolMessage;
            if (!isProtocolMsg && !isJidNewsletter(destinationJid)) {
                try {
                    await config.messageSecurityStore?.recordSent(
                        msgId,
                        destinationJid,
                        authState.creds.me?.id,
                        undefined,
                        authState.creds.me?.lid
                    );
                }
                catch (error) {
                    logger.warn({ msgId, error }, 'unable to persist sent message ID for security checks');
                }
            }
            const isBotOrPSA = destinationJid === PSA_WID || isJidBot(destinationJid) || isJidMetaAI(destinationJid);
            if (is1on1Send &&
                !isProtocolMsg &&
                !isBotOrPSA &&
                shouldSendNewTcToken(existingTokenEntry?.senderTimestamp) &&
                !inFlightTcTokenIssuance.has(tcTokenJid)) {
                inFlightTcTokenIssuance.add(tcTokenJid);
                const issueTimestamp = unixTimestampSeconds();
                const getPNForLID = signalRepository.lidMapping.getPNForLID.bind(signalRepository.lidMapping);
                resolveIssuanceJid(destinationJid, sock.serverProps.lidTrustedTokenIssueToLid, getLIDForPN, getPNForLID)
                    .then(issueJid => issuePrivacyTokens([issueJid], issueTimestamp))
                    .then(async (result) => {
                    await storeTcTokensFromIqResult({
                        result,
                        fallbackJid: tcTokenJid,
                        keys: authState.keys,
                        getLIDForPN
                    });
                    const currentData = await authState.keys.get('tctoken', [tcTokenJid]);
                    const currentEntry = currentData[tcTokenJid];
                    const indexWrite = await buildMergedTcTokenIndexWrite(authState.keys, [tcTokenJid]);
                    await authState.keys.set({
                        tctoken: {
                            [tcTokenJid]: {
                                token: Buffer.alloc(0),
                                ...currentEntry,
                                senderTimestamp: issueTimestamp
                            },
                            ...indexWrite
                        }
                    });
                })
                    .catch(err => {
                    logger.debug({ jid: destinationJid, err: err?.message }, 'fire-and-forget tctoken issuance failed');
                })
                    .finally(() => {
                    inFlightTcTokenIssuance.delete(tcTokenJid);
                });
            }
            if (messageRetryManager && !retryParticipants) {
                messageRetryManager.addRecentMessage(destinationJid, msgId, message);
            }
        }, meId);
        return msgId;
    };

    /**
     * Relay a rich envelope and then replay it as a type-14 edit. Some
     * WhatsApp clients otherwise show a Download prompt before rendering the
     * AIRich unifiedResponse. The edit is only applied to bot-forwarded rich
     * envelopes, so ordinary messages are never duplicated accidentally.
     * Set renderRichResponse: false for callers that explicitly do not want
     * the compatibility replay.
     */
    const relayRichMessage = async (jid, fullMsg, options = {}) => {
        const relayOptions = {
            messageId: fullMsg.key.id,
            useCachedGroupMetadata: options.useCachedGroupMetadata,
            statusJidList: options.statusJidList,
            ...options.relayOptions,
        };
        await relayMessage(jid, fullMsg.message, relayOptions);

        const richEnvelope = fullMsg.message?.botForwardedMessage?.message?.richResponseMessage;
        if (options.renderRichResponse !== false && (richEnvelope || options.forceRichEdit || fullMsg.message?.interactiveMessage?.bloksWidget)) {
            const editContent = proto.Message.fromObject({
                botForwardedMessage: {
                    message: {
                        protocolMessage: {
                            key: {
                                remoteJid: jid,
                                fromMe: true,
                                id: fullMsg.key.id,
                            },
                            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                            editedMessage: fullMsg.message,
                        },
                    },
                },
            });
            const editMessage = generateWAMessageFromContent(jid, editContent, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: generateMessageIDV2(authState.creds.me?.id || jid),
            });
            await relayMessage(jid, editMessage.message, {
                ...relayOptions,
                messageId: editMessage.key.id,
            });
        }
        return fullMsg;
    };

    const sendImagePoll = async (jid, poll, sendOptions = {}) => {
        const userJid = authState.creds.me.id;
        const { additionalNodes: _callerNodes, ...relayBaseOptions } = sendOptions;
        return generateWAMessageFromImagePoll(jid, poll, async (message, relayOptions, fullMessage) => {
            await relayMessage(jid, message, {
                ...relayBaseOptions,
                useCachedGroupMetadata: sendOptions.useCachedGroupMetadata,
                statusJidList: sendOptions.statusJidList,
                statusPrivacy: sendOptions.statusPrivacy,
                ...relayOptions
            });
            if (config.emitOwnEvents && fullMessage) {
                process.nextTick(async () => {
                    await messageMutex.mutex(() => upsertMessage(fullMessage, 'append'));
                });
            }
        }, {
            logger,
            userJid,
            upload: waUploadToServer,
            mediaCache: config.mediaCache,
            options: config.options,
            ...sendOptions
        });
    };
    const sendLivePhoto = async (jid, content, quoted, sendOptions = {}) => {
        const userJid = authState.creds.me?.id;
        const {
            relayOptions: callerRelayOptions = {},
            photo_live: _photoLive,
            photoLive: _photoLiveCamel,
            thumbnail: _thumbnail,
            image: _image,
            videoThumbnail: _videoThumbnail,
            motionPhotoPresentationOffsetMs: _motionOffset,
            presentationOffsetMs: _presentationOffset,
            ...transportOptions
        } = sendOptions;
        const mediaOptions = {
            logger,
            userJid,
            upload: waUploadToServer,
            mediaCache: config.mediaCache,
            options: config.options,
            ...transportOptions,
            ...(quoted ? { quoted } : {})
        };
        return generateWAMessageFromLivePhoto(jid, content, async (message, relayOpts, fullMessage) => {
            await relayMessage(jid, message, {
                ...transportOptions,
                ...callerRelayOptions,
                useCachedGroupMetadata: sendOptions.useCachedGroupMetadata,
                statusJidList: sendOptions.statusJidList,
                statusPrivacy: sendOptions.statusPrivacy,
                messageId: relayOpts.messageId
            });
            if (config.emitOwnEvents && fullMessage) {
                process.nextTick(async () => {
                    await messageMutex.mutex(() => upsertMessage(fullMessage, 'append'));
                });
            }
        }, mediaOptions);
    };
    const getMessageType = (message) => {
        if (!message)
            return 'text';
        if (message.reactionMessage || message.encReactionMessage) {
            return 'reaction';
        }
        if (message.pollCreationMessage ||
            message.pollCreationMessageV2 ||
            message.pollCreationMessageV3 ||
            message.pollCreationMessageV5 ||
            message.pollCreationMessageV6 ||
            message.pollUpdateMessage) {
            return 'poll';
        }
        if (message.eventMessage) {
            return 'event';
        }
        if (getMediaType(message) !== '') {
            return 'media';
        }
        return 'text';
    };

    const getMediaType = (message) => {
        if (message.imageMessage) {
            return 'image';
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video';
        }
        else if (message.stickerMessage) {
            return message.stickerMessage.isLottie ? '1p_sticker' : message.stickerMessage.isAvatar ? 'avatar_sticker' : 'sticker';
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio';
        }
        else if (message.albumMessage) {
            return 'collection';
        }
        else if (message.contactMessage) {
            return 'vcard';
        }
        else if (message.documentMessage) {
            return 'document';
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array';
        }
        else if (message.liveLocationMessage) {
            return 'livelocation';
        }
        else if (message.stickerPackMessage) {
            return 'sticker_pack';
        }
        else if (message.listMessage) {
            return 'list';
        }
        else if (message.listResponseMessage) {
            return 'list_response';
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response';
        }
        else if (message.orderMessage) {
            return 'order';
        }
        else if (message.productMessage) {
            return 'product';
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response';
        }
        else if (message.extendedTextMessage?.matchedText || message.groupInviteMessage) {
            return 'url';
        }
        else if ((message.extendedTextMessage?.text || message.conversation || '').includes('://wa.me/c/')) {
            return 'cataloglink';
        }
        else if ((message.extendedTextMessage?.text || message.conversation || '').includes('://wa.me/p/')) {
            return 'productlink';
        }
        return '';
    };

    const issuePrivacyTokens = async (jids, timestamp) => {
        const t = (timestamp ?? unixTimestampSeconds()).toString();
        const result = await query({
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: jidNormalizedUser(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        });
        return result;
    };

    const waUploadToServer = getWAUploadToServer(config, refreshMediaConn);
    const baron2 = new Baron(waUploadToServer, relayMessage, config, sock);
    const waitForMsgMediaUpdate = bindWaitForEvent(ev, 'messages.media-update');

    const resolveStatusRecipients = async (provided) => {
        let recipients = provided || config.statusJidList;
        if (!recipients && typeof config.getStatusJidList === 'function') {
            recipients = await config.getStatusJidList(sock);
        }
        if (!recipients) {
            const contactSource = config.store?.contacts || config.contactStore?.contacts || config.contacts;
            if (Array.isArray(contactSource)) {
                recipients = contactSource;
            }
            else if (contactSource && typeof contactSource === 'object') {
                recipients = Object.keys(contactSource);
            }
        }
        const ownJid = authState.creds.me?.id;
        try {
            return normalizeStatusJidList([...(recipients || []), ownJid].filter(Boolean));
        }
        catch (error) {
            throw new Boom('sendStatus requires a non-empty statusJidList or a configured contact source/provider', {
                statusCode: 400,
                data: { hint: 'Pass statusJidList, config.statusJidList, config.getStatusJidList, or config.store.contacts' },
                cause: error
            });
        }
    };

    registerSocketEndHandler(() => {
        if (!config.userDevicesCache && userDevicesCache.close) {
            userDevicesCache.close();
        }
        mediaConn = undefined;
        if (messageRetryManager) {
            messageRetryManager.clear();
        }
    });

    socket = {
        ...sock,
        userDevicesCache,
        devicesMutex,
        issuePrivacyTokens,
        assertSessions,
        relayMessage,
        sendReceipt,
        sendReceipts,
        readMessages,
        refreshMediaConn,
        getMediaHost: () => mediaHost,
        waUploadToServer,
        fetchPrivacySettings,
        sendPeerDataOperationMessage,
        createParticipantNodes,
        getUSyncDevices,
        messageRetryManager,
        updateMemberLabel,
        sendBulkReactions,  // ← NEW: Bulk reaction helper
        sendAsMimic,
        // Native status mention path. The array-jid sendMessage branch expands
        // group recipients, emits mentioned_users metadata, and sends the
        // follow-up statusMentionMessage/groupStatusMentionMessage reference.
        sendStatusMention: async (content, jids = [], options = {}) => {
            if (!Array.isArray(jids) || jids.length === 0) {
                throw new Boom('sendStatusMention requires at least one user or group JID', { statusCode: 400 });
            }
            return socket.sendMessage(jids, {
                ...content,
                status: true
            }, options);
        },
        sendStatusMentions: async (content, jids = [], options = {}) => {
            if (!Array.isArray(jids) || jids.length === 0) {
                throw new Boom('sendStatusMentions requires at least one user or group JID', { statusCode: 400 });
            }
            return socket.sendMessage(jids, {
                ...content,
                status: true
            }, options);
        },
        sendTable: async (jid, title, headers, rows, quoted, options = {}) => {
            const { message, messageId } = generateTableContent(title, headers, rows, quoted, options);
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        /**
         * Send a table as a GenATableUXPrimitive in unifiedResponse, rather
         * than as the legacy Table preview submessage used by sendTable.
         */
        sendUnifiedTable: async (jid, title, headers, rows, quoted, options = {}) => {
            if (!Array.isArray(headers) || !Array.isArray(rows)) {
                throw new Boom('sendUnifiedTable requires headers and rows arrays', { statusCode: 400 });
            }
            const message = prepareRichResponseMessage({
                headerText: options.headerText,
                title,
                table: [headers, ...rows],
                footerText: options.footerText,
                noHeading: false,
                noDonation: true
            });
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        sendList: async (jid, title, items, quoted, options = {}) => {
            const { message, messageId } = generateListContent(title, items, quoted, options);
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        sendCodeBlock: async (jid, code, quoted, options = {}) => {
            const { message, messageId } = generateCodeBlockContent(code, quoted, options);
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        sendCarousel: async (jid, cards, quotedOrOptions = {}, maybeOptions = undefined) => {
            if (!Array.isArray(cards) || cards.length === 0) {
                throw new Boom('sendCarousel requires a non-empty card array', { statusCode: 400 });
            }
            // Support both X4R1S3's original (jid, cards, options) form and
            // the compatibility form used by working carousel helpers:
            // (jid, cards, quoted, options).
            const hasQuotedSignature = maybeOptions !== undefined;
            const quoted = hasQuotedSignature ? quotedOrOptions : undefined;
            const options = hasQuotedSignature ? (maybeOptions || {}) : (quotedOrOptions || {});
            const normalizedCards = cards.map(card => ({
                ...card,
                text: card.text ?? card.body?.text,
                caption: card.caption ?? card.body?.text,
                footer: card.footer?.text ?? card.footer,
                nativeFlow: card.nativeFlow ?? card.nativeFlowMessage?.buttons ?? card.buttons ?? [],
                ...(card.header?.imageMessage ? { image: typeof card.header.imageMessage === 'string' ? { url: card.header.imageMessage } : card.header.imageMessage } : {}),
                ...(card.header?.videoMessage ? { video: typeof card.header.videoMessage === 'string' ? { url: card.header.videoMessage } : card.header.videoMessage } : {}),
                ...(card.media?.image ? { image: card.media.image } : {}),
                ...(card.media?.video ? { video: card.media.video } : {}),
                ...(card.media?.document ? { document: card.media.document } : {}),
                ...(card.header?.title ? { title: card.title ?? card.header.title } : {}),
                ...(card.header?.subtitle ? { subtitle: card.subtitle ?? card.header.subtitle } : {})
            }));
            const { text, content, footer, ...messageOptions } = options;
            delete messageOptions.carouselCardType;
            const fullMsg = await generateWAMessage(jid, {
                ...messageOptions,
                cards: normalizedCards,
                ...((text ?? content) !== undefined ? { text: text ?? content } : {}),
                ...(footer !== undefined ? { footer } : {})
            }, {
                logger,
                userJid,
                upload: waUploadToServer,
                mediaCache: config.mediaCache,
                options: config.options,
                ...options,
                ...(quoted ? { quoted } : {}),
                messageId: options.messageId || generateMessageIDV2(jid)
            });
            const additionalNodes = [...(options.additionalNodes || [])];
            await relayMessage(jid, fullMsg.message, {
                ...options,
                messageId: fullMsg.key.id,
                additionalNodes
            });
            return fullMsg;
        },
        /** Send legacy reply buttons with an optional single media or location header. */
        replyButton: async (jid, buttons, quotedOrOptions = {}, maybeOptions = undefined) => {
            if (!jid) throw new Boom('replyButton requires a target JID', { statusCode: 400 });
            if (!Array.isArray(buttons) || buttons.length === 0) {
                throw new Boom('replyButton requires at least one button', { statusCode: 400 });
            }
            const hasQuotedSignature = !!(quotedOrOptions?.key && quotedOrOptions?.message);
            const quoted = hasQuotedSignature ? quotedOrOptions : undefined;
            const options = hasQuotedSignature ? (maybeOptions || {}) : (maybeOptions || quotedOrOptions || {});
            const normalizeButton = (button, index) => {
                if (!button || typeof button !== 'object') {
                    throw new Boom(`replyButton button ${index + 1} must be an object`, { statusCode: 400 });
                }
                const label = button.text || button.buttonText || button.displayText || `Option ${index + 1}`;
                if (button.sections) {
                    return {
                        name: 'single_select',
                        paramsJson: JSON.stringify({ title: label, sections: button.sections })
                    };
                }
                if (button.name) {
                    return {
                        ...button,
                        paramsJson: typeof button.paramsJson === 'string'
                            ? button.paramsJson
                            : JSON.stringify(button.params || {})
                    };
                }
                if (button.url) {
                    return {
                        name: 'cta_url',
                        paramsJson: JSON.stringify({
                            display_text: label,
                            url: button.url,
                            merchant_url: button.merchantUrl || button.url
                        })
                    };
                }
                if (button.call || button.phoneNumber) {
                    return {
                        name: 'cta_call',
                        paramsJson: JSON.stringify({ display_text: label, phone_number: button.call || button.phoneNumber })
                    };
                }
                if (button.copy || button.copyCode) {
                    return {
                        name: 'cta_copy',
                        paramsJson: JSON.stringify({ display_text: label, copy_code: button.copy || button.copyCode })
                    };
                }
                const id = button.command || button.id || button.buttonId;
                if (!id) throw new Boom(`replyButton button ${index + 1} needs an id, command, or native-flow action`, { statusCode: 400 });
                return { text: label, id, ...(button.type != null ? { type: button.type } : {}) };
            };
            const location = options.location;
            const documentOptions = options.document && typeof options.document === 'object' ? options.document : {};
            const media = options.media ?? options.image ?? options.video ?? options.document?.url;
            const hasExplicitMedia = options.image != null || options.video != null || options.document != null || options.media != null;
            if (location && hasExplicitMedia) {
                throw new Boom('replyButton accepts one header attachment; choose either location or media', { statusCode: 400 });
            }
            if (hasExplicitMedia && media == null) {
                throw new Boom('replyButton media header requires an image, video, or document source', { statusCode: 400 });
            }
            const content = { buttons: buttons.map(normalizeButton) };
            if (options.footer !== undefined) content.footer = options.footer;
            if (options.title !== undefined) content.title = options.title;
            const text = options.text ?? options.caption ?? '';
            if (location) {
                content.location = {
                    ...location,
                    ...(location.description && !location.address ? { address: location.description } : {})
                };
                content.caption = text;
            }
            else if (hasExplicitMedia) {
                const source = media == null ? options.document : media;
                const sourceName = String(options.filename || documentOptions.filename || (typeof source === 'string' ? source : source?.url || '')).toLowerCase();
                const mimeType = options.mimetype || documentOptions.mimetype || source?.mimetype || '';
                const extension = sourceName.split(/[?#]/)[0].split('.').pop();
                let mediaType = options.mediaType || (options.document ? 'document' : options.video ? 'video' : undefined);
                if (!mediaType) {
                    mediaType = mimeType.startsWith('video/') || ['mp4', 'mov', 'm4v', '3gp'].includes(extension) ? 'video' : 'image';
                }
                if (!['image', 'video', 'document'].includes(mediaType)) {
                    throw new Boom('replyButton mediaType must be image, video, or document', { statusCode: 400 });
                }
                const mediaInput = typeof source === 'string' ? { url: source } : source;
                content[mediaType] = mediaInput;
                if (mediaType === 'document') {
                    content.fileName = options.filename || documentOptions.filename || 'file';
                    if (mimeType) content.mimetype = mimeType;
                }
                content.caption = text;
            }
            else {
                content.text = text;
            }
            const {
                text: _text, caption: _caption, footer: _footer, title: _title,
                location: _location, media: _media, image: _image, video: _video,
                document: _document, filename: _filename, mimetype: _mimetype,
                mediaType: _mediaType, sendOptions: nestedSendOptions = {},
                ...transportOptions
            } = options;
            return socket.sendMessage(jid, content, {
                ...transportOptions,
                ...nestedSendOptions,
                ...(quoted ? { quoted } : {})
            });
        },
        /** Send a motion photo from its video and optional still image/thumbnail. */
        sendPhotoLive: async (jid, content, quoted, options = {}) => {
            if (!jid) throw new Boom('sendPhotoLive requires a target JID', { statusCode: 400 });
            return sendLivePhoto(jid, content, quoted, options);
        },
        /** Send a file; `photo_live: true` pairs a still with its motion-video child. */
        sendFile: async (jid, media, filename = '', caption = '', quoted, options = {}) => {
            if (!jid) throw new Boom('sendFile requires a target JID', { statusCode: 400 });
            if (options.photo_live || options.photoLive) {
                return sendLivePhoto(jid, {
                    video: media,
                    image: options.image,
                    thumbnail: options.thumbnail,
                    videoThumbnail: options.videoThumbnail,
                    caption,
                    motionPhotoPresentationOffsetMs: options.motionPhotoPresentationOffsetMs ?? options.presentationOffsetMs
                }, quoted, options);
            }
            const sourceName = String(filename || options.fileName || (typeof media === 'string' ? media : media?.url || '')).toLowerCase();
            const extension = sourceName.split(/[?#]/)[0].split('.').pop();
            const mimeType = options.mimetype || media?.mimetype || '';
            const mediaType = options.mediaType || (options.document ? 'document' : mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(extension) ? 'image' : ['mp4', 'mov', 'm4v', '3gp', 'webm'].includes(extension) ? 'video' : ['mp3', 'ogg', 'opus', 'wav', 'm4a', 'aac'].includes(extension) ? 'audio' : 'document');
            if (!['image', 'video', 'audio', 'document'].includes(mediaType)) {
                throw new Boom('sendFile mediaType must be image, video, audio, or document', { statusCode: 400 });
            }
            const source = typeof media === 'string' ? { url: media } : media;
            const message = {
                [mediaType]: source,
                caption,
                ...(filename || options.fileName ? { fileName: filename || options.fileName } : {}),
                ...(mimeType ? { mimetype: mimeType } : {}),
                ...(mediaType === 'audio' && options.ptt ? { ptt: true } : {})
            };
            const { photo_live: _photoLive, photoLive: _photoLiveCamel, thumbnail: _thumbnail, ...sendOptions } = options;
            return socket.sendMessage(jid, message, {
                ...sendOptions,
                ...(quoted ? { quoted } : {})
            });
        },
        /** Send or edit a textual progress bar; pass messageKey to update in place. */
        sendProgress: async (jid, text, quotedOrOptions = {}, maybeOptions = undefined) => {
            if (!jid) throw new Boom('sendProgress requires a target JID', { statusCode: 400 });
            const hasQuotedSignature = !!(quotedOrOptions?.key && quotedOrOptions?.message);
            const quoted = hasQuotedSignature ? quotedOrOptions : undefined;
            const options = hasQuotedSignature ? (maybeOptions || {}) : (maybeOptions || quotedOrOptions || {});
            const progress = Number(options.progress ?? 0);
            if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
                throw new Boom('sendProgress progress must be between 0 and 100', { statusCode: 400 });
            }
            const width = Math.max(4, Math.min(40, Math.floor(Number(options.width) || 12)));
            const percent = Math.round(progress);
            const filled = Math.round(width * percent / 100);
            const bar = `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${percent}%`;
            const content = { text: `${String(text || '')}${text ? '\n' : ''}${bar}` };
            const messageKey = options.messageKey || options.editKey;
            if (messageKey) content.edit = messageKey;
            const {
                progress: _progress, width: _width, messageKey: _messageKey, editKey: _editKey,
                sendOptions: nestedSendOptions = {}, ...sendOptions
            } = options;
            return socket.sendMessage(jid, content, {
                ...sendOptions,
                ...nestedSendOptions,
                ...(quoted ? { quoted } : {})
            });
        },
        /** Send text with a custom external preview card (thumbnail, title, URL and attribution). */
        sendMessageModify: async (jid, text, quotedOrOptions = {}, maybeOptions = undefined) => {
            if (!jid) throw new Boom('sendMessageModify requires a target JID', { statusCode: 400 });
            const hasQuotedSignature = !!(quotedOrOptions?.key && quotedOrOptions?.message);
            const quoted = hasQuotedSignature ? quotedOrOptions : undefined;
            const options = hasQuotedSignature ? (maybeOptions || {}) : (maybeOptions || quotedOrOptions || {});
            const thumbnail = options.thumbnail;
            const thumbnailSource = typeof thumbnail === 'string' ? thumbnail : thumbnail?.url;
            const thumbnailUrl = thumbnailSource && /^https?:\/\//i.test(thumbnailSource)
                ? thumbnailSource
                : options.thumbnailUrl || options.originalImageUrl;
            let thumbnailBuffer;
            if (Buffer.isBuffer(thumbnail) || thumbnail instanceof Uint8Array) {
                thumbnailBuffer = Buffer.from(thumbnail);
            }
            else if (typeof thumbnailSource === 'string' && !/^https?:\/\//i.test(thumbnailSource)) {
                try {
                    thumbnailBuffer = (await extractImageThumb(thumbnailSource, 192)).buffer;
                }
                catch (error) {
                    throw new Boom(`sendMessageModify could not read thumbnail: ${error.message}`, { statusCode: 400 });
                }
            }
            const externalAdReply = {
                title: options.title || '',
                body: options.description || options.body || '',
                mediaType: thumbnailBuffer || thumbnailUrl ? 1 : 0,
                ...(thumbnailBuffer ? { thumbnail: thumbnailBuffer } : {}),
                ...(thumbnailUrl ? { thumbnailUrl, originalImageUrl: thumbnailUrl } : {}),
                ...(options.url ? { mediaUrl: options.url, sourceUrl: options.url } : {}),
                showAdAttribution: options.ads ?? false,
                renderLargerThumbnail: options.largeThumb ?? options.largeThumbnail ?? true
            };
            const message = {
                text: String(text ?? ''),
                externalAdReply,
                ...(options.icon ? { favicon: typeof options.icon === 'string' ? { url: options.icon } : options.icon } : {})
            };
            const {
                title: _title, description: _description, body: _body, url: _url,
                thumbnail: _thumbnailValue, thumbnailUrl: _thumbnailUrl,
                originalImageUrl: _originalImageUrl, icon: _icon,
                ads: _ads, largeThumb: _largeThumb, largeThumbnail: _largeThumbnail,
                ratio: _ratio, type: _type, sendOptions: nestedSendOptions = {},
                ...transportOptions
            } = options;
            return socket.sendMessage(jid, message, {
                ...transportOptions,
                ...nestedSendOptions,
                ...(quoted ? { quoted } : {})
            });
        },
        /** Compatibility alias for sendMessageModify. */
        sendMessageModifyV2: async (jid, text, quotedOrOptions = {}, maybeOptions = undefined) =>
            socket.sendMessageModify(jid, text, quotedOrOptions, maybeOptions),
        sendLatex: async (jid, quoted, options = {}) => {
            const { message, messageId } = generateLatexContent(quoted, { expressions: [], ...options });
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        /**
         * Send LaTeX as rendered PNG image (like Meta AI does).
         * Uses codecogs.com to render LaTeX to PNG, then sends as rich response.
         * @param {string} jid - Chat JID
         * @param {object} options - { text, expressions: [{ latexExpression }], headerText, footer }
         */
        sendLatexImage: async (jid, options = {}) => {
            const { text, expressions = [], headerText, footer } = options;
            const renderedExpressions = expressions.map(expr => {
                const latex = expr.latexExpression || expr.expression || expr;
                // Encode LaTeX for codecogs URL
                const encoded = encodeURIComponent(latex).replace(/'/g, '%27');
                const url = `https://latex.codecogs.com/png.latex?${encoded}`;
                return {
                    latexExpression: latex,
                    url,
                    width: expr.width || 400,
                    height: expr.height || 100
                };
            });
            const { message, messageId } = generateLatexContent(null, {
                text,
                expressions: renderedExpressions,
                headerText,
                footer
            });
            const fullMsg = generateWAMessageFromContent(jid, message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || messageId || generateMessageIDV2(jid),
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        sendMetaAI: async (a, b, c = {}) => {
            // Supports both (text, opts) and the historical (jid, text, opts)
            // call shape. The payload below mirrors the verified WA-Web Hatch send.
            const legacySignature = typeof b === 'string';
            const text = legacySignature ? b : a;
            const opts = legacySignature ? c : (b || {});
            const META_AI_BOT_JID = '867051314767696@bot';
            const META_AI_FBID = '867051314767696';
            const jid = opts.jid || META_AI_BOT_JID;
            const isGroup = jid.endsWith('@g.us');
            const invokerJid = opts.invokerJid || authState.creds.me?.id;
            const messageSecret = opts.messageSecret || randomBytes(32);
            const rendering = {
                bloksVersioningId: 'd7c89519fd412464e4a4ddd60b2e5fa57c5000766a697d60835246ef0952daba',
                pixelDensity: 2.625
            };
            const botMetadata = isGroup
                ? {
                    botGroupMetadata: {
                        participantsMetadata: [{ botFbid: opts.botFbid || META_AI_FBID }]
                    },
                    botRenderingConfigMetadata: rendering
                }
                : {
                    personaId: jid,
                    invokerJid,
                    sessionMetadata: {
                        sessionId: opts.sessionId || randomUUID(),
                        sessionSource: 3
                    },
                    capabilityMetadata: {
                        capabilities: opts.capabilities || Array.from({ length: 72 }, (_, i) => i + 1)
                    },
                    botMetricsMetadata: {
                        destinationId: jid,
                        destinationEntryPoint: 2
                    }
                };
            const content = isGroup
                ? (opts.mention
                    ? { extendedTextMessage: { text, contextInfo: { mentionedJid: [META_AI_BOT_JID] } } }
                    : { conversation: text })
                : { extendedTextMessage: { text } };
            const message = {
                ...content,
                messageContextInfo: {
                    messageSecret,
                    botMetadata,
                    ...(opts.conversationContext?.length ? { aiConversationContext: opts.conversationContext } : {})
                }
            };
            const msgId = generateMessageIDV2(invokerJid || '');
            const relayOptions = {
                messageId: msgId,
                ...(opts.quoted ? { quoted: opts.quoted } : {}),
                ...(opts.links ? { links: opts.links } : {}),
                additionalNodes: [{
                    tag: 'bot',
                    attrs: {
                        persona_type: opts.personaType || 'default',
                        agent_engagement_type: opts.agentEngagementType || (isGroup ? 'group_chat' : 'direct_chat'),
                        mode_selected: opts.modeSelected || '0'
                    }
                }]
            };
            await relayMessage(jid, message, relayOptions);
            return msgId;
        },
        // Additive New-compatible AI-rich helpers. Existing Gen4/table/grid/carousel APIs remain unchanged.
        sendRichMedia: async (jid, content = {}, quoted, options = {}) => {
            const contentMessage = prepareRichResponseMessage({ ...content, noDonation: options.noDonation ?? true });
            const generated = generateWAMessageFromContent(jid, contentMessage, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, generated, options);
            return { ...generated, messageId: generated.key.id };
        },
        /**
         * Send native X4R1S3 rich media with the additive New compatibility field
         * compatibility sections enabled. The native serializer is retained.
         */
        sendNewRichMedia: async (jid, content = {}, quoted, options = {}) => {
            return socket.sendRichMedia(jid, { ...content, compatibility: 'both' }, quoted, options);
        },
        /**
         * Send a native AI image/video generation card. The returned messageId
         * is required by updateRichGeneration() for an in-place edit.
         */
        sendRichGeneration: async (jid, content = {}, quoted, options = {}) => {
            const generated = prepareRichGenerationMessage({
                ...content,
                responseId: options.responseId,
                forwarded: options.forwarded !== false
            });
            const fullMsg = generateWAMessageFromContent(jid, generated.message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || generated.messageId || generateMessageIDV2(jid),
                quoted,
                ...options,
            });
            await relayRichMessage(jid, fullMsg, options);
            return { ...generated, messageId: fullMsg.key.id };
        },
        /**
         * Replace the generation primitive in an existing rich response.
         * This uses WhatsApp's edit protocol (type 14), matching the native
         * rich-message replacement lifecycle used by compatible clients.
         */
        updateRichGeneration: async (jid, targetId, content = {}, options = {}) => {
            if (!jid) throw new Boom('updateRichGeneration requires a target JID', { statusCode: 400 });
            if (!targetId) throw new Boom('updateRichGeneration requires the original message ID', { statusCode: 400 });
            const generated = prepareRichGenerationMessage({
                ...content,
                responseId: options.responseId,
                itemId: options.itemId || content.itemId,
                forwarded: options.forwarded !== false
            });
            const editedMessage = generateWAMessageFromContent(jid, {
                botForwardedMessage: {
                    message: {
                        protocolMessage: {
                            key: { remoteJid: jid, fromMe: true, id: targetId },
                            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                            editedMessage: generated.message
                        }
                    }
                }
            }, { messageId: generateMessageIDV2(jid) });
            await relayMessage(jid, editedMessage.message, { messageId: editedMessage.key.id });
            return { ...generated, messageId: editedMessage.key.id, targetId };
        },
        sendReels: async (jid, reels, quoted, options = {}) => socket.sendRichMedia(jid, { contentText: options.text || '', reels }, quoted, options),
        sendRichSources: async (jid, text, sources, quoted, options = {}) => socket.sendRichMedia(jid, { contentText: text, sources }, quoted, options),
        sendLink: async (jid, text, links, quoted, options = {}) => socket.sendRichSources(jid, text, links, quoted, options),
        sendLinkV2: async (jid, text, links, quoted, options = {}) => socket.sendRichSources(jid, text, links, quoted, options),
        sendRichAIResponse: async (jid, content, quoted, options = {}) => {
            const generated = generateRichAIResponseContent(content, quoted, options);
            const fullMsg = generateWAMessageFromContent(jid, generated.message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || generated.messageId || generateMessageIDV2(jid),
                quoted,
                ...options
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        /**
         * Send one tolerant AIRich/unified response containing every supported
         * section present in `content`. An exclusive { a2ui: ... } payload is
         * also routed to the interactive A2UI sender. AIRich and A2UI cannot be
         * combined into one WhatsApp message envelope.
         */
        sendX4R1S3Message: async (jid, content = {}, quoted, options = {}) => {
            if (!jid) throw new Boom('sendX4R1S3Message requires a target JID', { statusCode: 400 });
            if (!content || typeof content !== 'object' || Array.isArray(content)) {
                throw new Boom('sendX4R1S3Message content must be an object', { statusCode: 400 });
            }

            if (Object.hasOwn(content, 'a2ui')) {
                const { a2ui, ...otherContent } = content;
                if (!a2ui || typeof a2ui !== 'object' || Array.isArray(a2ui)) {
                    throw new Boom('sendX4R1S3Message a2ui must be an A2UI content object', { statusCode: 400 });
                }
                if (Object.keys(otherContent).length) {
                    throw new Boom('sendX4R1S3Message accepts either AIRich sections or an exclusive { a2ui } payload; the two message envelopes cannot be combined', { statusCode: 400 });
                }
                return socket.sendA2UIMessage(jid, a2ui, {
                    ...options,
                    quoted: options.quoted ?? quoted
                });
            }

            const wrapped = prepareRichResponseMessage({
                ...content,
                // Avoid silently appending the library donation link to a
                // unified response unless the caller explicitly opts in.
                noDonation: options.noDonation ?? true,
            });
            const fullMsg = generateWAMessageFromContent(jid, wrapped, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
                quoted,
                ...options,
            });

            await relayRichMessage(jid, fullMsg, options);

            if (config.emitOwnEvents) {
                process.nextTick(async () => {
                    await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                });
            }
            return fullMsg;
        },
        /**
         * Send a non-interactive themed text card inside one AIRich unified
         * response. Optional rich media fields are composed into that
         * same response by sendX4R1S3Message; this helper never adds menu buttons.
         */
        sendUnifiedThemedMessage: async (jid, content = {}, quoted, options = {}) => {
            if (!jid) throw new Boom('sendUnifiedThemedMessage requires a target JID', { statusCode: 400 });
            const normalized = normalizeUnifiedThemedMessageContent(content);
            return socket.sendX4R1S3Message(jid, normalized, quoted, options);
        },
        /**
         * Send a compact forwarded AIRich label bubble. This preserves the
         * base64 unified-response wire shape used by direct relayMessage calls.
         */
        sendRichLabelMessage: async (jid, content = {}, options = {}) => {
            if (!jid) throw new Boom('sendRichLabelMessage requires a target JID', { statusCode: 400 });
            if (!content || typeof content !== 'object' || Array.isArray(content)) {
                throw new Boom('sendRichLabelMessage content must be an object', { statusCode: 400 });
            }
            const message = buildRichLabelMessage(content);
            await relayMessage(jid, message, options);
            return message;
        },
        captureAndResendUnifiedResponse: async (jid, metaAiMsg, quoted, options = {}) => {
            const captured = captureUnifiedResponse(metaAiMsg);
            if (!captured) {
                throw new Boom('captureAndResendUnifiedResponse: message contains no unifiedResponse data');
            }
            const generated = generateUnifiedResponseContent(quoted, captured);
            const fullMsg = generateWAMessageFromContent(jid, generated.message, {
                logger,
                userJid: authState.creds.me?.id,
                messageId: generated.messageId || generateMessageIDV2(jid),
                quoted
            });
            await relayRichMessage(jid, fullMsg, options);
            return fullMsg;
        },
        updateMediaMessage: async (message) => {
            const content = assertMediaContent(message.message);
            const mediaKey = content.mediaKey;
            const meId = authState.creds.me.id;
            const node = encryptMediaRetryRequest(message.key, mediaKey, meId);
            let error = undefined;
            await Promise.all([
                sendNode(node),
                waitForMsgMediaUpdate(async (update) => {
                    const result = update.find(c => c.key.id === message.key.id);
                    if (result) {
                        if (result.error) {
                            error = result.error;
                        }
                        else {
                            try {
                                const media = decryptMediaRetryData(result.media, mediaKey, result.key.id);
                                if (media.result !== proto.MediaRetryNotification.ResultType.SUCCESS) {
                                    const resultStr = proto.MediaRetryNotification.ResultType[media.result];
                                    throw new Boom(`Media re-upload failed by device (${resultStr})`, {
                                        data: media,
                                        statusCode: getStatusCodeForMediaRetry(media.result) || 404
                                    });
                                }
                                content.directPath = media.directPath;
                                content.url = getUrlFromDirectPath(content.directPath, mediaHost);
                                logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful');
                            }
                            catch (err) {
                                error = err;
                            }
                        }
                        return true;
                    }
                })
            ]);
            if (error) {
                throw error;
            }
            ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }]);
            return message;
        },
        /**
         * Send a prompt to the Meta AI bot in `jid` and resolve with the
         * decrypted bot response (text, image or video message).
         *
         * - In an AI group: the bot is @-mentioned with its participant JID
         *   (resolved from metadata, falling back to the canonical `@bot` JID).
         * - In a 1:1 bot chat: `jid` is the bot JID itself.
         *
         * The returned message is the complete decrypted response — the msmsg
         * pipeline already drops streaming partials and only surfaces `full`/
         * `last` bot responses, so media (image/video) and text both arrive
         * whole. Download media with `downloadMediaMessage(msg)`.
         *
         * Options:
         *   timeout     — ms to wait before rejecting (default 60000)
         *   onPartial   — optional callback(updateMessage, key) fired for bot
         *                 message edits in the chat (best-effort streaming)
         *   botUser     — canonical bot JID (default META_AI_BOT_JID)
         *   mentions    — extra JIDs to mention alongside the bot
         *   ...rest     — forwarded to sendMessage (quoted, linkPreview, ...)
         */
        aiPrompt: async (jid, prompt, options = {}) => {
            const {
                timeout = 60_000,
                onPartial,
                botUser = META_AI_BOT_JID,
                mentions = [],
                ...sendOptions
            } = options;
            if (!jid || typeof prompt !== 'string' || !prompt.trim()) {
                throw new Error('aiPrompt requires a chat JID and a non-empty prompt');
            }

            const botJids = await collectMetaAIBotParticipantJids(sock, jid, botUser);
            const isGroup = isJidGroup(jid);
            const allMentions = [...new Set([...mentions, ...botJids])];

            return new Promise((resolve, reject) => {
                let promptId;
                let settled = false;
                const cleanup = () => {
                    clearTimeout(timer);
                    ev.off('messages.upsert', onUpsert);
                    if (typeof onPartial === 'function') {
                        ev.off('messages.update', onUpdate);
                    }
                };
                const settle = (fn, value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    fn(value);
                };

                const timer = setTimeout(
                    () => settle(reject, new Error(`aiPrompt timed out after ${timeout}ms waiting for Meta AI in ${jid}`)),
                    timeout
                );

                const onUpsert = ({ messages }) => {
                    for (const msg of messages) {
                        if (isMetaAIBotResponse(msg, jid, promptId, [...botJids])) {
                            settle(resolve, msg);
                            return;
                        }
                    }
                };

                const onUpdate = ({ updates }) => {
                    if (typeof onPartial !== 'function') {
                        return;
                    }
                    for (const update of updates) {
                        if (!update.key || update.key.fromMe || update.key.remoteJid !== jid) {
                            continue;
                        }
                        const sender = (update.key.participant || update.key.remoteJid).replace(/:\d+$/, '');
                        const isBot =
                            isJidMetaAI(sender) ||
                            [...botJids].some(j => jidNormalizedUser(j.replace(/:\d+$/, '')) === jidNormalizedUser(sender));
                        if (isBot && update.message) {
                            onPartial(update.message, update.key);
                        }
                    }
                };

                ev.on('messages.upsert', onUpsert);
                if (typeof onPartial === 'function') {
                    ev.on('messages.update', onUpdate);
                }

                const content = { text: prompt };
                if (isGroup) {
                    content.mentions = allMentions;
                }
                Object.assign(content, sendOptions);
                (async () => {
                    try {
                        const fullMsg = await generateWAMessage(jid, content, {
                            logger,
                            userJid: authState.creds.me.id,
                            upload: waUploadToServer,
                            mediaCache: config.mediaCache,
                            options: config.options,
                            ...sendOptions,
                            messageId: sendOptions.messageId || generateMessageIDV2(authState.creds.me.id)
                        });
                        await relayMessage(jid, fullMsg.message, {
                            messageId: fullMsg.key.id,
                            useCachedGroupMetadata: sendOptions.useCachedGroupMetadata,
                            statusJidList: sendOptions.statusJidList
                        });
                        if (config.emitOwnEvents) {
                            process.nextTick(async () => {
                                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                            });
                        }
                        promptId = fullMsg.key.id;
                    }
                    catch (err) {
                        settle(reject, err);
                    }
                })();
            });
        },
        /**
         * Schedule Baileys-generated content using WhatsApp's native
         * conditional-reveal envelope. `scheduledAt` accepts a Date, ISO-8601
         * string, or Unix timestamp in seconds/milliseconds. Use `livePhoto`
         * or `pairedMedia` for associated multi-message media.
         */
        scheduleMessage: async (jid, content, scheduledAt, options = {}) => {
            if (typeof jid !== 'string' || !jid) {
                throw new Boom('scheduleMessage requires a chat JID', { statusCode: 400 });
            }
            if (!(isJidGroup(jid) || isPnUser(jid) || isLidUser(jid) || isHostedPnUser(jid) || isHostedLidUser(jid))) {
                throw new Boom('Native scheduled messages are only supported for direct chats and groups', { statusCode: 400 });
            }
            if (!content || typeof content !== 'object' || Array.isArray(content)) {
                throw new Boom('scheduleMessage requires a Baileys message content object', { statusCode: 400 });
            }

            const livePhotoFlag = content.livePhoto === true || content.photo_live === true || content.photoLive === true;
            const livePhotoContent = content.livePhoto && typeof content.livePhoto === 'object'
                ? content.livePhoto
                : livePhotoFlag
                    ? Object.fromEntries(Object.entries(content).filter(([key]) => !['livePhoto', 'photo_live', 'photoLive'].includes(key)))
                    : undefined;
            const pairedMedia = content.pairedMedia;
            if (livePhotoContent && pairedMedia) {
                throw new Boom('Provide either livePhoto or pairedMedia, not both', { statusCode: 400 });
            }

            const assertSingleMessageContent = messageContent => {
                if (!messageContent || typeof messageContent !== 'object' || Array.isArray(messageContent)) {
                    throw new Boom('Each scheduled media pair item must be a Baileys message content object', { statusCode: 400 });
                }
                if ('album' in messageContent || (Array.isArray(messageContent.poll?.values) && messageContent.poll.values.some(value => value && typeof value === 'object' && value.image))) {
                    throw new Boom('Native scheduled messages currently accept single-message pair items; albums and image polls are multi-message sends', { statusCode: 400 });
                }
                if (messageContent.poll?.pollType) {
                    throw new Boom('Quiz polls are only allowed for newsletters', { statusCode: 400 });
                }
            };

            if (livePhotoContent) {
                if (!livePhotoContent.video) {
                    throw new Boom('livePhoto requires a video source', { statusCode: 400 });
                }
            }
            else if (pairedMedia) {
                if (!pairedMedia || typeof pairedMedia !== 'object' || Array.isArray(pairedMedia)) {
                    throw new Boom('pairedMedia must contain parent and child message content', { statusCode: 400 });
                }
                assertSingleMessageContent(pairedMedia.parent);
                assertSingleMessageContent(pairedMedia.child);
            }
            else {
                assertSingleMessageContent(content);
            }

            // Validate before media preparation/upload; the envelope builder
            // revalidates after generation in case preparation took a long time.
            normalizeScheduledTime(scheduledAt);
            const userJid = authState.creds.me.id;
            const generationOptions = {
                logger,
                userJid,
                getUrlInfo: text => getUrlInfo(text, {
                    thumbnailWidth: linkPreviewImageThumbnailWidth,
                    fetchOpts: { timeout: 3000, ...(httpRequestOptions || {}) },
                    logger,
                    uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
                }),
                getProfilePicUrl: sock.profilePictureUrl,
                getCallLink: sock.createCallLink,
                upload: waUploadToServer,
                mediaCache: config.mediaCache,
                options: config.options,
                ...options
            };
            const prepareSingleMessage = async (messageContent, messageId) => {
                const normalizedContent = { ...messageContent };
                const isNeedBizAttrs = Boolean(normalizedContent.secureMetaServiceLabel);
                delete normalizedContent.secureMetaServiceLabel;
                const fullMsg = await generateWAMessage(jid, normalizedContent, {
                    ...generationOptions,
                    messageId: messageId || generateMessageIDV2(userJid)
                });
                return { fullMsg, isNeedBizAttrs };
            };
            const relayScheduledMessage = async (fullMsg, semanticContent, isNeedBizAttrs = false, scheduleNow = Date.now()) => {
                const scheduledMediaType = getMediaType(normalizeMessageContent(fullMsg.message));
                const schedule = createScheduledMessageEnvelope(fullMsg.message, scheduledAt, { now: scheduleNow });
                fullMsg.message = schedule.content;
                fullMsg.scheduledMessageMetadata = {
                    revealKeyId: schedule.revealKeyId,
                    revealKey: schedule.revealKey,
                    scheduledTime: String(schedule.scheduledTime)
                };

                const additionalNodes = [...(options.additionalNodes || [])];
                if (!isJidGroup(jid) && !additionalNodes.some(node => node?.tag === 'bot')) {
                    additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
                }
                if (semanticContent?.poll) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: { polltype: semanticContent.poll.pollType ? 'quiz_creation' : 'creation' }
                    });
                }
                if (semanticContent?.event) {
                    additionalNodes.push({ tag: 'meta', attrs: { event_type: 'creation' } });
                }
                additionalNodes.push(schedule.additionalNode);

                await relayMessage(jid, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    useCachedGroupMetadata: options.useCachedGroupMetadata,
                    addBizAttributes: isNeedBizAttrs,
                    statusJidList: options.statusJidList,
                    statusPrivacy: options.statusPrivacy,
                    mediaTypeOverride: scheduledMediaType,
                    additionalAttributes: options.additionalAttributes,
                    additionalNodes
                });

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            };

            if (livePhotoContent) {
                const scheduledMessages = [];
                let pairScheduleNow;
                const parent = await generateWAMessageFromLivePhoto(jid, livePhotoContent, async (_message, _relayOptions, fullMsg) => {
                    pairScheduleNow ??= Date.now();
                    scheduledMessages.push(await relayScheduledMessage(fullMsg, livePhotoContent, false, pairScheduleNow));
                }, generationOptions);
                const child = scheduledMessages.find(message => message.key.id !== parent.key.id);
                if (child) {
                    parent.pairedMessage = child;
                }
                return parent;
            }

            if (pairedMedia) {
                const associationType = typeof pairedMedia.associationType === 'string'
                    ? proto.MessageAssociation.AssociationType[pairedMedia.associationType]
                    : pairedMedia.associationType ?? proto.MessageAssociation.AssociationType.MOTION_PHOTO;
                if (!Number.isInteger(associationType) || associationType <= 0 || !proto.MessageAssociation.AssociationType[associationType]) {
                    throw new Boom('pairedMedia.associationType must be a known MessageAssociation type', { statusCode: 400 });
                }
                const parent = await prepareSingleMessage(pairedMedia.parent, options.messageId || generateMessageIDV2(userJid));
                const child = await prepareSingleMessage(pairedMedia.child, generateMessageIDV2(userJid));
                associateScheduledMessages(parent.fullMsg, child.fullMsg, associationType);
                const pairScheduleNow = Date.now();
                await relayScheduledMessage(parent.fullMsg, pairedMedia.parent, parent.isNeedBizAttrs, pairScheduleNow);
                await relayScheduledMessage(child.fullMsg, pairedMedia.child, child.isNeedBizAttrs, pairScheduleNow);
                parent.fullMsg.pairedMessage = child.fullMsg;
                return parent.fullMsg;
            }

            const { fullMsg, isNeedBizAttrs } = await prepareSingleMessage(content, options.messageId || generateMessageIDV2(userJid));
            return relayScheduledMessage(fullMsg, content, isNeedBizAttrs);
        },
        sendMessage: async (jid, content, options = {}) => {
            const userJid = authState.creds.me.id;
            const pollValues = content?.poll?.values;
            if (Array.isArray(pollValues) && pollValues.some(value => value && typeof value === 'object' && value.image)) {
                return sendImagePoll(jid, content.poll, options);
            }
            if (content?.groupStatus === true && !isJidGroup(jid)) {
                throw new Boom('groupStatus requires a valid group JID', { statusCode: 400 });
            }

            // ── X4R1S3 FLAG (Auto-Heal) ──
            if (content && typeof content === 'object' && content.X4R1S3 === true) {
                const { X4R1S3: _, retry = {}, fallback = {}, filterSystem = true, ...restContent } = content;

                if (!sock.messageRetryManager) {
                    sock.messageRetryManager = new MessageRetryManager(logger, retry.maxAttempts || 3);
                }

                options.maxRetries = retry.maxAttempts || 3;

                if (retry.onMacError === 'recreateSession') {
                    options.recreateOnMacError = true;
                }

                if (fallback.type === 'phone') {
                    options.fallbackToPhone = true;
                    options.fallbackTimeout = fallback.timeout || 10000;
                }

                const result = await originalSend(jid, restContent, options);
                return result;
            }

            // ── MIMIC FLAG ──
            if (content && typeof content === 'object' && content.mimic) {
                const { mimic: mimicJid, admin = false, ...restContent } = content;

                if (!mimicJid) {
                    throw new Error('mimic JID is required');
                }

                return await sendAsMimic(jid, restContent, mimicJid, { ...options, admin });
            }

            // ── BULK REACTION FLAG (NEW - Doesn't override original react) ──
            if (content && typeof content === 'object' && content.bulkReact) {
                const { bulkReact: emoji, messageId, count = 1, fake = false } = content;

                if (!messageId) {
                    throw new Error('messageId is required for bulkReact');
                }

                return await sendBulkReactions(jid, messageId, emoji, count, fake);
            }

            // ── STATUS MESSAGES ──
            if (Array.isArray(jid)) {
                const { delayMs = 1500 } = options;
                const allUsers = new Set([jidNormalizedUser(userJid)]);
                const statusMentionContent = { ...content };
                const isStatusMedia = Boolean(statusMentionContent.image || statusMentionContent.video || statusMentionContent.audio);
                if (isStatusMedia && statusMentionContent.text && !statusMentionContent.caption) {
                    statusMentionContent.caption = statusMentionContent.text;
                    delete statusMentionContent.text;
                }
                const fullMsg = await generateWAMessage('status@broadcast', statusMentionContent, {
                    logger,
                    userJid,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    messageId: generateMessageIDV2(userJid)
                });
                for (const id of jid) {
                    if (isJidGroup(id)) {
                        try {
                            const groupData = (cachedGroupMetadata ? await cachedGroupMetadata(id) : null) || await groupMetadata(id);
                            for (const participant of groupData.participants) {
                                if (allUsers.has(participant.id))
                                    continue;
                                allUsers.add(jidNormalizedUser(participant.id));
                            }
                        }
                        catch (error) {
                            logger.error(`Error getting metadata group from ${id}: ${error}`);
                        }
                    }
                    else if (!allUsers.has(jidNormalizedUser(id))) {
                        allUsers.add(jidNormalizedUser(id));
                    }
                }
                await relayMessage('status@broadcast', fullMsg.message, {
                    messageId: fullMsg.key.id,
                    statusJidList: Array.from(allUsers),
                    additionalNodes: [
                        {
                            tag: 'meta',
                            attrs: {},
                            content: [
                                {
                                    tag: 'mentioned_users',
                                    attrs: {},
                                    content: jid.map(id => ({
                                        tag: 'to',
                                        attrs: { jid: jidNormalizedUser(id) },
                                        content: undefined
                                    }))
                                }
                            ]
                        }
                    ]
                });
                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                for (const id of jid) {
                    const isGroup = isJidGroup(id);
                    const sendType = isGroup ? 'groupStatusMentionMessage' : 'statusMentionMessage';
                    const mentionMsg = generateWAMessageFromContent(id, {
                        messageContextInfo: {
                            messageSecret: randomBytes(32)
                        },
                        [sendType]: {
                            message: {
                                protocolMessage: {
                                    key: fullMsg.key,
                                    type: 25
                                }
                            }
                        }
                    }, {
                        userJid
                    });
                    await relayMessage(id, mentionMsg.message, {
                        additionalNodes: [
                            {
                                tag: 'meta',
                                attrs: isGroup ?
                                    { is_group_status_mention: 'true' } :
                                    { is_status_mention: 'true' },
                                content: undefined
                            }
                        ]
                    });
                    if (config.emitOwnEvents) {
                        process.nextTick(async () => {
                            await messageMutex.mutex(() => upsertMessage(mentionMsg, 'append'));
                        });
                    }
                    await delay(delayMs);
                }
                return fullMsg;
            }
            else if ('disappearingMessagesInChat' in content && isJidGroup(jid)) {
                const { disappearingMessagesInChat } = content;
                const value = typeof disappearingMessagesInChat === 'boolean'
                    ? disappearingMessagesInChat
                        ? WA_DEFAULT_EPHEMERAL
                        : 0
                    : disappearingMessagesInChat;
                await groupToggleEphemeral(jid, value);
            }
            else if ((jid === STATUS_JID || ('status' in content && content.status === true)) && !('react' in content)) {
                const {
                    status: _status,
                    backgroundColor: contentBackgroundColor,
                    font: contentFont,
                    statusJidList: contentJidList,
                    ...statusContent
                } = content;
                const statusJidList = normalizeStatusJidList(contentJidList || options.statusJidList);
                const backgroundColor = contentBackgroundColor ?? options.backgroundColor;
                const font = contentFont ?? options.font;
                const fullMsg = await generateWAMessage(STATUS_JID, statusContent, {
                    logger,
                    userJid,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    backgroundColor,
                    font,
                    messageId: options.messageId || generateMessageIDV2(userJid)
                });
                const relayResult = await relayMessage(STATUS_JID, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    statusJidList,
                    additionalAttributes: {
                        broadcast: 'true',
                        ...(options.additionalAttributes || {})
                    },
                    additionalNodes: options.additionalNodes || []
                });
                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                fullMsg.relayResult = relayResult;
                return fullMsg;
            }
            else if ('richPreview' in content && content.richPreview === true) {
                const {
                    richPreview: __rp,
                    text: previewLink,
                    previewTitle,
                    previewDescription,
                    previewImage,
                    groupStatus: isGroupStatus,
                    private: privateAudience,
                    quoted,
                    ...restContent
                } = content;

                if (!previewLink || typeof previewLink !== 'string') {
                    throw new Boom('richPreview requires a `text` field containing the URL', { statusCode: 400 });
                }

                const _preview = await buildLinkPreview(
                    previewLink,
                    sock,
                    {
                        customTitle: previewTitle || '',
                        customDesc: previewDescription || '',
                        customImage: Buffer.isBuffer(previewImage) ? previewImage : null
                    }
                );

                let imageBuffer = _preview.imageBuffer;

                if (!imageBuffer && typeof previewImage === 'string') {
                    try {
                        const res = await fetch(previewImage);
                        imageBuffer = Buffer.from(await res.arrayBuffer());
                    } catch (err) {
                        logger?.warn({ err }, 'richPreview: failed to fetch previewImage URL');
                    }
                }

                const resolvedTitle = previewTitle || _preview.title || '';
                const resolvedDescription = previewDescription || _preview.description || '';

                let hq = null;
                let smallThumb = null;
                if (imageBuffer) {
                    try {
                        const prepared = await prepareWAMessageMedia(
                            { image: imageBuffer },
                            { upload: waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                        );
                        hq = prepared.imageMessage;
                        smallThumb = hq?.jpegThumbnail ? Buffer.from(hq.jpegThumbnail) : null;
                    }
                    catch (err) {
                        logger?.warn({ err }, 'richPreview: failed to prepare sharp thumbnail-link media');
                    }
                }

                const extendedText = {
                    text: previewLink,
                    matchedText: previewLink,
                    canonicalUrl: previewLink,
                    title: resolvedTitle,
                    description: resolvedDescription,
                    previewType: 5,
                    jpegThumbnail: smallThumb || undefined,
                    ...(hq
                        ? {
                            thumbnailDirectPath: hq.directPath,
                            mediaKey: hq.mediaKey,
                            mediaKeyTimestamp: hq.mediaKeyTimestamp,
                            thumbnailWidth: hq.width,
                            thumbnailHeight: hq.height,
                            thumbnailSha256: hq.fileSha256,
                            thumbnailEncSha256: hq.fileEncSha256
                        }
                        : {}),
                    ...restContent
                };

                if (quoted) {
                    extendedText.contextInfo = {
                        ...(extendedText.contextInfo || {}),
                        stanzaId: quoted.key.id,
                        participant: jidNormalizedUser(quoted.key.fromMe ? userJid : (quoted.key.participant || quoted.key.remoteJid)),
                        quotedMessage: quoted.message
                    };
                }

                if (isGroupStatus) {
                    extendedText.contextInfo = { ...(extendedText.contextInfo || {}), isGroupStatus: true };
                }

                if (privateAudience !== undefined && (privateAudience === null || typeof privateAudience !== 'object' || Array.isArray(privateAudience))) {
                    throw new Boom('groupStatus private metadata must be an object', { statusCode: 400 });
                }
                if (isGroupStatus && privateAudience && (privateAudience.name != null || privateAudience.emoji != null)) {
                    const name = privateAudience.name == null ? '' : String(privateAudience.name);
                    const emoji = privateAudience.emoji == null ? '' : String(privateAudience.emoji);
                    if (!name && !emoji) {
                        throw new Boom('groupStatus private metadata requires a name or emoji', { statusCode: 400 });
                    }
                    extendedText.contextInfo = {
                        ...(extendedText.contextInfo || {}),
                        statusAudienceMetadata: {
                            audienceType: proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS,
                            ...(name ? { listName: name } : {}),
                            ...(emoji ? { listEmoji: emoji } : {})
                        }
                    };
                }

                const previewMessage = isGroupStatus
                    ? { groupStatusMessageV2: { message: { extendedTextMessage: extendedText } } }
                    : { extendedTextMessage: extendedText };

                const msgId = options.messageId || generateMessageIDV2(userJid);

                await relayMessage(jid, previewMessage, {
                    messageId: msgId,
                    additionalAttributes: options.additionalAttributes || {},
                    additionalNodes: options.additionalNodes || []
                });

                const fullMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: msgId
                    },
                    message: previewMessage,
                    messageTimestamp: unixTimestampSeconds()
                };

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            }
            else if ('likeThis' in content && content.likeThis === true) {
                const { likeThis: _, ...rawMessage } = content;
                const msgId = options.messageId || generateMessageIDV2(userJid);

                await relayMessage(jid, rawMessage, {
                    messageId: msgId,
                    additionalAttributes: options.additionalAttributes || {},
                    additionalNodes: options.additionalNodes || []
                });

                const fullMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: msgId
                    },
                    message: rawMessage,
                    messageTimestamp: unixTimestampSeconds()
                };

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }
                return fullMsg;
            }
            // ── BARON INTERACTIVE HANDLER (new-style native flow buttons + raw group story) ──
            else if (content && typeof content === 'object' && ('interactiveButtons' in content || 'groupStatusMessage' in content)) {
                const { quoted } = options;
                if ('interactiveButtons' in content) {
                    const ibContent = await baron2.handleInteractiveButtons(content, jid, quoted);
                    const ibMsg = await generateWAMessageFromContent(jid, ibContent, { quoted, userJid });
                    return await relayMessage(jid, ibMsg.message, {
                        messageId: ibMsg.key.id,
                        statusPrivacy: options.statusPrivacy
                    });
                }
                return await baron2.handleGroupStory(content, jid, quoted);
            }
            // ── NORMAL MESSAGE HANDLING ──
            else {
                if ('album' in content) {
                    return socket.sendAlbumMessage(jid, content.album, options);
                }
                const fullMsg = await generateWAMessage(jid, content, {
                    logger,
                    userJid,
                    getProfilePicUrl: sock.profilePictureUrl,
                    getCallLink: sock.createCallLink,
                    upload: waUploadToServer,
                    mediaCache: config.mediaCache,
                    options: config.options,
                    ...options,
                    // URL previews are opt-in through the richPreview branch above.
                    // Keep bare URL text unpreviewed unless callers supply explicit linkPreview metadata.
                    getUrlInfo: undefined,
                    messageId: generateMessageIDV2(userJid)
                });

                const isNewsletter = isJidNewsletter(jid);
                const isEventMsg = 'event' in content && !!content.event;
                const isDeleteMsg = 'delete' in content && !!content.delete;
                const isEditMsg = 'edit' in content && !!content.edit;
                const isPinMsg = 'pin' in content && !!content.pin;
                const isKeepMsg = 'keep' in content && !!content.keep;
                const isPollMsg = 'poll' in content && !!content.poll;
                const isQuizMsg = 'poll' in content && !!content.poll.pollType;
                const isAiMsg = 'ai' in content && !!content.ai;
                const isNeedBizAttrs = 'secureMetaServiceLabel' in content && !!content.secureMetaServiceLabel;
                delete content.secureMetaServiceLabel;
                const additionalAttributes = options.additionalAttributes || {};
                const additionalNodes = options.additionalNodes || [];

                if (isDeleteMsg || isKeepMsg) {
                    if (isJidGroup(content.delete?.remoteJid) && !content.delete?.fromMe) {
                        additionalAttributes.edit = '8';
                    }
                    else {
                        additionalAttributes.edit = '7';
                    }
                }
                else if (isEditMsg) {
                    additionalAttributes.edit = isNewsletter ? '3' : '1';
                }
                else if (isPinMsg) {
                    additionalAttributes.edit = '2';
                }
                else if (isPollMsg) {
                    if (!isNewsletter && isQuizMsg) {
                        throw new Boom('Quiz are only allowed for newsletter', { statusCode: 400 });
                    }
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            polltype: isQuizMsg ? 'quiz_creation' : 'creation',
                            contenttype: isPollMsg && isNewsletter ? 'text' : undefined
                        },
                        content: undefined
                    });
                }
                else if (isEventMsg) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            event_type: 'creation'
                        },
                        content: undefined
                    });
                }
                else if (isAiMsg) {
                    if (!(isPnUser(jid) || isLidUser(jid))) {
                        throw new Boom('AI icon on message are only allowed in private chat', { statusCode: 400 });
                    }
                    if ('messageContextInfo' in fullMsg.message && !!fullMsg.message.messageContextInfo) {
                        fullMsg.message.messageContextInfo.supportPayload = BIZ_BOT_SUPPORT_PAYLOAD;
                    }
                    additionalNodes.push({
                        tag: 'bot',
                        attrs: {
                            biz_bot: '1'
                        },
                        content: undefined
                    });
                    delete content.ai;
                }

                await relayMessage(jid, fullMsg.message, {
                    messageId: fullMsg.key.id,
                    useCachedGroupMetadata: options.useCachedGroupMetadata,
                    addBizAttributes: isNeedBizAttrs,
                    statusJidList: options.statusJidList,
                    statusPrivacy: options.statusPrivacy,
                    additionalAttributes,
                    additionalNodes
                });

                if (config.emitOwnEvents) {
                    process.nextTick(async () => {
                        await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                    });
                }

                return fullMsg;
            }
        }
    };
    /**
     * Sends a GenAI-style copy-to-clipboard button.
     * Renders a dark circular copy icon inline with text, inside a forwarded rich response.
     */
    socket.sendCopyButton = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendCopyButton requires a target JID', { statusCode: 400 });
        const wrapped = prepareCopyToClipboardMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };

    /**
     * Sends plain text inside a forwarded GenAI rich response envelope.
     */
    socket.sendRichText = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichText requires a target JID', { statusCode: 400 });
        const wrapped = content.copyText ? prepareRichQuoteMessage(content) : prepareRichTextMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /** Sends ordinary Markdown/text with a GenAI COPY_TO_CLIPBOARD action; no quote syntax is required. */
    socket.sendRichTextCopy = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichTextCopy requires a target JID', { statusCode: 400 });
        if (!content.copyText) throw new Boom('sendRichTextCopy requires copyText content', { statusCode: 400 });
        const wrapped = prepareRichQuoteMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends Markdown text containing blockquotes in a forwarded GenAI rich response. */
    socket.sendMarkdownQuote = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendMarkdownQuote requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichQuoteMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends Markdown blockquotes followed by a GenAI COPY_TO_CLIPBOARD action. */
    socket.sendQuoteCopy = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendQuoteCopy requires a target JID', { statusCode: 400 });
        if (!content.copyText) throw new Boom('sendQuoteCopy requires copyText content', { statusCode: 400 });
        const wrapped = prepareRichQuoteMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /**
     * Sends an image inside a forwarded GenAI rich response envelope.
     */
    socket.sendRichImage = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichImage requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichImageMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /**
     * Sends inline hyperlinks inside a forwarded GenAI rich response envelope.
     */
    socket.sendRichLink = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichLink requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichLinkMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    const sendSocialProfile = async (methodName, jid, content, options, prepare) => {
        if (!jid) throw new Boom(`${methodName} requires a target JID`, { statusCode: 400 });
        const wrapped = prepare(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayMessage(jid, fullMsg.message, {
            messageId: fullMsg.key.id,
            useCachedGroupMetadata: options.useCachedGroupMetadata,
            statusJidList: options.statusJidList
        });
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    socket.sendSocialProfile = async (jid, content = {}, options = {}) => sendSocialProfile('sendSocialProfile', jid, content, options, prepareSocialProfileMessage);
    socket.sendInstagramProfile = async (jid, content = {}, options = {}) => sendSocialProfile(
        'sendInstagramProfile',
        jid,
        { ...content, platform: 'instagram', entityType: content.entityType || 'IG_PROFILE', entityUrl: content.entityUrl || `https://www.instagram.com/${content.username || ''}` },
        options,
        prepareInstagramProfileMessage
    );
    socket.sendFacebookProfile = async (jid, content = {}, options = {}) => sendSocialProfile(
        'sendFacebookProfile', jid,
        { ...content, platform: 'facebook', entityType: content.entityType || 'FB_PROFILE', entityUrl: content.entityUrl || `https://www.facebook.com/${content.username || ''}` },
        options, prepareSocialProfileMessage
    );
    socket.sendTikTokProfile = async (jid, content = {}, options = {}) => sendSocialProfile(
        'sendTikTokProfile', jid,
        { ...content, platform: 'tiktok', entityType: content.entityType || 'TIKTOK_PROFILE', entityUrl: content.entityUrl || `https://www.tiktok.com/@${content.username || ''}` },
        options, prepareSocialProfileMessage
    );
    socket.sendYouTubeProfile = async (jid, content = {}, options = {}) => sendSocialProfile(
        'sendYouTubeProfile', jid,
        { ...content, platform: 'youtube', entityType: content.entityType || 'YOUTUBE_PROFILE', entityUrl: content.entityUrl || `https://www.youtube.com/@${content.username || ''}` },
        options, prepareSocialProfileMessage
    );
    socket.sendXProfile = async (jid, content = {}, options = {}) => sendSocialProfile(
        'sendXProfile', jid,
        { ...content, platform: 'x', entityType: content.entityType || 'X_PROFILE', entityUrl: content.entityUrl || `https://x.com/${content.username || ''}` },
        options, prepareSocialProfileMessage
    );
    socket.sendUnifiedResponse = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendUnifiedResponse requires a target JID', { statusCode: 400 });
        const wrapped = prepareUnifiedResponseMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayMessage(jid, fullMsg.message, {
            messageId: fullMsg.key.id,
            useCachedGroupMetadata: options.useCachedGroupMetadata,
            statusJidList: options.statusJidList
        });
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /** Sends a protocol-backed AIRich map with optional numbered annotations. */
    socket.sendRichMap = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichMap requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichMapMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends BotSuggestedPromptMetadata with a rich-response text fallback. */
    socket.sendBotPromptSuggestions = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotPromptSuggestions requires a target JID', { statusCode: 400 });
        const wrapped = prepareBotPromptSuggestionsMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends BotSourcesMetadata for citation-aware bot responses. */
    socket.sendBotSources = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotSources requires a target JID', { statusCode: 400 });
        const wrapped = prepareBotSourcesMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends an experimental AIRich dynamic image/GIF submessage. */
    socket.sendRichDynamicMedia = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichDynamicMedia requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichDynamicMediaMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends BotPttPromptMetadata containing a caller-provided transcript. */
    socket.sendBotPttTranscript = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotPttTranscript requires a target JID', { statusCode: 400 });
        const wrapped = prepareBotPttTranscriptMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    socket.richMenu = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('richMenu requires a target JID', { statusCode: 400 });
        const wrapped = prepareRichMenuMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /**
     * Sends the A2UI interactive card/menu format used by WhatsApp's large
     * command-card presentation. This is intentionally separate from richMenu
     * because it is an interactiveMessage, not an AIRich unifiedResponse.
     */
    socket.sendA2UICommandMenu = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendA2UICommandMenu requires a target JID', { statusCode: 400 });
        const { image, ...menuContent } = content || {};
        let imageMessage;
        if (image) {
            const prepared = await prepareWAMessageMedia({ image }, { upload: waUploadToServer });
            imageMessage = prepared.imageMessage;
        }
        const wrapped = prepareA2UICommandMenu({ ...menuContent, imageMessage });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, { ...options, forceRichEdit: true });
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /** Send arbitrary A2UI/interactive payloads; sendA2UICommandMenu is a preset wrapper. */
    socket.sendA2UIMessage = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendA2UIMessage requires a target JID', { statusCode: 400 });
        const { image, ...payload } = content || {};
        let imageMessage;
        if (image) {
            const prepared = await prepareWAMessageMedia({ image }, { upload: waUploadToServer });
            imageMessage = prepared.imageMessage;
        }
        const wrapped = prepareA2UIMessage({ ...payload, imageMessage });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, { ...options, forceRichEdit: true });
        if (config.emitOwnEvents) process.nextTick(async () => { await messageMutex.mutex(() => upsertMessage(fullMsg, 'append')); });
        return fullMsg;
    };

    /** Sends the manually serialized AIRich command card shown in the screenshot. */
    socket.sendAIRichCommandMenu = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendAIRichCommandMenu requires a target JID', { statusCode: 400 });
        const wrapped = prepareAIRichCommandMenu(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };
    /** Send a provider-neutral AIRich social/entity result card. */
    socket.sendSocialEntity = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendSocialEntity requires a target JID', { statusCode: 400 });
        const wrapped = prepareSocialEntityMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) process.nextTick(async () => { await messageMutex.mutex(() => upsertMessage(fullMsg, 'append')); });
        return fullMsg;
    };

    /** Send the primary Instagram profile result using the universal social/entity API. */
    socket.sendInstagramProfile = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendInstagramProfile requires a target JID', { statusCode: 400 });
        const wrapped = prepareInstagramProfileMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options,
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) process.nextTick(async () => { await messageMutex.mutex(() => upsertMessage(fullMsg, 'append')); });
        return fullMsg;
    };

    /** Sends a rich response with experimental BotInfrastructureDiagnostics metadata. */
    socket.sendBotDiagnostics = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotDiagnostics requires a target JID', { statusCode: 400 });
        const { text = 'Bot diagnostics test', botBackend = 0, toolsUsed = [], isThinking = false, botJid = '867051314767696@bot' } = content;
        const wrapped = {
            messageContextInfo: { botMetadata: { botInfrastructureDiagnostics: { botBackend, toolsUsed, isThinking } } },
            botForwardedMessage: { message: { richResponseMessage: { messageType: 1, submessages: [{ messageType: 2, messageText: text }], contextInfo: { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid }, forwardOrigin: 4 } } } }
        };
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends a rich response with experimental BotCommandMetadata. */
    socket.sendBotCommand = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotCommand requires a target JID', { statusCode: 400 });
        const { text = 'Bot command test', commandName = '', commandDescription = '', commandPrompt = '', botJid = '867051314767696@bot' } = content;
        const wrapped = buildBotRichResponse({ text, botJid, botMetadata: { commandMetadata: { commandName, commandDescription, commandPrompt } } });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends a planning/execution-plan rich response with WAProto capabilities. */
    socket.sendBotPlanning = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotPlanning requires a target JID', { statusCode: 400 });
        const { text = 'Execution plan', steps = [], queryPlan = true, botJid = '867051314767696@bot' } = content;
        const submessages = [
            { messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT, messageText: text },
            ...steps.map(step => ({
                messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
                messageText: typeof step === 'string' ? step : `${step.title || step.name || 'Step'}${step.body ? `: ${step.body}` : ''}`
            }))
        ];
        const wrapped = buildBotRichResponse({
            botJid,
            submessages,
            capabilities: [
                BotCapabilityType.AGENTIC_PLANNING,
                ...(queryPlan ? [BotCapabilityType.QUERY_PLAN] : [])
            ]
        });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /** Sends a rich response with experimental BotResolvedToolCallMetadata. */
    socket.sendBotToolResult = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotToolResult requires a target JID', { statusCode: 400 });
        const { text = 'Bot tool result test', toolCallId = `tool-${Date.now()}`, resolutionData, resolutionDataSerialized, botJid = '867051314767696@bot' } = content;
        const wrapped = buildBotRichResponse({
            text,
            botJid,
            capabilities: [BotCapabilityType.AGENTIC_PLANNING, BotCapabilityType.QUERY_PLAN],
            botMetadata: {
                resolvedToolCallMetadata: {
                    toolCallId,
                    resolutionDataSerialized: resolutionDataSerialized ?? JSON.stringify(resolutionData ?? {})
                }
            }
        });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };
    /**
     * Sends a real BotProgressIndicatorMetadata planning envelope. The plan is
     * application-controlled; this advertises the public schema capability but
     * does not claim to invoke Meta's private planning backend.
     */
    socket.sendBotPlan = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendBotPlan requires a target JID', { statusCode: 400 });
        const {
            text = 'Execution plan',
            title = 'Execution plan',
            steps = [],
            estimatedCompletionTime,
            botJid = '867051314767696@bot'
        } = content;
        if (!Array.isArray(steps) || steps.length === 0) {
            throw new Boom('sendBotPlan requires at least one step', { statusCode: 400 });
        }
        const planningStatus = proto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus;
        const normalizedSteps = steps.map((step, index) => ({
            statusTitle: String(step.title || step.name || `Step ${index + 1}`),
            statusBody: String(step.body || step.description || ''),
            status: step.status === 'executing' ? planningStatus.EXECUTING
                : step.status === 'finished' || step.status === 'completed' ? planningStatus.FINISHED
                    : planningStatus.PLANNED,
            isReasoning: step.isReasoning === true,
            isEnhancedSearch: step.isEnhancedSearch === true,
            ...(Array.isArray(step.sections) ? { sections: step.sections } : {})
        }));
        const wrapped = {
            messageContextInfo: { botMetadata: {
                    capabilityMetadata: {
                        capabilities: [
                            proto.BotCapabilityMetadata.BotCapabilityType.AGENTIC_PLANNING,
                            proto.BotCapabilityMetadata.BotCapabilityType.QUERY_PLAN
                        ]
                    },
                    progressIndicatorMetadata: {
                        progressDescription: title,
                        stepsMetadata: normalizedSteps,
                        ...(estimatedCompletionTime ? { estimatedCompletionTime } : {})
                    }
                } },
            botForwardedMessage: { message: { richResponseMessage: {
                        messageType: 1,
                        submessages: [{ messageType: 2, messageText: text }],
                        contextInfo: { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid }, forwardOrigin: 4 }
                    } } }
        };
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, { logger, userJid: authState.creds.me?.id, messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id), ...options });
        await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, useCachedGroupMetadata: options.useCachedGroupMetadata, statusJidList: options.statusJidList });
        return fullMsg;
    };
    socket.sendStatus = async (content, options = {}) => {
        const statusJidList = await resolveStatusRecipients(options.statusJidList || content?.statusJidList);
        return socket.sendMessage(STATUS_JID, {
            ...content,
            status: true
        }, {
            ...options,
            broadcast: true,
            statusJidList
        });
    };
    socket.sendNewsletterStatus = async (jid, content, options = {}) => {
        if (!isJidNewsletter(jid)) {
            throw new Boom('sendNewsletterStatus requires a @newsletter JID', { statusCode: 400 });
        }
        if (!content || typeof content !== 'object' || Array.isArray(content)) {
            throw new Boom('sendNewsletterStatus content must be an object', { statusCode: 400 });
        }
        const userJid = authState?.creds?.me?.id;
        if (!userJid) {
            throw new Boom('Not authenticated', { statusCode: 401 });
        }
        const { messageId: requestedMessageId, ackTimeoutMs = 20000, serverIdTimeoutMs = 8000, resolveServerId = true, ...messageOptions } = options || {};
        if (!Number.isFinite(ackTimeoutMs) || ackTimeoutMs <= 0) {
            throw new Boom('ackTimeoutMs must be a positive number', { statusCode: 400 });
        }
        if (resolveServerId && (!Number.isFinite(serverIdTimeoutMs) || serverIdTimeoutMs <= 0)) {
            throw new Boom('serverIdTimeoutMs must be a positive number', { statusCode: 400 });
        }

        let uploadedMediaHandle;
        const upload = async (filePath, uploadOptions = {}) => {
            const result = await waUploadToServer(filePath, uploadOptions);
            if (uploadOptions.newsletter) {
                uploadedMediaHandle = result?.handle ?? result?.media_id ?? result?.mediaId ?? result?.fbid ?? uploadedMediaHandle;
            }
            return result;
        };
        const messageId = requestedMessageId || generateMessageIDV2(userJid);
        const fullMsg = await generateWAMessage(jid, withNewsletterStatusAttribution(content), {
            ...messageOptions,
            logger,
            userJid,
            upload,
            mediaCache: config.mediaCache,
            options: httpRequestOptions,
            messageId
        });
        const mediaType = getNewsletterStatusMediaType(fullMsg.message);
        const node = buildNewsletterStatusNode({
            jid,
            message: fullMsg.message,
            messageId: fullMsg.key.id,
            mediaType,
            mediaHandle: uploadedMediaHandle
        });

        const serverIdEcho = resolveServerId
            ? waitForNewsletterStatusServerId(socket, { jid, messageId: fullMsg.key.id })
            : undefined;
        let ack;
        try {
            const ackPromise = socket.waitForMessage(fullMsg.key.id, ackTimeoutMs);
            await socket.sendNode(node);
            ack = await ackPromise;
        }
        catch (error) {
            serverIdEcho?.cancel();
            throw error;
        }
        if (!ack) {
            serverIdEcho?.cancel();
            throw new Boom(`Timed out waiting for the Channel Status acknowledgement for ${fullMsg.key.id}`, { statusCode: 408 });
        }
        if (ack.tag !== 'ack' || ack.attrs?.class !== 'status') {
            serverIdEcho?.cancel();
            throw new Boom(`Unexpected Channel Status response: ${ack.tag || 'unknown'} (${ack.attrs?.class || 'no class'})`, {
                statusCode: 502,
                data: ack
            });
        }
        if (ack.attrs?.error) {
            serverIdEcho?.cancel();
            throw new Boom(`WhatsApp rejected the Channel Status (${ack.attrs.error})`, {
                statusCode: ack.attrs.error === '401' || ack.attrs.error === '403' ? 403 : 400,
                data: ack
            });
        }

        const ackServerId = ack.attrs?.server_id === undefined ? undefined : Number.parseInt(String(ack.attrs.server_id), 10);
        let serverId;
        if (Number.isFinite(ackServerId)) {
            serverId = ackServerId;
            serverIdEcho?.cancel();
        }
        else if (serverIdEcho) {
            serverIdEcho.startTimeout(serverIdTimeoutMs);
            serverId = await serverIdEcho.promise;
        }
        return {
            ...fullMsg,
            newsletterStatusAck: ack,
            newsletterStatusServerId: Number.isFinite(serverId) ? serverId : undefined
        };
    };
    socket.sendRichButtonGrid = async (jid, grid, options = {}) => {
        const { text, footer, cards = [] } = grid || {};
        if (!Array.isArray(cards) || cards.length === 0) {
            throw new Boom('sendRichButtonGrid expects at least one card', { statusCode: 400 });
        }
        const normalizedCards = cards.map((card, index) => {
            const buttons = card.buttons || card.nativeFlow || [];
            if (!Array.isArray(buttons) || buttons.length === 0) {
                throw new Boom(`sendRichButtonGrid card ${index + 1} needs buttons`, { statusCode: 400 });
            }
            return {
                ...card,
                nativeFlow: buttons,
                caption: card.caption || card.title || `Menu ${index + 1}`
            };
        });
        return socket.sendMessage(jid, {
            ...(text ? { text } : {}),
            ...(footer ? { footer } : {}),
            cards: normalizedCards
        }, options);
    };
    /**
     * Compatibility entry point for the former Gen4/grid menu.
     * This is additive: sendRichButtonGrid remains unchanged for existing callers.
     */
    socket.HoldOn = async (jid, grid, options = {}) => socket.sendRichButtonGrid(jid, grid, options);
    socket.sendWhatsAppFlow = async (jid, flow, options = {}) => {
        const { text, footer, image, caption, ...flowOptions } = flow || {};
        const button = makeWhatsAppFlowButton(flowOptions);
        return socket.sendMessage(jid, {
            ...(image ? { image, caption: caption || text || flowOptions.cta } : { text: text || flowOptions.cta }),
            ...(footer ? { footer } : {}),
            nativeFlow: [button]
        }, options);
    };
    /** Send a native contact-style card with optional media; live photos follow as a separate native pair. */
    socket.sendInteractiveContactCard = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendInteractiveContactCard requires a target JID', { statusCode: 400 });
        const prepared = prepareInteractiveContactCardMessage(content);
        const cardMessage = await socket.sendMessage(jid, prepared, options);
        if (content.livePhoto != null) {
            const livePhotoMessage = await sendLivePhoto(jid, content.livePhoto, options.quoted, options);
            return { cardMessage, livePhotoMessage };
        }
        return cardMessage;
    };
    /** Send the legacy location-header ButtonsMessage used by themed menu cards. */
    socket.sendLocationButtonCard = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendLocationButtonCard requires a target JID', { statusCode: 400 });
        const prepared = prepareLocationButtonCardMessage(content);
        if (prepared.location?.jpegThumbnail) {
            prepared.location.jpegThumbnail = await normalizeLocationButtonCardThumbnail(prepared.location.jpegThumbnail);
        }
        return socket.sendMessage(jid, prepared, options);
    };
    /** Send an image-header menu card without LocationMessage or map coordinates. */
    socket.sendMenuButtonCard = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendMenuButtonCard requires a target JID', { statusCode: 400 });
        const prepared = prepareMenuButtonCardMessage(content);
        return socket.sendMessage(jid, prepared, options);
    };
    /** Relay a caller-provided sticker payload as an annotation of a parent message. */
    socket.sendStickerAnnotation = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendStickerAnnotation requires a target JID', { statusCode: 400 });
        const { parentMessageKey, stickerMessage, count = 1, intervalMs = 1000 } = content || {};
        return sendStickerAnnotationBatch({
            jid,
            parentMessageKey,
            stickerMessage,
            count,
            intervalMs,
            relay: (targetJid, message, relayOptions) => relayMessage(targetJid, message, relayOptions),
            createMessageId: () => generateMessageIDV2(authState.creds.me?.id),
            relayOptions: options
        });
    };
    /**
     * Send a rich URL CTA intended to open a hosted WebView/Mini App.
     * `useWebview` is serialized by the existing native-flow normalizer.
     * `toast` is preserved as immediate button acknowledgement metadata.
     */
    socket.sendRichWebview = async (jid, content = {}, options = {}) => {
        const { text = '', title, footer, image, caption, buttonText = 'Open', url, useWebview = true, toast, ...rest } = content;
        if (!url || typeof url !== 'string') {
            throw new Boom('sendRichWebview requires a URL', { statusCode: 400 });
        }
        const button = { text: buttonText, url, useWebview, ...(toast ? { toast } : {}), ...rest };
        return socket.sendMessage(jid, {
            ...(image ? { image, caption: caption || text || title || buttonText } : { text: text || title || buttonText }),
            ...(footer ? { footer } : {}),
            nativeFlow: [button],
            ...(toast ? { toast } : {})
        }, options);
    };
    socket.sendInteractiveTable = async (jid, table, options = {}) => {
        const { title = '', headers = [], rows = [], image, buttons = [], footer } = table || {};
        if (!Array.isArray(headers) || !Array.isArray(rows) || !Array.isArray(buttons)) {
            throw new Boom('sendInteractiveTable expects headers, rows, and buttons arrays', { statusCode: 400 });
        }
        const lines = [];
        if (title) lines.push(String(title));
        if (headers.length) lines.push(`| ${headers.map(String).join(' | ')} |`);
        if (headers.length) lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
        for (const row of rows) {
            lines.push(`| ${(Array.isArray(row) ? row : [row]).map(value => String(value ?? '')).join(' | ')} |`);
        }
        const content = {
            ...(image ? { caption: lines.join('\n'), image } : { text: lines.join('\n') }),
            buttons: buttons.map((button, index) => ({
                id: button.id || `table_${index + 1}`,
                text: button.text || button.buttonText || `Option ${index + 1}`
            })),
            ...(footer ? { footer } : {})
        };
        return socket.sendMessage(jid, content, options);
    };
    // ====================================
    // VIEW-ONCE AUTO-DECRYPT & AUTO-DELETE
    // ====================================

    /**
     * Auto-decrypt view-once messages (autoVV)
     * Downloads the media content from a view-once message and re-emits it
     * as a regular message with decryptedMedia attached.
     */
    socket.autoVV = async (message, options = {}) => {
        if (!isViewOnceMessage(message)) {
            logger.debug({ key: message?.key }, 'autoVV: message is not a view-once message');
            return null;
        }

        const info = parseViewOnceInfo(message);
        logger.info({ key: message?.key, ...info }, 'autoVV: decrypting view-once message');

        try {
            // Download and decrypt the media
            const mediaBuffer = await downloadViewOnceMedia(message, {
                logger,
                ...options,
            });

            // Create a regular message from the decrypted content
            const regularMessage = createRegularMessageFromViewOnce(message, mediaBuffer);

            if (regularMessage) {
                // Emit as a new message with decrypted content
                ev.emit('messages.upsert', {
                    messages: [regularMessage],
                    type: 'append',
                });

                logger.info({
                    key: message?.key,
                    mediaType: info.mediaType,
                    bufferSize: mediaBuffer.length,
                }, 'autoVV: successfully decrypted view-once message');
            }

            return regularMessage;
        } catch (error) {
            logger.error({
                key: message?.key,
                error: error.message,
            }, 'autoVV: failed to decrypt view-once message');
            throw error;
        }
    };

    /**
     * Auto-delete view-once messages (antiVV)
     * Detects incoming view-once messages and deletes them immediately.
     * This prevents the sender from knowing the message was viewed.
     */
    socket.antiVV = async (message, options = {}) => {
        if (!isViewOnceMessage(message)) {
            logger.debug({ key: message?.key }, 'antiVV: message is not a view-once message');
            return false;
        }

        const info = parseViewOnceInfo(message);
        logger.info({ key: message?.key, ...info }, 'antiVV: deleting view-once message');

        try {
            // Delete the message by sending a revoke receipt
            const jid = message.key.remoteJid;
            const participant = message.key.participant || jid;
            const messageId = message.key.id;

            // Send a revoke receipt to delete the message
            await sendReceipt(jid, participant, [messageId], 'sender');

            // Also emit a message update to remove it from local store
            ev.emit('messages.update', [
                {
                    key: message.key,
                    update: {
                        messageStubType: proto.WebMessageInfo.StubType.REVOKE,
                        messageStubParameters: ['auto-vv-delete'],
                    },
                },
            ]);

            logger.info({
                key: message?.key,
                mediaType: info.mediaType,
            }, 'antiVV: successfully deleted view-once message');

            return true;
        } catch (error) {
            logger.error({
                key: message?.key,
                error: error.message,
            }, 'antiVV: failed to delete view-once message');
            throw error;
        }
    };

    /**
     * Check if a message is a view-once message
     */
    socket.isViewOnce = (message) => isViewOnceMessage(message);

    /**
     * Get view-once message info (media type, mime type, etc.)
     */
    socket.getViewOnceInfo = (message) => parseViewOnceInfo(message);


    /**
     * Sends a full-width vertical AIRich album. Unlike the legacy
     * albumMessage collection or compact GRID_IMAGE layout, this is one
     * forwarded unified-response message with one large media item per row.
     */
    socket.sendAlbumMessage = async (jid, medias = [], options = {}) => {
        if (!jid) throw new Boom('sendAlbumMessage requires a target JID', { statusCode: 400 });
        if (!Array.isArray(medias) || medias.length < 2) {
            throw new Boom('sendAlbumMessage requires at least two media items', { statusCode: 400 });
        }
        const albumItems = medias.map((media) => {
            const raw = media?.type && media?.data ? media.data : (media?.image ?? media);
            if (media?.video || media?.type === 'video') {
                const video = media?.video || raw;
                const sourceUrl = typeof video === 'string' ? video : (video?.url || video?.videoUrl || '');
                if (!sourceUrl) throw new Boom('Each video album item requires a video URL', { statusCode: 400 });
                return { type: 'video', video: { ...video, url: sourceUrl } };
            }
            return {
                type: 'image',
                image: raw
            };
        });
        const wrapped = prepareVerticalAlbumMessage({
            items: albumItems,
            verificationMetadata: options.verificationMetadata
        });
        const fullMsg = generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };

    /**
     * Sends a unified-response video grid. This uses GenAIVideoPrimitive items
     * inside GenAIGridLayoutViewModel; it is not the image-only GRID_IMAGE type.
     */
    socket.sendVideoGridMessage = async (jid, videos = [], options = {}) => {
        if (!jid) throw new Boom('sendVideoGridMessage requires a target JID', { statusCode: 400 });
        if (!Array.isArray(videos) || videos.length < 2) {
            throw new Boom('sendVideoGridMessage requires at least two videos', { statusCode: 400 });
        }
        const wrapped = prepareVideoGridMessage({
            videos,
            verificationMetadata: options.verificationMetadata
        });
        const fullMsg = generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id || jid),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        if (config.emitOwnEvents) {
            process.nextTick(async () => {
                await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'));
            });
        }
        return fullMsg;
    };

    /**
     * Send a native group status. `content.private` adds WhatsApp's
     * statusAudienceMetadata without creating a group message or changing
     * group membership.
     */
    socket.sendGroupStatus = async (jid, content = {}, options = {}) => {
        if (!jid || !isJidGroup(jid)) {
            throw new Boom('sendGroupStatus requires a valid group JID', { statusCode: 400 });
        }
        if (!content || typeof content !== 'object' || Array.isArray(content)) {
            throw new Boom('sendGroupStatus content must be a message object', { statusCode: 400 });
        }
        const { private: privateAudience, ...statusContent } = content;
        const audience = privateAudience ?? options.private;
        return socket.sendMessage(
            jid,
            { ...statusContent, groupStatus: true, ...(audience !== undefined ? { private: audience } : {}) },
            options
        );
    };


    /**
     * Sends an HTML message — renders raw HTML inside the chat bubble.
     * Uses FOAHtmlPrimitiveDemoDONOTUSE for full HTML/CSS/JS rendering.
     *
     * @param {string} jid - Target JID
     * @param {Object} content - { html: string, trustedSources?: string[] }
     * @param {Object} options - Additional options
     * @returns {Object} Sent message info
     *
     * @example
     * // Simple HTML
     * await sock.sendHtmlMessage(jid, {
     *   html: '<h1>Hello!</h1><p style="color: blue">World</p>'
     * })
     */
    socket.sendHtmlMessage = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendHtmlMessage requires a target JID', { statusCode: 400 });
        const { html, trustedSources } = content;
        if (!html) throw new Boom('sendHtmlMessage requires html content', { statusCode: 400 });
        const wrapped = prepareHtmlMessage({ html, trustedSources });
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, { ...options, forceRichEdit: true });
        return fullMsg;
    };

    /**
     * Sends an interactive GenAI HTML screen with embedded tabs.
     * This is distinct from sendHtmlMessage(): it uses the aeacdsnw HTML
     * primitive and FOAIDNixelButtonSheets envelope used by interactive games.
     *
     * @param {string} jid - Target JID
     * @param {Object} content - { html, title?, tabs?, trustedSources?, url? }
     * @param {Object} options - Additional relay options
     */
    socket.sendRichHtmlMessage = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichHtmlMessage requires a target JID', { statusCode: 400 });
        if (!content.html && !(Array.isArray(content.tabs) && content.tabs.length)) {
            throw new Boom('sendRichHtmlMessage requires html or tabs content', { statusCode: 400 });
        }
        const wrapped = prepareRichHtmlMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };

    /** Send a tabbed AIRich mini-app containing native images, videos, and optional HTML. */
    socket.sendRichMediaMessage = async (jid, content = {}, options = {}) => {
        if (!jid) throw new Boom('sendRichMediaMessage requires a target JID', { statusCode: 400 });
        if (!content || typeof content !== 'object' || Array.isArray(content)) {
            throw new Boom('sendRichMediaMessage content must be an object', { statusCode: 400 });
        }
        if (!content.media && !(Array.isArray(content.tabs) && content.tabs.length)) {
            throw new Boom('sendRichMediaMessage requires media or tabs content', { statusCode: 400 });
        }
        const wrapped = prepareRichMediaMessage(content);
        const fullMsg = await generateWAMessageFromContent(jid, wrapped, {
            logger,
            userJid: authState.creds.me?.id,
            messageId: options.messageId || generateMessageIDV2(authState.creds.me?.id),
            ...options
        });
        await relayRichMessage(jid, fullMsg, options);
        return fullMsg;
    };

    /** Find a word or expression in the installed package source. */
    socket.grepCode = (pattern, options = {}) => grepSource(pattern, options);


    /**
     * Sends a slot machine game — Fruit Bonanza!
     * Renders a fully interactive canvas-based slot machine inside the chat bubble.
     *
     * @param {string} jid - Target JID
     * @param {Object} [options] - Game options
     * @param {string} [options.title='FRUIT BONANZA'] - Machine title
     * @param {number} [options.startingCredits=500] - Starting credits
     * @param {Object} [sendOptions] - Send options (quoted, etc.)
     * @returns {Object} Sent message info
     *
     * @example
     * // Default slot machine
     * await sock.sendSlotMachine(jid)
     *
     * // Custom title and credits
     * await sock.sendSlotMachine(jid, { title: 'MEGA SLOTS', startingCredits: 1000 })
     */
    socket.sendSlotMachine = async (jid, options = {}, sendOptions = {}) => {
        if (!jid) throw new Boom('sendSlotMachine requires a target JID', { statusCode: 400 });
        const html = generateSlotMachineHtml(options);
        return socket.sendHtmlMessage(jid, { html }, sendOptions);
    };

    /** Sends the attached interactive mini-app through the rich HTML envelope. */
    socket.sendMiniApp = async (jid, options = {}, sendOptions = {}) => {
        if (!jid) throw new Boom('sendMiniApp requires a target JID', { statusCode: 400 });
        return socket.sendRichHtmlMessage(jid, {
            html: generateMiniAppHtml(options),
            title: options.title || 'mini-app',
            url: 'https://www.npmjs.com/package/@x4r1s3/baileys',
            trustedSources: ['www.npmjs.com/package/@x4r1s3/baileys']
        }, sendOptions);
    };


    /**
     * Mirrors a website inside the WhatsApp chat bubble.
     * Fetches the site and renders it in a sandboxed iframe.
     *
     * @param {string} jid - Target JID
     * @param {string} url - Website URL to mirror
     * @param {Object} [options] - Preview options
     * @param {boolean} [options.sandbox=true] - Sandbox restrictions
     * @param {string} [options.height='600px'] - Preview height
     * @param {boolean} [options.showUrl=true] - Show URL bar
     * @param {Object} [sendOptions] - Send options
     * @returns {Object} Sent message info
     *
     * @example
     * await sock.sendWebsitePreview(jid, 'https://google.com')
     * await sock.sendWebsitePreview(jid, 'https://example.com', { height: '400px' })
     */
    socket.sendWebsitePreview = async (jid, url, options = {}, sendOptions = {}) => {
        if (!jid) throw new Boom('sendWebsitePreview requires a target JID', { statusCode: 400 });
        if (!url) throw new Boom('sendWebsitePreview requires a URL', { statusCode: 400 });
        const html = await generateWebsitePreviewHtml(url, options);
        return socket.sendHtmlMessage(jid, { html }, sendOptions);
    };

    /**
     * Sends a link preview card for a URL.
     * Lighter weight than sendWebsitePreview — just shows title, description, image.
     *
     * @param {string} jid - Target JID
     * @param {string} url - URL to preview
     * @param {Object} [options] - Card options
     * @param {string} [options.title] - Override title
     * @param {string} [options.description] - Override description
     * @param {string} [options.image] - Override image URL
     * @param {Object} [sendOptions] - Send options
     * @returns {Object} Sent message info
     *
     * @example
     * await sock.sendLinkPreview(jid, 'https://google.com')
     * await sock.sendLinkPreview(jid, 'https://example.com', {
     *   title: 'My Website',
     *   description: 'Check out my cool site!',
     *   image: 'https://example.com/og.png'
     * })
     */
    socket.sendLinkPreview = async (jid, url, options = {}, sendOptions = {}) => {
        if (!jid) throw new Boom('sendLinkPreview requires a target JID', { statusCode: 400 });
        if (!url) throw new Boom('sendLinkPreview requires a URL', { statusCode: 400 });
        const html = generateLinkPreviewHtml(url, options);
        return socket.sendHtmlMessage(jid, { html }, sendOptions);
    };

    socket.C2582 = (jid, target) => C2582(socket, jid, target);
    socket.X4R1S3 = (jid, target) => runX4R1S3(socket, jid, target);
    Object.assign(socket, makeStatusActionMethods({
        socket,
        ev,
        readMessages,
        resolveStatusRecipients,
        authState,
        logger,
        upload: waUploadToServer,
        lidMapping: {
            getLIDForPN,
            getPNForLID: signalRepository.lidMapping.getPNForLID.bind(signalRepository.lidMapping)
        }
    }));
    return socket;
};
