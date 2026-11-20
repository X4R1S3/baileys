/**
 * @X4R1S3
 *
 * File: lib/Utils/messages.js
 * About: Messages module for the X4R1S3 WhatsApp protocol client.
 * Important exports: extractUrlFromText, generateLinkPreviewIfRequired, prepareWAMessageMedia, prepareDisappearingMessageSettingContent, generateForwardMessageContent, hasNonNullishProperty, hasOptionalProperty, hasValidAlbumMedia; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { Boom } from '@hapi/boom';
import { randomBytes } from 'crypto';
import { zip } from 'fflate';
import { promises as fs } from 'fs';
import { proto } from '../../WAProto/index.js';
import { CALL_AUDIO_PREFIX, CALL_VIDEO_PREFIX, DONATE_URL, LIBRARY_NAME, MEDIA_KEYS, URL_REGEX, WA_DEFAULT_EPHEMERAL } from '../Defaults/index.js';
import { AssociationType, ButtonHeaderType, ButtonType, CarouselCardType, ListType, ProtocolType, WAMessageStatus, WAProto } from '../Types/index.js';
import { isLidUser, isPnUser, isJidGroup, isJidNewsletter, isJidStatusBroadcast, jidEncode, jidNormalizedUser } from '../WABinary/index.js';
import { sha256 } from './crypto.js';
import { generateMessageIDV2, getKeyAuthor, unixTimestampSeconds } from './generics.js';
import { downloadContentFromMessage, encryptedStream, extractImageThumb, generateThumbnail, getAudioDuration, getAudioWaveform, getImageProcessingLibrary, getRawMediaUploadData, getStream, toBuffer } from './messages-media.js';
import { prepareRichResponseMessage } from './rich-message-utils.js';
import { shouldIncludeReportingToken } from './reporting-utils.js';
const CONCURRENCY_LIMIT = 15;
const MIMETYPE_MAP = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    'product-catalog-image': 'image/jpeg'
};
const MessageTypeProto = {
    image: WAProto.Message.ImageMessage,
    video: WAProto.Message.VideoMessage,
    audio: WAProto.Message.AudioMessage,
    sticker: WAProto.Message.StickerMessage,
    document: WAProto.Message.DocumentMessage
};
/**
 * Uses a regex to test whether the string contains a URL, and returns the URL if it does.
 * @param text eg. hello https://google.com
 * @returns the URL, eg. https://google.com
 */
export const extractUrlFromText = (text) => text.match(URL_REGEX)?.[0];
export const generateLinkPreviewIfRequired = async (text, getUrlInfo, logger) => {
    const url = extractUrlFromText(text);
    if (!!getUrlInfo && url) {
        try {
            const urlInfo = await getUrlInfo(url);
            return urlInfo;
        }
        catch (error) {
            // ignore if fails
            logger?.warn({ trace: error.stack }, 'url generation failed');
        }
    }
};
const assertColor = async (color) => {
    let assertedColor;
    if (typeof color === 'number') {
        assertedColor = color > 0 ? color : 0xffffffff + Number(color) + 1;
    }
    else {
        let hex = color.trim().replace('#', '');
        if (hex.length <= 6) {
            hex = 'FF' + hex.padStart(6, '0');
        }
        assertedColor = parseInt(hex, 16);
        return assertedColor;
    }
};
export const prepareWAMessageMedia = async (message, options) => {
    const logger = options.logger;
    let mediaType;
    for (const key of MEDIA_KEYS) {
        if (key in message) {
            mediaType = key;
        }
    }
    if (!mediaType) {
        throw new Boom('Invalid media type', { statusCode: 400 });
    }
    const uploadData = {
        ...message,
        media: message[mediaType]
    };
    delete uploadData[mediaType];
    // check if cacheable + generate cache key
    const cacheableKey = typeof uploadData.media === 'object' &&
        'url' in uploadData.media &&
        !!uploadData.media.url &&
        !!options.mediaCache &&
        mediaType + ':' + uploadData.media.url.toString();
    if (mediaType === 'document' && !uploadData.fileName) {
        uploadData.fileName = 'file';
    }
    if (!uploadData.mimetype) {
        uploadData.mimetype = MIMETYPE_MAP[mediaType];
    }
    if (mediaType === 'sticker') {
        // New compatibility names the native AI-sticker marker `meta`. WhatsApp's
        // current StickerMessage schema exposes this as `isAiSticker`.
        if (hasOptionalProperty(message, 'meta')) {
            uploadData.isAiSticker = !!message.meta;
            delete uploadData.meta;
        }
        // There is no protobuf field literally named `lock`. WhatsApp's
        // compatible native marker for stickers that should not be saved is
        // the avatar-sticker bit, which is what current clients inspect.
        if (hasOptionalProperty(message, 'lock')) {
            uploadData.isAvatar = !!message.lock;
            delete uploadData.lock;
        }
    }
    if (cacheableKey) {
        const mediaBuff = await options.mediaCache.get(cacheableKey);
        if (mediaBuff) {
            logger?.debug({ cacheableKey }, 'got media cache hit');
            const obj = proto.Message.decode(mediaBuff);
            const key = `${mediaType}Message`;
            Object.assign(obj[key], { ...uploadData, media: undefined });
            return obj;
        }
    }
    const isNewsletter = !!options.jid && isJidNewsletter(options.jid);
    if (isNewsletter) {
        logger?.info({ key: cacheableKey }, 'Preparing raw media for newsletter');
        const { filePath, fileSha256, fileLength } = await getRawMediaUploadData(uploadData.media, options.mediaTypeOverride || mediaType, logger);
        const fileSha256B64 = fileSha256.toString('base64');
        const { mediaUrl, directPath, thumbnailDirectPath, thumbnailSha256 } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs,
            newsletter: isNewsletter
        });
        await fs.unlink(filePath);
        const obj = WAProto.Message.fromObject({
            // todo: add more support here
            [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({
                url: mediaUrl,
                directPath,
                fileSha256,
                fileLength,
                thumbnailDirectPath,
                thumbnailSha256,
                ...uploadData,
                media: undefined
            })
        });
        if (uploadData.ptv) {
            obj.ptvMessage = obj.videoMessage;
            delete obj.videoMessage;
        }
        if (obj.stickerMessage) {
            obj.stickerMessage.stickerSentTs = Date.now();
        }
        if (cacheableKey) {
            logger?.debug({ cacheableKey }, 'set cache');
            await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
        }
        return obj;
    }
    const requiresDurationComputation = mediaType === 'audio' && typeof uploadData.seconds === 'undefined';
    const requiresThumbnailComputation = (mediaType === 'image' || mediaType === 'video') && typeof uploadData['jpegThumbnail'] === 'undefined';
    const requiresWaveformProcessing = mediaType === 'audio' && uploadData.ptt === true && typeof uploadData.waveform === 'undefined';
    const requiresAudioBackground = options.backgroundColor && mediaType === 'audio' && uploadData.ptt === true;
    const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;
    const { mediaKey, encFilePath, originalFilePath, fileEncSha256, fileSha256, fileLength } = await encryptedStream(uploadData.media, options.mediaTypeOverride || mediaType, {
        logger,
        saveOriginalFileIfRequired: requiresOriginalForSomeProcessing,
        opts: options.options
    });
    const fileEncSha256B64 = fileEncSha256.toString('base64');
    const [{ mediaUrl, directPath }] = await Promise.all([
        (async () => {
            const result = await options.upload(encFilePath, {
                fileEncSha256B64,
                mediaType,
                timeoutMs: options.mediaUploadTimeoutMs
            });
            logger?.debug({ mediaType, cacheableKey }, 'uploaded media');
            return result;
        })(),
        (async () => {
            try {
                if (requiresThumbnailComputation) {
                    const { thumbnail, originalImageDimensions } = await generateThumbnail(originalFilePath, mediaType, options);
                    uploadData.jpegThumbnail = thumbnail;
                    if (!uploadData.width && originalImageDimensions) {
                        uploadData.width = originalImageDimensions.width;
                        uploadData.height = originalImageDimensions.height;
                        logger?.debug('set dimensions');
                    }
                    logger?.debug('generated thumbnail');
                }
                if (requiresDurationComputation) {
                    uploadData.seconds = await getAudioDuration(originalFilePath);
                    logger?.debug('computed audio duration');
                }
                if (requiresWaveformProcessing) {
                    uploadData.waveform = await getAudioWaveform(originalFilePath, logger);
                    logger?.debug('processed waveform');
                }
                if (requiresAudioBackground) {
                    uploadData.backgroundArgb = await assertColor(options.backgroundColor);
                    logger?.debug('computed backgroundColor audio status');
                }
            }
            catch (error) {
                logger?.warn({ trace: error.stack }, 'failed to obtain extra info');
            }
        })()
    ]).finally(async () => {
        try {
            await fs.unlink(encFilePath);
            if (originalFilePath) {
                await fs.unlink(originalFilePath);
            }
            logger?.debug('removed tmp files');
        }
        catch (error) {
            logger?.warn('failed to remove tmp file');
        }
    });
    const obj = WAProto.Message.fromObject({
        [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({
            url: mediaUrl,
            directPath,
            mediaKey,
            fileEncSha256,
            fileSha256,
            fileLength,
            mediaKeyTimestamp: unixTimestampSeconds(),
            ...uploadData,
            media: undefined
        })
    });
    if (uploadData.ptv) {
        obj.ptvMessage = obj.videoMessage;
        delete obj.videoMessage;
    }
    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache');
        await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
    }
    return obj;
};
// Lia@Changes 31-01-26 --- Extract product message into a standalone function so it can also be reused as the header for interactive messages
const prepareProductMessage = async (message, options) => {
    if (!message.businessOwnerJid) {
        throw new Boom('"businessOwnerJid" is missing from the content', { statusCode: 400 });
    }
    const { imageMessage } = await prepareWAMessageMedia({ image: message.image || message.product.productImage }, options);
    // Lia@Changes 01-02-26 --- Add product message default value
    const { image, ...content } = message;
    content.product = {
        currencyCode: 'IDR',
        priceAmount1000: 1000,
        title: LIBRARY_NAME,
        ...message.product,
        productImage: imageMessage
    };
    return content;
};
/**
 * Lia@Note 30-01-26
 * ---
 * Credits: Work on ensuring stickerPackMessage fields are valid by @jlucaso1 (https://github.com/jlucaso1).
 * based on https://github.com/WhiskeySockets/Baileys/pull/1561
 */
