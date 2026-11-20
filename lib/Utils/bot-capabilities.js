/**
 * @X4R1S3
 *
 * File: lib/Utils/bot-capabilities.js
 * About: Bot capabilities module for the X4R1S3 WhatsApp protocol client.
 * Important exports: BotCapabilityType, normalizeBotCapabilities, buildBotCapabilityMetadata, buildBotRichResponse, capability
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';

/**
 * Numeric capability values exposed by WAProto.BotCapabilityMetadata.
 * Keep this derived from the generated protobuf so callers cannot drift from
 * the checked-in schema.
 */
export const BotCapabilityType = proto.BotCapabilityMetadata.BotCapabilityType;

const capabilityNames = new Set(
    Object.keys(BotCapabilityType).filter(name => Number.isNaN(Number(name)))
);

/** Normalize enum names/numbers and reject unknown capability values. */
export const normalizeBotCapabilities = (capabilities = []) => {
    if (!Array.isArray(capabilities)) {
        throw new TypeError('capabilities must be an array');
    }
    const values = capabilities.map(capability => {
        if (typeof capability === 'string') {
            if (!capabilityNames.has(capability)) {
                throw new TypeError(`Unknown bot capability: ${capability}`);
            }
            return BotCapabilityType[capability];
        }
        if (Number.isInteger(capability) && BotCapabilityType[capability] !== undefined) {
            return capability;
        }
        throw new TypeError(`Invalid bot capability: ${String(capability)}`);
    });
    return [...new Set(values)];
};

export const buildBotCapabilityMetadata = (capabilities = []) => ({
    capabilities: normalizeBotCapabilities(capabilities)
});

/**
 * Build the canonical wrapper used by WhatsApp's bot rich-response messages.
 * The capability list is deliberately explicit; unknown or duplicate values
 * are never put on the wire.
 */
export const buildBotRichResponse = ({
    text,
    submessages,
    capabilities = [],
    botMetadata = {},
    botJid = '867051314767696@bot',
    richResponse = {}
} = {}) => {
    const resolvedSubmessages = submessages || (text == null ? [] : [{
        messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
        messageText: String(text)
    }]);
    return {
        messageContextInfo: {
            botMetadata: {
                ...botMetadata,
                capabilityMetadata: buildBotCapabilityMetadata(capabilities)
            }
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
                    submessages: resolvedSubmessages,
                    ...richResponse,
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        forwardedAiBotMessageInfo: { botJid },
                        forwardOrigin: 4,
                        ...(richResponse.contextInfo || {})
                    }
                }
            }
        }
    };
};

export const capability = (name) => {
    if (!capabilityNames.has(name)) throw new TypeError(`Unknown bot capability: ${name}`);
    return BotCapabilityType[name];
};
