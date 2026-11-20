/**
 * @X4R1S3
 *
 * File: lib/Utils/bot-planning-replay.js
 * About: Bot planning replay module for the X4R1S3 WhatsApp protocol client.
 * Important exports: replayPlanning, replayPlanningOnly, buildReasoningSteps, buildSearchSteps, mixedSteps
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * Lia@Changes [WIP]
 * botPlanningReplay — Meta AI-style live reasoning feed.
 *
 * UNIVERSAL VERSION: Works on ALL WhatsApp clients.
 *   - Native Meta AI rendering for compatible clients
 *   - Plain text fallback for regular clients (no "Update WhatsApp")
 *
 * Flow:
 *   Send placeholder (all steps pending)
 *     → edit: step[0] → DONE
 *     → edit: step[1] → DONE
 *     → ...
 *     → MESSAGE_EDIT: final answer on the same message key
 *
 * If you use or copy this code, please credit @X4R1S3/bailey.
 */

import { proto } from '../../WAProto/index.js';
import {
    buildCompositingPlaceholder,
    buildProgressIndicator,
    buildPlainPlaceholder,
    PlanningStepStatus
} from './meta-compositing.js';
import { BOT_RENDERING_CONFIG_METADATA } from '../Defaults/index.js';
import { delay } from './generics.js';

// ─── Internal: build native Meta AI frame ──────────────────────────────────
const buildReplayFrame = (description, steps, placeholderText = '') => {
    return buildCompositingPlaceholder({ description, steps, placeholderText });
};

// ─── Internal: edit planning bubble (native Meta AI) ───────────────────────
const editPlanningBubble = async (sock, jid, key, description, steps, placeholderText) => {
    const updated = buildReplayFrame(description, steps, placeholderText);
    await sock.sendMessage(jid, { raw: true, edit: key, ...updated });
};

// ─── Internal: edit plain text bubble (universal) ──────────────────────────
const editPlainBubble = async (sock, jid, key, description, steps, placeholderText) => {
    const updated = buildPlainPlaceholder(description, steps, placeholderText);
    await sock.sendMessage(jid, { edit: key, ...updated });
};

/**
 * replayPlanning — full live planning animation (UNIVERSAL).
 */
export const replayPlanning = async (sock, jid, steps, finalContent, {
    description = 'Thinking…',
    placeholderText = '',
    stepDelayMs = 900,
    finalPauseMs = 600,
    abortOnDisconnect = true,
    sendOptions = {},
    useNativeMeta = false
} = {}) => {
    if (!steps?.length) {
        throw new Error('replayPlanning: steps array must have at least one entry');
    }

    let aborted = false;
    const onClose = () => { aborted = true; };
    if (abortOnDisconnect) {
        sock.ev?.once?.('connection.update', ({ connection }) => {
            if (connection === 'close') onClose();
        });
    }

    // Show typing
    await sock.sendPresenceUpdate('composing', jid);

    // Build initial steps (all pending)
    const initialSteps = steps.map(step => ({
        ...step,
        status: PlanningStepStatus.IN_PROGRESS
    }));

    // Determine mode
    const isNative = useNativeMeta && false; // Always false for now — force universal

    // Send initial placeholder
    let placeholder;
    if (isNative) {
        placeholder = await sock.sendMessage(jid, {
            raw: true,
            ...buildReplayFrame(description, initialSteps, placeholderText)
        });
    } else {
        placeholder = await sock.sendMessage(jid,
            buildPlainPlaceholder(description, initialSteps, placeholderText)
        );
    }

    const key = placeholder?.key;

    // Replay loop
    try {
        const currentSteps = [...initialSteps];

        for (let i = 0; i < currentSteps.length; i++) {
            if (aborted) break;
            await delay(stepDelayMs);
            if (aborted) break;

            currentSteps[i] = { ...currentSteps[i], status: PlanningStepStatus.DONE };

            if (key) {
                if (isNative) {
                    await editPlanningBubble(sock, jid, key, description, currentSteps, placeholderText);
                } else {
                    await editPlainBubble(sock, jid, key, description, currentSteps, placeholderText);
                }
            }
        }

        if (!aborted && finalPauseMs > 0) {
            await delay(finalPauseMs);
        }

    } catch (err) {
        // Keep the latest successfully rendered frame if an intermediate edit fails.
    }

    await sock.sendPresenceUpdate('paused', jid);

    // Skip the final edit if _skipFinalSend is set (for replayPlanningOnly).
    if (sendOptions._skipFinalSend || !key || aborted) return placeholder;

    const { _skipFinalSend: _ignored, ...finalSendOptions } = sendOptions;
    return sock.sendMessage(jid, { ...finalContent, edit: key }, finalSendOptions);
};

/**
 * replayPlanningOnly — animation WITHOUT final message.
 */
export const replayPlanningOnly = async (sock, jid, steps, options = {}) => {
    return replayPlanning(sock, jid, steps, null, {
        ...options,
        sendOptions: { ...options.sendOptions, _skipFinalSend: true }
    });
};

/**
 * buildReasoningSteps — steps with isReasoning: true.
 */
export const buildReasoningSteps = (titles) =>
    titles.map(title => ({ title, isReasoning: true }));

/**
 * buildSearchSteps — steps with isEnhancedSearch: true.
 */
export const buildSearchSteps = (titles) =>
    titles.map(title => ({ title, isEnhancedSearch: true }));

/**
 * mixedSteps — mix reasoning + search + plain steps.
 */
export const mixedSteps = (defs) =>
    defs.map(({ title, body, type }) => ({
        title,
        ...(body ? { body } : {}),
        ...(type === 'reasoning' ? { isReasoning: true } : {}),
        ...(type === 'search' ? { isEnhancedSearch: true } : {})
    }));
