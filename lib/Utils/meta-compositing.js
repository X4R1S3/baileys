/**
 * @X4R1S3
 *
 * File: lib/Utils/meta-compositing.js
 * About: Meta compositing module for the X4R1S3 WhatsApp protocol client.
 * Important exports: PlanningStepStatus, supportsMetaRendering, buildProgressIndicator, buildCompositingPlaceholder, buildPlainPlaceholder, metaTyping, editMetaMessage, sendMetaComposited; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * Lia@Changes [WIP]
 * Meta Compositing — send rich messages with Meta AI-style progress indicator.
 *
 * UNIVERSAL VERSION: Works on ALL WhatsApp clients.
 *   - Native Meta AI rendering is opt-in and requires caller-supplied verification metadata
 *   - Plain text fallback is used unless the native payload can be authenticated
 *
 * metaTyping() — shows the "typing..." / planning steps indicator.
 * sendMetaComposited() — full flow: initial message → streaming MESSAGE_EDIT frames → final edit.
 *
 * If you use or copy this code, please credit @X4R1S3/bailey.
 */

import { proto } from '../../WAProto/index.js';
import { BOT_RENDERING_CONFIG_METADATA } from '../Defaults/index.js';
import { BotCapabilityType, buildBotCapabilityMetadata } from './bot-capabilities.js';
import { delay } from './generics.js';

// ─── Step status enum ───
export const PlanningStepStatus = {
    IN_PROGRESS: 0,
    DONE: 1,
    FAILED: 2
};

/**
 * Check whether the socket explicitly allows native Meta AI progress rendering.
 * WhatsApp validates bot verification metadata on these messages. The library
 * therefore refuses to fabricate certificates or signatures: native rendering
 * requires both an explicit socket opt-in and verification metadata obtained from
 * a compatible, trusted Meta AI message/session.
 */
export const supportsMetaRendering = (_jid, config = {}) => {
    return config.forceMetaRendering === true &&
        config.metaAiRendering?.verificationMetadata?.proofs?.length > 0;
};

/**
 * Build a BotProgressIndicatorMetadata object.
 */
export const buildProgressIndicator = (description, steps = [], estimatedMs) => {
    const stepsMetadata = steps.map(step => {
        const s = {
            statusTitle: step.title,
            status: step.status ?? PlanningStepStatus.IN_PROGRESS
        };
        if (step.body) s.statusBody = step.body;
        if (step.isReasoning) s.isReasoning = true;
        if (step.isEnhancedSearch) s.isEnhancedSearch = true;
        return s;
    });

    const indicator = { stepsMetadata };
    if (description) indicator.progressDescription = description;
    if (estimatedMs != null) indicator.estimatedCompletionTime = estimatedMs;
    return indicator;
};

/**
 * Build the native Meta AI compositing placeholder (for compatible clients only).
 */
export const buildCompositingPlaceholder = ({
    description = 'Thinking…',
    steps = [],
    estimatedMs,
    placeholderText = '',
    verificationMetadata
} = {}) => {
    const progressIndicatorMetadata = buildProgressIndicator(description, steps, estimatedMs);

    const textEncoder = new TextEncoder();
    const unifiedData = textEncoder.encode(JSON.stringify({
        response_id: crypto.randomUUID(),
        sections: placeholderText ? [{
            view_model: {
                primitive: {
                    text: placeholderText,
                    inline_entities: [],
                    __typename: 'GenAIMarkdownTextUXPrimitive'
                },
                __typename: 'GenAISingleLayoutViewModel'
            }
        }] : []
    }));

    const richResponseMessage = {
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: unifiedData },
        submessages: []
    };
    const capabilities = [
        BotCapabilityType.PROGRESS_INDICATOR,
        ...(steps.length ? [BotCapabilityType.AGENTIC_PLANNING] : []),
        ...(steps.some(step => step.queryPlan || step.type === 'query') ? [BotCapabilityType.QUERY_PLAN] : [])
    ];

    return {
        messageContextInfo: {
            botMetadata: {
                capabilityMetadata: buildBotCapabilityMetadata(capabilities),
                pluginMetadata: {},
                progressIndicatorMetadata,
                botRenderingConfigMetadata: BOT_RENDERING_CONFIG_METADATA,
                ...(verificationMetadata ? { verificationMetadata } : {})
            }
        },
        botForwardedMessage: {
            message: { richResponseMessage }
        }
    };
};

