/**
 * @X4R1S3
 *
 * File: lib/Utils/rich-message-utils.js
 * About: Rich message utils module for the X4R1S3 WhatsApp protocol client.
 * Important exports: tokenizeCode, normalizeNewReel, normalizeNewRichImage, prepareNewRichMediaCompatibility, toUnified, buildImaginePrimitive, prepareRichGenerationMessage, buildAdditionalBotMetadataContext; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * Lia@Changes 09-04-26 [WIP]
 * Adds support for tables and code blocks with richResponseMessage (wrapped inside botForwardedMessage).
 *
 * If you use or copy this code, please credit my name or project. AND DO NOT CHANGE THIS NOTE
 */
import { getRandomValues, randomUUID, randomBytes } from 'crypto';
import { Boom } from '@hapi/boom';
import { BOT_RENDERING_CONFIG_METADATA, DONATE_URL, LEXER_REGEX } from '../Defaults/index.js';
import { LANGUAGE_KEYWORDS } from '../WABinary/constants.js';
import { CodeHighlightType, RichSubMessageType } from '../Types/RichType.js';
import { proto } from '../../WAProto/index.js';
import { unixTimestampSeconds } from './generics.js';
import { generateRichAIResponseContent, generateTableContent } from './message-composer.js';
import { extractImageThumb } from './messages-media.js';
const normalizeReminderEnum = (value, enumObject, field) => {
    const normalized = typeof value === 'string' ? enumObject[value] : value;
    if (typeof normalized !== 'number' || !Object.values(enumObject).includes(normalized)) {
        throw new Boom(`reminderMetadata.${field} must be a recognized enum name or number`, { statusCode: 400 });
    }
    return normalized;
};
const normalizeReminderMetadata = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Boom('reminderMetadata must be an object', { statusCode: 400 });
    }
    const metadata = {};
    if (value.requestMessageKey !== undefined && value.requestMessageKey !== null) {
        if (typeof value.requestMessageKey !== 'object' || Array.isArray(value.requestMessageKey)) {
            throw new Boom('reminderMetadata.requestMessageKey must be a message-key object', { statusCode: 400 });
        }
        metadata.requestMessageKey = value.requestMessageKey;
    }
    if (value.action !== undefined && value.action !== null) {
        metadata.action = normalizeReminderEnum(value.action, proto.BotReminderMetadata.ReminderAction, 'action');
    }
    if (value.name !== undefined && value.name !== null) {
        if (typeof value.name !== 'string') throw new Boom('reminderMetadata.name must be a string', { statusCode: 400 });
        metadata.name = value.name;
    }
    if (value.nextTriggerTimestamp !== undefined && value.nextTriggerTimestamp !== null) {
        const timestamp = value.nextTriggerTimestamp;
        const validNumber = typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp >= 0;
        const validString = typeof timestamp === 'string' && /^\d+$/.test(timestamp) && BigInt(timestamp) <= 0xffffffffffffffffn;
        if (!validNumber && !validString) {
            throw new Boom('reminderMetadata.nextTriggerTimestamp must be a non-negative uint64 integer or digit string', { statusCode: 400 });
        }
        metadata.nextTriggerTimestamp = timestamp;
    }
    if (value.frequency !== undefined && value.frequency !== null) {
        metadata.frequency = normalizeReminderEnum(value.frequency, proto.BotReminderMetadata.ReminderFrequency, 'frequency');
    }
    return metadata;
};
const NOOP = new Set([]);
export const tokenizeCode = (code, language = 'javascript') => {
    const keywords = LANGUAGE_KEYWORDS[language] || NOOP;
    const blocks = [];
    LEXER_REGEX.lastIndex = 0;
    let match;
    while ((match = LEXER_REGEX.exec(code)) !== null) {
        if (match[1]) {
            blocks.push({ highlightType: CodeHighlightType.COMMENT, codeContent: match[1] });
        }
        else if (match[2]) {
            blocks.push({ highlightType: CodeHighlightType.STRING, codeContent: match[2] });
        }
        else if (match[3]) {
            blocks.push({
                highlightType: keywords.has(match[3]) ? CodeHighlightType.KEYWORD : CodeHighlightType.METHOD,
                codeContent: match[3],
            });
        }
        else if (match[4]) {
            blocks.push({
                highlightType: keywords.has(match[4]) ? CodeHighlightType.KEYWORD : CodeHighlightType.DEFAULT,
                codeContent: match[4],
            });
        }
        else if (match[5]) {
            blocks.push({ highlightType: CodeHighlightType.NUMBER, codeContent: match[5] });
        }
        else {
            blocks.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: match[6] });
        }
    }
    return blocks;
};
const firstImageValue = (...values) => values.find(value => value !== undefined && value !== null && String(value).length > 0);

const inferImageMimeType = (url = '') => {
    const path = String(url).split('?')[0].toLowerCase();
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    return 'image/png';
};

/** Normalize album image variants without downgrading full-size URLs to previews. */
const buildRichImagePrimitive = (image = {}, expiration = String(Date.now() + 30 * 24 * 60 * 60 * 1000)) => {
    const previewUrl = firstImageValue(image.imagePreviewUrl, image.previewUrl, image.preview_url, image.sourceUrl, image.source_url, image.url) || '';
    const fullUrl = firstImageValue(image.imageHighResUrl, image.highResUrl, image.high_res_url, image.fullUrl, image.full_url, image.sourceUrl, image.source_url, image.url, previewUrl);
    const darkPreviewUrl = firstImageValue(image.darkModePreviewUrl, image.dark_mode_preview_url, previewUrl);
    const darkFullUrl = firstImageValue(image.darkModeHighResUrl, image.darkModeHighResUrl, image.dark_mode_high_res_url, image.darkModePreviewUrl, image.dark_mode_preview_url, fullUrl);
    const width = Number(image.previewWidth || image.preview_width || image.width || 600);
    const height = Number(image.previewHeight || image.preview_height || image.height || 400);
    const fullWidth = Number(image.fullWidth || image.full_width || image.highResWidth || image.high_res_width || image.width || width);
    const fullHeight = Number(image.fullHeight || image.full_height || image.highResHeight || image.high_res_height || image.height || height);
    const darkWidth = Number(image.darkWidth || image.dark_width || fullWidth);
    const darkHeight = Number(image.darkHeight || image.dark_height || fullHeight);
    const mimeType = image.mimeType || image.mime_type || inferImageMimeType(fullUrl || previewUrl);
    const media = (url, mediaWidth, mediaHeight) => ({
        url,
        url_fallback: url,
        mime_type: mimeType,
        expiration_timestamp_ms: expiration,
        width: mediaWidth,
        height: mediaHeight
    });
    const primitive = {
        full_image: media(fullUrl, fullWidth, fullHeight),
        asset_query_status: 'FETCHED',
        __typename: 'GenAIImagePrimitive'
    };
    // WhatsApp requires the preview slots to recognize an image primitive.
    // Omitting them makes mixed image/video albums silently drop the image.
    primitive.preview_image = media(previewUrl, width, height);
    primitive.dark_mode_preview_image = media(darkPreviewUrl, darkWidth, darkHeight);
    primitive.dark_mode_full_image = media(darkFullUrl, darkWidth, darkHeight);
    return primitive;
};

/** Normalize the field names used by New compatibility's Meta/reels helpers. */
export const normalizeNewReel = (reel = {}) => ({
    reels_url: reel.videoUrl || reel.video_url || reel.reels_url || reel.reelsUrl || reel.url || '',
    thumbnail_url: reel.thumbnailUrl || reel.thumbnail_url || reel.thumbnail || '',
    creator: reel.creator || reel.username || reel.title || '',
    avatar_url: reel.profileIconUrl || reel.avatar_url || reel.avatar || reel.icon || '',
    reels_title: reel.title || reel.reels_title || reel.reelsTitle || '',
    likes_count: reel.likesCount ?? reel.likes_count ?? reel.likes ?? 0,
    comments_count: reel.commentsCount ?? reel.comments_count ?? reel.comments ?? 0,
    shares_count: reel.sharesCount ?? reel.shares_count ?? reel.shares ?? 0,
    view_count: reel.viewCount ?? reel.view_count ?? reel.views ?? 0,
    reel_source: reel.reelSource || reel.reel_source || reel.source || 'IG',
    is_verified: !!(reel.isVerified ?? reel.is_verified ?? reel.verified),
    orientation: reel.orientation || reel.ratio || 'LANDSCAPE',
    post_type: reel.postType || reel.post_type || 'VIDEO',
    is_carousel: reel.isCarousel ?? reel.is_carousel ?? false
});

/** Build the New-compatible image/post shape without replacing native image data. */
export const normalizeNewRichImage = (image = {}) => ({
    thumbnail_url: image.thumbnailUrl || image.thumbnail_url || image.thumbnail || image.previewUrl || image.preview_url || '',
    image_url: image.imageUrl || image.image_url || image.fullUrl || image.full_url || image.url || '',
    source_url: image.sourceUrl || image.source_url || image.url || '',
    title: image.title || image.caption || '',
    creator: image.creator || image.username || '',
    avatar_url: image.profileIconUrl || image.avatar_url || image.avatar || '',
    is_verified: !!(image.isVerified ?? image.is_verified ?? image.verified),
    post_caption: image.postCaption || image.post_caption || image.caption || '',
    likes_count: image.likesCount ?? image.likes_count ?? image.likes ?? 0,
    comments_count: image.commentsCount ?? image.comments_count ?? image.comments ?? 0,
    shares_count: image.sharesCount ?? image.shares_count ?? image.shares ?? 0,
    orientation: image.orientation || image.ratio || 'LANDSCAPE',
    post_type: image.postType || image.post_type || 'IMAGE',
    is_carousel: image.isCarousel ?? image.is_carousel ?? false
});