// Lia@Changes 21-04-26 --- Enhanced prepareStickerPackMessage
const prepareStickerPackMessage = async (message, options) => {
    const { cover, stickers = [], name = '📦 Sticker Pack', publisher = 'Website: www.npmjs.com/package/@x4r1s3/baileys', description = '🏷️ X4R1S3/bailey' } = message;
    if (stickers.length > 60) {
        throw new Boom('Sticker pack exceeds the maximum limit of 60 stickers', { statusCode: 400 });
    }
    if (stickers.length === 0) {
        throw new Boom('Sticker pack must contain at least one sticker', { statusCode: 400 });
    }
    if (!cover) {
        throw new Boom('Sticker pack must contain a cover', { statusCode: 400 });
    }
    const logger = options.logger;
    // Lia@Changes 01-02-26 --- Add caching for sticker pack
    let cacheableKey = false;
    if (Array.isArray(stickers) && stickers.length && options.mediaCache) {
        const urls = [];
        for (let i = 0; i < stickers.length; i++) {
            const data = stickers[i].data;
            if (typeof data === 'object' && data?.url) {
                urls.push(data.url);
            }
        }
        if (urls.length > 0) {
            cacheableKey = 'sticker:' + urls.join('@');
        }
    }
    if (cacheableKey) {
        const mediaBuff = await options.mediaCache.get(cacheableKey);
        if (mediaBuff) {
            logger?.debug({ cacheableKey }, 'got media cache hit');
            return proto.Message.StickerPackMessage.decode(mediaBuff);
        }
    }
    const lib = await getImageProcessingLibrary();
    const hasSharp = 'sharp' in lib && !!lib.sharp?.default;
    const hasImage = 'image' in lib && !!lib.image?.Transformer;
    const hasJimp = 'jimp' in lib && !!lib.jimp?.Jimp;
    if (!hasSharp && !hasImage) {
        throw new Boom('No image processing library (sharp or @napi-rs/image) available for converting sticker to WebP.');
    }
    const stickerPackIdValue = generateMessageIDV2();
    const stickerData = {};
    const stickerMetadata = new Array(stickers.length);
    for (let i = 0; i < stickers.length; i += CONCURRENCY_LIMIT) {
        const promises = [];
        const chunkEnd = Math.min(i + CONCURRENCY_LIMIT, stickers.length);
        for (let j = i; j < chunkEnd; j++) {
            promises.push((async (index) => {
                const sticker = stickers[index];
                const { stream } = await getStream(sticker.data);
                const buffer = await toBuffer(stream);
                let webpBuffer;
                let isAnimated = false;
                if (isWebPBuffer(buffer)) {
                    webpBuffer = buffer;
                    isAnimated = isAnimatedWebP(buffer);
                }
                else if (hasSharp) {
                    webpBuffer = await lib.sharp.default(buffer)
                        .resize(512, 512, { fit: 'inside' })
                        .webp({ quality: 80 })
                        .toBuffer();
                }
                else {
                    webpBuffer = await new lib.image.Transformer(buffer)
                        .resize(512, 512)
                        .webp(80);
                }
                if (webpBuffer.length > 1024 * 1024) {
                    throw new Boom(`Sticker at index ${index} exceeds the 1MB size limit`, { statusCode: 400 });
                }
                const hash = sha256(webpBuffer).toString('base64').replace(/\//g, '-');
                const fileName = `${hash}.webp`;
                stickerData[fileName] = [new Uint8Array(webpBuffer), { level: 0 }];
                stickerMetadata[index] = {
                    fileName,
                    mimetype: 'image/webp',
                    isAnimated,
                    emojis: sticker.emojis || ['✨'],
                    accessibilityLabel: sticker.accessibilityLabel || '‎'
                };
            })(j));
        }
        await Promise.all(promises);
    }
    const trayIconFileName = `${stickerPackIdValue}.webp`;
    const { stream: coverStream } = await getStream(cover);
    const coverBuffer = await toBuffer(coverStream);
    let coverWebpBuffer;
    if (isWebPBuffer(coverBuffer)) {
        coverWebpBuffer = coverBuffer;
    }
    else if (hasSharp) {
        coverWebpBuffer = await lib.sharp.default(coverBuffer)
            .resize(512, 512, { fit: 'inside' })
            .webp({ quality: 80 })
            .toBuffer();
    }
    else {
        coverWebpBuffer = await new lib.image.Transformer(coverBuffer)
            .resize(512, 512)
            .webp(80);
    }
    stickerData[trayIconFileName] = [new Uint8Array(coverWebpBuffer), { level: 0 }];
    const zipBuffer = await new Promise((resolve, reject) => {
        zip(stickerData, (error, data) => error ? reject(error) : resolve(Buffer.from(data)));
    });
    const stickerPackUpload = await encryptedStream(zipBuffer, 'sticker-pack', {
        logger,
        opts: options.options
    });
    let stickerPackUploadResult;
    try {
        stickerPackUploadResult = await options.upload(stickerPackUpload.encFilePath, {
            fileEncSha256B64: stickerPackUpload.fileEncSha256.toString('base64'),
            mediaType: 'sticker-pack',
            timeoutMs: options.mediaUploadTimeoutMs
        });
    }
    finally {
        fs.unlink(stickerPackUpload.encFilePath).catch(() => logger?.warn('failed to remove tmp file'));
    }
    const obj = {
        name,
        publisher,
        stickerPackId: stickerPackIdValue,
        packDescription: description,
        stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED,
        stickerPackSize: zipBuffer.length,
        stickers: stickerMetadata,
        fileSha256: stickerPackUpload.fileSha256,
        fileEncSha256: stickerPackUpload.fileEncSha256,
        mediaKey: stickerPackUpload.mediaKey,
        directPath: stickerPackUploadResult.directPath,
        fileLength: stickerPackUpload.fileLength,
        mediaKeyTimestamp: unixTimestampSeconds(),
        trayIconFileName
    };
    try {
        let thumbnailBuffer;
        if (hasSharp) {
            thumbnailBuffer = await lib.sharp.default(coverBuffer).resize(252, 252).jpeg().toBuffer();
        }
        else if (hasImage) {
            thumbnailBuffer = await new lib.image.Transformer(coverBuffer).resize(252, 252).jpeg();
        }
        else if (hasJimp) {
            const jimpImage = await lib.jimp.Jimp.read(coverBuffer);
            thumbnailBuffer = await jimpImage.resize({ w: 252, h: 252 }).getBuffer('image/jpeg');
        }
        else {
            throw new Error('No image processing library available for thumbnail generation');
        }
        if (!thumbnailBuffer || thumbnailBuffer.length === 0) {
            throw new Error('Failed to generate thumbnail buffer');
        }
        const thumbUpload = await encryptedStream(thumbnailBuffer, 'thumbnail-sticker-pack', {
            logger,
            opts: options.options,
            mediaKey: stickerPackUpload.mediaKey
        });
        let thumbUploadResult;
        try {
            thumbUploadResult = await options.upload(thumbUpload.encFilePath, {
                fileEncSha256B64: thumbUpload.fileEncSha256.toString('base64'),
                mediaType: 'thumbnail-sticker-pack',
                timeoutMs: options.mediaUploadTimeoutMs
            });
        }
        finally {
            fs.unlink(thumbUpload.encFilePath).catch(() => logger?.warn('failed to remove tmp file'));
        }
        Object.assign(obj, {
            thumbnailDirectPath: thumbUploadResult.directPath,
            thumbnailSha256: thumbUpload.fileSha256,
            thumbnailEncSha256: thumbUpload.fileEncSha256,
            thumbnailHeight: 252,
            thumbnailWidth: 252,
            imageDataHash: sha256(thumbnailBuffer).toString('base64')
        });
    }
    catch (error) {
        logger?.warn(`Thumbnail generation failed: ${error}`);
    }
    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache (background)');
        options.mediaCache.set(cacheableKey, WAProto.Message.StickerPackMessage.encode(obj).finish());
    }
    return WAProto.Message.StickerPackMessage.fromObject(obj);
};
// Lia@Changes 30-01-26 --- Add native flow button helper for interactive message
const prepareNativeFlowButtons = (message) => {
    const buttons = message.nativeFlow;
    const isButtonsFieldArray = Array.isArray(buttons);
    const correctedField = isButtonsFieldArray ? buttons : buttons.buttons;
    const messageParamsJson = {};
    // Lia@Changes 31-01-26 --- Add offer and options inside interactive message
    if (hasOptionalProperty(message, 'offerText') && !!message.offerText) {
        Object.assign(messageParamsJson, {
            limited_time_offer: {
                text: message.offerText || LIBRARY_NAME,
                url: message.offerUrl || DONATE_URL, // Lia@Note 02-02-26 --- Apologies if this feels cheeky, just a fallback
                copy_code: message.offerCode,
                expiration_time: message.offerExpiration
            }
        });
    }
    if (hasOptionalProperty(message, 'optionText') && !!message.optionText) {
        Object.assign(messageParamsJson, {
            bottom_sheet: {
                in_thread_buttons_limit: 1,
                divider_indices: Array.from({ length: correctedField.length }, (_, index) => index),
                list_title: message.optionTitle || '📄 Select Options',
                button_title: message.optionText
            }
        });
    }
    return {
        buttons: correctedField.map(button => {
            const buttonText = button.text || button.buttonText;
            const buttonIcon = button.icon?.toUpperCase();
            if (hasOptionalProperty(button, 'id') && !!button.id) {
                return {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: buttonText || '👉🏻 Click',
                        id: button.id,
                        icon: buttonIcon,
                        ...(button.toast ? { toast: button.toast } : {})
                    })
                };
            }
            else if (hasOptionalProperty(button, 'copy') && !!button.copy) {
                return {
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: buttonText || '📋 Copy',
                        copy_code: button.copy,
                        icon: buttonIcon,
                        ...(button.toast ? { toast: button.toast } : {})
                    })
                };
            }
            else if (hasOptionalProperty(button, 'url') && !!button.url) {
                return {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: buttonText || '🌐 Visit',
                        url: button.url,
                        merchant_url: button.url,
                        webview_interaction: button.useWebview,
                        ...(button.toast ? { toast: button.toast } : {}),
                        icon: buttonIcon
                    })
                };
            }
            else if (hasOptionalProperty(button, 'call') && !!button.call) {
                return {
                    name: 'cta_call',
                    buttonParamsJson: JSON.stringify({
                        display_text: buttonText || '📞 Call',
                        phone_number: button.call,
                        icon: buttonIcon
                    })
                };
            }
            // Lia@Changes 12-03-26 --- Add "single_select" shortcut ＼⁠(⁠°⁠o⁠°⁠)⁠／
            else if (hasOptionalProperty(button, 'sections') && !!button.sections) {
                return {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: buttonText || '📋 Select',
                        sections: button.sections,
                        icon: buttonIcon
                    })
                };
            }
            return button;
        }),
        messageParamsJson: JSON.stringify(messageParamsJson)
    };
};
export const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
    ephemeralExpiration = ephemeralExpiration || 0;
    const content = {
        ephemeralMessage: {
            message: {
                protocolMessage: {
                    type: WAProto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                    ephemeralExpiration
                }
            }
        }
    };
    return WAProto.Message.fromObject(content);
};
/**
 * Generate forwarded message content like WA does
 * @param message the message to forward
 * @param options.forceForward will show the message as forwarded even if it is from you
 */