/**
 * Build a plain-text placeholder that works on ALL WhatsApp clients.
 */
export const buildPlainPlaceholder = (description = 'Thinking…', steps = [], placeholderText = '') => {
    const stepLines = steps.map(step => {
        const icon = step.status === PlanningStepStatus.DONE ? '✓' :
                     step.status === PlanningStepStatus.FAILED ? '✗' : '○';
        return `${icon} ${step.title}`;
    }).join('\n');

    let text = `_${description}_`;
    if (stepLines) text += `\n\n${stepLines}`;
    if (placeholderText) text += `\n\n${placeholderText}`;

    return { text };
};

/**
 * metaTyping — sends the progress/compositing indicator.
 * UNIVERSAL: plain text is the default. Native Meta progress is sent only when
 * useNativeMeta is true, forceMetaRendering is enabled, and trusted verification
 * metadata is supplied in socket.config.metaAiRendering.
 */
export const metaTyping = async (sock, jid, {
    description = 'Thinking…',
    steps = [],
    estimatedMs,
    placeholderText = '',
    useNativeMeta = false
} = {}) => {
    // Show typing indicator
    await sock.sendPresenceUpdate('composing', jid);

    if (useNativeMeta && supportsMetaRendering(jid, sock.config)) {
        const placeholder = buildCompositingPlaceholder({
            description,
            steps,
            estimatedMs,
            placeholderText,
            verificationMetadata: sock.config?.metaAiRendering?.verificationMetadata
        });
        return sock.sendMessage(jid, { raw: true, ...placeholder });
    }

    // Universal fallback: plain text placeholder
    const plainSteps = steps.map(s => ({ ...s, status: PlanningStepStatus.IN_PROGRESS }));
    const placeholder = buildPlainPlaceholder(description, plainSteps, placeholderText);
    return sock.sendMessage(jid, placeholder);
};

/** Send a streaming MESSAGE_EDIT frame without changing the original key. */
export const editMetaMessage = async (sock, jid, key, content, sendOptions = {}, streamContext) => {
    if (!key)
        return undefined;
    const frame = streamContext
        ? { ...content, messageContextInfo: { ...streamContext, ...content.messageContextInfo } }
        : content;
    return sock.sendMessage(jid, { ...frame, edit: key }, sendOptions);
};

/**
 * sendMetaComposited — full Meta AI-style flow (UNIVERSAL).
 *   1. Send initial progress indicator
 *   2. Optionally emit streamUpdates as MESSAGE_EDIT frames
 *   3. Edit the same message into the final response
 */
export const sendMetaComposited = async (sock, jid, content, {
    thinkingMs = 2000,
    description = 'Thinking…',
    steps = [],
    placeholderText = '',
    sendOptions = {},
    useNativeMeta = false,
    streamUpdates = [],
    streamUpdateDelayMs = 0,
    streamContext
} = {}) => {
    const placeholder = await metaTyping(sock, jid, {
        description, steps, estimatedMs: thinkingMs, placeholderText, useNativeMeta
    });

    try {
        await delay(thinkingMs);
        if (placeholder?.key) {
            for (const update of streamUpdates) {
                const frame = typeof update === 'string' ? { text: update } : update;
                try {
                    await editMetaMessage(sock, jid, placeholder.key, frame, sendOptions, streamContext);
                }
                catch (_) {}
                if (streamUpdateDelayMs > 0)
                    await delay(streamUpdateDelayMs);
            }
            try {
                await editMetaMessage(sock, jid, placeholder.key, content, sendOptions, streamContext);
            }
            catch (_) {
                await sock.sendMessage(jid, content, sendOptions);
            }
        }
        else {
            await sock.sendMessage(jid, content, sendOptions);
        }
    } catch (_) {}

    await sock.sendPresenceUpdate('paused', jid);
    return placeholder;
};

/**
 * Convenience: build a steps array from plain strings.
 */
export const buildSteps = (titles, status = PlanningStepStatus.IN_PROGRESS) =>
    titles.map(title => ({ title, status }));
