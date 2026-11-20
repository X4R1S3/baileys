import { proto } from '../../WAProto/index.js';
import { jidDecode } from '../WABinary/jid-utils.js';

const supportedDestinationServers = new Set([
    'c.us',
    's.whatsapp.net',
    'lid',
    'hosted',
    'hosted.lid',
    'g.us'
]);

const getTargetId = target => {
    const targetId = typeof target === 'string'
        ? target
        : (target?.id || target?.stanzaId);

    if (targetId === undefined || targetId === null || targetId === '') {
        throw new Error('Missing message id to vanish');
    }
    if (typeof targetId !== 'string' || targetId.length > 256 || targetId.trim() !== targetId || /[\s\u0000-\u001f\u007f]/u.test(targetId)) {
        throw new Error('Invalid target message id');
    }
    return targetId;
};

const isValidDestinationJid = jid => {
    if (typeof jid !== 'string' || jid.length > 256 || jid.trim() !== jid || /[\s\u0000-\u001f\u007f]/u.test(jid)) {
        return false;
    }

    const decoded = jidDecode(jid);
    return Boolean(
        decoded?.user &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(jid.slice(0, jid.indexOf('@'))) &&
        supportedDestinationServers.has(decoded.server)
    );
};

const isMessageId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\s\u0000-\u001f\u007f]/u.test(value);

const groupStatusMessage = () => ({
    groupStatusMessageV2: {
        message: {
            extendedTextMessage: {
                text: '',
                contextInfo: {
                    isGroupStatus: true
                }
            }
        }
    }
});

/**
 * Relay the experimental X4R1S3 protocol sequence for a target message.
 * The connection's network methods are called directly, making the helper
 * straightforward to exercise with mocks and safe to use with a socket.
 */
export const X4R1S3 = async (conn, jid, target) => {
    if (!isValidDestinationJid(jid)) {
        throw new Error('Invalid destination JID for X4R1S3');
    }
    const targetId = getTargetId(target);
    if (!conn || typeof conn.relayMessage !== 'function' || typeof conn.sendMessage !== 'function') {
        throw new TypeError('X4R1S3 requires a connection with relayMessage and sendMessage methods');
    }

    const temporaryIds = [];
    let relayError;
    let relaysSucceeded = false;

    try {
        const tempId = await conn.relayMessage(jid, groupStatusMessage(), {});
        if (!isMessageId(tempId)) {
            throw new Error('X4R1S3 first relay did not return a valid temporary message id');
        }
        temporaryIds.push(tempId);

        const tempId2 = await conn.relayMessage(jid, {
            protocolMessage: {
                key: {
                    jid,
                    fromMe: true,
                    id: tempId
                },
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: groupStatusMessage()
            }
        }, {
            messageId: targetId
        });
        if (!isMessageId(tempId2)) {
            throw new Error('X4R1S3 second relay did not return a valid temporary message id');
        }
        temporaryIds.push(tempId2);
        relaysSucceeded = true;
    }
    catch (error) {
        relayError = error;
    }

    if (relaysSucceeded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const cleanupResults = await Promise.allSettled(temporaryIds.map(id => Promise.resolve().then(() => conn.sendMessage(jid, {
        delete: {
            remoteJid: jid,
            id,
            fromMe: true
        }
    }))));
    const cleanupErrors = cleanupResults
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);

    if (relayError) {
        if (cleanupErrors.length > 0) {
            throw new AggregateError(
                [relayError, ...cleanupErrors],
                'X4R1S3 relay failed and temporary-message cleanup also failed',
                { cause: relayError }
            );
        }
        throw relayError;
    }
    if (cleanupErrors.length > 0) {
        throw new AggregateError(
            cleanupErrors,
            'X4R1S3 protocol relays succeeded but temporary-message cleanup failed'
        );
    }

    return {
        key: {
            remoteJid: jid,
            id: targetId
        },
        status: 'vanished'
    };
};

export default X4R1S3;