/** Create the second New-shaped representation beside native AIRich sections. */
export const prepareNewRichMediaCompatibility = (content = {}) => {
    const reels = (Array.isArray(content.reels) ? content.reels : []).map(normalizeNewReel);
    const images = (Array.isArray(content.images) ? content.images : content.image ? [content.image] : []).map(normalizeNewRichImage);
    const posts = (Array.isArray(content.posts) ? content.posts : content.post ? [content.post] : []).map(normalizeNewRichImage);
    const sections = [];
    if (reels.length) sections.push({ view_model: { primitives: reels.map(item => ({ ...item, __typename: 'GenAIReelPrimitive' })), __typename: 'GenAIHScrollLayoutViewModel' } });
    if (images.length) sections.push({ view_model: { primitives: images.map(item => ({ ...item, __typename: 'GenAIImagePrimitive' })), __typename: 'GenAIHScrollLayoutViewModel' } });
    if (posts.length) sections.push({ view_model: { primitives: posts.map(item => ({ ...item, __typename: 'GenAIPostPrimitive' })), __typename: 'GenAIHScrollLayoutViewModel' } });
    return { compatibility: 'new-rich-media', reels, images, posts, sections };
};
// Lia@Changes 09-04-26 --- Inject buffer into unifiedResponse.data to support proper rendering of rich messages (ex: tables and code blocks)
export const toUnified = (submessages, uuid) => ({
    response_id: uuid || randomUUID(),
    sections: submessages.map((submessage) => {
        switch (submessage.messageType) {
            case RichSubMessageType.CODE: {
                const codeMetadata = submessage.codeMetadata || {};
                return {
                    view_model: {
                        primitive: {
                            language: codeMetadata.codeLanguage || 'javascript',
                            code_blocks: (codeMetadata.codeBlocks || []).map((block) => ({ content: block.codeContent, type: CodeHighlightType[block.highlightType] || 'DEFAULT' })),
                            __typename: 'GenAICodeUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.GRID_IMAGE: {
                const imageUrls = submessage.gridImageMetadata?.imageUrls ||
                    (submessage.gridImageMetadata?.gridImageUrl ? [submessage.gridImageMetadata.gridImageUrl] : []);
                if (!imageUrls.length) return null;
                const expiration = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
                const primitives = imageUrls.map(img => buildRichImagePrimitive(img, expiration));
                return { view_model: { primitives, __typename: 'GenAIGridLayoutViewModel' } };
            }
            case RichSubMessageType.CONTENT_ITEMS: {
                const items = submessage.contentItemsMetadata?.itemsMetadata || [];
                const primitives = items.map((item) => {
                    const reel = item?.reelItem || item || {};
                    return {
                        reels_url: reel.videoUrl || reel.reels_url || reel.url || '',
                        thumbnail_url: reel.thumbnailUrl || reel.thumbnail_url || '',
                        creator: reel.creator || reel.title || '',
                        avatar_url: reel.profileIconUrl || reel.avatar_url || '',
                        reels_title: reel.title || reel.reels_title || '',
                        likes_count: reel.likesCount ?? reel.likes_count ?? 0,
                        shares_count: reel.sharesCount ?? reel.shares_count ?? 0,
                        view_count: reel.viewCount ?? reel.view_count ?? 0,
                        reel_source: reel.reelSource || reel.reel_source || 'IG',
                        is_verified: !!(reel.isVerified ?? reel.is_verified),
                        __typename: 'GenAIReelPrimitive'
                    };
                }).filter((item) => item.reels_url || item.thumbnail_url || item.reels_title);
                return {
                    view_model: {
                        primitives,
                        __typename: 'GenAIHScrollLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.INLINE_IMAGE: {
                const image = submessage.imageMetadata || {};
                const rawImage = image.imageUrl || image.url || image.image;
                const imageData = typeof rawImage === 'string'
                    ? { ...image, url: rawImage }
                    : { ...image, ...(rawImage || {}) };
                const primitive = buildRichImagePrimitive({
                    ...imageData,
                    mimeType: imageData.mimeType || imageData.mime_type,
                });
                return primitive.full_image.url
                    ? {
                        view_model: {
                            primitives: [{ ...primitive, display_mode: 'FULL_WIDTH', full_width: true }],
                            display_mode: 'FULL_WIDTH',
                            full_width: true,
                            __typename: 'GenAIVStackLayoutViewModel'
                        }
                    }
                    : {};
            }
            case RichSubMessageType.LATEX: {
                const metadata = submessage.latexMetadata || {};
                const expression = (metadata.expressions || [])[0] || {};
                const item = {
                    latex_expression: expression.latexExpression || expression.expression || '',
                    font_height: expression.fontHeight,
                    padding: expression.padding ?? 15,
                    latex_image: {
                        url: expression.url || '',
                        width: expression.width || 388,
                        height: expression.height || 160
                    }
                };
                return {
                    view_model: {
                        primitive: { item, ...item, __typename: 'GenAILatexUXPrimitive' },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.TABLE: {
                const tableMetadata = submessage.tableMetadata || {};
                return {
                    view_model: {
                        primitive: {
                            title: tableMetadata.title || '',
                            rows: (tableMetadata.rows || []).map((row) => ({
                                is_header: !!row.isHeading,
                                cells: row.items || [],
                                markdown_cells: (row.items || []).map((item) => ({ text: item }))
                            })),
                            __typename: 'GenATableUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.MAP: {
                const map = submessage.mapMetadata || {};
                return {
                    view_model: {
                        primitive: {
                            center_latitude: map.centerLatitude,
                            center_longitude: map.centerLongitude,
                            latitude_delta: map.latitudeDelta,
                            longitude_delta: map.longitudeDelta,
                            show_info_list: map.showInfoList === true,
                            annotations: (map.annotations || []).map((annotation, index) => ({
                                annotation_number: annotation.annotationNumber ?? index + 1,
                                latitude: annotation.latitude,
                                longitude: annotation.longitude,
                                title: annotation.title || '',
                                body: annotation.body || ''
                            })),
                            __typename: 'GenAIMapPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.DYNAMIC: {
                const dynamic = submessage.dynamicMetadata || {};
                const dynamicType = dynamic.type === proto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF
                    ? 'GIF'
                    : 'IMAGE';
                return {
                    view_model: {
                        primitive: {
                            dynamic_type: dynamicType,
                            version: dynamic.version,
                            url: dynamic.url || '',
                            loop_count: dynamic.loopCount,
                            __typename: 'GenAIDynamicMediaPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            }
            case RichSubMessageType.TEXT:
                return {
                    view_model: {
                        primitive: {
                            text: submessage.messageText || '',
                            inline_entities: submessage.inlineEntities || [],
                            __typename: 'GenAIMarkdownTextUXPrimitive'
                        },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                };
            default:
                return submessage;
        }
    })
});
/**
 * Build the Meta-style AI image/video primitive used for generation states.
 * This is intentionally additive: existing reels, tables, links, and menus keep
 * their current wire format.
 */
export const buildImaginePrimitive = ({
    mediaType = 'video',
    url = '',
    thumbnail,
    mimeType,
    fileLength = 0,
    duration = 0,
    status = 'GENERATING',
    estimatedMs,
    imagineType
} = {}) => {
    const normalizedType = String(mediaType).toLowerCase() === 'image' ? 'IMAGE' : 'ANIMATE';
    const primitive = {
        media: {
            url: url || '',
            mime_type: mimeType || (normalizedType === 'IMAGE' ? 'image/jpeg' : 'video/mp4'),
            file_length: fileLength || 0,
            duration: duration || 0
        },
        imagine_type: imagineType || normalizedType,
        status: { status: String(status || 'GENERATING').toUpperCase() },
        __typename: 'GenAIImaginePrimitive'
    };
    if (estimatedMs != null) {
        primitive.status.estimated_completion_time = Math.floor((Date.now() + Number(estimatedMs)) / 1000);
    }
    if (thumbnail) primitive.thumbnail = { raw_media: thumbnail };
    return primitive;
};

/**
 * Prepare a native rich-response message containing a generation primitive.
 * `itemId` is returned to callers so a later edit can replace the same item.
 */
export const prepareRichGenerationMessage = ({
    text = '',
    mediaType = 'video',
    url = '',
    thumbnail,
    mimeType,
    fileLength = 0,
    duration = 0,
    status = 'GENERATING',
    estimatedMs,
    itemId = `imagine_${randomUUID()}`,
    responseId = randomUUID(),
    forwarded = true,
    verificationMetadata
} = {}) => {
    const sections = [];
    if (text) {
        sections.push({ view_model: { primitive: { text: String(text), inline_entities: [], __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    }
    sections.push({ view_model: { primitive: buildImaginePrimitive({ mediaType, url, thumbnail, mimeType, fileLength, duration, status, estimatedMs }), __typename: 'GenAISingleLayoutViewModel', id: itemId } });
    const submessages = text ? [{ messageType: RichSubMessageType.TEXT, messageText: String(text) }] : [];
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: responseId, sections })) },
        contextInfo: forwarded ? { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 } : {}
    });
    const message = wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
    message.messageContextInfo = message.messageContextInfo || {};
    message.messageContextInfo.botMetadata = {
        ...(message.messageContextInfo.botMetadata || {}),
        botResponseId: responseId
    };
    return { message, responseId, itemId };
};

// Lia@Note 17-04-26 --- WIP
/**
 * A preview-media descriptor is only meaningful when the client can locate and
 * decrypt the media. A descriptor without a key, hash and direct path describes
 * media that cannot be fetched, so it is dropped rather than shipped
 * present-but-empty (which is what previously produced `''` crypto fields and a
 * hard-coded `image/jpeg` mimetype on every reel).
 *
 * Callers that upload real media supply it as `previewMedia` on the reel item or
 * LaTeX expression: `{ fileSha256, mediaKey, fileEncSha256, directPath, mimetype?, mediaKeyTimestamp?, mediaId? }`.
 */
const normalizePreviewMedia = (media) => {
    if (!media || typeof media !== 'object') return null;
    const { fileSha256, mediaKey, fileEncSha256, directPath, mimetype, mediaKeyTimestamp } = media;
    if (!fileSha256 || !mediaKey || !fileEncSha256 || !directPath) return null;
    return {
        fileSha256,
        mediaKey,
        fileEncSha256,
        directPath,
        mediaKeyTimestamp: mediaKeyTimestamp ?? unixTimestampSeconds(),
        mimetype: mimetype || 'image/jpeg'
    };
};

export const buildAdditionalBotMetadataContext = (submessages) => {
    const sources = [];
    const mediaDetailsMetadataList = [];
    for (const submessage of submessages) {
        switch (submessage.messageType) {
            case RichSubMessageType.CONTENT_ITEMS: {
                const itemsMetadata = submessage.contentItemsMetadata?.itemsMetadata || [];
                for (const item of itemsMetadata) {
                    const reelItem = item?.reelItem || item || {};
                    sources.push({
                        provider: 0,
                        thumbnailCdnUrl: reelItem.thumbnailUrl || reelItem.thumbnail_url || '',
                        sourceProviderUrl: reelItem.videoUrl || reelItem.reels_url || reelItem.url || '',
                        sourceQuery: '',
                        faviconCdnUrl: reelItem.profileIconUrl || reelItem.avatar_url || '',
                        // 1-based source ordinal, not the submessage index.
                        citationNumber: sources.length + 1,
                        sourceTitle: reelItem.title || reelItem.reels_title || reelItem.creator || ''
                    });
                    const previewMedia = normalizePreviewMedia(reelItem.previewMedia);
                    if (previewMedia) {
                        mediaDetailsMetadataList.push({
                            id: reelItem.mediaId || reelItem.previewMedia?.mediaId || randomBytes(32).toString('hex'),
                            previewMedia
                        });
                    }
                }
                break;
            }
            case RichSubMessageType.LATEX: {
                const expressions = submessage.latexMetadata?.expressions || [];
                for (const expression of expressions) {
                    const previewMedia = normalizePreviewMedia(expression?.previewMedia);
                    if (previewMedia) {
                        mediaDetailsMetadataList.push({
                            id: expression.mediaId || expression.previewMedia?.mediaId || randomBytes(32).toString('hex'),
                            previewMedia
                        });
                    }
                }
                break;
            }
        }
    }
    return { sources, mediaDetailsMetadataList };
}
const richMenuToolId = () => randomBytes(8).toString('hex');

const mediaPrimitive = (image, inline = false, padding = 4) => {
    if (!image?.url) return null;
    const media = {
        __typename: 'GenAIMediaItem',
        mime_type: image.mime_type || image.mimeType || 'image/png',
        url: image.url,
        url_fallback: image.url,
        width: image.width || (inline ? 500 : undefined),
        height: image.height || (inline ? 500 : undefined),
        expiration_timestamp_ms: Date.now() + 86400000,
    };
    if (inline) {
        return {
            __typename: 'GenAIMarkdownTextUXPrimitive',
            text: '{{header}}.{{/header}}',
            inline_entities: [{
                __typename: 'GenAITextInlineEntity',
                key: 'header',
                metadata: {
                    __typename: 'GenAILatexItem',
                    latex_expression: '.',
                    font_height: 24,
                    padding,
                    latex_image: media,
                },
            }],
        };
    }
    return {
        __typename: 'GenAIImagePrimitive',
        preview_image: media,
        full_image: media,
    };
};

const richMenuButton = (button, toast = '') => {
    const label = typeof button === 'string' ? button : (button?.text || button?.label || button?.id || 'Option');
    return {
        label: String(label),
        state: 'PENDING',
        kind: 'OTHER',
        // Preserve supplied IDs so WhatsApp CTA replies are routable.
        // Legacy string-only buttons retain generated IDs for compatibility.
        tool_call_id: typeof button === 'object' && button?.id != null
            ? String(button.id)
            : richMenuToolId(),
        toast: {
            label: typeof button === 'object' && button?.toast != null ? String(button.toast) : String(toast || ''),
            __typename: 'GenAIExtWidgetToast',
        },
        __typename: 'GenAI3PExtWidgetCTA',
    };
};

/**
 * Builds the Meta AI-style rich menu envelope used by vansnowi/baileys.
 * This is an experimental WhatsApp rich-response format, not a standard
 * buttonsMessage/nativeFlowMessage payload.
 */
/**
 * Build a universal AIRich social/entity result card.
 * The wire format is provider-neutral; Instagram is exposed as a dedicated
 * convenience wrapper below because it is the primary supported profile view.
 */
export const prepareSocialEntityMessage = ({
    username = '',
    platform = 'GENERIC',
    title = 'X4R1S3',
    subtitle = '⚉',
    imageUrl = '',
    entityId,
    entityUrl = '',
    entityType,
    fullName = 'NOT found',
    isVerified = false,
    resultText = 'See results',
    botJid = '867051314767696@bot',
    responseId
} = {}) => {
    const normalizedPlatform = String(platform || 'GENERIC').toUpperCase();
    const profileUrl = entityUrl || (username ? `https://www.${normalizedPlatform.toLowerCase()}.com/${encodeURIComponent(username)}` : '');
    const resolvedType = entityType || (normalizedPlatform === 'INSTAGRAM' ? 'IG_PROFILE' : 'SOCIAL_PROFILE');
    const displayName = username || fullName || 'Profile';
    const sections = [
        {
            view_model: {
                primitives: [{
                    title,
                    subtitle,
                    ...(imageUrl ? { image: { url: imageUrl, mime_type: 'image/png' } } : {}),
                    entity_id: String(entityId ?? username ?? ''),
                    entity_url: profileUrl,
                    entity_type: 'WEBSITE',
                    action_type: 'OPEN_URL',
                    is_verified: !!isVerified,
                    __typename: 'GenAICompactEntityPrimitive'
                }],
                __typename: 'GenAIActionRowLayoutViewModel'
            }
        },
        {
            view_model: {
                primitives: [{ type: 'HORIZONTAL_LINE', __typename: 'GenAIDividerPrimitive' }],
                __typename: 'GenAIVStackLayoutViewModel'
            }
        },
        {
            view_model: {
                primitives: [
                    { __typename: 'GenAISpacerPrimitive' },
                    {
                        text: `# {{social_entity_1}}${resultText}\0{{/social_entity_1}}    `,
                        inline_entities: [{
                            key: 'social_entity_1',
                            metadata: {
                                __typename: 'GenAISocialEntityItem',
                                entity_id: String(entityId ?? username ?? ''),
                                entity_name: displayName,
                                entity_full_name: fullName,
                                platform: String(platform || 'GENERIC').toUpperCase(),
                                entity_picture_url: imageUrl,
                                entity_url: profileUrl,
                                entity_type: resolvedType,
                                platform: normalizedPlatform,
                                is_verified: !!isVerified
                            }
                        }],
                        __typename: 'GenAIMarkdownTextUXPrimitive'
                    },
                    { __typename: 'GenAISpacerPrimitive' }
                ],
                __typename: 'GenAIActionRowLayoutViewModel'
            }
        }
    ];
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: {
                        response_id: responseId || randomUUID(),
                        data: Buffer.from(JSON.stringify({ sections })).toString('base64')
                    },
                    contextInfo: {
                        isForwarded: true,
                        forwardOrigin: 4,
                        forwardedAiBotMessageInfo: { botJid }
                    }
                }
            }
        }
    };
};

/** Dedicated Instagram profile card using the universal social-entity wire format. */
export const prepareInstagramProfileMessage = (content = {}) => prepareSocialProfileMessage({
    ...content,
    platform: 'INSTAGRAM',
    entityType: 'IG_PROFILE',
    entityUrl: content.entityUrl || (content.username ? `https://www.instagram.com/${encodeURIComponent(content.username)}` : undefined)
});

export const prepareRichMenuMessage = (content = {}) => {
    const { header = {}, body = {}, footer = {}, verificationMetadata } = content || {};
    const sections = [];
    const title = header?.title || '';
    if (title) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: { __typename: 'FOATextPrimitive', text: '# ' + title },
            },
        });
    }
    const headerImage = mediaPrimitive(header?.image, Boolean(header?.image?.inline));
    if (headerImage) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: headerImage },
        });
    }
    if (header?.disclaimer) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: { __typename: 'GenAIMarkdownTextUXPrimitive', text: header.disclaimerText || ' ' },
            },
        });
    }
    const cards = Array.isArray(body?.cards) ? body.cards : [];
    const buttons = Array.isArray(body?.buttons) ? body.buttons : [];
    if (cards.length) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                primitives: cards.map(card => ({
                    __typename: 'GenAI3PExtWidgetPrimitive',
                    header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: card?.title || '' },
                    body: {
                        __typename: 'GenAI3PExtCalendarEventList',
                        ctas: (Array.isArray(card?.buttons) ? card.buttons : []).map(button => richMenuButton(button, card?.toast)),
                        sections: [],
                    },
                })),
                __typename: body.carousel ? 'GenAIHScrollLayoutViewModel' : 'GenAIActionRowLayoutViewModel',
            },
        });
    } else if (buttons.length) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAI3PExtWidgetPrimitive',
                    header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: body.title || '' },
                    body: {
                        __typename: 'GenAI3PExtCalendarEventList',
                        ctas: buttons.map(button => richMenuButton(button, body.toast)),
                        sections: [],
                    },
                },
            },
        });
    }
    if (footer?.text || footer?.url || footer?.image?.url) {
        const footerImage = mediaPrimitive(footer.image, true, -5);
        sections.push({
            view_model: {
                primitives: [
                    { __typename: 'GenAIFooterActionPrimitive', cta_text: footer.text || 'Open', cta_type: 'OPEN_URL', cta_url: footer.url || '' },
                    ...(footerImage ? [footerImage] : []),
                ],
                __typename: 'GenAIActionRowLayoutViewModel',
            },
        });
    }
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Builds a GenAI copy-to-clipboard rich response message.
 * Renders a text label with a dark circular copy icon (addon_action_type: COPY_TO_CLIPBOARD).
 *
 * @param {Object} options
 * @param {string} options.text - The text to display (and copy when tapped)
 * @param {string} [options.label] - Optional display label (defaults to text)
 * @param {'END'|'START'|'CENTER'} [options.alignment='END'] - Button alignment
 * @returns {Object} Wrapped botForwardedMessage ready for relayMessage
 */