export const generateForwardMessageContent = (message, forceForward) => {
    let content = message.message;
    if (!content) {
        throw new Boom('no content in message', { statusCode: 400 });
    }
    // hacky copy
    content = normalizeMessageContent(content);
    content = proto.Message.decode(proto.Message.encode(content).finish());
    let key = Object.keys(content)[0];
    let score = content?.[key]?.contextInfo?.forwardingScore || 0;
    score += message.key.fromMe && !forceForward ? 0 : 1;
    if (key === 'conversation') {
        content.extendedTextMessage = { text: content[key] };
        delete content.conversation;
        key = 'extendedTextMessage';
    }
    const key_ = content?.[key];
    if (score > 0) {
        key_.contextInfo = { forwardingScore: score, isForwarded: true };
    }
    else {
        key_.contextInfo = {};
    }
    return content;
};
export const hasNonNullishProperty = (message, key) => {
    return message != null &&
        typeof message === 'object' &&
        key in message &&
        message[key] != null;
};
export const hasOptionalProperty = (obj, key) => {
    return obj != null &&
        typeof obj === 'object' &&
        key in obj &&
        obj[key] != null;
};
// Lia@Changes 06-02-26 --- Validate album message media to avoid bug
export const hasValidAlbumMedia = (message) => {
    return !!(message.imageMessage ||
        message.videoMessage);
};
export const hasValidInteractiveHeader = (message) => {
    return !!(message.imageMessage ||
        message.videoMessage ||
        message.documentMessage ||
        message.productMessage ||
        message.locationMessage);
};
// Lia@Changes 30-01-26 --- Validate carousel cards header to avoid bug
export const hasValidCarouselHeader = (message) => {
    return !!(message.imageMessage ||
        message.videoMessage ||
        message.productMessage);
};
export const generateWAMessageContent = async (message, options) => {
    var _a, _b;
    const fixupExternalAdReply = async (externalAdReply) => {
        if (!externalAdReply || typeof externalAdReply !== 'object') {
            return externalAdReply;
        }
        const thumbUrl = externalAdReply.originalImageUrl || externalAdReply.thumbnailUrl;
        const currentThumb = externalAdReply.thumbnail;
        const currentThumbLength = currentThumb && typeof currentThumb.length === 'number' ? currentThumb.length : 0;
        if (thumbUrl && (!currentThumb || currentThumbLength < 2000)) {
            let downloaded;
            try {
                const response = await fetch(thumbUrl, { signal: AbortSignal.timeout(7000) });
                if (response.ok) {
                    downloaded = Buffer.from(await response.arrayBuffer());
                    if (downloaded.length) {
                        const { buffer } = await extractImageThumb(downloaded, 192);
                        if (buffer?.length) {
                            externalAdReply.thumbnail = buffer;
                        }
                    }
                }
            }
            catch (error) {
                const isBoundedJpeg = downloaded?.length <= 512 * 1024 && downloaded?.length >= 4 &&
                    downloaded[0] === 0xff && downloaded[1] === 0xd8 &&
                    downloaded[downloaded.length - 2] === 0xff && downloaded[downloaded.length - 1] === 0xd9;
                if (isBoundedJpeg) {
                    externalAdReply.thumbnail = downloaded;
                }
                options?.logger?.warn?.({ err: error?.message, url: thumbUrl }, isBoundedJpeg
                    ? 'failed to resize externalAdReply thumbnail; using bounded original JPEG'
                    : 'failed to download externalAdReply thumbnail');
            }
        }
        const thumbnail = externalAdReply.thumbnail;
        const hasThumbnail = !!(thumbnail && (thumbnail.length || thumbnail.byteLength));
        const isPrivateUrl = (value) => typeof value === 'string' && /(?:^|[/.])[a-z0-9-]*\.?whatsapp\.net\//i.test(value);
        if (hasThumbnail) {
            if (isPrivateUrl(externalAdReply.thumbnailUrl)) delete externalAdReply.thumbnailUrl;
            if (isPrivateUrl(externalAdReply.originalImageUrl)) delete externalAdReply.originalImageUrl;
        }
        if (externalAdReply.mediaType == null) externalAdReply.mediaType = hasThumbnail ? 1 : 0;
        if (externalAdReply.showAdAttribution === undefined) externalAdReply.showAdAttribution = false;
        if (externalAdReply.renderLargerThumbnail === undefined) externalAdReply.renderLargerThumbnail = hasThumbnail;
        return externalAdReply;
    };
    if (message.contextInfo?.externalAdReply) {
        message.contextInfo.externalAdReply = await fixupExternalAdReply(message.contextInfo.externalAdReply);
    }
    if (message.externalAdReply) {
        message.externalAdReply = await fixupExternalAdReply(message.externalAdReply);
    }
    const externalAdReplyForFallback = message.externalAdReply || message.contextInfo?.externalAdReply;
    if (externalAdReplyForFallback && typeof message.text === 'string' && typeof message.linkPreview === 'undefined') {
        const previewUrl = [
            externalAdReplyForFallback.sourceUrl,
            externalAdReplyForFallback.adPreviewUrl,
            externalAdReplyForFallback.wtwaWebsiteUrl,
            externalAdReplyForFallback.mediaUrl,
            externalAdReplyForFallback.url
        ].find((value) => {
            if (typeof value !== 'string') return false;
            try {
                const protocol = new URL(value).protocol;
                return protocol === 'http:' || protocol === 'https:';
            }
            catch {
                return false;
            }
        });
        if (previewUrl) {
            const originalText = message.text.trimEnd();
            if (!message.text.includes(previewUrl)) {
                message.text = originalText ? `${originalText}\n${previewUrl}` : previewUrl;
            }
            const thumbnail = externalAdReplyForFallback.thumbnail;
            message.linkPreview = {
                'matched-text': previewUrl,
                ...(externalAdReplyForFallback.title ? { title: externalAdReplyForFallback.title } : {}),
                ...(externalAdReplyForFallback.body ? { description: externalAdReplyForFallback.body } : {}),
                previewType: 0,
                ...(thumbnail && (Buffer.isBuffer(thumbnail) || thumbnail instanceof Uint8Array)
                    ? { jpegThumbnail: Buffer.from(thumbnail) }
                    : {})
            };
        }
    }
    let m = {};
    // Lia@Changes 30-01-26 --- Add "raw" boolean to send raw messages directly via generateWAMessage()
    if (hasNonNullishProperty(message, 'raw')) {
        delete message.raw;
        return message;
    }
    // Lia@Changes 09-04-26 --- Add support for code block and table with richResponseMessage
    else if (hasNonNullishProperty(message, 'code') ||
        hasNonNullishProperty(message, 'links') ||
        hasNonNullishProperty(message, 'table') ||
        hasNonNullishProperty(message, 'richResponse')) {
        m = prepareRichResponseMessage(message);
    }
    else if (hasNonNullishProperty(message, 'text')) {
        const extContent = { text: message.text };
        let urlInfo = message.linkPreview;
        if (typeof urlInfo === 'undefined') {
            urlInfo = await generateLinkPreviewIfRequired(message.text, options.getUrlInfo, options.logger);
        }
        if (urlInfo) {
            extContent.matchedText = urlInfo['matched-text'];
            extContent.jpegThumbnail = urlInfo.jpegThumbnail;
            extContent.description = urlInfo.description;
            extContent.title = urlInfo.title;
            extContent.previewType = urlInfo.previewType ?? 0;
            extContent.linkPreviewMetadata = urlInfo.linkPreviewMetadata;
            const img = urlInfo.highQualityThumbnail;
            if (img) {
                extContent.thumbnailDirectPath = img.directPath;
                extContent.mediaKey = img.mediaKey;
                extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
                extContent.thumbnailWidth = img.width;
                extContent.thumbnailHeight = img.height;
                extContent.thumbnailSha256 = img.fileSha256;
                extContent.thumbnailEncSha256 = img.fileEncSha256;
            }
        }
        const faviconData = message.favicon;
        if (faviconData && typeof options.upload === 'function') {
            const { imageMessage } = await prepareWAMessageMedia({
                image: faviconData
            }, options);
            extContent.faviconMMSMetadata = {
                thumbnailDirectPath: imageMessage.directPath,
                mediaKey: imageMessage.mediaKey,
                mediaKeyTimestamp: imageMessage.mediaKeyTimestamp,
                thumbnailWidth: 32,
                thumbnailHeight: 32,
                thumbnailSha256: imageMessage.fileSha256,
                thumbnailEncSha256: imageMessage.fileEncSha256
            };
        }
        if (options.backgroundColor !== undefined) {
            extContent.backgroundArgb = await assertColor(options.backgroundColor);
        }
        if (options.font !== undefined) {
            if (!Number.isInteger(options.font) || options.font < 0 || options.font > 9) {
                throw new Boom('font must be an integer between 0 and 9', { statusCode: 400 });
            }
            extContent.font = options.font;
        }
        m.extendedTextMessage = extContent;
    }
    else if (hasNonNullishProperty(message, 'contacts')) {
        const contactLen = message.contacts.contacts.length;
        if (!contactLen) {
            throw new Boom('require atleast 1 contact', { statusCode: 400 });
        }
        if (contactLen === 1) {
            m.contactMessage = WAProto.Message.ContactMessage.create(message.contacts.contacts[0]);
        }
        else {
            m.contactsArrayMessage = WAProto.Message.ContactsArrayMessage.create(message.contacts);
        }
    }
    else if (hasNonNullishProperty(message, 'location')) {
        m.locationMessage = WAProto.Message.LocationMessage.create(message.location);
    }
    else if (hasNonNullishProperty(message, 'react')) {
        if (!message.react.senderTimestampMs) {
            message.react.senderTimestampMs = Date.now();
        }
        m.reactionMessage = WAProto.Message.ReactionMessage.create(message.react);
    }
    else if (hasNonNullishProperty(message, 'delete')) {
        m.protocolMessage = {
            key: message.delete,
            type: WAProto.Message.ProtocolMessage.Type.REVOKE
        };
    }
    else if (hasNonNullishProperty(message, 'forward')) {
        m = generateForwardMessageContent(message.forward, message.force);
    }
    else if (hasNonNullishProperty(message, 'disappearingMessagesInChat')) {
        const exp = typeof message.disappearingMessagesInChat === 'boolean'
            ? message.disappearingMessagesInChat
                ? WA_DEFAULT_EPHEMERAL
                : 0
            : message.disappearingMessagesInChat;
        m = prepareDisappearingMessageSettingContent(exp);
    }
    else if (hasNonNullishProperty(message, 'groupInvite')) {
        m.groupInviteMessage = {};
        m.groupInviteMessage.inviteCode = message.groupInvite.inviteCode;
        m.groupInviteMessage.inviteExpiration = message.groupInvite.inviteExpiration;
        m.groupInviteMessage.caption = message.groupInvite.text;
        m.groupInviteMessage.groupJid = message.groupInvite.jid;
        m.groupInviteMessage.groupName = message.groupInvite.subject;
        //TODO: use built-in interface and get disappearing mode info etc.
        //TODO: cache / use store!?
        if (options.getProfilePicUrl) {
            const pfpUrl = await options.getProfilePicUrl(message.groupInvite.jid, 'preview');
            if (pfpUrl) {
                const resp = await fetch(pfpUrl, { method: 'GET', dispatcher: options?.options?.dispatcher });
                if (resp.ok) {
                    const buf = Buffer.from(await resp.arrayBuffer());
                    m.groupInviteMessage.jpegThumbnail = buf;
                }
            }
        }
    }
    else if (hasNonNullishProperty(message, 'stickers')) {
        m.stickerPackMessage = await prepareStickerPackMessage(message, options);
    }
    else if (hasNonNullishProperty(message, 'pin')) {
        m.pinInChatMessage = {};
        m.messageContextInfo = {};
        m.pinInChatMessage.key = message.pin;
        m.pinInChatMessage.type = message.type;
        m.pinInChatMessage.senderTimestampMs = Date.now();
        m.messageContextInfo.messageAddOnDurationInSecs = message.type === 1 ? message.time || 86400 : 0;
    }
    else if (hasNonNullishProperty(message, 'keep')) {
        m.keepInChatMessage = {};
        m.keepInChatMessage.key = message.keep;
        m.keepInChatMessage.keepType = message.type;
        m.keepInChatMessage.timestampMs = Date.now();
    }
    else if (hasNonNullishProperty(message, 'flowReply')) {
        m.interactiveResponseMessage = {
            body: {
                format: message.flowReply.format || proto.Message.InteractiveResponseMessage.Body.Format.DEFAULT,
                text: message.flowReply.text
            },
            nativeFlowResponseMessage: {
                name: message.flowReply.name,
                paramsJson: message.flowReply.paramsJson || '{}',
                version: message.flowReply.version || 1
            }
        };
    }
    else if (hasNonNullishProperty(message, 'buttonReply')) {
        switch (message.type) {
            case 'template':
                m.templateButtonReplyMessage = {
                    selectedDisplayText: message.buttonReply.displayText,
                    selectedId: message.buttonReply.id,
                    selectedIndex: message.buttonReply.index
                };
                break;
            case 'plain':
                m.buttonsResponseMessage = {
                    selectedButtonId: message.buttonReply.id,
                    selectedDisplayText: message.buttonReply.displayText,
                    type: proto.Message.ButtonsResponseMessage.Type.DISPLAY_TEXT
                };
                break;
        }
    }
    else if (hasNonNullishProperty(message, 'listReply')) {
        m.listResponseMessage = {
            description: message.listReply.description,
            listType: proto.Message.ListResponseMessage.ListType.SINGLE_SELECT,
            singleSelectReply: {
                selectedRowId: message.listReply.id
            },
            title: message.listReply.title
        };
    }
    else if (hasOptionalProperty(message, 'ptv') && message.ptv) {
        const { videoMessage } = await prepareWAMessageMedia({ video: message.video }, options);
        m.ptvMessage = videoMessage;
    }
    else if (hasNonNullishProperty(message, 'product')) {
        m.productMessage = await prepareProductMessage(message, options);
    }
    else if (hasNonNullishProperty(message, 'music') || hasNonNullishProperty(message, 'musicMessage')) {
        const music = message.music ?? message.musicMessage;
        if (!music || typeof music !== 'object' || Array.isArray(music)) {
            throw new Boom('music must be a MusicMessage content object', { statusCode: 400 });
        }
        if (!music.embeddedMusic && !music.songUri && !music.artworkUri) {
            throw new Boom('music requires embeddedMusic, songUri, or artworkUri', { statusCode: 400 });
        }
        m.musicMessage = proto.Message.MusicMessage.fromObject(music);
    }
    else if (hasNonNullishProperty(message, 'eventInvite') || hasNonNullishProperty(message, 'eventInviteMessage')) {
        const invite = message.eventInvite || message.eventInviteMessage;
        if (!invite.eventId && !invite.id) {
            throw new Boom('eventInvite requires an eventId', { statusCode: 400 });
        }
        const startTime = invite.startDate instanceof Date
            ? Math.floor(invite.startDate.getTime() / 1000)
            : invite.startTime != null ? Number(invite.startTime) : undefined;
        const endTime = invite.endDate instanceof Date
            ? Math.floor(invite.endDate.getTime() / 1000)
            : invite.endTime != null ? Number(invite.endTime) : undefined;
        m.eventInviteMessage = proto.Message.EventInviteMessage.fromObject({
            eventId: invite.eventId || invite.id,
            eventTitle: invite.title || invite.eventTitle || '',
            caption: invite.text || invite.caption || '',
            startTime,
            endTime,
            isCanceled: invite.isCancelled ?? invite.isCanceled ?? false,
            jpegThumbnail: invite.thumbnail || invite.jpegThumbnail,
            callLink: invite.callLink,
            coverImageHandle: invite.coverImageHandle,
            locationName: invite.locationName,
            lastUpdatedTsUsec: invite.lastUpdatedTsUsec,
            status: invite.status,
            contextInfo: invite.contextInfo
        });
    }
    else if (hasNonNullishProperty(message, 'event')) {
        m.eventMessage = {};
        const startTime = Math.floor(message.event.startDate.getTime() / 1000);
        if (message.event.call && options.getCallLink) {
            const token = await options.getCallLink(message.event.call, { startTime });
            m.eventMessage.joinLink = (message.event.call === 'audio' ? CALL_AUDIO_PREFIX : CALL_VIDEO_PREFIX) + token;
        }
        m.messageContextInfo = {
            // encKey
            messageSecret: message.event.messageSecret || randomBytes(32)
        };
        m.eventMessage.name = message.event.name;
        m.eventMessage.description = message.event.description;
        m.eventMessage.startTime = startTime;
        m.eventMessage.endTime = message.event.endDate ? message.event.endDate.getTime() / 1000 : undefined;
        m.eventMessage.isCanceled = message.event.isCancelled ?? false;
        m.eventMessage.extraGuestsAllowed = message.event.extraGuestsAllowed;
        m.eventMessage.isScheduleCall = message.event.isScheduleCall ?? false;
        m.eventMessage.location = message.event.location;
    }
    else if (hasNonNullishProperty(message, 'imagePoll')) {
        const imagePoll = message.imagePoll;
        if (!Array.isArray(imagePoll.options) || imagePoll.options.length < 2 || imagePoll.options.length > 12) {
            throw new Boom('imagePoll.options must contain between 2 and 12 options', { statusCode: 400 });
        }
        const selectableOptionsCount = imagePoll.selectableCount ?? 1;
        if (selectableOptionsCount < 0 || selectableOptionsCount > imagePoll.options.length) {
            throw new Boom(`imagePoll.selectableCount should be >= 0 and <= ${imagePoll.options.length}`, {
                statusCode: 400
            });
        }
        m.pollCreationMessageV3 = {
            name: imagePoll.name,
            selectableOptionsCount,
            options: imagePoll.options.map(option => ({
                optionName: option.optionName,
                optionHash: option.optionHash
            })),
            pollContentType: WAProto.Message.PollContentType.IMAGE,
            endTime: imagePoll.endDate ? imagePoll.endDate.getTime() : undefined,
            hideParticipantName: imagePoll.hideVoter ?? false,
            allowAddOption: imagePoll.canAddOption ?? false
        };
        m.messageContextInfo = {
            messageSecret: imagePoll.messageSecret || randomBytes(32)
        };
    }
    else if (hasNonNullishProperty(message, 'poll')) {
        (_a = message.poll).selectableCount || (_a.selectableCount = 0);
        (_b = message.poll).toAnnouncementGroup || (_b.toAnnouncementGroup = false);
        if (!Array.isArray(message.poll.values)) {
            throw new Boom('Invalid poll values', { statusCode: 400 });
        }
        if (message.poll.selectableCount < 0 || message.poll.selectableCount > message.poll.values.length) {
            throw new Boom(`poll.selectableCount in poll should be >= 0 and <= ${message.poll.values.length}`, {
                statusCode: 400
            });
        }
        const pollCreationMessage = {
            name: message.poll.name,
            selectableOptionsCount: message.poll.selectableCount,
            options: message.poll.values.map(optionName => ({ optionName })),
            endTime: message.poll.endDate ? message.poll.endDate.getTime() : undefined,
            hideParticipantName: message.poll.hideVoter ?? false,
            allowAddOption: message.poll.canAddOption ?? false
        };
        if (message.poll.toAnnouncementGroup) {
            // poll v2 is for community announcement groups (single select and multiple)
            m.pollCreationMessageV2 = pollCreationMessage;
        }
        else {
            // Lia@Changes 08-02-26 --- Add quiz message support
            if (message.poll.pollType === 1) {
                if (!message.poll.correctAnswer) {
                    throw new Boom('No "correctAnswer" provided for quiz', { statusCode: 400 });
                }
                m.pollCreationMessageV5 = {
                    // Lia@Note 08-02-26 --- quiz for newsletter only
                    ...pollCreationMessage,
                    correctAnswer: {
                        optionName: message.poll.correctAnswer.toString()
                    },
                    pollType: 1,
                    selectableOptionsCount: 1
                };
            }
            else if (message.poll.selectableCount === 1) {
                //poll v3 is for single select polls
                m.pollCreationMessageV3 = pollCreationMessage;
            }
            else {
                // poll for multiple choice polls
                m.pollCreationMessage = pollCreationMessage;
            }
        }
        m.messageContextInfo = {
            // encKey
            messageSecret: message.poll.messageSecret || randomBytes(32)
        };
    }
    // Lia@Changes 08-02-26 --- Add poll result snapshot message
    else if (hasNonNullishProperty(message, 'pollResult')) {
        const pollResultSnapshotMessage = {
            name: message.pollResult.name,
            pollVotes: message.pollResult.votes.map(vote => ({
                optionName: vote.name,
                optionVoteCount: parseInt(vote.voteCount)
            }))
        };
        if (message.pollResult.pollType === 1) {
            pollResultSnapshotMessage.pollType = proto.Message.PollType.QUIZ;
            m.pollResultSnapshotMessageV3 = pollResultSnapshotMessage;
        }
        else {
            pollResultSnapshotMessage.pollType = proto.Message.PollType.POLL;
            m.pollResultSnapshotMessage = pollResultSnapshotMessage;
        }
    }
    // Lia@Changes 08-02-26 --- Add poll update message
    else if (hasNonNullishProperty(message, 'pollUpdate')) {
        if (!message.pollUpdate.key) {
            throw new Boom('Message key is required', { statusCode: 400 });
        }
        if (!message.pollUpdate.vote) {
            throw new Boom('Encrypted vote payload is required', { statusCode: 400 });
        }
        m.pollUpdateMessage = {
            metadata: message.pollUpdate.metadata,
            pollCreationMessageKey: message.pollUpdate.key,
            senderTimestampMs: Date.now(),
            vote: message.pollUpdate.vote
        };
    }
    else if (hasNonNullishProperty(message, 'pollAddOption') || hasNonNullishProperty(message, 'pollAddOptionMessage')) {
        const addition = message.pollAddOption ?? message.pollAddOptionMessage;
        if (!addition || typeof addition !== 'object' || Array.isArray(addition)) {
            throw new Boom('pollAddOption must be an object', { statusCode: 400 });
        }
        const pollCreationMessageKey = addition.pollCreationMessageKey ?? addition.key;
        if (!pollCreationMessageKey?.remoteJid || !pollCreationMessageKey?.id) {
            throw new Boom('pollAddOption requires the original poll message key (remoteJid and id)', { statusCode: 400 });
        }
        const rawOption = addition.addOption ?? addition.option ?? addition;
        const addOption = typeof rawOption === 'string' ? { optionName: rawOption } : rawOption;
        if (!addOption || typeof addOption !== 'object' || Array.isArray(addOption) || typeof addOption.optionName !== 'string' || !addOption.optionName.trim()) {
            throw new Boom('pollAddOption requires a non-empty optionName', { statusCode: 400 });
        }
        m.pollAddOptionMessage = proto.Message.PollAddOptionMessage.fromObject({
            pollCreationMessageKey,
            addOption,
            ...(addition.metadata ? { metadata: addition.metadata } : {})
        });
    }
    else if (hasNonNullishProperty(message, 'statusStickerInteraction')) {
        const interaction = message.statusStickerInteraction;
        m.statusStickerInteractionMessage = proto.Message.StatusStickerInteractionMessage.fromObject({
            key: interaction.key,
            stickerKey: interaction.stickerKey,
            type: interaction.type ?? proto.Message.StatusStickerInteractionMessage.StatusStickerType.REACTION
        });
    }
    else if (hasNonNullishProperty(message, 'statusQuoted')) {
        const quoted = message.statusQuoted;
        m.statusQuotedMessage = proto.Message.StatusQuotedMessage.fromObject({
            type: quoted.type ?? proto.Message.StatusQuotedMessage.StatusQuotedMessageType.QUESTION_ANSWER,
            text: quoted.text,
            thumbnail: quoted.thumbnail,
            originalStatusId: quoted.originalStatusId
        });
    }
    else if (hasNonNullishProperty(message, 'statusQuestionAnswer')) {
        m.statusQuestionAnswerMessage = proto.Message.StatusQuestionAnswerMessage.fromObject(message.statusQuestionAnswer);
    }
    else if (hasNonNullishProperty(message, 'questionResponse')) {
        m.questionResponseMessage = proto.Message.QuestionResponseMessage.fromObject(message.questionResponse);
    }
    else if (hasNonNullishProperty(message, 'comment')) {
        const comment = message.comment;
        m.commentMessage = proto.Message.CommentMessage.fromObject({ message: comment.message, targetMessageKey: comment.targetMessageKey });
    }
    else if (hasNonNullishProperty(message, 'statusNotification')) {
        m.statusNotificationMessage = proto.Message.StatusNotificationMessage.fromObject(message.statusNotification);
    }
    else if (hasNonNullishProperty(message, 'stickerSyncRMR')) {
        const sync = message.stickerSyncRMR;
        m.stickerSyncRmrMessage = proto.Message.StickerSyncRMRMessage.fromObject({
            filehash: sync.filehash || sync.fileHash || [],
            rmrSource: sync.rmrSource,
            requestTimestamp: sync.requestTimestamp ?? Date.now()
        });
    }
    else if (hasNonNullishProperty(message, 'sendPayment')) {
        const payment = message.sendPayment;
        m.sendPaymentMessage = proto.Message.SendPaymentMessage.fromObject({
            requestMessageKey: payment.requestMessageKey,
            noteMessage: payment.noteMessage,
            background: payment.background,
            transactionData: payment.transactionData
        });
    }
    else if (hasNonNullishProperty(message, 'declinePayment')) {
        m.declinePaymentRequestMessage = proto.Message.DeclinePaymentRequestMessage.fromObject({ key: message.declinePayment.key || message.declinePayment });
    }
    else if (hasNonNullishProperty(message, 'cancelPayment')) {
        m.cancelPaymentRequestMessage = proto.Message.CancelPaymentRequestMessage.fromObject({ key: message.cancelPayment.key || message.cancelPayment });
    }
    else if (hasNonNullishProperty(message, 'scheduledCallEdit')) {
        m.scheduledCallEditMessage = proto.Message.ScheduledCallEditMessage.fromObject(message.scheduledCallEdit);
    }
    else if (hasNonNullishProperty(message, 'secretEncrypted')) {
        m.secretEncryptedMessage = proto.Message.SecretEncryptedMessage.fromObject(message.secretEncrypted);
    }
    else if (hasNonNullishProperty(message, 'encComment')) {
        m.encCommentMessage = proto.Message.EncCommentMessage.fromObject(message.encComment);
    }
    else if (hasNonNullishProperty(message, 'encEventResponse')) {
        m.encEventResponseMessage = proto.Message.EncEventResponseMessage.fromObject(message.encEventResponse);
    }
    else if (hasNonNullishProperty(message, 'messageHistoryBundle')) {
        const bundle = message.messageHistoryBundle;
        const media = bundle.media ? await prepareWAMessageMedia({ document: bundle.media }, options) : undefined;
        const document = media?.documentMessage;
        m.messageHistoryBundle = proto.Message.MessageHistoryBundle.fromObject({
            mimetype: bundle.mimetype || document?.mimetype || 'application/octet-stream',
            fileSha256: bundle.fileSha256 || document?.fileSha256,
            mediaKey: bundle.mediaKey || document?.mediaKey,
            fileEncSha256: bundle.fileEncSha256 || document?.fileEncSha256,
            directPath: bundle.directPath || document?.directPath,
            mediaKeyTimestamp: bundle.mediaKeyTimestamp || document?.mediaKeyTimestamp,
            contextInfo: bundle.contextInfo,
            messageHistoryMetadata: bundle.messageHistoryMetadata
        });
    }
    else if (hasNonNullishProperty(message, 'messageHistoryNotice')) {
        m.messageHistoryNotice = proto.Message.MessageHistoryNotice.fromObject(message.messageHistoryNotice);
    }
    else if (hasNonNullishProperty(message, 'inviteAdmin')) {
        const invite = message.inviteAdmin;
        m.newsletterAdminInviteMessage = proto.Message.NewsletterAdminInviteMessage.fromObject({
            newsletterJid: invite.newsletterJid || invite.jid,
            newsletterName: invite.newsletterName || invite.subject,
            jpegThumbnail: invite.jpegThumbnail || invite.thumbnail,
            caption: invite.caption || invite.text,
            inviteExpiration: invite.inviteExpiration,
            contextInfo: invite.contextInfo
        });
    }
    // Lia@Changes 01-02-26 --- Add payment invite message
    else if (hasNonNullishProperty(message, 'paymentInviteServiceType')) {
        m.paymentInviteMessage = {
            expiryTimestamp: Date.now(),
            serviceType: message.paymentInviteServiceType
        };
    }
    // Lia@Changes 01-02-26 --- Add order message
    else if (hasNonNullishProperty(message, 'orderText')) {
        if (!Buffer.isBuffer(message.thumbnail)) {
            throw new Boom('Must provide thumbnail buffer in order message', { statusCode: 400 });
        }
        m.orderMessage = {
            itemCount: 1,
            messageVersion: 1,
            orderTitle: LIBRARY_NAME,
            status: proto.Message.OrderMessage.OrderStatus.INQUIRY,
            surface: proto.Message.OrderMessage.OrderSurface.CATALOG,
            token: generateMessageIDV2(),
            totalAmount1000: 1000,
            totalCurrencyCode: 'IDR',
            ...message,
            message: message.orderText
        };
        delete m.orderMessage.orderText;
    }
    else if (hasNonNullishProperty(message, 'album')) {
        throw new Boom('Legacy albumMessage is removed; use socket.sendAlbumMessage() for an AIRich GRID_IMAGE album', { statusCode: 400 });
    }
    else if (hasNonNullishProperty(message, 'sharePhoneNumber')) {
        m.protocolMessage = {
            type: proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER
        };
    }
    else if (hasNonNullishProperty(message, 'requestPhoneNumber')) {
        m.requestPhoneNumberMessage = {};
    }
    else if (hasNonNullishProperty(message, 'requestLocation')) {
        m.requestLocationMessage = proto.Message.RequestLocationMessage.fromObject({});
    }
    else if (hasNonNullishProperty(message, 'requestLocationUpdate')) {
        const request = message.requestLocationUpdate || {};
        const updateType = proto.Message.RequestLocationUpdateMessage.UpdateType;
        m.requestLocationUpdateMessage = proto.Message.RequestLocationUpdateMessage.fromObject({
            key: request.key,
            updateType: request.cancel ? updateType.CANCEL : (request.updateType ?? updateType.UNKNOWN),
            senderTimestampMs: request.senderTimestampMs ?? Date.now()
        });
    }
    else if (hasNonNullishProperty(message, 'chatTheme')) {
        const theme = message.chatTheme || {};
        const themeSetting = {};
        if (theme.colorSchemeId || theme.chatThemeId) {
            const colorSchemeId = theme.colorSchemeId ||
                (String(theme.chatThemeId).includes('@') ? theme.chatThemeId : `${theme.chatThemeId}@Tonal`);
            themeSetting.colorSchemeId = String(colorSchemeId);
        }
        if (theme.solidColor) {
            const solidColor = typeof theme.solidColor === 'object' ? theme.solidColor : {};
            const hexToArgb = (value, fallback) => {
                if (typeof value === 'number')
                    return value >>> 0;
                if (typeof value !== 'string')
                    return fallback;
                const hex = value.replace('#', '');
                if (hex.length === 6)
                    return (0xff000000 | parseInt(hex, 16)) >>> 0;
                if (hex.length === 8)
                    return parseInt(hex, 16) >>> 0;
                return fallback;
            };
            const solid = {
                backgroundLightArgb: hexToArgb(solidColor.colorLight || solidColor.color, 0xffffffff),
                backgroundDarkArgb: hexToArgb(solidColor.colorDark || solidColor.color, 0xff000000),
                isDoodleEnabled: solidColor.isDoodleEnabled ?? false
            };
            if (solidColor.doodleColorLight != null)
                solid.doodleLightArgb = hexToArgb(solidColor.doodleColorLight);
            if (solidColor.doodleColorDark != null)
                solid.doodleDarkArgb = hexToArgb(solidColor.doodleColorDark);
            themeSetting.solidColor = proto.Message.ChatSolidColorWallpaper.fromObject(solid);
        }
        if (theme.animatedWallpaper) {
            const wallpaper = theme.animatedWallpaper;
            themeSetting.animatedWallpaper = proto.Message.ChatAnimatedWallpaper.fromObject({
                animatedWallpaperId: wallpaper.id || wallpaper.animatedWallpaperId,
                dimLevel: wallpaper.dimLevel ?? (wallpaper.opacity != null ? wallpaper.opacity / 100 : 0)
            });
        }
        if (Object.keys(themeSetting).length) {
            m.protocolMessage = {
                type: proto.Message.ProtocolMessage.Type.CHAT_THEME_SETTING,
                chatThemeSetting: proto.Message.ChatThemeSetting.fromObject(themeSetting)
            };
        }
    }
    else if (hasNonNullishProperty(message, 'newsletterFollowerInvite') ||
        hasNonNullishProperty(message, 'newsletterFollowerInviteMessage') ||
        hasNonNullishProperty(message, 'newsletterFollowerInviteMessageV2')) {
        const isV2 = hasNonNullishProperty(message, 'newsletterFollowerInviteMessageV2');
        const invite = isV2
            ? message.newsletterFollowerInviteMessageV2
            : (message.newsletterFollowerInvite ?? message.newsletterFollowerInviteMessage);
        const field = isV2 ? 'newsletterFollowerInviteMessageV2' : 'newsletterFollowerInviteMessage';
        m = { [field]: proto.Message.NewsletterFollowerInviteMessage.fromObject(invite) };
    }
    else if (hasNonNullishProperty(message, 'limitSharing')) {
        m.protocolMessage = {
            type: proto.Message.ProtocolMessage.Type.LIMIT_SHARING,
            limitSharing: {
                sharingLimited: message.limitSharing === true,
                trigger: 1,
                limitSharingSettingTimestamp: Date.now(),
                initiatedByMe: true
            }
        };
    }
    else if (hasNonNullishProperty(message, 'cards')) {
        // Carousel composition is handled by the interactive-message chain
        // below. Mark this shape as recognized so cards-only sends do not
        // fall through to prepareWAMessageMedia(message), which has no
        // top-level media key and incorrectly throws Invalid media type.
        m = {};
    }
    else {
        m = await prepareWAMessageMedia(message, options);
        if (m.audioMessage && options.backgroundColor !== undefined) {
            m.audioMessage.backgroundArgb = await assertColor(options.backgroundColor);
        }
    }
    if (m.stickerMessage && hasNonNullishProperty(message, 'stickerAudio')) {
        const audioPrepared = await prepareWAMessageMedia({ audio: message.stickerAudio, ptt: true }, options);
        if (audioPrepared?.audioMessage) {
            m.stickerMessage.audioMessage = audioPrepared.audioMessage;
        }
    }
    // Lia@Changes 30-01-26 --- Add interactive messages (buttonsMessage, listMessage, interactiveMessage, templateMessage, and carouselMessage)
    if (hasNonNullishProperty(message, 'buttons')) {
        const buttonsMessage = {
            buttons: message.buttons.map(button => {
                // Lia@Changes 12-03-26 --- Add "single_select" shortcut!
                const buttonText = button.text || button.buttonText;
                if (hasOptionalProperty(button, 'sections')) {
                    return {
                        nativeFlowInfo: {
                            name: 'single_select',
                            paramsJson: JSON.stringify({
                                title: buttonText,
                                sections: button.sections
                            })
                        },
                        type: ButtonType.NATIVE_FLOW
                    };
                }
                else if (hasOptionalProperty(button, 'name')) {
                    return {
                        nativeFlowInfo: {
                            name: button.name,
                            paramsJson: button.paramsJson
                        },
                        type: ButtonType.NATIVE_FLOW
                    };
                }
                return {
                    buttonId: button.id || button.buttonId,
                    buttonText: typeof buttonText === 'string' ? { displayText: buttonText } : buttonText,
                    type: button.type || ButtonType.RESPONSE
                };
            })
        };
        if (hasOptionalProperty(message, 'text')) {
            buttonsMessage.contentText = message.text;
            buttonsMessage.headerType = ButtonHeaderType.EMPTY;
        }
        else {
            if (hasOptionalProperty(message, 'caption')) {
                buttonsMessage.contentText = message.caption;
            }
            const type = Object.keys(m)[0].replace('Message', '').toUpperCase();
            buttonsMessage.headerType = ButtonHeaderType[type];
            Object.assign(buttonsMessage, m);
        }
        if (hasOptionalProperty(message, 'footer')) {
            buttonsMessage.footerText = message.footer;
        }
        m = { buttonsMessage };
    }
    else if (hasNonNullishProperty(message, 'sections')) {
        const listMessage = {
            sections: message.sections,
            buttonText: message.buttonText,
            title: message.title,
            footerText: message.footer,
            description: message.text,
            listType: ListType.SINGLE_SELECT
        };
        m = { listMessage };
    }
    // Lia@Note 03-02-26 --- This message type is shown on WhatsApp Web/Desktop and iOS (I guess ｡⁠◕⁠‿⁠◕⁠｡). On Android, it only appears in newsletter (so far ಥ⁠‿⁠ಥ)
    else if (hasNonNullishProperty(message, 'templateButtons')) {
        const hydratedTemplate = {
            hydratedButtons: message.templateButtons.map((button, i) => {
                const buttonText = button.text || button.buttonText;
                if (hasOptionalProperty(button, 'id')) {
                    return {
                        index: i,
                        quickReplyButton: {
                            displayText: buttonText || '👉🏻 Click',
                            id: button.id
                        }
                    };
                }
                else if (hasOptionalProperty(button, 'url')) {
                    return {
                        index: i,
                        urlButton: {
                            displayText: buttonText || '🌐 Visit',
                            url: button.url
                        }
                    };
                }
                else if (hasOptionalProperty(button, 'call')) {
                    return {
                        index: i,
                        callButton: {
                            displayText: buttonText || '✆ Call',
                            phoneNumber: button.call
                        }
                    };
                }
                button.index = button.index || i;
                return button;
            })
        };
        if (hasOptionalProperty(message, 'text')) {
            hydratedTemplate.hydratedContentText = message.text;
        }
        else {
            if (hasOptionalProperty(message, 'caption')) {
                hydratedTemplate.hydratedTitleText = message.title;
                hydratedTemplate.hydratedContentText = message.caption;
            }
            ;
            Object.assign(hydratedTemplate, m);
        }
        if (hasOptionalProperty(message, 'footer')) {
            hydratedTemplate.hydratedFooterText = message.footer;
        }
        hydratedTemplate.templateId = message.id || 'template-' + Date.now(); // Lia@Note 04-02-26 --- Minimal templateId to satisfy WhatsApp (⁠ ⁠ꈍ⁠ᴗ⁠ꈍ⁠)
        m = {
            templateMessage: {
                hydratedFourRowTemplate: hydratedTemplate,
                hydratedTemplate: hydratedTemplate
            }
        };
    }
    else if (hasNonNullishProperty(message, 'nativeFlow')) {
        const interactiveMessage = {
            nativeFlowMessage: prepareNativeFlowButtons(message)
        };
        if (hasOptionalProperty(message, 'bizJid')) {
            interactiveMessage.collectionMessage = {
                bizJid: message.bizJid,
                id: message.id,
                messageVersion: 1
            };
        }
        else if (hasOptionalProperty(message, 'shopSurface')) {
            interactiveMessage.shopStorefrontMessage = {
                surface: message.shopSurface,
                id: message.id,
                messageVersion: 1
            };
        }
        if (hasOptionalProperty(message, 'text')) {
            interactiveMessage.body = { text: message.text };
            if (hasOptionalProperty(message, 'title') || hasOptionalProperty(message, 'subtitle')) {
                interactiveMessage.header = {
                    ...(hasOptionalProperty(message, 'title') ? { title: String(message.title) } : {}),
                    ...(hasOptionalProperty(message, 'subtitle') ? { subtitle: String(message.subtitle) } : {})
                };
            }
            const hasMediaInput = ['image', 'video', 'document'].some(key => hasOptionalProperty(message, key));
            const headerMedia = hasValidInteractiveHeader(m)
                ? m
                : hasMediaInput ? await prepareWAMessageMedia(message, options) : undefined;
            if (headerMedia && hasValidInteractiveHeader(headerMedia)) {
                interactiveMessage.header ??= {};
                interactiveMessage.header.hasMediaAttachment = true;
                Object.assign(interactiveMessage.header, headerMedia);
            }
        }
        else {
            if (hasOptionalProperty(message, 'caption')) {
                const isValidHeader = hasValidInteractiveHeader(m);
                if (!isValidHeader) {
                    throw new Boom('Invalid media type for interactive message header', { statusCode: 400 });
                }
                interactiveMessage.header = {
                    title: message.title || '',
                    subtitle: message.subtitle || '',
                    hasMediaAttachment: isValidHeader
                };
                interactiveMessage.body = { text: message.caption };
            }
            if (hasOptionalProperty(message, 'thumbnail') && !!message.thumbnail) {
                interactiveMessage.jpegThumbnail = message.thumbnail;
            }
            Object.assign(interactiveMessage.header, m);
        }
        if (hasOptionalProperty(message, 'audioFooter')) {
            const { audioMessage } = await prepareWAMessageMedia({
                audio: message.audioFooter
            }, options);
            interactiveMessage.footer = {
                audioMessage,
                hasMediaAttachment: true
            };
        }
        else if (hasOptionalProperty(message, 'footer')) {
            interactiveMessage.footer = { text: message.footer };
        }
        m = { interactiveMessage };
    }
    // Native carousel wire layout adapted from @itsliaaa/baileys 0.4.3 (MIT); see THIRD_PARTY_NOTICES.md.
    else if (hasNonNullishProperty(message, 'cards')) {
        if (!Array.isArray(message.cards) || message.cards.length === 0) {
            throw new Boom('Carousel requires at least one card', { statusCode: 400 });
        }
        const interactiveMessage = {
            carouselMessage: {
                cards: await Promise.all(message.cards.map(async (card) => {
                    if (!card || typeof card !== 'object' || Array.isArray(card)) {
                        throw new Boom('Carousel card must be an object', { statusCode: 400 });
                    }
                    let carouselHeader;
                    if (hasNonNullishProperty(card, 'product')) {
                        carouselHeader = { productMessage: await prepareProductMessage(card, options) };
                    }
                    else {
                        carouselHeader = await prepareWAMessageMedia(card, options).catch(() => ({}));
                    }
                    const hasValidHeader = hasValidCarouselHeader(carouselHeader);
                    if (!hasValidHeader) {
                        throw new Boom('Invalid media type for carousel card', { statusCode: 400 });
                    }
                    const carouselCard = {
                        nativeFlowMessage: prepareNativeFlowButtons({
                            ...card,
                            nativeFlow: Array.isArray(card.nativeFlow) ? card.nativeFlow : []
                        }),
                        header: {
                            title: card.title || '',
                            subtitle: card.subtitle || '',
                            hasMediaAttachment: hasValidHeader
                        }
                    };
                    const cardText = card.text ?? card.body?.text ?? card.caption;
                    if (cardText != null) {
                        carouselCard.body = { text: cardText };
                    }
                    if (hasOptionalProperty(card, 'thumbnail') && !!card.thumbnail) {
                        carouselCard.jpegThumbnail = card.thumbnail;
                    }
                    // Keep the native media header attached for both text and caption cards.
                    Object.assign(carouselCard.header, carouselHeader);
                    if (hasOptionalProperty(card, 'audioFooter')) {
                        const { audioMessage } = await prepareWAMessageMedia({
                            audio: card.audioFooter
                        }, options);
                        carouselCard.footer = {
                            audioMessage,
                            hasMediaAttachment: true
                        };
                    }
                    else if (hasOptionalProperty(card, 'footer')) {
                        carouselCard.footer = { text: card.footer };
                    }
                    return carouselCard;
                })),
                carouselCardType: CarouselCardType.UNKNOWN,
                messageVersion: 1
            }
        };
        if (hasOptionalProperty(message, 'text')) {
            interactiveMessage.body = { text: message.text };
        }
        if (hasOptionalProperty(message, 'footer')) {
            interactiveMessage.footer = { text: message.footer };
        }
        m = { interactiveMessage };
    }
    // Lia@Changes 01-02-26 --- Add request payment message
    else if (hasNonNullishProperty(message, 'requestPaymentFrom')) {
        const requestPaymentMessage = {
            amount: {
                currencyCode: 'IDR',
                offset: 1000,
                value: 1000
            },
            amount1000: 1000,
            currencyCodeIso4217: 'IDR',
            expiryTimestamp: Date.now(),
            noteMessage: m,
            requestFrom: message.requestPaymentFrom,
            ...message
        };
        delete requestPaymentMessage.requestPaymentFrom;
        if (hasNonNullishProperty(m, 'extendedTextMessage') || hasNonNullishProperty(m, 'stickerMessage')) {
            Object.assign(requestPaymentMessage.noteMessage, m);
        }
        else {
            throw new Boom('Invalid message type for request payment note message', { statusCode: 400 });
        }
        m = { requestPaymentMessage };
    }
    // Lia@Changes 01-02-26 --- Add invoice message
    else if (hasNonNullishProperty(message, 'invoiceNote')) {
        const attachment = m.imageMessage || m.documentMessage;
        const type = Object.keys(m)[0].replace('Message', '').toUpperCase();
        const invoiceMessage = {
            attachmentType: proto.Message.InvoiceMessage.AttachmentType[type === 'DOCUMENT' ? 'PDF' : 'IMAGE'],
            note: message.invoiceNote
        };
        if (attachment) {
            const { directPath, fileEncSha256, fileSha256, jpegThumbnail = undefined, mediaKey, mediaKeyTimestamp, mimetype } = attachment;
            Object.assign(invoiceMessage, {
                attachmentDirectPath: directPath,
                attachmentFileEncSha256: fileEncSha256,
                attachmentFileSha256: fileSha256,
                attachmentJpegThumbnail: jpegThumbnail,
                attachmentMediaKey: mediaKey,
                attachmentMediaKeyTimestamp: mediaKeyTimestamp,
                attachmentMimetype: mimetype,
                token: generateMessageIDV2()
            });
        }
        else {
            throw new Boom('Invalid media type for invoice message', { statusCode: 400 });
        }
        m = { invoiceMessage };
    }
    // Lia@Changes 31-01-26 --- Add direct externalAdReply access (no need to create contextInfo first)
    if (hasOptionalProperty(message, 'externalAdReply') && !!message.externalAdReply) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        const content = message.externalAdReply;
        if ('thumbnail' in content && content.thumbnail != null && !Buffer.isBuffer(content.thumbnail) && !(content.thumbnail instanceof Uint8Array)) {
            throw new Boom('Thumbnail must in buffer type', { statusCode: 400 });
        }
        const externalAdReply = {
            ...content,
            body: content.body,
            mediaType: content.mediaType ?? (content.thumbnail ? 1 : 0),
            mediaUrl: content.mediaUrl || content.url,
            renderLargerThumbnail: content.largeThumbnail ?? content.renderLargerThumbnail ?? !!content.thumbnail,
            sourceUrl: content.sourceUrl || content.url,
            thumbnail: content.thumbnail,
            thumbnailUrl: content.thumbnailUrl || content.originalImageUrl || (content.url ? content.url + '?update=' + Date.now() : undefined),
            title: content.title || LIBRARY_NAME
        };
        delete externalAdReply.subTitle;
        delete externalAdReply.largeThumbnail;
        delete externalAdReply.url;
        if (key && 'contextInfo' in key && !!key.contextInfo) {
            key.contextInfo.externalAdReply = { ...key.contextInfo.externalAdReply, ...externalAdReply };
        }
        else if (key) {
            key.contextInfo = { externalAdReply };
        }
    }
    if ((hasOptionalProperty(message, 'mentions') && message.mentions?.length) ||
        (hasOptionalProperty(message, 'mentionAll') && message.mentionAll)) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        if (key && 'contextInfo' in key) {
            key.contextInfo = key.contextInfo || {};
            if (message.mentions?.length) {
                key.contextInfo.mentionedJid = message.mentions;
            }
            if (message.mentionAll) {
                key.contextInfo.nonJidMentions = 1;
            }
        }
        else if (key) {
            key.contextInfo = {
                mentionedJid: message.mentions,
                nonJidMentions: message.mentionAll ? 1 : 0
            };
        }
    }
    if (hasOptionalProperty(message, 'contextInfo') && !!message.contextInfo) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        if (key && 'contextInfo' in key && !!key.contextInfo) {
            key.contextInfo = { ...key.contextInfo, ...message.contextInfo };
        }
        else if (key) {
            key.contextInfo = message.contextInfo;
        }
    }
    // Lia@Changes 31-01-26 --- Add "groupStatus" boolean to set contextInfo.isGroupStatus and wrap message into groupStatusMessageV2
    if (hasOptionalProperty(message, 'groupStatus') && !!message.groupStatus) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        const privateAudience = message.private;
        if (privateAudience !== undefined && (privateAudience === null || typeof privateAudience !== 'object' || Array.isArray(privateAudience))) {
            throw new Boom('groupStatus private metadata must be an object', { statusCode: 400 });
        }
        if (key && 'contextInfo' in key && !!key.contextInfo) {
            key.contextInfo.isGroupStatus = message.groupStatus;
        }
        else if (key) {
            key.contextInfo = {
                isGroupStatus: message.groupStatus
            };
        }
        if (privateAudience && (privateAudience.name != null || privateAudience.emoji != null)) {
            const name = privateAudience.name == null ? '' : String(privateAudience.name);
            const emoji = privateAudience.emoji == null ? '' : String(privateAudience.emoji);
            if (!name && !emoji) {
                throw new Boom('groupStatus private metadata requires a name or emoji', { statusCode: 400 });
            }
            const statusMessage = m[Object.keys(m)[0]];
            statusMessage.contextInfo = {
                ...(statusMessage.contextInfo || {}),
                statusAudienceMetadata: {
                    audienceType: proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS,
                    ...(name ? { listName: name } : {}),
                    ...(emoji ? { listEmoji: emoji } : {})
                }
            };
        }
        // V2 remains the default. The legacy envelope is available for
        // compatibility testing with clients that still handle the two
        // group-status fields differently.
        const groupStatusVersion = message.groupStatusVersion || options?.groupStatusVersion;
        m = groupStatusVersion === 'legacy' || groupStatusVersion === 'v1'
            ? { groupStatusMessage: { message: m } }
            : { groupStatusMessageV2: { message: m } };
        delete message.groupStatus;
        delete message.groupStatusVersion;
        delete message.private;
    }
    // Media spoiler support uses WhatsApp's FutureProofMessage spoiler envelope plus
    // contextInfo.isSpoiler. Text spoilers use ||...|| by default because native text
    // spoiler formatting is still rolling out. View-once is available as an explicit
    // compatibility fallback for clients that reject the media spoiler envelope.
    if (hasOptionalProperty(message, 'spoiler') && !!message.spoiler) {
        const messageType = Object.keys(m)[0];
        const key = m[messageType];
        const mediaSpoiler = ['imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(messageType);
        // Native media spoilers use contextInfo.isSpoiler. View-once remains an
        // explicit compatibility fallback for clients that do not render it.
        const mediaSpoilerMode = message.mediaSpoilerMode || options?.mediaSpoilerMode || 'native';
        if (mediaSpoiler && mediaSpoilerMode === 'viewOnce') {
            m = { viewOnceMessage: { message: m } };
        }
        else if (mediaSpoiler && mediaSpoilerMode === 'native') {
            if (key && 'contextInfo' in key && !!key.contextInfo) {
                key.contextInfo.isSpoiler = true;
            }
            else if (key) {
                key.contextInfo = { isSpoiler: true };
            }
            // `spoilerMessage` is not a field in WAProto.Message. The native
            // representation is the media message's contextInfo.isSpoiler bit.
        }
        else if (key && typeof key.text === 'string') {
            const nativeSpoiler = message.spoilerMode === 'native' || options?.spoilerMode === 'native';
            if (nativeSpoiler) {
                key.contextInfo = { ...(key.contextInfo || {}), isSpoiler: true };
            }
            else {
                key.text = key.text.startsWith('||') && key.text.endsWith('||') ? key.text : `||${key.text}||`;
            }
        }
        else if (key && typeof key.caption === 'string') {
            key.caption = key.caption.startsWith('||') && key.caption.endsWith('||') ? key.caption : `||${key.caption}||`;
        }
        else {
            options?.logger?.warn?.('Spoiler fallback is only reliable for text/caption messages; sending without spoiler metadata');
        }
        delete message.spoiler;
        delete message.spoilerMode;
        delete message.mediaSpoilerMode;
    }
    // X4R1S3@VerifiedMe --- Add "verifiedMe" boolean to attach a verified
    // forward badge (✓) on image/video messages only. Uses forwardingScore +
    // isForwarded + the 0@s.whatsapp.net participant/remoteJid trick (no
    // newsletter context needed) — confirmed working pattern. Also injects a
    // synthetic quoted message fallback if none is already present, matching
    // the same pattern.
    if (hasOptionalProperty(message, 'verifiedMe') && !!message.verifiedMe) {
        const messageType = Object.keys(m)[0];
        const isMediaMessage = messageType === 'imageMessage' || messageType === 'videoMessage';
        if (isMediaMessage) {
            const key = m[messageType];
            const verifiedContext = {
                isForwarded: true,
                participant: '0@s.whatsapp.net',
                remoteJid: '0@s.whatsapp.net'
            };
            if (key && 'contextInfo' in key && !!key.contextInfo) {
                key.contextInfo = { ...key.contextInfo, ...verifiedContext };
            }
            else if (key) {
                key.contextInfo = verifiedContext;
            }
            if (options && !options.quoted) {
                options.quoted = {
                    key: {
                        remoteJid: '0@s.whatsapp.net',
                        fromMe: false,
                        participant: '0@s.whatsapp.net',
                        id: '3EB0' + Math.random().toString(16).substring(2, 10).toUpperCase()
                    },
                    message: {
                        conversation: '```ஃ𖠃 AI ⚉```'
                    }
                };
            }
        }
        delete message.verifiedMe;
    }
    // Lia@Changes 02-02-26 --- Add "interactiveAsTemplate" boolean to wrap interactiveMessage into templateMessage
    else if (hasOptionalProperty(message, 'interactiveAsTemplate') && !!message.interactiveAsTemplate) {
        if (!m.interactiveMessage) {
            throw new Boom('Invalid message type for template', { statusCode: 400 }); // Lia@Note 02-02-26 --- To avoid bug 👀
        }
        m = {
            templateMessage: {
                interactiveMessageTemplate: m.interactiveMessage,
                templateId: message.id || 'template-' + Date.now() // Lia@Note 04-02-26 --- Minimal templateId to satisfy WhatsApp (⁠ ⁠ꈍ⁠ᴗ⁠ꈍ⁠)
            }
        };
        delete message.interactiveAsTemplate;
    }
    // Lia@Changes 30-01-26 --- Add "ephemeral" boolean to wrap message into ephemeralMessage like "viewOnce"
    if (hasOptionalProperty(message, 'ephemeral') && !!message.ephemeral) {
        m = { ephemeralMessage: { message: m } };
        delete message.ephemeral;
    }
    // Lia@Changes 16-05-26 --- Add wrap message into lottieStickerMessage by isLottie boolean
    if (hasOptionalProperty(message, 'isLottie') && !!message.isLottie) {
        m = { lottieStickerMessage: { message: m } };
    }
    else if (hasOptionalProperty(message, 'viewOnce') && !!message.viewOnce) {
        // Text view-once clients expect the flag on the inner
        // ExtendedTextMessage. Media continues to use the standard outer
        // viewOnceMessage envelope.
        if (m.extendedTextMessage) {
            m.extendedTextMessage.viewOnce = true;
        }
        else {
            m = { viewOnceMessage: { message: m } };
        }
        delete message.viewOnce;
    }
    // Lia@Changes 03-02-26 --- Add "viewOnceV2" boolean to wrap message into viewOnceMessageV2 like "viewOnce"
    else if (hasOptionalProperty(message, 'viewOnceV2') && !!message.viewOnceV2) {
        m = { viewOnceMessageV2: { message: m } };
        delete message.viewOnceV2;
    }
    // Lia@Changes 03-02-26 --- Add "viewOnceV2Extension" boolean to wrap message into viewOnceMessageV2Extension like "viewOnce"
    else if (hasOptionalProperty(message, 'viewOnceV2Extension') && !!message.viewOnceV2Extension) {
        m = { viewOnceMessageV2Extension: { message: m } };
        delete message.viewOnceV2Extension;
    }
    if (hasOptionalProperty(message, 'edit')) {
        m = {
            protocolMessage: {
                key: message.edit,
                editedMessage: m,
                timestampMs: Date.now(),
                type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            }
        };
    }
    if (shouldIncludeReportingToken(m)) {
        m.messageContextInfo = m.messageContextInfo || {};
        if (!m.messageContextInfo.messageSecret) {
            m.messageContextInfo.messageSecret = randomBytes(32);
        }
    }
    return WAProto.Message.create(m);
};
export const generateWAMessageFromContent = (jid, message, options) => {
    // set timestamp to now
    // if not specified
    if (!options.timestamp) {
        options.timestamp = new Date();
    }
    const innerMessage = normalizeMessageContent(message);
    const messageContextInfo = message.messageContextInfo;
    const key = getContentType(innerMessage);
    const timestamp = unixTimestampSeconds(options.timestamp);
    const isNewsletter = isJidNewsletter(jid);
    const { quoted, userJid } = options;
    if (quoted) {
        const participant = quoted.key.fromMe
            ? userJid // TODO: Add support for LIDs
            : quoted.participant || quoted.key.participant || quoted.key.remoteJid;
        let quotedMsg = normalizeMessageContent(quoted.message);
        const msgType = getContentType(quotedMsg);
        // strip any redundant properties
        quotedMsg = proto.Message.create({ [msgType]: quotedMsg[msgType] });
        const quotedContent = quotedMsg[msgType];
        if (typeof quotedContent === 'object' && quotedContent && 'contextInfo' in quotedContent) {
            delete quotedContent.contextInfo;
        }
        const contextInfo = (innerMessage[key] && 'contextInfo' in innerMessage[key] && innerMessage[key]?.contextInfo) || {};
        contextInfo.participant = jidNormalizedUser(participant);
        contextInfo.stanzaId = quoted.key.id;
        contextInfo.quotedMessage = quotedMsg;
        // if a participant is quoted, then it must be a group
        // hence, remoteJid of group must also be entered
        if (!isNewsletter && jid !== quoted.key.remoteJid) {
            contextInfo.remoteJid = quoted.key.remoteJid;
        }
        if (contextInfo && innerMessage[key]) {
            /* @ts-ignore */
            innerMessage[key].contextInfo = contextInfo;
        }
    }
    if (
    // if we want to send a disappearing message
    !!options?.ephemeralExpiration &&
        // and it's not a protocol message -- delete, toggle disappear message
        key !== 'protocolMessage' &&
        // already not converted to disappearing message
        key !== 'ephemeralMessage' &&
        // newsletters don't support ephemeral messages
        !isNewsletter) {
        /* @ts-ignore */
        innerMessage[key].contextInfo = {
            ...(innerMessage[key].contextInfo || {}),
            expiration: options.ephemeralExpiration || WA_DEFAULT_EPHEMERAL
            //ephemeralSettingTimestamp: options.ephemeralOptions.eph_setting_ts?.toString()
        };
    }
    // Lia@Changes 30-01-26 --- Add deviceListMetadata inside messageContextInfo for private chat
    if (messageContextInfo?.messageSecret && (isPnUser(jid) || isLidUser(jid))) {
        messageContextInfo.deviceListMetadata = {
            recipientKeyHash: randomBytes(10),
            recipientTimestamp: unixTimestampSeconds()
        };
        messageContextInfo.deviceListMetadataVersion = 2;
    }
    message = WAProto.Message.create(message);
    const messageJSON = {
        key: {
            remoteJid: jid,
            fromMe: true,
            id: options?.messageId || generateMessageIDV2()
        },
        message: message,
        messageTimestamp: timestamp,
        messageStubParameters: [],
        participant: isJidGroup(jid) || isJidStatusBroadcast(jid) ? userJid : undefined, // TODO: Add support for LIDs
        status: WAMessageStatus.PENDING
    };
    return WAProto.WebMessageInfo.fromObject(messageJSON);
};
export const generateWAMessage = async (jid, content, options) => {
    // ensure msg ID is with every log
    options.logger = options?.logger?.child({ msgId: options.messageId });
    // Pass jid in the options to generateWAMessageContent
    if (jid) {
        options.jid = jid;
    }
    return generateWAMessageFromContent(jid, await generateWAMessageContent(content, options), options);
};
/**
 * Hashes an image-poll option as SHA-256(SHA-256(option name) + base64(file SHA-256)).
 * This follows the WhatsApp Web image-poll format; the format remains experimental.
 */
