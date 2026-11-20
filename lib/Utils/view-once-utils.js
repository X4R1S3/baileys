/**
 * @X4R1S3
 *
 * File: lib/Utils/view-once-utils.js
 * About: View once utils module for the X4R1S3 WhatsApp protocol client.
 * Important exports: isViewOnceMessage, extractViewOnceContent, getViewOnceMediaType, getViewOnceMediaContent, downloadViewOnceMedia, createRegularMessageFromViewOnce, shouldAutoDecryptViewOnce, shouldDeleteViewOnce; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * View-Once Message Utilities
 *
 * Provides auto-detection, decryption, and handling of view-once messages.
 * - autoVV: Automatically decrypt view-once messages and re-emit as regular messages
 * - antiVV: Automatically detect and delete/view view-once messages
 */

import { downloadContentFromMessage } from './messages-media.js';
import { extractMessageContent, getContentType } from './messages.js';

/**
 * Detect if a message is a view-once message
 * @param {object} message - The message object
 * @returns {boolean}
 */
export const isViewOnceMessage = (message) => {
    if (!message) return false;
    const content = message.message || message;
    return !!(
        content.viewOnceMessage ||
        content.viewOnceMessageV2 ||
        content.viewOnceMessageV2Extension
    );
};

/**
 * Extract the inner content from a view-once message wrapper
 * @param {object} message - The message object with viewOnce wrapper
 * @returns {object|null} The inner message content or null
 */
export const extractViewOnceContent = (message) => {
    const content = message.message || message;
    const viewOnceWrapper =
        content.viewOnceMessage ||
        content.viewOnceMessageV2 ||
        content.viewOnceMessageV2Extension;

    if (!viewOnceWrapper) return null;
    return viewOnceWrapper.message || viewOnceWrapper;
};

/**
 * Get the media type from a view-once message
 * @param {object} message - The message object
 * @returns {string|null} The media type (image, video, audio, document) or null
 */
export const getViewOnceMediaType = (message) => {
    const innerContent = extractViewOnceContent(message);
    if (!innerContent) return null;

    if (innerContent.imageMessage) return 'image';
    if (innerContent.videoMessage) return 'video';
    if (innerContent.audioMessage) return 'audio';
    if (innerContent.documentMessage) return 'document';
    if (innerContent.stickerMessage) return 'sticker';

    return null;
};

/**
 * Get the media content from a view-once message
 * @param {object} message - The message object
 * @returns {object|null} The media content object with url, mediaKey, etc.
 */
export const getViewOnceMediaContent = (message) => {
    const innerContent = extractViewOnceContent(message);
    if (!innerContent) return null;

    return innerContent.imageMessage ||
           innerContent.videoMessage ||
           innerContent.audioMessage ||
           innerContent.documentMessage ||
           innerContent.stickerMessage ||
           null;
};

/**
 * Download and decrypt a view-once message's media content
 * @param {object} message - The full message object
 * @param {object} options - Options for download
 * @returns {Promise<Buffer>} The decrypted media buffer
 */
export const downloadViewOnceMedia = async (message, options = {}) => {
    const mediaContent = getViewOnceMediaContent(message);
    if (!mediaContent) {
        throw new Error('No media content found in view-once message');
    }

    const mediaType = getViewOnceMediaType(message);
    if (!mediaType) {
        throw new Error('Could not determine media type');
    }

    const stream = await downloadContentFromMessage(mediaContent, mediaType, options);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

/**
 * Create a regular message from a decrypted view-once message
 * @param {object} originalMessage - The original view-once message
 * @param {Buffer} mediaBuffer - The decrypted media buffer
 * @returns {object} A regular message object with the media
 */
export const createRegularMessageFromViewOnce = (originalMessage, mediaBuffer) => {
    const innerContent = extractViewOnceContent(originalMessage);
    if (!innerContent) return null;

    const mediaType = getViewOnceMediaType(originalMessage);
    const mediaContent = getViewOnceMediaContent(originalMessage);

    // Create a new message with the decrypted content
    const newMessage = {
        key: originalMessage.key,
        messageTimestamp: originalMessage.messageTimestamp,
        pushName: originalMessage.pushName,
        participant: originalMessage.participant,
        // Store the decrypted media
        decryptedMedia: {
            type: mediaType,
            buffer: mediaBuffer,
            mimeType: mediaContent?.mimetype,
            fileName: mediaContent?.fileName,
            caption: mediaContent?.caption,
            fileLength: mediaContent?.fileLength,
        },
        // Keep original message for reference
        originalViewOnceMessage: originalMessage.message,
    };

    return newMessage;
};

/**
 * Check if a message should be auto-decrypted based on configuration
 * @param {object} message - The message object
 * @param {object} config - Configuration object
 * @returns {boolean}
 */
export const shouldAutoDecryptViewOnce = (message, config = {}) => {
    if (!isViewOnceMessage(message)) return false;

    // Check if auto-decryption is enabled
    if (config.autoVV === false) return false;

    // Check if it's from self (don't decrypt own messages)
    if (message.key?.fromMe) return false;

    return true;
};

/**
 * Check if a message should be deleted based on anti-VV configuration
 * @param {object} message - The message object
 * @param {object} config - Configuration object
 * @returns {boolean}
 */
export const shouldDeleteViewOnce = (message, config = {}) => {
    if (!isViewOnceMessage(message)) return false;

    // Check if anti-VV is enabled
    if (config.antiVV === false) return false;

    // Check if it's from self (don't delete own messages)
    if (message.key?.fromMe) return false;

    return true;
};

/**
 * Parse view-once message info for logging/display
 * @param {object} message - The message object
 * @returns {object} Parsed view-once info
 */
export const parseViewOnceInfo = (message) => {
    const mediaType = getViewOnceMediaType(message);
    const mediaContent = getViewOnceMediaContent(message);

    return {
        isViewOnce: isViewOnceMessage(message),
        mediaType,
        mimeType: mediaContent?.mimetype,
        fileName: mediaContent?.fileName,
        caption: mediaContent?.caption,
        fileLength: mediaContent?.fileLength,
        hasUrl: !!mediaContent?.url,
        hasDirectPath: !!mediaContent?.directPath,
        hasMediaKey: !!mediaContent?.mediaKey,
    };
};

export default {
    isViewOnceMessage,
    extractViewOnceContent,
    getViewOnceMediaType,
    getViewOnceMediaContent,
    downloadViewOnceMedia,
    createRegularMessageFromViewOnce,
    shouldAutoDecryptViewOnce,
    shouldDeleteViewOnce,
    parseViewOnceInfo,
};