/** Build the manually serialized AIRich command menu shown in the screenshot. */
export const prepareAIRichCommandMenu = ({ image, title = 'X4R1S3', subtitle = '', code = '', rows = [], buttons = [], footer = 'Developed by - X4R1S3', latexImage, latexExpression = '' } = {}) => {
    if (!image) throw new Error('AIRich command menu requires an image URL');
    if (!Array.isArray(rows)) throw new Error('AIRich command-menu rows must be an array');
    if (!Array.isArray(buttons)) throw new Error('AIRich command-menu buttons must be an array');
    const safeRows = rows.map((row, index) => ({ command: String(row?.[0] ?? row?.command ?? `command_${index + 1}`), description: String(row?.[1] ?? row?.description ?? '') }));
    const table = ['Command | Function', '--- | ---', ...safeRows.map((row) => `${row.command} | ${row.description}`)].join('\n');
    const inlineEntities = latexImage ? [{ key: 'NGA', metadata: { latex_expression: String(latexExpression), latex_image: { url: String(latexImage), width: 400, height: 400 }, font_height: 83.333, padding: 15, __typename: 'GenAILatexItem' } }] : [];
    const text = [String(title), subtitle && String(subtitle), code && `Code: ${String(code)}`, '## Command List', table, footer && String(footer)].filter(Boolean).join('\n');
    const imagePrimitive = { __typename: 'GenAIImagePrimitive', preview_image: { __typename: 'GenAIMediaItem', mime_type: 'image/png', url: String(image) }, full_image: { __typename: 'GenAIMediaItem', mime_type: 'image/png', url: String(image) } };
    const ctas = buttons.map((button, index) => ({ label: String(button?.text || button?.label || `Button ${index + 1}`), state: 'PENDING', kind: 'OTHER', tool_call_id: String(button?.id || `airich_menu_${index + 1}`), toast: { label: String(button?.toast || ''), __typename: 'GenAIExtWidgetToast' }, __typename: 'GenAI3PExtWidgetCTA' }));
    const footerPrimitives = buttons.map((button, index) => ({ cta_text: String(button?.text || button?.label || `Button ${index + 1}`), cta_type: 'OPEN_URL', cta_url: String(button?.url || ''), __typename: 'GenAIFooterActionPrimitive' }));
    footerPrimitives.push({ cta_text: '☷ OPEN MENU', cta_type: 'OPEN_URL', cta_url: String(buttons[0]?.url || ''), __typename: 'GenAIFooterActionPrimitive' });
    const sections = [
        { __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: imagePrimitive } },
        ...(ctas.length ? [{ __typename: 'GenAIUnifiedResponseSection', view_model: { primitives: [{ __typename: 'GenAI3PExtWidgetPrimitive', header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: 'Command List' }, body: { __typename: 'GenAIExtCalendarEventList', ctas, sections: [] } }], __typename: 'GenAIActionRowLayoutViewModel' } }] : []),
        { __typename: 'GenAIUnifiedResponseSection', view_model: { primitive: { text: `{{NGA}}${text}{{/NGA}}`, inline_entities: inlineEntities, __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } },
        { __typename: 'GenAIUnifiedResponseSection', view_model: { primitives: footerPrimitives, __typename: 'GenAIActionRowLayoutViewModel' } }
    ];
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [{ messageType: RichSubMessageType.TEXT, messageText: text }],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: randomUUID(), sections })) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage);
};

/**
 * Build the calendar-event-list widget envelope used by AIRich responses.
 * Event section objects are passed through unchanged because their internal
 * schema is not documented by the current Proto definitions.
 */
const prepareAIRichCalendarWidgetSection = ({ title = 'Upcoming events', sections = [], actions = [] } = {}) => {
    if (!Array.isArray(sections) || sections.some(section => !section || typeof section !== 'object' || Array.isArray(section))) {
        throw new Boom('calendarWidget.sections must be an array of section objects', { statusCode: 400 });
    }
    if (!Array.isArray(actions) || actions.some(action => !action || typeof action !== 'object' || Array.isArray(action))) {
        throw new Boom('calendarWidget.actions must be an array of action objects', { statusCode: 400 });
    }
    const ctas = actions.map((action, index) => ({
        __typename: 'GenAI3PExtWidgetCTA',
        label: String(action.label ?? ''),
        state: String(action.state ?? 'PENDING'),
        kind: String(action.kind ?? 'OTHER'),
        tool_call_id: String(action.tool_call_id ?? action.toolCallId ?? action.id ?? `calendar_action_${index + 1}`),
        ...(action.toast !== undefined ? {
            toast: {
                __typename: 'GenAI3PExtWidgetToast',
                label: String(typeof action.toast === 'object' && action.toast !== null ? action.toast.label ?? action.label ?? '' : action.toast)
            }
        } : {})
    }));
    const widget = {
        __typename: 'GenAI3PExtWidgetPrimitive',
        header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: String(title) },
        body: {
            __typename: 'GenAI3PExtCalendarEventList',
            sections,
            ...(ctas.length ? { ctas } : {})
        }
    };
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAISingleLayoutViewModel',
            primitive: widget
        }
    };
};

/**
 * Prepare a customizable client-rendered contact-style card using the
 * inapp_signup native-flow action. The viewer-local avatar is not sent as
 * media; it is rendered by compatible WhatsApp clients.
 */
export const prepareInteractiveContactCardMessage = ({
    title,
    body,
    detailLabel = 'View details',
    description = '',
    buttonName = 'inapp_signup',
    buttonParams = {},
    footer,
    image,
    video,
    gif,
    livePhoto
} = {}) => {
    const normalizedTitle = String(title ?? '').trim();
    if (!normalizedTitle) {
        throw new Boom('sendInteractiveContactCard requires a non-empty title', { statusCode: 400 });
    }
    if (typeof buttonName !== 'string' || !buttonName.trim()) {
        throw new Boom('sendInteractiveContactCard buttonName must be a non-empty string', { statusCode: 400 });
    }
    if (!buttonParams || typeof buttonParams !== 'object' || Array.isArray(buttonParams)) {
        throw new Boom('sendInteractiveContactCard buttonParams must be an object', { statusCode: 400 });
    }
    const mediaSources = [image, video, gif, livePhoto].filter(value => value !== undefined && value !== null);
    if (mediaSources.length > 1) {
        throw new Boom('sendInteractiveContactCard accepts only one of image, video, gif, or livePhoto', { statusCode: 400 });
    }
    if (livePhoto != null && (!livePhoto || typeof livePhoto !== 'object' || Array.isArray(livePhoto) || !livePhoto.video)) {
        throw new Boom('sendInteractiveContactCard livePhoto requires a video source', { statusCode: 400 });
    }

    const bodyText = body == null
        ? `${normalizedTitle}\n${String(detailLabel ?? 'View details')}${description ? `\n\n${String(description)}` : ''}`
        : String(body);

    const mediaContent = image != null
        ? { image }
        : video != null
            ? { video }
            : gif != null
                ? { video: gif, gifPlayback: true }
                : {};

    return {
        ...mediaContent,
        title: normalizedTitle,
        text: bodyText,
        nativeFlow: [{
            name: buttonName.trim(),
            buttonParamsJson: JSON.stringify(buttonParams)
        }],
        ...(footer != null ? { footer: String(footer) } : {})
    };
};

/**
 * Prepare the legacy location-header button card used by themed bot menus.
 * The JPEG is a LocationMessage thumbnail, not a separately uploaded image.
 */
export const prepareLocationButtonCardMessage = ({
    title,
    subtitle = '',
    text = '',
    thumbnail,
    buttons = [],
    latitude = 0,
    longitude = 0,
    footer
} = {}) => {
    const normalizedTitle = String(title ?? '').trim();
    if (!normalizedTitle) {
        throw new Boom('sendLocationButtonCard requires a non-empty title', { statusCode: 400 });
    }
    if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
        throw new Boom('sendLocationButtonCard requires between 1 and 3 buttons', { statusCode: 400 });
    }
    const normalizedButtons = buttons.map((button, index) => {
        const id = String(button?.id ?? button?.buttonId ?? '').trim();
        const label = String(button?.text ?? button?.buttonText ?? '').trim();
        if (!id || !label) {
            throw new Boom(`sendLocationButtonCard button ${index + 1} requires a non-empty id and text`, { statusCode: 400 });
        }
        return { id, text: label };
    });

    const degreesLatitude = Number(latitude);
    const degreesLongitude = Number(longitude);
    if (!Number.isFinite(degreesLatitude) || degreesLatitude < -90 || degreesLatitude > 90) {
        throw new Boom('sendLocationButtonCard latitude must be between -90 and 90', { statusCode: 400 });
    }
    if (!Number.isFinite(degreesLongitude) || degreesLongitude < -180 || degreesLongitude > 180) {
        throw new Boom('sendLocationButtonCard longitude must be between -180 and 180', { statusCode: 400 });
    }
    if (thumbnail != null && !Buffer.isBuffer(thumbnail) && !(thumbnail instanceof Uint8Array)) {
        throw new Boom('sendLocationButtonCard thumbnail must be a Buffer or Uint8Array', { statusCode: 400 });
    }

    return {
        caption: String(text ?? ''),
        location: {
            degreesLatitude,
            degreesLongitude,
            name: normalizedTitle,
            address: String(subtitle ?? ''),
            ...(thumbnail != null ? { jpegThumbnail: Buffer.from(thumbnail) } : {})
        },
        buttons: normalizedButtons,
        ...(footer != null ? { footer: String(footer) } : {})
    };
};

/** Prepare an image-header button card for menus that should not carry map data. */
export const prepareMenuButtonCardMessage = ({
    title,
    subtitle = '',
    text = '',
    image,
    buttons = [],
    footer
} = {}) => {
    const normalizedTitle = String(title ?? '').trim();
    if (!normalizedTitle) {
        throw new Boom('sendMenuButtonCard requires a non-empty title', { statusCode: 400 });
    }
    if (!Buffer.isBuffer(image) && !(image instanceof Uint8Array)) {
        throw new Boom('sendMenuButtonCard image must be a Buffer or Uint8Array', { statusCode: 400 });
    }
    if (image.length === 0) {
        throw new Boom('sendMenuButtonCard image must not be empty', { statusCode: 400 });
    }
    if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
        throw new Boom('sendMenuButtonCard requires between 1 and 3 buttons', { statusCode: 400 });
    }
    const normalizedButtons = buttons.map((button, index) => {
        const id = String(button?.id ?? button?.buttonId ?? '').trim();
        const label = String(button?.text ?? button?.buttonText ?? '').trim();
        if (!id || !label) {
            throw new Boom(`sendMenuButtonCard button ${index + 1} requires a non-empty id and text`, { statusCode: 400 });
        }
        return { id, text: label };
    });
    const caption = [normalizedTitle, String(subtitle ?? '').trim(), String(text ?? '').trim()]
        .filter(Boolean)
        .join('\n');
    return {
        image: Buffer.from(image),
        caption,
        buttons: normalizedButtons,
        ...(footer != null ? { footer: String(footer) } : {})
    };
};

/**
 * Normalize a caller-provided location thumbnail to the compact JPEG form
 * accepted by WhatsApp location-card renderers. The original bytes are kept
 * as a compatibility fallback when no optional image processor is installed.
 */
export const normalizeLocationButtonCardThumbnail = async thumbnail => {
    if (thumbnail == null) {
        return thumbnail;
    }
    const original = Buffer.from(thumbnail);
    try {
        const firstPass = await extractImageThumb(original, 192);
        const originalWidth = Number(firstPass.original?.width) || 0;
        const originalHeight = Number(firstPass.original?.height) || 0;
        const longestSide = Math.max(originalWidth, originalHeight);
        const targetWidth = longestSide > 0
            ? Math.max(1, Math.round(Math.min(192, longestSide) * originalWidth / longestSide))
            : 192;
        const buffer = targetWidth === 192
            ? firstPass.buffer
            : (await extractImageThumb(original, targetWidth)).buffer;
        return buffer?.length ? buffer : original;
    }
    catch {
        return original;
    }
};