export const hashImagePollOption = (optionName, fileSha256) => {
    const nameHash = sha256(Buffer.from(String(optionName), 'utf-8')).toString('hex');
    const mediaHash = fileSha256 ? Buffer.from(fileSha256).toString('base64') : '';
    return sha256(Buffer.from(nameHash + mediaHash, 'utf-8')).toString('hex');
};
/**
 * Sends a photo poll as one poll-creation message followed by associated image child messages.
 * `relay` receives `(message, relayOptions, webMessageInfo)` for each wire message.
 */
export const generateWAMessageFromImagePoll = async (jid, content, relay, options = {}) => {
    if (typeof relay !== 'function') {
        throw new Boom('image poll requires a relay callback', { statusCode: 400 });
    }
    if (!Array.isArray(content?.values) || content.values.length < 2 || content.values.length > 12) {
        throw new Boom('image poll requires between 2 and 12 values', { statusCode: 400 });
    }
    if (content.values.some(value => value && typeof value === 'object' && value.image) && typeof options.upload !== 'function') {
        throw new Boom('image poll requires a configured media uploader', { statusCode: 400 });
    }
    const prepared = [];
    const pollOptions = [];
    for (const value of content.values) {
        const option = typeof value === 'string' ? { name: value } : value;
        const optionName = option?.name ?? option?.optionName;
        if (typeof optionName !== 'string' || !optionName.trim()) {
            throw new Boom('Each image poll value must have a non-empty name', { statusCode: 400 });
        }
        let media;
        if (option.image) {
            media = await prepareWAMessageMedia({ image: option.image }, { ...options, jid });
        }
        prepared.push({ media });
        pollOptions.push({
            optionName,
            optionHash: hashImagePollOption(optionName, media?.imageMessage?.fileSha256)
        });
    }
    if (!prepared.some(({ media }) => media)) {
        throw new Boom('At least one image poll option must include an image', { statusCode: 400 });
    }
    const pollMessageContent = await generateWAMessageContent({
        imagePoll: {
            name: content.name,
            selectableCount: content.selectableCount ?? 1,
            options: pollOptions,
            endDate: content.endDate,
            hideVoter: content.hideVoter,
            canAddOption: content.canAddOption,
            messageSecret: content.messageSecret
        }
    }, { ...options, jid });
    const poll = generateWAMessageFromContent(jid, pollMessageContent, { ...options, jid });
    const pollMeta = {
        tag: 'meta',
        attrs: {
            polltype: 'creation',
            contenttype: isJidNewsletter(jid) ? 'image' : undefined
        },
        content: undefined
    };
    await relay(poll.message, {
        messageId: poll.key.id,
        additionalNodes: [...(options.additionalNodes || []), pollMeta]
    }, poll);
    for (let index = 0; index < prepared.length; index++) {
        const media = prepared[index].media;
        if (!media) continue;
        const optionMessage = proto.Message.fromObject({
            pollCreationOptionImageMessage: { message: media },
            messageContextInfo: {
                messageAssociation: {
                    associationType: proto.MessageAssociation.AssociationType.MEDIA_POLL,
                    parentMessageKey: poll.key
                }
            }
        });
        const option = generateWAMessageFromContent(jid, optionMessage, { ...options, jid, messageId: undefined });
        await relay(option.message, { messageId: option.key.id }, option);
    }
    return poll;
};
/**
 * Sends a motion photo as an image parent followed by an associated video child.
 * The static image may be supplied as `image` or `thumbnail`; otherwise the
 * prepared video thumbnail is used as the still image.
 */