/**
 * Build an arbitrary A2UI interactive message. The command-menu helper below
 * is only a convenience preset; callers may provide any supported component,
 * widget, or native-flow payload through this universal builder.
 */
export const prepareA2UIMessage = ({ imageMessage, bloksWidget = {}, nativeFlowMessage, fallback = '', ...interactiveFields } = {}) => ({
    interactiveMessage: {
        ...interactiveFields,
        ...(imageMessage ? { header: { imageMessage, hasMediaAttachment: true } } : {}),
        bloksWidget: {
            type: bloksWidget.type || 'im_a2ui',
            data: typeof bloksWidget.data === 'string' ? bloksWidget.data : JSON.stringify(bloksWidget.data || {}),
            ...(bloksWidget.fallback || fallback ? { fallback: String(bloksWidget.fallback || fallback) } : {})
        },
        ...(nativeFlowMessage ? {
            nativeFlowMessage: {
                ...nativeFlowMessage,
                ...(nativeFlowMessage.buttons ? { buttons: nativeFlowMessage.buttons } : {})
            }
        } : {})
    }
});

/** Build the A2UI interactive command menu used by the full-size card layout. */
export const prepareA2UICommandMenu = ({ imageMessage, title = 'X4R1S3', rows = [], buttons = [], fallback = '' } = {}) => {
    if (!Array.isArray(rows)) throw new Error('A2UI command-menu rows must be an array');
    if (!Array.isArray(buttons)) throw new Error('A2UI command-menu buttons must be an array');
    const safeRows = rows.map((row, index) => ({
        title: String(row?.[0] ?? row?.title ?? `Command ${index + 1}`),
        description: String(row?.[1] ?? row?.description ?? ''),
        id: String(row?.[2] ?? row?.id ?? row?.[0] ?? `command_${index + 1}`)
    }));
    const safeButtons = buttons.map((button, index) => ({ id: `a2ui_button_${index + 1}`, label: String(button?.text || button?.label || `Button ${index + 1}`), url: String(button?.url || '') }));
    const componentIds = ['title', 'divider', 'tableCard', 'footer', ...(safeButtons.length ? ['buttonRow'] : [])];
    const components = [
        { id: 'root', component: 'Column', align: 'center', children: componentIds },
        { id: 'title', component: 'Text', text: String(title), variant: 'h2' },
        { id: 'divider', component: 'Divider' },
        { id: 'tableCard', component: 'Card', child: 'tableColumn' },
        { id: 'tableColumn', component: 'Column', children: ['headerRow', ...safeRows.flatMap((_, index) => [`divider_${index}`, `row_${index}`])] },
        { id: 'headerRow', component: 'Row', children: ['headerCommand', 'headerFunction'] },
        { id: 'headerCommand', component: 'Text', text: 'Command', variant: 'h5' },
        { id: 'headerFunction', component: 'Text', text: 'Function', variant: 'h5' },
        ...safeRows.flatMap((row, index) => [
            { id: `divider_${index}`, component: 'Divider' },
            { id: `row_${index}`, component: 'Row', children: [`command_${index}`, `description_${index}`] },
            { id: `command_${index}`, component: 'Text', text: row.title },
            { id: `description_${index}`, component: 'Text', text: row.description }
        ]),
        { id: 'footer', component: 'Text', text: 'Developed by - X4R1S3', variant: 'caption' }
    ];
    if (safeButtons.length) {
        components.push({ id: 'buttonRow', component: 'Row', justify: 'spaceEvenly', children: safeButtons.flatMap((button, index) => [`buttonLabel_${index}`, `button_${index}`]) });
        safeButtons.forEach((button, index) => {
            components.push({ id: `buttonLabel_${index}`, component: 'Text', text: button.label });
            components.push({ id: `button_${index}`, component: 'Button', child: `buttonLabel_${index}`, variant: 'primary', action: { call: 'openUrl', args: { url: button.url } } });
        });
    }
    return {
        interactiveMessage: {
            ...(imageMessage ? { header: { imageMessage, hasMediaAttachment: true } } : {}),
            bloksWidget: { type: 'im_a2ui', data: JSON.stringify({ version: 'v0.9', createSurface: { surfaceId: 'X4R1S3-a2ui-command-menu', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json', components } }), fallback: String(fallback || title) },
            nativeFlowMessage: { messageParamsJson: JSON.stringify({ limited_time_offer: { text: String(title), url: safeButtons[0]?.url || '', copy_code: String(title), expiration_time: Date.now() * 1000 } }), buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: String(title), sections: [{ title: 'Available Commands', rows: safeRows }] }) }] }
        }
    };
};

export const prepareCopyToClipboardMessage = (options = {}) => {
    const { text = '', label, alignment = 'END', verificationMetadata } = options;
    const displayText = label || text;
    const sections = [
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIAddonActionLayoutViewModel',
                addon_action_type: 'COPY_TO_CLIPBOARD',
                addon_action_alignment: alignment,
                primitives: [
                    {
                        __typename: 'GenAIMarkdownTextUXPrimitive',
                        text: String(displayText),
                        inline_entities: [],
                    },
                ],
            },
        },
    ];
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Builds a GenAI rich text message — plain text rendered inside a forwarded rich response.
 * Uses GenAIMarkdownTextUXPrimitive inside a GenAISingleLayoutViewModel.
 *
 * @param {Object} options
 * @param {string} options.text - The text content to display
 * @returns {Object} Wrapped botForwardedMessage ready for relayMessage
 */
export const prepareRichTextMessage = (options = {}) => {
    const { text = '', verificationMetadata } = options;
    const sections = [
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: String(text),
                    inline_entities: [],
                },
            },
        },
    ];
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/** Builds Markdown text with an optional GenAI COPY_TO_CLIPBOARD action section. */
export const prepareRichQuoteMessage = (options = {}) => {
    const { text = '', copyText, copyLabel = copyText, alignment = 'END', verificationMetadata } = options;
    const sections = [{
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAISingleLayoutViewModel',
            primitive: { __typename: 'GenAIMarkdownTextUXPrimitive', text: String(text), inline_entities: [] },
        },
    }];
    if (copyText) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIAddonActionLayoutViewModel',
                addon_action_type: 'COPY_TO_CLIPBOARD',
                addon_action_alignment: alignment,
                primitives: [{ __typename: 'GenAIMarkdownTextUXPrimitive', text: String(copyLabel || copyText), inline_entities: [] }],
            },
        });
    }
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Builds a GenAI rich image message — an image rendered inside a forwarded rich response.
 * Uses GenAIImagePrimitive with preview and full image variants.
 *
 * @param {Object} options
 * @param {string} options.url - Image URL
 * @param {string} [options.mimeType='image/png'] - MIME type
 * @returns {Object} Wrapped botForwardedMessage ready for relayMessage
 */
export const prepareRichImageMessage = (options = {}) => {
    const { url = '', mimeType, verificationMetadata } = options;
    const primitive = {
        ...buildRichImagePrimitive({ url, mimeType }),
        display_mode: 'FULL_WIDTH',
        full_width: true,
    };
    const sections = [
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIVStackLayoutViewModel',
                primitives: [primitive],
                display_mode: 'FULL_WIDTH',
                full_width: true,
            },
        },
    ];
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};


/**
 * Builds a GenAI rich link message — inline hyperlinks rendered inside a forwarded rich response.
 * Uses GenAIInlineLinkItem for simple clickable text links (not citation-style).
 *
 * @param {Object} options
 * @param {Array<Object>} options.links - Array of { text, url, displayName?, isTrusted? }
 * @returns {Object} Wrapped botForwardedMessage ready for relayMessage
 */
export const prepareRichLinkMessage = (options = {}) => {
    const { links = [], text: fallbackText, verificationMetadata } = options;
    const sections = [];
    const allInlineEntities = [];
    let combinedText = '';

    links.forEach((link, index) => {
        const key = `INLINE_HYPERLINK_${index}`;
        const displayText = link.text || link.displayName || link.url || '';
        const url = link.url || '';
        const isTrusted = link.isTrusted !== false;

        combinedText += `{{${key}}}${displayText}{{/${key}}}`;
        allInlineEntities.push({
            key,
            metadata: {
                display_name: displayText,
                is_trusted: isTrusted,
                url,
                __typename: 'GenAIInlineLinkItem',
            },
        });
    });

    sections.push({
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAISingleLayoutViewModel',
            primitive: {
                __typename: 'GenAIMarkdownTextUXPrimitive',
                text: combinedText || fallbackText || '',
                inline_entities: allInlineEntities,
            },
        },
    });
    if (sections.length === 0) {
        sections.push({
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: '',
                    inline_entities: [],
                },
            },
        });
    }
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/** Build an AIRich GRID_IMAGE album instead of the legacy albumMessage collection. */
export const prepareGridImageMessage = ({ imageUrls = [], verificationMetadata } = {}) => {
    if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
        throw new Error('GRID_IMAGE album requires at least two images');
    }
    const submessages = [{
        messageType: RichSubMessageType.GRID_IMAGE,
        gridImageMetadata: { imageUrls }
    }];
    const unified = toUnified(submessages, randomUUID());
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Build a video grid using the client-supported GenAIVideoPrimitive.
 *
 * WhatsApp exposes no AIRich GRID_VIDEO submessage type. Video grids therefore
 * use the generic unified-response Grid layout with one GenAIVideoPrimitive per
 * item. This is deliberately separate from prepareGridImageMessage so callers
 * do not accidentally label video media as GenAIImagePrimitive.
 */
/** Build a full-width vertical album with one large media item per row. */
export const prepareVerticalAlbumMessage = ({ items = [], verificationMetadata } = {}) => {
    if (!Array.isArray(items) || items.length < 2) throw new Error('Vertical album requires at least two media items');
    const expiration = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const primitives = items.map((item) => {
        const kind = item?.type || (item?.video ? 'video' : 'image');
        if (kind === 'video') {
            const video = item.video || item.data || item;
            const url = typeof video === 'string' ? video : (video?.url || video?.videoUrl || '');
            if (!url) throw new Error('Each video album item requires a video URL');
            return buildImaginePrimitive({ mediaType: 'video', url, thumbnail: video?.thumbnail || video?.thumbnailUrl, mimeType: video?.mimeType || video?.mime_type || 'video/mp4', fileLength: video?.fileLength || video?.file_length || 0, duration: video?.duration || 0, status: 'READY' });
        }
        const rawImage = item?.image || item?.data || item;
        const image = typeof rawImage === 'string' ? { url: rawImage } : (rawImage || {});
        const sourceUrl = firstImageValue(
            image?.imageHighResUrl, image?.highResUrl, image?.fullUrl,
            image?.imagePreviewUrl, image?.previewUrl, image?.sourceUrl, image?.url
        ) || '';
        if (!sourceUrl) throw new Error('Each image album item requires an image URL');
        // Unlike a compact image grid, vertical albums are intended to render
        // the actual media at full size. Some clients choose preview_image and
        // never follow full_image, so expose the selected full URL/dimensions
        // in both slots instead of allowing a thumbnail URL to win.
        const fullUrl = firstImageValue(
            image?.imageHighResUrl, image?.highResUrl, image?.high_res_url,
            image?.fullUrl, image?.full_url, image?.sourceUrl, image?.source_url, image?.url
        ) || sourceUrl;
        const fullWidth = Number(image?.fullWidth || image?.full_width || image?.highResWidth || image?.high_res_width || image?.width || item?.width || 0);
        const fullHeight = Number(image?.fullHeight || image?.full_height || image?.highResHeight || image?.high_res_height || image?.height || item?.height || 0);
        const primitive = buildRichImagePrimitive({
            ...image,
            imagePreviewUrl: fullUrl,
            previewUrl: fullUrl,
            sourceUrl: fullUrl,
            imageHighResUrl: fullUrl,
            fullUrl,
            ...(fullWidth > 0 ? { width: fullWidth, fullWidth } : {}),
            ...(fullHeight > 0 ? { height: fullHeight, fullHeight } : {})
        }, expiration);
        return { ...primitive, display_mode: 'FULL_WIDTH', full_width: true };
    });
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: randomUUID(), sections: [{ view_model: { primitives, display_mode: 'FULL_WIDTH', full_width: true, __typename: 'GenAIVStackLayoutViewModel' } }] })) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

export const prepareVideoGridMessage = ({ videos = [], verificationMetadata } = {}) => {
    if (!Array.isArray(videos) || videos.length < 2) {
        throw new Error('Video grid requires at least two videos');
    }
    const primitives = videos.map((video) => {
        const url = typeof video === 'string' ? video : (video?.url || video?.videoUrl || video?.reelsUrl || '');
        if (!url) throw new Error('Each video-grid item requires a video URL');
        const item = typeof video === 'string' ? {} : video;
        return {
            post_id: item.postId == null ? undefined : String(item.postId),
            reels_url: url,
            reels_title: item.title,
            thumbnail_url: item.thumbnailUrl || item.thumbnail,
            creator: item.creator,
            avatar_url: item.avatarUrl,
            content_hash: item.contentHash,
            likes_count: item.likes,
            comments_count: item.comments,
            shares_count: item.shares,
            is_verified: item.isVerified,
            source_app: item.sourceApp,
            video_delivery_response: {
                progressive_urls: (item.progressiveUrls || []).map((value) => ({
                    progressive_url: value,
                    __typename: 'GenAIProgressiveUrlResponse'
                })),
                dash_manifests: (item.dashManifests || []).map((value) => ({
                    manifest_xml: value,
                    __typename: 'GenAIDashManifestResponse'
                })),
                __typename: 'GenAIVideoDeliveryResponse'
            },
            __typename: 'GenAIVideoPrimitive'
        };
    });
    const unified = {
        response_id: randomUUID(),
        sections: [{
            view_model: {
                primitives,
                __typename: 'GenAIGridLayoutViewModel'
            }
        }]
    };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Builds a compact social-profile card used by WhatsApp's unified response
 * renderer. The summary is an inline social entity, not ordinary plain text.
 */
export const prepareSocialProfileMessage = (options = {}) => {
    const {
        username,
        platform = 'instagram',
        title = 'X4R1S3',
        subtitle = '⚉',
        imageUrl = '',
        entityId = username,
        entityUrl = `https://www.${platform}.com/${username || ''}`,
        entityType = platform === 'instagram' ? 'IG_PROFILE' : `${String(platform).toUpperCase()}_PROFILE`,
        fullName = 'NOT found',
        isVerified = false,
        resultText = 'See results'
    } = options;
    if (!username || typeof username !== 'string') {
        throw new Boom('sendSocialProfile requires a username', { statusCode: 400 });
    }
    const image = imageUrl ? { url: imageUrl, mime_type: 'image/png' } : undefined;
    const sections = [
        {
            view_model: {
                primitives: [{
                    title,
                    subtitle,
                    ...(image ? { image } : {}),
                    entity_id: String(entityId || username),
                    entity_url: entityUrl,
                    entity_type: 'WEBSITE',
                    action_type: 'OPEN_URL',
                    is_verified: Boolean(isVerified),
                    __typename: 'GenAICompactEntityPrimitive'
                }],
                __typename: 'GenAIActionRowLayoutViewModel'
            }
        },
        {
            view_model: {
                primitives: [{ type: 'HORIZONTAL_LINE', __typename: 'GenAIDividerPrimitive' }],
                __typename: 'GenAIVStackLayoutViewModel'
            }
        },
        {
            view_model: {
                primitives: [
                    { __typename: 'GenAISpacerPrimitive' },
                    {
                        text: `# {{social_entity_1}}${resultText}\0{{/social_entity_1}}    `,
                        inline_entities: [{
                            key: 'social_entity_1',
                            metadata: {
                                __typename: 'GenAISocialEntityItem',
                                entity_id: username,
                                entity_name: username,
                                entity_full_name: fullName,
                                platform: String(platform || 'GENERIC').toUpperCase(),
                                entity_picture_url: imageUrl,
                                entity_url: entityUrl,
                                entity_type: entityType,
                                is_verified: Boolean(isVerified)
                            }
                        }],
                        __typename: 'GenAIMarkdownTextUXPrimitive'
                    },
                    { __typename: 'GenAISpacerPrimitive' }
                ],
                __typename: 'GenAIActionRowLayoutViewModel'
            }
        }
    ];
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ sections })) },
        contextInfo: { isForwarded: true, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage);
};


/**
 * Builds a generic unified-response envelope without reducing its sections to
 * plain text. This is the extension point for newer WhatsApp primitives that
 * are present in WAProto but do not yet have a dedicated convenience helper.
 */
export const prepareUnifiedResponseMessage = ({ sections = [], submessages = [], responseId = randomUUID(), contextInfo } = {}) => {
    if (!Array.isArray(sections) || sections.length === 0) {
        throw new Boom('sendUnifiedResponse requires at least one section', { statusCode: 400 });
    }
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: responseId, sections })) },
        contextInfo: contextInfo || { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage);
};

/** Build a protocol-backed AIRich map card with optional numbered annotations. */
export const prepareRichMapMessage = ({ text = 'Map location', centerLatitude, centerLongitude, latitudeDelta, longitudeDelta, annotations = [], showInfoList = false, verificationMetadata } = {}) => {
    if (!Number.isFinite(Number(centerLatitude)) || !Number.isFinite(Number(centerLongitude))) {
        throw new Boom('prepareRichMapMessage requires centerLatitude and centerLongitude', { statusCode: 400 });
    }
    const submessages = [
        ...(text ? [{ messageType: RichSubMessageType.TEXT, messageText: String(text) }] : []),
        {
        messageType: RichSubMessageType.MAP,
        mapMetadata: {
            centerLatitude: Number(centerLatitude),
            centerLongitude: Number(centerLongitude),
            ...(latitudeDelta == null ? {} : { latitudeDelta: Number(latitudeDelta) }),
            ...(longitudeDelta == null ? {} : { longitudeDelta: Number(longitudeDelta) }),
            showInfoList: Boolean(showInfoList),
            annotations: (Array.isArray(annotations) ? annotations : []).map((annotation, index) => ({
                annotationNumber: annotation.annotationNumber ?? index + 1,
                latitude: Number(annotation.latitude),
                longitude: Number(annotation.longitude),
                title: String(annotation.title || ''),
                body: String(annotation.body || '')
            }))
        }
        }
    ];
    const richResponseMessage = proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages,
        unifiedResponse: { data: Buffer.from(JSON.stringify(toUnified(submessages, randomUUID()))) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/** Build a rich response carrying BotSuggestedPromptMetadata from WAProto. */
export const prepareBotPromptSuggestionsMessage = ({ text = '', suggestions = [], selectedPromptIndex, selectedPromptId, verificationMetadata } = {}) => {
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Boom('prepareBotPromptSuggestionsMessage requires at least one suggestion', { statusCode: 400 });
    }
    const envelope = wrapToBotForwardedMessage(proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages: [{ messageType: RichSubMessageType.TEXT, messageText: String(text) }],
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    }), verificationMetadata);
    envelope.messageContextInfo.botMetadata.suggestedPromptMetadata = {
        suggestedPrompts: suggestions.map(String),
        ...(selectedPromptIndex == null ? {} : { selectedPromptIndex: Number(selectedPromptIndex) }),
        ...(selectedPromptId == null ? {} : { selectedPromptId: String(selectedPromptId) })
    };
    return envelope;
};

/** Build a rich response carrying BotSourcesMetadata for citations/search results. */
export const prepareBotSourcesMessage = ({ text = '', sources = [], verificationMetadata } = {}) => {
    if (!Array.isArray(sources) || sources.length === 0) {
        throw new Boom('prepareBotSourcesMessage requires at least one source', { statusCode: 400 });
    }
    const submessages = [{
        messageType: RichSubMessageType.TEXT,
        messageText: String(text || 'Sources')
    }];
    const sourceCards = sources.map((source, index) => ({
        source_type: 'THIRD_PARTY',
        source_display_name: source.sourceTitle || source.title || '',
        source_subtitle: source.sourceQuery || source.query || 'Source',
        source_url: source.sourceProviderUrl || source.url || '',
        favicon: {
            url: source.faviconCdnUrl || source.faviconUrl || source.thumbnailCdnUrl || source.thumbnailUrl || '',
            mime_type: 'image/jpeg',
            width: 16,
            height: 16
        },
        citation_number: source.citationNumber ?? index + 1
    })).filter((source) => source.source_url || source.source_display_name);
    const sections = toUnified(submessages, randomUUID()).sections;
    if (sourceCards.length) {
        sections.push({
            view_model: {
                primitive: { sources: sourceCards, __typename: 'GenAISearchResultPrimitive' },
                __typename: 'GenAISingleLayoutViewModel'
            }
        });
    }
    const envelope = wrapToBotForwardedMessage(proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages,
        unifiedResponse: { data: Buffer.from(JSON.stringify({ response_id: randomUUID(), sections })) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    }), verificationMetadata);
    envelope.messageContextInfo.botMetadata.richResponseSourcesMetadata = {
        sources: sources.map((source, index) => ({
            provider: source.provider ?? proto.BotSourcesMetadata.BotSourceItem.SourceProvider.OTHER,
            thumbnailCdnUrl: source.thumbnailCdnUrl || source.thumbnailUrl || '',
            sourceProviderUrl: source.sourceProviderUrl || source.url || '',
            sourceQuery: source.sourceQuery || source.query || '',
            faviconCdnUrl: source.faviconCdnUrl || source.faviconUrl || '',
            citationNumber: source.citationNumber ?? index + 1,
            sourceTitle: source.sourceTitle || source.title || ''
        }))
    };
    return envelope;
};

/** Build an AIRich dynamic image/GIF submessage from WAProto metadata. */
export const prepareRichDynamicMediaMessage = ({ url = '', type = 'IMAGE', version = 1, loopCount, verificationMetadata } = {}) => {
    if (!url || typeof url !== 'string') throw new Boom('prepareRichDynamicMediaMessage requires a URL', { statusCode: 400 });
    const dynamicTypes = proto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType;
    const normalizedType = String(type).toUpperCase();
    const dynamicMetadata = {
        type: normalizedType === 'GIF'
            ? dynamicTypes.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF
            : dynamicTypes.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_IMAGE,
        version: Number(version),
        url,
        ...(loopCount == null ? {} : { loopCount: Number(loopCount) })
    };
    const submessages = [{ messageType: RichSubMessageType.DYNAMIC, dynamicMetadata }];
    const richResponseMessage = proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages,
        unifiedResponse: { data: Buffer.from(JSON.stringify(toUnified(submessages, randomUUID()))) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/** Build a rich response carrying the exact BotPttPromptMetadata transcript field. */
export const prepareBotPttTranscriptMessage = ({ text = '', transcript = '', verificationMetadata } = {}) => {
    if (!transcript || typeof transcript !== 'string') {
        throw new Boom('prepareBotPttTranscriptMessage requires a transcript', { statusCode: 400 });
    }
    const envelope = wrapToBotForwardedMessage(proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages: [{ messageType: RichSubMessageType.TEXT, messageText: String(text || transcript) }],
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    }), verificationMetadata);
    envelope.messageContextInfo.botMetadata.pttPromptMetadata = { transcript };
    return envelope;
};

const buildFoaHtmlSection = (html, trustedSources = []) => ({
    __typename: 'GenAIUnifiedResponseSection',
    view_model: {
        __typename: 'GenAISingleLayoutViewModel',
        primitive: {
            __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
            trusted_sources: Array.isArray(trustedSources) ? trustedSources : [],
            payload: String(html ?? '').trim()
        }
    }
});

const buildRichMediaSection = (media = {}) => {
    const item = typeof media === 'string' ? { url: media } : media;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Boom('rich media items must be objects or URLs', { statusCode: 400 });
    }
    const type = String(item.type || (item.video || item.videoUrl || item.reelsUrl ? 'video' : 'image')).toLowerCase();
    if (type === 'video') {
        const url = item.url || item.videoUrl || item.reelsUrl || item.reels_url || '';
        if (!url) throw new Boom('video media items require a URL', { statusCode: 400 });
        const configuredProgressiveUrls = item.progressiveUrls || item.progressive_urls;
        const progressiveUrls = Array.isArray(configuredProgressiveUrls) && configuredProgressiveUrls.length
            ? configuredProgressiveUrls
            : [String(url)];
        const configuredDashManifests = item.dashManifests ?? item.dash_manifests;
        if (configuredDashManifests != null && !Array.isArray(configuredDashManifests)) {
            throw new Boom('dashManifests must be an array', { statusCode: 400 });
        }
        return {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    reels_url: String(url),
                    reels_title: item.title,
                    thumbnail_url: item.thumbnailUrl || item.thumbnail_url || item.thumbnail,
                    creator: item.creator,
                    avatar_url: item.avatarUrl || item.avatar_url,
                    source_app: item.sourceApp || item.source_app,
                    video_delivery_response: {
                        progressive_urls: progressiveUrls.map(value => ({ progressive_url: value, __typename: 'GenAIProgressiveUrlResponse' })),
                        dash_manifests: (configuredDashManifests || []).map(value => ({ manifest_xml: value, __typename: 'GenAIDashManifestResponse' })),
                        __typename: 'GenAIVideoDeliveryResponse'
                    },
                    ...(item.mimeType || item.mime_type ? { mime_type: item.mimeType || item.mime_type } : {}),
                    ...(item.duration == null ? {} : { duration: Number(item.duration) }),
                    __typename: 'GenAIVideoPrimitive'
                }
            }
        };
    }
    if (type !== 'image' && type !== 'photo') {
        throw new Boom(`unsupported rich media type: ${type}`, { statusCode: 400 });
    }
    const url = item.url || item.imageUrl || item.image_url || '';
    if (!url) throw new Boom('image media items require a URL', { statusCode: 400 });
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAISingleLayoutViewModel',
            primitive: buildRichImagePrimitive({ ...item, url })
        }
    };
};

/** Build a tabbed embedded screen containing native image/video primitives and optional HTML. */
export const prepareRichMediaMessage = (options = {}) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Boom('prepareRichMediaMessage options must be an object', { statusCode: 400 });
    }
    const { title = 'Media', tabHeader = 'Media', media, tabs = [], verificationMetadata } = options;
    const tabItems = Array.isArray(tabs) && tabs.length ? tabs : [{ id: 'tab_0', tab_header: tabHeader, media }];
    const embeddedTabs = tabItems.map((tab, index) => {
        if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
            throw new Boom(`rich media tabs[${index}] must be an object`, { statusCode: 400 });
        }
        const sections = Array.isArray(tab.sections) ? [...tab.sections] : [];
        const tabMedia = tab.media == null ? [] : (Array.isArray(tab.media) ? tab.media : [tab.media]);
        const mediaSections = tabMedia.map(buildRichMediaSection);
        if (mediaSections.length > 1) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAIHScrollLayoutViewModel',
                    primitives: mediaSections.map(section => section.view_model.primitive)
                }
            });
        } else {
            sections.push(...mediaSections);
        }
        if (tab.html != null) sections.push(buildFoaHtmlSection(tab.html, tab.trustedSources || options.trustedSources || []));
        if (!sections.length) throw new Boom(`rich media tabs[${index}] requires media, html, or sections`, { statusCode: 400 });
        return {
            id: String(tab.id ?? `tab_${index}`),
            tab_header: String(tab.tab_header ?? tab.tabHeader ?? tab.title ?? `Media ${index + 1}`),
            sections,
            step_entries: Array.isArray(tab.step_entries) ? tab.step_entries : []
        };
    });
    const embeddedScreen = { title: String(title), content: [{ __typename: 'FOAIDNixelButtonSheets', tabs: embeddedTabs }] };
    const unified = {
        response_id: randomUUID(),
        sections: [{ view_model: { primitive: { text: `> ${title}`, __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } }],
        embedded_screens: [embeddedScreen]
    };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages: [{ messageType: RichSubMessageType.TEXT, messageText: `> ${title}` }],
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

const buildRichHtmlScreen = (options = {}) => {
    const {
        html = '',
        trustedSources = [],
        url = '',
        title = 'Preview',
        tabHeader = 'HTML',
        tabs
    } = options;
    const tabItems = Array.isArray(tabs) && tabs.length
        ? tabs
        : [{ id: 'tab_0', tab_header: tabHeader, html }];
    const embeddedTabs = tabItems.map((tab, index) => ({
        id: tab.id || `tab_${index}`,
        tab_header: tab.tab_header || tab.title || `HTML ${index + 1}`,
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAIaeacdsnwHtmlPrimitive',
                    payload: String(tab.html ?? tab.payload ?? html).trim(),
                    url: tab.url || url,
                    trusted_sources: tab.trustedSources || trustedSources
                }
            }
        }],
        step_entries: []
    }));
    return {
        title,
        embeddedScreen: {
            title,
            content: [{
                __typename: 'FOAIDNixelButtonSheets',
                tabs: embeddedTabs
            }]
        }
    };
};