export const generateWAMessageFromLivePhoto = async (jid, content, relay, options = {}) => {
    if (typeof relay !== 'function') {
        throw new Boom('live photo requires a relay callback', { statusCode: 400 });
    }
    if (!content?.video) {
        throw new Boom('live photo requires a video source', { statusCode: 400 });
    }
    const normalizeMedia = media => typeof media === 'string' ? { url: media } : media;
    const offset = content.motionPhotoPresentationOffsetMs ?? content.presentationOffsetMs;
    if (offset != null && (!Number.isSafeInteger(Number(offset)) || Number(offset) < 0)) {
        throw new Boom('motionPhotoPresentationOffsetMs must be a non-negative integer', { statusCode: 400 });
    }
    const video = await prepareWAMessageMedia({
        video: normalizeMedia(content.video),
        ...(content.videoMimetype ? { mimetype: content.videoMimetype } : {}),
        ...(content.videoThumbnail ? { jpegThumbnail: content.videoThumbnail } : {}),
        ...(offset != null ? { motionPhotoPresentationOffsetMs: Number(offset) } : {})
    }, { ...options, jid });
    const videoMessage = video?.videoMessage;
    if (!videoMessage) {
        throw new Boom('live photo video could not be prepared', { statusCode: 400 });
    }
    const still = content.image || content.thumbnail || videoMessage.jpegThumbnail;
    if (!still) {
        throw new Boom('live photo needs a still image or a video with an extractable thumbnail', { statusCode: 400 });
    }
    const parent = await generateWAMessage(jid, {
        image: normalizeMedia(still),
        caption: content.caption ?? content.text ?? '',
        ...(!content.image && !content.thumbnail && videoMessage.jpegThumbnail
            ? { jpegThumbnail: videoMessage.jpegThumbnail }
            : content.imageThumbnail ? { jpegThumbnail: content.imageThumbnail } : {})
    }, { ...options, jid });
    const childContent = proto.Message.fromObject({
        videoMessage: {
            ...videoMessage,
            ...(offset != null ? { motionPhotoPresentationOffsetMs: Number(offset) } : {})
        },
        messageContextInfo: {
            messageAssociation: {
                associationType: proto.MessageAssociation.AssociationType.MOTION_PHOTO,
                parentMessageKey: parent.key
            }
        }
    });
    const { quoted: _quoted, ...childOptions } = options;
    const child = generateWAMessageFromContent(jid, childContent, {
        ...childOptions,
        jid,
        messageId: undefined
    });
    const relayOptions = options.relayOptions || {};
    await relay(parent.message, { ...relayOptions, messageId: parent.key.id }, parent);
    await relay(child.message, { ...relayOptions, messageId: child.key.id }, child);
    return parent;
};
/** Get the key to access the true type of content */
export const getContentType = (content) => {
    if (content) {
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.includes('Message')) && k !== 'senderKeyDistributionMessage');
        return key;
    }
};
/**
 * Normalizes ephemeral, view once messages to regular message content
 * Eg. image messages in ephemeral messages, in view once messages etc.
 * @param content
 * @returns
 */
export const normalizeMessageContent = (content) => {
    if (!content) {
        return undefined;
    }
    // set max iterations to prevent an infinite loop
    for (let i = 0; i < 5; i++) {
        const inner = getFutureProofMessage(content);
        if (!inner) {
            break;
        }
        content = inner.message;
    }
    return content;
    // Lia@Changes 03-02-26 --- Add all futureProofMessage into getFutureProofMessage()
    function getFutureProofMessage(message) {
        return (message?.associatedChildMessage ||
            message?.botForwardedMessage ||
            message?.botInvokeMessage ||
            message?.botTaskMessage ||
            message?.documentWithCaptionMessage ||
            message?.editedMessage ||
            message?.ephemeralMessage ||
            message?.eventCoverImage ||
            message?.groupMentionedMessage ||
            message?.groupStatusMentionMessage ||
            message?.groupStatusMessage ||
            message?.groupStatusMessageV2 ||
            message?.limitSharingMessage ||
            message?.lottieStickerMessage ||
            message?.newsletterAdminProfileMessage ||
            message?.newsletterAdminProfileMessageV2 ||
            message?.newsletterAdminProfileStatusMessage ||
            message?.pollCreationMessageV4 ||
            message?.pollCreationOptionImageMessage ||
            message?.questionMessage ||
            message?.questionReplyMessage ||
            message?.spoilerMessage ||
            message?.statusAddYours ||
            message?.statusMentionMessage ||
            message?.viewOnceMessage ||
            message?.viewOnceMessageV2 ||
            message?.viewOnceMessageV2Extension);
    }
};
/**
 * Extract the true message content from a message
 * Eg. extracts the inner message from a disappearing message/view once message
 */