const normalizeEmbeddedScreenInput = (screen) => {
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
        throw new Boom('embeddedScreen must be an object', { statusCode: 400 });
    }
    if (Object.hasOwn(screen, 'content')) {
        if (!Array.isArray(screen.content)) {
            throw new Boom('embeddedScreen.content must be an array', { statusCode: 400 });
        }
        return screen;
    }
    if (!Array.isArray(screen.tabs)) {
        throw new Boom('embeddedScreen requires a tabs array or a prebuilt content array', { statusCode: 400 });
    }
    const tabs = screen.tabs.map((tab, index) => {
        if (!tab || typeof tab !== 'object' || Array.isArray(tab) || !Array.isArray(tab.sections)) {
            throw new Boom(`embeddedScreen.tabs[${index}] requires a sections array`, { statusCode: 400 });
        }
        if (tab.sections.some(section => !section || typeof section !== 'object' || Array.isArray(section))) {
            throw new Boom(`embeddedScreen.tabs[${index}].sections must contain section objects`, { statusCode: 400 });
        }
        const { media, ...tabFields } = tab;
        const mediaItems = media == null ? [] : (Array.isArray(media) ? media : [media]);
        const mediaSections = mediaItems.map(buildRichMediaSection);
        const sections = [...tab.sections];
        if (mediaSections.length > 1) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAIHScrollLayoutViewModel',
                    primitives: mediaSections.map(section => section.view_model.primitive)
                }
            });
        }
        else {
            sections.push(...mediaSections);
        }
        return {
            ...tabFields,
            id: String(tab.id ?? `tab_${index}`),
            tab_header: String(tab.tab_header ?? tab.title ?? `Tab ${index + 1}`),
            sections,
            step_entries: Array.isArray(tab.step_entries) ? tab.step_entries : []
        };
    });
    const { tabs: _tabs, ...metadata } = screen;
    return {
        ...metadata,
        title: String(screen.title ?? 'Screen'),
        content: [{ __typename: 'FOAIDNixelButtonSheets', tabs }]
    };
};

/**
 * Normalize a standalone themed message into the existing AIRich composer.
 * This intentionally creates no interactiveMessage, buttons, or menu: its
 * title/body are ordinary unified-response text sections, alongside any
 * optional rich media fields the caller supplies.
 */
export const normalizeUnifiedThemedMessageContent = (content = {}) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Boom('sendUnifiedThemedMessage content must be an object', { statusCode: 400 });
    }

    const {
        title,
        subtitle,
        text,
        body,
        footer,
        headerText: suppliedHeaderText,
        contentText: suppliedContentText,
        footerText: suppliedFooterText,
        ...richContent
    } = content;
    const normalizedTitle = title === undefined || title === null ? '' : String(title).trim();
    const normalizedSubtitle = subtitle === undefined || subtitle === null ? '' : String(subtitle).trim();
    const headerText = normalizedTitle
        ? `# ${normalizedTitle}${normalizedSubtitle ? `\n\n• ${normalizedSubtitle}` : ''}`
        : normalizedSubtitle || suppliedHeaderText;
    const bodyText = text ?? body ?? suppliedContentText;
    const footerText = footer ?? suppliedFooterText;

    return {
        ...richContent,
        ...(headerText !== undefined ? { headerText: String(headerText) } : {}),
        ...(bodyText !== undefined ? { contentText: String(bodyText) } : {}),
        ...(footerText !== undefined ? { footerText: String(footerText) } : {})
    };
};

const prepareRichResponseMessageFixedOrder = (content) => {
    const { alignment, code, compatibility, contentText, disclaimerText, footerText, headerText, html, richHtml, trustedSources, imageText, image, images, inlineImage, inlineVideo, items, language, latex, links, noDonation, noHeading, posts, products, reels, sources: sourceInputs, suggested, richResponse, table, tapLinkUrl, title, verificationMetadata, sections: rawSections, richSections, copyButton, copyToClipboard, copyText, copyLabel, richText, quote, richImage, richLinks, richMap, map, dynamicMedia, richDynamicMedia, socialEntity, socialProfile, richMenu, airichCommandMenu, unifiedResponse, gridImages, verticalAlbum, videoGrid, richGeneration, richLabel, suggestedPrompt, botSources, botPttTranscript } = content;
    let submessages = [];
    const extraSections = [];
    if (Array.isArray(richResponse)) {
        submessages = richResponse.map((submessage) => {
            if (submessage.text) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: submessage.text,
                    inlineEntities: submessage.inlineEntities
                };
            }
            else if (submessage.code) {
                return {
                    messageType: RichSubMessageType.CODE,
                    codeMetadata: {
                        codeLanguage: submessage.language,
                        codeBlocks: submessage.code
                    }
                };
            }
            else if (submessage.items) {
                return {
                    messageType: RichSubMessageType.CONTENT_ITEMS,
                    contentItemsMetadata: {
                        itemsMetadata: submessage.items,
                        contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                    }
                };
            }
            else if (submessage.inlineImage) {
                return {
                    messageType: RichSubMessageType.INLINE_IMAGE,
                    imageMetadata: {
                        imageUrl: submessage.inlineImage,
                        imageText: submessage.imageText,
                        alignment: submessage.alignment,
                        tapLinkUrl: submessage.tapLinkUrl
                    }
                };
            }
            else if (submessage.inlineVideo) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'INLINE_VIDEO'
                };
            }
            else if (submessage.latex) {
                return {
                    messageType: RichSubMessageType.LATEX,
                    latexMetadata: {
                        text: submessage.text,
                        expressions: submessage.latex
                    }
                };
            }
            else if (submessage.posts) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'POSTS'
                };
            }
            else if (submessage.products) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'PRODUCTS'
                };
            }
            else if (submessage.suggested) {
                return {
                    messageType: RichSubMessageType.TEXT,
                    messageText: 'SUGGESTED_PROMPT'
                };
            }
            else if (submessage.table) {
                return {
                    messageType: RichSubMessageType.TABLE,
                    tableMetadata: {
                        title: submessage.title,
                        rows: submessage.table
                    }
                };
            }
            return submessage;
        });
    }
    else {
        if (headerText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: headerText
            });
        }
        if (contentText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: contentText
            });
        }
        if (code) {
            language ||= 'javascript';
            submessages.push({
                messageType: RichSubMessageType.CODE,
                codeMetadata: {
                    codeLanguage: language,
                    codeBlocks: tokenizeCode(code, language)
                }
            });
        }
        const reelItems = Array.isArray(reels) ? reels.map((reel) => ({ reelItem: {
            title: reel?.title || reel?.reels_title || '',
            creator: reel?.creator || '',
            videoUrl: reel?.videoUrl || reel?.reels_url || reel?.url || '',
            thumbnailUrl: reel?.thumbnailUrl || reel?.thumbnail_url || '',
            profileIconUrl: reel?.profileIconUrl || reel?.avatar_url || '',
            likesCount: reel?.likesCount ?? reel?.likes_count ?? 0,
            sharesCount: reel?.sharesCount ?? reel?.shares_count ?? 0,
            viewCount: reel?.viewCount ?? reel?.view_count ?? 0,
            reelSource: reel?.reelSource || reel?.reel_source || 'IG',
            isVerified: !!(reel?.isVerified ?? reel?.is_verified)
        } })) : [];
        const resolvedItems = [
            ...(Array.isArray(items) ? items : []),
            ...reelItems
        ];
        if (resolvedItems?.length) {
            submessages.push({
                messageType: RichSubMessageType.CONTENT_ITEMS,
                contentItemsMetadata: {
                    itemsMetadata: resolvedItems,
                    contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                }
            });
        }
        if (inlineImage) {
            const image = typeof inlineImage === 'string' ? { url: inlineImage } : (inlineImage || {});
            submessages.push({
                messageType: RichSubMessageType.INLINE_IMAGE,
                imageMetadata: {
                    ...image,
                    imageUrl: image.url || image.imageUrl || image.image || '',
                    imageText,
                    alignment,
                    tapLinkUrl,
                    mimeType: image.mimeType || image.mime_type,
                    width: image.width,
                    height: image.height,
                    fullWidth: image.fullWidth || image.full_width,
                    fullHeight: image.fullHeight || image.full_height
                }
            });
        }
        if (inlineVideo) {
            const video = typeof inlineVideo === 'string' ? { url: inlineVideo } : inlineVideo;
            extraSections.push({
                view_model: {
                    primitive: buildImaginePrimitive({
                        mediaType: 'video',
                        url: video?.url || video?.videoUrl || video?.video_url || '',
                        mimeType: video?.mimeType || video?.mime_type || video?.mimetype || 'video/mp4',
                        fileLength: video?.fileLength ?? video?.file_length ?? video?.filesize ?? 0,
                        duration: video?.duration ?? 0,
                        thumbnail: video?.thumbnail || video?.thumbnailUrl || video?.thumbnail_url,
                        status: video?.status || 'READY'
                    }),
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        }
        if (latex) {
            submessages.push({
                messageType: RichSubMessageType.LATEX,
                latexMetadata: {
                    text: contentText || '',
                    expressions: latex
                }
            });
        }
        const defaultDonationLink = {
            text: '',
            url: DONATE_URL,
            title: 'X4R1S3',
            displayName: 'X4R1S3 bot'
        };
        const rawSources = Array.isArray(sourceInputs) ? sourceInputs : [];
        // Existing `sources: [{ url, displayName, subtitle }]` callers use
        // citation entities. The serialized AIRich addSource format is the
        // distinct tuple form: `[[faviconUrl, sourceUrl, displayText], ...]`.
        const sourceTuples = rawSources.length > 0 && rawSources.every((source) => Array.isArray(source));
        if (sourceTuples) {
            const sourceCards = rawSources.map((source) => {
                const item = Array.isArray(source)
                    ? { icon: source[0], url: source[1], text: source[2] }
                    : source;
                const sourceUrl = item.url || item.sourceUrl || item.source_url || '';
                return {
                    source_type: 'THIRD_PARTY',
                    source_display_name: item.text || item.displayName || item.sourceDisplayName || '',
                    source_subtitle: item.subtitle || 'AI',
                    source_url: sourceUrl,
                    favicon: {
                        url: item.icon || item.iconUrl || item.favicon || '',
                        mime_type: item.mimeType || 'image/jpeg',
                        width: item.width || 16,
                        height: item.height || 16
                    }
                };
            }).filter((source) => source.source_url || source.source_display_name);
            if (sourceCards.length) {
                extraSections.push({
                    view_model: {
                        primitive: { sources: sourceCards, __typename: 'GenAISearchResultPrimitive' },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                });
            }
        }
        const sourceLinks = (sourceTuples ? [] : (sourceInputs || links || [])).map((linkField) => {
            if (typeof linkField === 'string') return { text: '', url: linkField, displayName: linkField };
            return { text: linkField?.text || linkField?.displayName || linkField?.title || '', ...linkField };
        });
        const resolvedLinks = noDonation ? sourceLinks : [...sourceLinks, defaultDonationLink];
        if (resolvedLinks) {
            resolvedLinks.forEach((linkField, index) => {
                const prefix = 'SS_' + index;
                const url = linkField.url || DONATE_URL;
                const sources = linkField.sources?.map((sourceField) => ({
                    source_type: 'THIRD_PARTY',
                    source_display_name: sourceField.displayName || 'pair bot',
                    source_subtitle: sourceField.subtitle || 'X4R1S3',
                    source_url: sourceField.url || url
                }));
                submessages.push({
                    messageType: RichSubMessageType.TEXT,
                    messageText: String(linkField.text || '') + ` {{${prefix}}}¹{{/${prefix}}} `,
                    inlineEntities: [{
                            key: prefix,
                            metadata: {
                                reference_id: index + 1,
                                reference_url: url,
                                reference_title: linkField.title || 'Get your own bot',
                                reference_display_name: linkField.displayName || 'pair',
                                sources: sources || [],
                                __typename: 'GenAISearchCitationItem'
                            }
                        }]
                });
            });
        }
        if (posts) {
            const postItems = (Array.isArray(posts) ? posts : [posts]).map((post) => ({
                title: post?.title || '',
                subtitle: post?.subtitle || '',
                username: post?.username || post?.user || '',
                profile_picture_url: post?.profile_picture_url || post?.profile || post?.profile_url || '',
                is_verified: !!(post?.is_verified ?? post?.verified),
                thumbnail_url: post?.thumbnail_url || post?.thumbnail || '',
                post_caption: post?.post_caption || post?.caption || '',
                likes_count: post?.likes_count ?? post?.like ?? 0,
                comments_count: post?.comments_count ?? post?.comment ?? 0,
                shares_count: post?.shares_count ?? post?.share ?? 0,
                post_url: post?.post_url || post?.url || '',
                post_deeplink: post?.post_deeplink || post?.deeplink || '',
                source_app: post?.source_app || post?.source || '',
                footer_label: post?.footer_label || post?.footer || '',
                footer_icon: post?.footer_icon || post?.icon || '',
                is_carousel: post?.is_carousel ?? true,
                orientation: post?.orientation || 'LANDSCAPE',
                post_type: post?.post_type || 'VIDEO',
                __typename: 'GenAIPostPrimitive'
            }));
            if (postItems.length) extraSections.push({ view_model: { primitives: postItems, __typename: 'GenAIHScrollLayoutViewModel' } });
        }
        if (products) {
            const productItems = (Array.isArray(products) ? products : [products]).map((product) => ({
                title: product?.title || '',
                brand: product?.brand || '',
                price: product?.price || '',
                sale_price: product?.sale_price || product?.salePrice || '',
                product_url: product?.product_url || product?.url || '',
                image: { url: product?.image?.url || product?.image || '' },
                additional_images: [{ url: product?.icon_url || product?.icon || '' }],
                __typename: 'GenAIProductItemCardPrimitive'
            }));
            if (productItems.length) {
                extraSections.push({
                    view_model: Array.isArray(products)
                        ? { primitives: productItems, __typename: 'GenAIHScrollLayoutViewModel' }
                        : { primitive: productItems[0], __typename: 'GenAISingleLayoutViewModel' }
                });
            }
        }
        if (suggested) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: 'SUGGESTED_PROMPT'
            });
        }
        if (Array.isArray(table)) {
            submessages.push({
                messageType: RichSubMessageType.TABLE,
                tableMetadata: {
                    title,
                    rows: table.map((items, index) => ({
                        isHeading: !noHeading && index == 0,
                        items: Array.isArray(items) ? items.map(String) : [String(items)]
                    }))
                }
            });
        }
        if (footerText) {
            submessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: footerText
            });
        }
    }
    const htmlIsTabbedConfig = html && typeof html === 'object' && Array.isArray(html.tabs);
    const simpleHtmlPayload = htmlIsTabbedConfig ? '' : (typeof html === 'string' ? html : (html?.html ?? html?.payload ?? ''));
    const htmlPayload = simpleHtmlPayload;
    const htmlTrustedSources = Array.isArray(html?.trustedSources) ? html.trustedSources : trustedSources;
    if (String(htmlPayload).trim()) {
        extraSections.push(buildFoaHtmlSection(htmlPayload, htmlTrustedSources));
    }
    const richHtmlOptions = richHtml ?? (htmlIsTabbedConfig ? html : null);
    const richHtmlConfig = typeof richHtmlOptions === 'string'
        ? { html: richHtmlOptions, trustedSources }
        : (richHtmlOptions && typeof richHtmlOptions === 'object'
            ? { ...richHtmlOptions, trustedSources: richHtmlOptions.trustedSources ?? trustedSources }
            : null);
    const hasRichHtmlContent = !!(richHtmlConfig && (
        String(richHtmlConfig.html || '').trim() ||
        (Array.isArray(richHtmlConfig.tabs) && richHtmlConfig.tabs.some(tab => String(tab?.html ?? tab?.payload ?? '').trim()))
    ));
    let richHtmlScreen;
    if (hasRichHtmlContent) {
        richHtmlScreen = buildRichHtmlScreen(richHtmlConfig);
        submessages.unshift({
            messageType: RichSubMessageType.TEXT,
            messageText: `> ${richHtmlScreen.title}`
        });
    }
    const uuid = randomUUID();
    const unified = toUnified(submessages, uuid);
    unified.sections = [...unified.sections.filter(Boolean), ...extraSections];
    if (compatibility === 'new-rich-media' || compatibility === 'both') {
        const compatible = prepareNewRichMediaCompatibility({ reels, images: images || (inlineImage ? [inlineImage] : image ? [image] : []), posts });
        unified.sections.push(...compatible.sections);
        unified.new_rich_media = {
            compatibility: compatible.compatibility,
            reels: compatible.reels,
            images: compatible.images,
            posts: compatible.posts
        };
    }
    if (richHtmlScreen) unified.embedded_screens = [richHtmlScreen.embeddedScreen];

    // Compose the remaining AIRich convenience formats as sections. These
    // aliases intentionally mirror the standalone send* helpers, allowing a
    // caller to mix them with text, HTML, tables, media, and citations in one
    // X4R1S3 message. Raw sections remain available as the forward-compatible
    // escape hatch for new WhatsApp primitives.
    const composed = { sections: unified.sections, embedded_screens: unified.embedded_screens, submessages, botMetadata: {} };
    const append = (prepared) => appendPreparedRichContent(composed, prepared);
    if (copyButton || copyToClipboard || copyText) append(prepareCopyToClipboardMessage(copyButton || copyToClipboard || { text: copyText, label: copyLabel }));
    if (richText) append(prepareRichTextMessage(typeof richText === 'string' ? { text: richText } : richText));
    if (quote) append(prepareRichQuoteMessage(typeof quote === 'string' ? { text: quote } : quote));
    if (richImage) append(prepareRichImageMessage(typeof richImage === 'string' ? { url: richImage } : richImage));
    if (richLinks) append(prepareRichLinkMessage(Array.isArray(richLinks) ? { links: richLinks } : richLinks));
    if (richMap || map) append(prepareRichMapMessage(richMap || map));
    if (dynamicMedia || richDynamicMedia) append(prepareRichDynamicMediaMessage(dynamicMedia || richDynamicMedia));
    if (socialEntity) append(prepareSocialEntityMessage(socialEntity));
    if (socialProfile) append(prepareSocialProfileMessage(socialProfile));
    if (richMenu) append(prepareRichMenuMessage(richMenu));
    if (airichCommandMenu) append(prepareAIRichCommandMenu(airichCommandMenu));
    if (gridImages) append(prepareGridImageMessage({ imageUrls: gridImages, verificationMetadata }));
    if (verticalAlbum) append(prepareVerticalAlbumMessage({ items: verticalAlbum, verificationMetadata }));
    if (videoGrid) append(prepareVideoGridMessage({ videos: videoGrid, verificationMetadata }));
    if (richGeneration) append(prepareRichGenerationMessage({ ...richGeneration, verificationMetadata }));
    if (richLabel) append(buildRichLabelMessage(richLabel));
    if (suggestedPrompt) append(prepareBotPromptSuggestionsMessage({ ...suggestedPrompt, verificationMetadata }));
    if (botSources) append(prepareBotSourcesMessage({ ...botSources, verificationMetadata }));
    if (botPttTranscript) append(prepareBotPttTranscriptMessage({ ...botPttTranscript, verificationMetadata }));
    if (unifiedResponse && typeof unifiedResponse === 'object') {
        if (Array.isArray(unifiedResponse.sections)) unified.sections.push(...unifiedResponse.sections);
        if (Array.isArray(unifiedResponse.embedded_screens)) unified.embedded_screens = [...(unified.embedded_screens || []), ...unifiedResponse.embedded_screens];
    }
    for (const section of [...(Array.isArray(rawSections) ? rawSections : []), ...(Array.isArray(richSections) ? richSections : [])]) {
        if (section && typeof section === 'object') unified.sections.push(section);
    }
    if (composed.embedded_screens?.length) unified.embedded_screens = composed.embedded_screens;
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: composed.submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: Buffer.from(JSON.stringify(unified)) // Lia@Note 25-04-26 --- Expects "ArrayBufferLike"
        },
        contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        }
    });
    const message = wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
    const botMetadata = message.messageContextInfo.botMetadata;
    Object.assign(botMetadata, composed.botMetadata);
    // Lia@Note 13-05-26 --- Add disclaimer text on richResponseMessage
    if (disclaimerText) {
        botMetadata.messageDisclaimerText = disclaimerText;
    }
    // Lia@Note 15-05-26 --- Add responseId from unified directly to botMetadata
    botMetadata.botResponseId = uuid;
    // Lia@Note 17-04-26 --- TODO: Fill mediaDetailsMetadataList and sources field
    const { sources, mediaDetailsMetadataList } = buildAdditionalBotMetadataContext(submessages);
    if (sources.length > 0) {
        botMetadata.richResponseSourcesMetadata = { sources };
    }
    if (mediaDetailsMetadataList.length > 0) {
        botMetadata.unifiedResponseMutation = { mediaDetailsMetadataList };
    }
    return message;
};
// Lia@Note 17-04-26 --- signature and certificateChain for proofs[] field
/**
 * @deprecated Generates random bytes that verify against nothing. Kept only for
 * experimental tooling; the library no longer attaches generated proofs to
 * messages. Pass real proofs through the `verificationMetadata` option instead.
 */
export const botMetadataSignature = () => {
    const signature = new Uint8Array(64);
    getRandomValues(signature);
    return signature;
};
export const botMetadataCertificate = (length = 685) => {
    const certificate = new Uint8Array(length);
    certificate[0] = 48;
    certificate[1] = 130;
    getRandomValues(certificate.subarray(2));
    return certificate;
};
/**
 * Builds a GenAI HTML primitive message — renders raw HTML inside a forwarded rich response.
 * Uses FOAHtmlPrimitiveDemoDONOTUSE for full HTML rendering inside the chat bubble.
 *
 * This is the game-changer: you can render games, forms, dashboards, and anything
 * else that HTML/CSS/JS can do, directly inside WhatsApp!
 *
 * @param {Object} options
 * @param {string} options.html - Raw HTML string to render
 * @param {Array} [options.trustedSources=[]] - Trusted source URLs for security
 * @returns {Object} Wrapped botForwardedMessage ready for relayMessage
 */
export const prepareHtmlMessage = (options = {}) => {
    const { html = '', trustedSources = [], verificationMetadata } = options;
    const sections = [buildFoaHtmlSection(html, trustedSources)];
    const unified = { response_id: randomUUID(), sections };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages: [],
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

/**
 * Build the alternate GenAI HTML envelope used by interactive HTML screens.
 * Unlike prepareHtmlMessage(), this includes embedded_screens and uses the
 * aeacdsnw HTML primitive used by the attached game message.
 */
export const prepareRichHtmlMessage = (options = {}) => {
    const { verificationMetadata } = options;
    const { title, embeddedScreen } = buildRichHtmlScreen(options);
    const unified = {
        response_id: randomUUID(),
        sections: [{
            view_model: {
                primitive: { text: `> ${title}`, __typename: 'GenAIMarkdownTextUXPrimitive' },
                __typename: 'GenAISingleLayoutViewModel'
            }
        }],
        embedded_screens: [embeddedScreen]
    };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        submessages: [{ messageType: RichSubMessageType.TEXT, messageText: `> ${title}` }],
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    });
    return wrapToBotForwardedMessage(richResponseMessage, verificationMetadata);
};

const decodePreparedUnified = (prepared) => {
    const richResponse = prepared?.botForwardedMessage?.message?.richResponseMessage;
    const rawData = richResponse?.unifiedResponse?.data;
    if (!rawData) return null;
    try {
        const text = Buffer.isBuffer(rawData)
            ? rawData.toString()
            : (rawData instanceof Uint8Array ? Buffer.from(rawData).toString() : String(rawData));
        const decoded = Buffer.from(text, /^[A-Za-z0-9+/]+=*$/.test(text) ? 'base64' : 'utf8').toString();
        return JSON.parse(decoded);
    }
    catch {
        return null;
    }
};

/**
 * Compose each rich fragment in the order its key appears in the caller's
 * object. The fixed-order renderer remains the single source of wire formats;
 * this wrapper only orders independently rendered sections before combining
 * them into one AIRich response.
 */