export const extractMessageContent = (content) => {
    const extractFromTemplateMessage = (msg) => {
        if (msg.imageMessage) {
            return { imageMessage: msg.imageMessage };
        }
        else if (msg.documentMessage) {
            return { documentMessage: msg.documentMessage };
        }
        else if (msg.videoMessage) {
            return { videoMessage: msg.videoMessage };
        }
        else if (msg.locationMessage) {
            return { locationMessage: msg.locationMessage };
        }
        else {
            return {
                conversation: 'contentText' in msg ? msg.contentText : 'hydratedContentText' in msg ? msg.hydratedContentText : ''
            };
        }
    };
    content = normalizeMessageContent(content);
    if (content?.buttonsMessage) {
        return extractFromTemplateMessage(content.buttonsMessage);
    }
    if (content?.templateMessage?.hydratedFourRowTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.hydratedFourRowTemplate);
    }
    if (content?.templateMessage?.hydratedTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.hydratedTemplate);
    }
    if (content?.templateMessage?.fourRowTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.fourRowTemplate);
    }
    return content;
};
/**
 * Returns the device predicted by message ID
 */
export const getDevice = (id) => /^3A.{18}$/.test(id)
    ? 'ios'
    : /^3E.{20}$/.test(id)
        ? 'web'
        : /^(.{21}|.{32})$/.test(id)
            ? 'android'
            : /^(3F|.{18}$)/.test(id)
                ? 'desktop'
                : 'unknown';
/** Upserts a receipt in the message */
export const updateMessageWithReceipt = (msg, receipt) => {
    msg.userReceipt = msg.userReceipt || [];
    const recp = msg.userReceipt.find(m => m.userJid === receipt.userJid);
    if (recp) {
        Object.assign(recp, receipt);
    }
    else {
        msg.userReceipt.push(receipt);
    }
};
/** Update the message with a new reaction */
export const updateMessageWithReaction = (msg, reaction) => {
    const authorID = getKeyAuthor(reaction.key);
    const reactions = (msg.reactions || []).filter(r => getKeyAuthor(r.key) !== authorID);
    reaction.text = reaction.text || '';
    reactions.push(reaction);
    msg.reactions = reactions;
};
/** Update the message with a new poll update */
export const updateMessageWithPollUpdate = (msg, update) => {
    const authorID = getKeyAuthor(update.pollUpdateMessageKey);
    const reactions = (msg.pollUpdates || []).filter(r => getKeyAuthor(r.pollUpdateMessageKey) !== authorID);
    if (update.vote?.selectedOptions?.length) {
        reactions.push(update);
    }
    msg.pollUpdates = reactions;
};
/** Update the message with a new event response */
export const updateMessageWithEventResponse = (msg, update) => {
    const authorID = getKeyAuthor(update.eventResponseMessageKey);
    const responses = (msg.eventResponses || []).filter(r => getKeyAuthor(r.eventResponseMessageKey) !== authorID);
    responses.push(update);
    msg.eventResponses = responses;
};
/**
 * Aggregates all poll updates in a poll.
 * @param msg the poll creation message
 * @param meId your jid
 * @returns A list of options & their voters
 */
export function getAggregateVotesInPollMessage({ message, pollUpdates }, meId) {
    const opts = message?.pollCreationMessage?.options ||
        message?.pollCreationMessageV2?.options ||
        message?.pollCreationMessageV3?.options ||
        [];
    const voteHashMap = opts.reduce((acc, opt) => {
        const hash = sha256(Buffer.from(opt.optionName || '')).toString();
        acc[hash] = {
            name: opt.optionName || '',
            voters: []
        };
        return acc;
    }, {});
    for (const update of pollUpdates || []) {
        const { vote } = update;
        if (!vote) {
            continue;
        }
        for (const option of vote.selectedOptions || []) {
            const hash = option.toString();
            let data = voteHashMap[hash];
            if (!data) {
                voteHashMap[hash] = {
                    name: 'Unknown',
                    voters: []
                };
                data = voteHashMap[hash];
            }
            voteHashMap[hash].voters.push(getKeyAuthor(update.pollUpdateMessageKey, meId));
        }
    }
    return Object.values(voteHashMap);
}
/**
 * Aggregates all event responses in an event message.
 * @param msg the event creation message
 * @param meId your jid
 * @returns A list of response types & their responders
 */
export function getAggregateResponsesInEventMessage({ eventResponses }, meId) {
    const responseTypes = ['GOING', 'NOT_GOING', 'MAYBE'];
    const responseMap = {};
    for (const type of responseTypes) {
        responseMap[type] = {
            response: type,
            responders: []
        };
    }
    for (const update of eventResponses || []) {
        const responseType = update.eventResponse || 'UNKNOWN';
        if (responseType !== 'UNKNOWN' && responseMap[responseType]) {
            responseMap[responseType].responders.push(getKeyAuthor(update.eventResponseMessageKey, meId));
        }
    }
    return Object.values(responseMap);
}
/** Given a list of message keys, aggregates them by chat & sender. Useful for sending read receipts in bulk */
export const aggregateMessageKeysNotFromMe = (keys) => {
    const keyMap = {};
    for (const { remoteJid, id, participant, fromMe } of keys) {
        if (!fromMe) {
            const uqKey = `${remoteJid}:${participant || ''}`;
            if (!keyMap[uqKey]) {
                keyMap[uqKey] = {
                    jid: remoteJid,
                    participant: participant,
                    messageIds: []
                };
            }
            keyMap[uqKey].messageIds.push(id);
        }
    }
    return Object.values(keyMap);
};
const REUPLOAD_REQUIRED_STATUS = [410, 404];
/**
 * Downloads the given message. Throws an error if it's not a media message
 */
export const downloadMediaMessage = async (message, type, options, ctx) => {
    const result = await downloadMsg().catch(async (error) => {
        if (ctx &&
            typeof error?.status === 'number' && // treat errors with status as HTTP failures requiring reupload
            REUPLOAD_REQUIRED_STATUS.includes(error.status)) {
            ctx.logger.info({ key: message.key }, 'sending reupload media request...');
            // request reupload
            message = await ctx.reuploadRequest(message);
            const result = await downloadMsg();
            return result;
        }
        throw error;
    });
    return result;
    async function downloadMsg() {
        const mContent = extractMessageContent(message.message);
        if (!mContent) {
            throw new Boom('No message present', { statusCode: 400, data: message });
        }
        const contentType = getContentType(mContent);
        let mediaType = contentType?.replace('Message', '');
        const media = mContent[contentType];
        if (!media || typeof media !== 'object' || (!('url' in media) && !('thumbnailDirectPath' in media))) {
            throw new Boom(`"${contentType}" message is not a media message`);
        }
        let download;
        if ('thumbnailDirectPath' in media && !('url' in media)) {
            download = {
                directPath: media.thumbnailDirectPath,
                mediaKey: media.mediaKey
            };
            mediaType = 'thumbnail-link';
        }
        else {
            download = media;
        }
        const stream = await downloadContentFromMessage(download, mediaType, options);
        if (type === 'buffer') {
            const bufferArray = [];
            for await (const chunk of stream) {
                bufferArray.push(chunk);
            }
            return Buffer.concat(bufferArray);
        }
        return stream;
    }
};
/** Checks whether the given message is a media message; if it is returns the inner content */
export const assertMediaContent = (content) => {
    content = extractMessageContent(content);
    const mediaContent = content?.documentMessage ||
        content?.imageMessage ||
        content?.videoMessage ||
        content?.audioMessage ||
        content?.stickerMessage;
    if (!mediaContent) {
        throw new Boom('given message is not a media message', { statusCode: 400, data: content });
    }
    return mediaContent;
};
/**
 * Checks if a WebP buffer is animated by looking for VP8X chunk with animation flag
 * or ANIM/ANMF chunks
 */
const isAnimatedWebP = (buffer) => {
    // WebP must start with RIFF....WEBP
    if (buffer.length < 12 ||
        buffer[0] !== 0x52 ||
        buffer[1] !== 0x49 ||
        buffer[2] !== 0x46 ||
        buffer[3] !== 0x46 ||
        buffer[8] !== 0x57 ||
        buffer[9] !== 0x45 ||
        buffer[10] !== 0x42 ||
        buffer[11] !== 0x50) {
        return false;
    }
    ;
    // Parse chunks starting after RIFF header (12 bytes)
    let offset = 12;
    while (offset < buffer.length - 8) {
        const chunkFourCC = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        if (chunkFourCC === 'VP8X') {
            // VP8X extended header, check animation flag (bit 1 at offset+8)
            const flagsOffset = offset + 8;
            if (flagsOffset < buffer.length) {
                const flags = buffer[flagsOffset];
                if (flags & 0x02) {
                    return true;
                }
                ;
            }
            ;
        }
        else if (chunkFourCC === 'ANIM' || chunkFourCC === 'ANMF') {
            // ANIM or ANMF chunks indicate animation
            return true;
        }
        ;
        // Move to next chunk (chunk size + 8 bytes header, padded to even)
        offset += 8 + chunkSize + (chunkSize % 2);
    }
    ;
    return false;
};
/**
 * Checks if a buffer is a WebP file
 */
const isWebPBuffer = (buffer) => {
    return (buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50);
};
/**
 * Lia@Changes 30-01-26
 * ---
 * Determines whether a message should include a Biz Binary Node.
 * A Biz Binary Node is added only for interactive messages
 * such as buttons or other supported interactive types.
 */
export const shouldIncludeBizBinaryNode = (message) => !!(message.buttonsMessage ||
    message.listMessage ||
    message.templateMessage ||
    (message.interactiveMessage &&
        message.interactiveMessage.nativeFlowMessage));