export const prepareRichResponseMessage = (content = {}) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Boom('rich response content must be an object', { statusCode: 400 });
    }
    const submessages = [];
    const sections = [];
    const embeddedScreens = [];
    const mergedBotMetadata = {};
    const compatibility = content.compatibility === 'new-rich-media' || content.compatibility === 'both';
    let compatibilityAdded = false;
    let newRichMedia;

    const appendPrepared = (prepared) => {
        const unified = decodePreparedUnified(prepared);
        if (Array.isArray(unified?.sections)) sections.push(...unified.sections.filter(Boolean));
        if (Array.isArray(unified?.embedded_screens)) embeddedScreens.push(...unified.embedded_screens);
        const richResponse = prepared?.botForwardedMessage?.message?.richResponseMessage;
        if (Array.isArray(richResponse?.submessages)) submessages.push(...richResponse.submessages);
        const botMetadata = prepared?.messageContextInfo?.botMetadata;
        if (botMetadata) Object.assign(mergedBotMetadata, botMetadata);
    };

    const appendEmbeddedScreen = (screen) => {
        const normalized = normalizeEmbeddedScreenInput(screen);
        embeddedScreens.push(normalized);
        const title = normalized.title === undefined || normalized.title === null ? '' : String(normalized.title).trim();
        if (title) {
            appendPrepared(prepareRichResponseMessageFixedOrder({
                contentText: `> ${title}`,
                noDonation: true,
                verificationMetadata: content.verificationMetadata
            }));
        }
    };

    const appendField = (key, value) => {
        const fragment = { noDonation: true, verificationMetadata: content.verificationMetadata };
        switch (key) {
            case 'text':
                fragment.contentText = value;
                break;
            case 'table':
                appendTableValue(value);
                return;
            case 'code':
                fragment.code = value;
                fragment.language = content.language;
                break;
            case 'inlineImage':
                fragment.inlineImage = value;
                fragment.imageText = content.imageText;
                fragment.alignment = content.alignment;
                fragment.tapLinkUrl = content.tapLinkUrl;
                break;
            case 'html':
                fragment.html = value;
                fragment.trustedSources = content.trustedSources;
                break;
            case 'richHtml':
                fragment.richHtml = value;
                fragment.trustedSources = content.trustedSources;
                break;
            case 'richTable':
                appendTableValue(value);
                return;
            case 'tables':
                if (Array.isArray(value)) value.forEach(appendTableValue);
                return;
            case 'richResponse': {
                if (!Array.isArray(value)) break;
                for (const item of value) {
                    if (item?.inlineVideo) appendField('inlineVideo', item.inlineVideo);
                    else if (Object.hasOwn(item || {}, 'table')) appendField('table', item.table);
                    else if (item?.posts) appendField('posts', item.posts);
                    else if (item?.products) appendField('products', item.products);
                    else if (item?.suggested) appendField('suggested', item.suggested);
                    else appendPrepared(prepareRichResponseMessageFixedOrder({
                        richResponse: [item],
                        noDonation: true,
                        verificationMetadata: content.verificationMetadata
                    }));
                }
                return;
            }
            case 'embeddedScreen':
                appendEmbeddedScreen(value);
                return;
            case 'embeddedScreens':
                if (!Array.isArray(value)) {
                    throw new Boom('embeddedScreens must be an array', { statusCode: 400 });
                }
                value.forEach(appendEmbeddedScreen);
                return;
            case 'reminderMetadata':
                mergedBotMetadata.reminderMetadata = normalizeReminderMetadata(value);
                return;
            case 'calendarWidget':
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    throw new Boom('calendarWidget must be an object', { statusCode: 400 });
                }
                sections.push(prepareAIRichCalendarWidgetSection(value));
                submessages.push({
                    messageType: RichSubMessageType.TEXT,
                    messageText: String(value.title ?? 'Upcoming events')
                });
                return;
            case 'contentItemsGroup':
                Object.assign(fragment, value);
                break;
            default:
                fragment[key] = value;
        }
        appendPrepared(prepareRichResponseMessageFixedOrder(fragment));
    };

    const appendSimpleTable = (tableRows) => {
        const normalizedRows = tableRows.map(row => Array.isArray(row) ? row : [row]);
        appendPrepared(prepareRichResponseMessageFixedOrder({
            table: normalizedRows,
            title: content.title,
            noHeading: content.noHeading,
            noDonation: true,
            verificationMetadata: content.verificationMetadata
        }));
    };

    const appendRichTable = (table) => {
        if (!table || typeof table !== 'object' || Array.isArray(table)) return;
        const richTable = generateTableContent(
            String(table.title ?? ''),
            Array.isArray(table.headers) ? table.headers : [],
            Array.isArray(table.rows) ? table.rows : [],
            undefined,
            { headerText: table.headerText, footer: table.footer }
        );
        const richResponse = richTable?.message?.botForwardedMessage?.message?.richResponseMessage;
        if (Array.isArray(richResponse?.submessages)) {
            submessages.push(...richResponse.submessages);
            // Keep rich-object tables as legacy preview submessages. Simple
            // array tables use appendSimpleTable and remain unified inline
            // table primitives, so callers can mix both renderers explicitly.
        }
    };

    const appendTableValue = (table) => {
        if (Array.isArray(table)) {
            appendSimpleTable(table);
            return;
        }
        if (!table || typeof table !== 'object') return;
        if (Array.isArray(table.headers) && Array.isArray(table.rows)) {
            appendRichTable(table);
        }
        else if (Array.isArray(table.rows)) {
            appendSimpleTable([...(Array.isArray(table.headers) ? [table.headers] : []), ...table.rows]);
        }
    };

    const appendCompatibility = () => {
        if (compatibilityAdded || !compatibility) return;
        compatibilityAdded = true;
        const compatible = prepareNewRichMediaCompatibility({
            reels: content.reels,
            images: content.images || (content.image ? [content.image] : []),
            posts: content.posts
        });
        if (!compatible.sections.length) return;
        sections.push(...compatible.sections);
        newRichMedia = {
            compatibility: compatible.compatibility,
            reels: compatible.reels,
            images: compatible.images,
            posts: compatible.posts
        };
    };

    const nonRenderableKeys = new Set([
        'alignment', 'compatibility', 'copyLabel', 'disclaimerText',
        'image', 'images', 'language', 'noDonation', 'noHeading', 'title',
        'tapLinkUrl', 'trustedSources', 'verificationMetadata'
    ]);
    const renderableKeys = new Set([
        'headerText', 'contentText', 'text', 'footerText', 'code', 'table', 'richTable', 'tables', 'items', 'reels',
        'inlineImage', 'inlineVideo', 'latex', 'links', 'sources', 'posts', 'products', 'suggested',
        'html', 'richHtml', 'richResponse', 'copyButton', 'copyToClipboard', 'copyText',
        'richText', 'quote', 'richImage', 'richLinks', 'richMap', 'map', 'dynamicMedia',
        'richDynamicMedia', 'socialEntity', 'socialProfile', 'richMenu', 'airichCommandMenu',
        'unifiedResponse', 'gridImages', 'verticalAlbum', 'videoGrid', 'richGeneration',
        'richLabel', 'suggestedPrompt', 'botSources', 'botPttTranscript', 'sections', 'richSections',
        'calendarWidget', 'embeddedScreen', 'embeddedScreens', 'reminderMetadata'
    ]);
    const inputEntries = Object.entries(content);
    const entries = [
        ...inputEntries.filter(([key]) => key === 'headerText'),
        ...inputEntries.filter(([key]) => key !== 'headerText' && key !== 'footerText'),
        ...inputEntries.filter(([key]) => key === 'footerText')
    ];
    for (let index = 0; index < entries.length; index++) {
        const [key, value] = entries[index];
        if (['reels', 'images', 'image', 'posts'].includes(key)) appendCompatibility();
        if (key === 'items' || key === 'reels') {
            const grouped = {};
            let nextIndex = index;
            while (nextIndex < entries.length && ['items', 'reels'].includes(entries[nextIndex][0])) {
                const [groupKey, groupValue] = entries[nextIndex];
                grouped[groupKey] = groupValue;
                nextIndex++;
            }
            if (Object.hasOwn(grouped, 'reels')) appendCompatibility();
            appendField('contentItemsGroup', grouped);
            index = nextIndex - 1;
            continue;
        }
        if (!renderableKeys.has(key) || nonRenderableKeys.has(key)) continue;
        appendField(key, value);
    }

    if (content.noDonation !== true) {
        appendPrepared(prepareRichResponseMessageFixedOrder({ links: [], noDonation: false }));
    }

    const responseId = randomUUID();
    const unified = {
        response_id: responseId,
        sections,
        ...(embeddedScreens.length ? { embedded_screens: embeddedScreens } : {}),
        ...(newRichMedia ? { new_rich_media: newRichMedia } : {})
    };
    const richResponseMessage = proto.AIRichResponseMessage.create({
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: { data: Buffer.from(JSON.stringify(unified)) },
        contextInfo: { isForwarded: true, forwardingScore: 1, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 }
    });
    const message = wrapToBotForwardedMessage(richResponseMessage, content.verificationMetadata);
    const botMetadata = message.messageContextInfo.botMetadata;
    Object.assign(botMetadata, mergedBotMetadata);
    if (content.disclaimerText) botMetadata.messageDisclaimerText = content.disclaimerText;
    botMetadata.botResponseId = responseId;
    const { sources, mediaDetailsMetadataList } = buildAdditionalBotMetadataContext(submessages);
    if (sources.length > 0) botMetadata.richResponseSourcesMetadata = { sources };
    if (mediaDetailsMetadataList.length > 0) botMetadata.unifiedResponseMutation = { mediaDetailsMetadataList };
    return message;
};

export const generateX4R1S3RichAIResponseContent = (content = {}, quoted, options = {}) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Boom('sendX4R1S3Message content must be an object', { statusCode: 400 });
    }
    const x4r1s3Content = { ...content };
    const aiSections = [];
    const supportedTypes = new Set(['table', 'list', 'codeBlock', 'latex', 'plain', 'text', 'gridImage', 'inlineImage', 'dynamic', 'map', 'contentItems']);
    if (Array.isArray(x4r1s3Content.sections) && x4r1s3Content.sections.length > 0) {
        const rawSections = [];
        for (const section of x4r1s3Content.sections) {
            if (section && typeof section === 'object' && !Array.isArray(section) && supportedTypes.has(section.type)) {
                aiSections.push(section);
            }
            else {
                rawSections.push(section);
            }
        }
        if (aiSections.length) {
            if (rawSections.length) x4r1s3Content.sections = rawSections;
            else delete x4r1s3Content.sections;
        }
    }
    if (x4r1s3Content.table && !Array.isArray(x4r1s3Content.table) && typeof x4r1s3Content.table === 'object' &&
        (Array.isArray(x4r1s3Content.table.headers) || Array.isArray(x4r1s3Content.table.rows))) {
        aiSections.push({ type: 'table', value: x4r1s3Content.table });
        delete x4r1s3Content.table;
    }
    for (const type of ['list', 'codeBlock', 'latex', 'plain', 'text', 'gridImage', 'inlineImage', 'dynamic', 'map', 'contentItems']) {
        if (x4r1s3Content[type] !== undefined && x4r1s3Content[type] !== null) {
            aiSections.push({ type, value: x4r1s3Content[type] });
            delete x4r1s3Content[type];
        }
    }
    let messageId;
    if (aiSections.length) {
        const generated = generateRichAIResponseContent({ sections: aiSections }, quoted, options);
        messageId = generated.messageId;
        const generatedSubmessages = generated?.message?.botForwardedMessage?.message?.richResponseMessage?.submessages || [];
        x4r1s3Content.richResponse = [
            ...(Array.isArray(x4r1s3Content.richResponse) ? x4r1s3Content.richResponse : []),
            ...generatedSubmessages
        ];
    }
    const message = prepareRichResponseMessage({
        ...x4r1s3Content,
        noDonation: options.noDonation ?? true
    });
    return { message, messageId };
};

/** Merge any prepared AIRich helper into a single X4R1S3 response. */
const appendPreparedRichContent = (target, prepared) => {
    const unified = decodePreparedUnified(prepared);
    if (unified?.sections?.length) target.sections.push(...unified.sections);
    if (Array.isArray(unified?.embedded_screens)) {
        target.embedded_screens = [...(target.embedded_screens || []), ...unified.embedded_screens];
    }
    const richResponse = prepared?.botForwardedMessage?.message?.richResponseMessage;
    if (Array.isArray(richResponse?.submessages)) target.submessages.push(...richResponse.submessages);
    const botMetadata = prepared?.messageContextInfo?.botMetadata;
    if (botMetadata) Object.assign(target.botMetadata, botMetadata);
};

/**
 * Proofs are forwarded only when the caller supplies real, verifiable proofs.
 * The library never fabricates a certificate chain or signature: an unverifiable
 * proof is worse than none, because it asserts provenance the caller cannot back.
 */
export const hasVerifiableProofs = (verificationMetadata) =>
    Array.isArray(verificationMetadata?.proofs) && verificationMetadata.proofs.length > 0;

/**
 * Attach trusted verification proofs to an already-built rich envelope.
 *
 * Pure, null-safe, and idempotent: returns the envelope untouched when no
 * verifiable proofs are supplied or when the envelope carries no botMetadata.
 * Used by the send pipeline (`relayMessage`) to auto-inject proofs configured
 * once on the socket as `config.metaAiRendering.verificationMetadata`, so every
 * rich message (menu, reels, rich text/image/link, HTML) is covered without each
 * send method needing to thread the config through.
 */
export const attachBotVerificationProofs = (envelope, verificationMetadata) => {
    if (!envelope || !hasVerifiableProofs(verificationMetadata))
        return envelope;
    const botMetadata = envelope?.messageContextInfo?.botMetadata;
    if (!botMetadata || botMetadata.verificationMetadata)
        return envelope;
    botMetadata.verificationMetadata = verificationMetadata;
    return envelope;
};

/**
 * Build a forwarded AIRich label message.
 *
 * This is the small single-label surface used by WhatsApp clients for a
 * colored forwarded bubble. The unified response is intentionally serialized
 * as base64 text because that is the wire shape accepted by the raw
 * `relayMessage` API.
 */
export const buildRichLabelMessage = ({
    text = '',
    variant = 'POSITIVE',
    backgroundColor = '#FF0000FF',
    textColor = '#000000FF',
    responseId = randomUUID(),
} = {}) => {
    const unified = {
        __typename: 'GenAIUnifiedResponse',
        response_id: responseId,
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAILabelPrimitive',
                    text: String(text),
                    variant,
                    background_color_override: backgroundColor,
                    text_color_override: textColor,
                },
            },
        }],
    };

    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: {
                        data: Buffer.from(JSON.stringify(unified)).toString('base64'),
                    },
                    contextInfo: {
                        isForwarded: true,
                        forwardOrigin: 4,
                    },
                },
            },
        },
    };
};

/**
 * Wrap a rich response in the bot-forwarded envelope.
 *
 * @param {Object} richResponseMessage - proto.AIRichResponseMessage
 * @param {Object} [verificationMetadata] - Trusted proofs supplied by the caller
 *   (typically `config.metaAiRendering.verificationMetadata`). Omitted when absent
 *   or empty, so no fabricated provenance is ever sent.
 */
export const wrapToBotForwardedMessage = (richResponseMessage, verificationMetadata) => ({
    messageContextInfo: {
        botMetadata: {
            pluginMetadata: {},
            ...(hasVerifiableProofs(verificationMetadata) ? { verificationMetadata } : {}),
            // Lia@Fix --- The Bloks rendering config is required for the client to resolve
            // and verify rich media. Without it, rich messages attach media the client
            // treats as unverified: "WhatsApp can't verify the security of this media",
            // tapping Download crashes the app, and reel previews stop rendering.
            botRenderingConfigMetadata: BOT_RENDERING_CONFIG_METADATA
        }
    },
    botForwardedMessage: {
        message: { richResponseMessage }
    }
});
//# sourceMappingURL=rich-message-utils.js.map
