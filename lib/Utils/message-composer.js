/**
 * @X4R1S3
 *
 * File: lib/Utils/message-composer.js
 * About: Message composer module for the X4R1S3 WhatsApp protocol client.
 * Important exports: generateTableContent, generateListContent, generateCodeBlockContent, generateLatexContent, generateLatexImageContent, generateLatexInlineImageContent, captureUnifiedResponse, generateUnifiedResponseContent; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';
import { generateMessageIDV2 } from './generics.js';

// NOTE: tokenizeCode / CodeHighlightType / RichSubMessageType are intentionally
// kept module-local here — @X4R1S3/baileys already exports these from
// lib/Utils/rich-message-utils.js and lib/Types/RichType.js. The baron composer
// implementation is preserved internally so the generator helpers stay faithful.

const JS_KEYWORDS = new Set([
    'import',
    'export',
    'from',
    'default',
    'as',
    'const',
    'let',
    'var',
    'function',
    'class',
    'extends',
    'new',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'try',
    'catch',
    'finally',
    'throw',
    'async',
    'await',
    'yield',
    'typeof',
    'instanceof',
    'in',
    'of',
    'delete',
    'void',
    'true',
    'false',
    'null',
    'undefined',
    'NaN',
    'Infinity',
    'this',
    'super',
    'static',
    'get',
    'set',
    'debugger',
    'with'
]);

const PYTHON_KEYWORDS = new Set([
    'import',
    'from',
    'as',
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'break',
    'continue',
    'try',
    'except',
    'finally',
    'raise',
    'with',
    'yield',
    'lambda',
    'pass',
    'del',
    'global',
    'nonlocal',
    'assert',
    'True',
    'False',
    'None',
    'and',
    'or',
    'not',
    'in',
    'is',
    'async',
    'await',
    'self',
    'print'
]);

const LANGUAGE_KEYWORDS = {
    javascript: JS_KEYWORDS,
    typescript: JS_KEYWORDS,
    js: JS_KEYWORDS,
    ts: JS_KEYWORDS,
    python: PYTHON_KEYWORDS,
    py: PYTHON_KEYWORDS
};

const CodeHighlightType = {
    DEFAULT: 0,
    KEYWORD: 1,
    METHOD: 2,
    STRING: 3,
    NUMBER: 4,
    COMMENT: 5
};

const RichSubMessageType = {
    UNKNOWN: 0,
    GRID_IMAGE: 1,
    TEXT: 2,
    INLINE_IMAGE: 3,
    TABLE: 4,
    CODE: 5,
    DYNAMIC: 6,
    MAP: 7,
    LATEX: 8,
    CONTENT_ITEMS: 9
};

const tokenizeCode = (codeStr, language = 'javascript') => {
    const keywords = LANGUAGE_KEYWORDS[language] || JS_KEYWORDS;
    const blocks = [];
    const lines = codeStr.split('\n');
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const isLast = li === lines.length - 1;
        const nl = isLast ? '' : '\n';
        if (!line.trim()) {
            blocks.push({
                highlightType: CodeHighlightType.DEFAULT,
                codeContent: line + nl
            });
            continue;
        }
        if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
            blocks.push({
                highlightType: CodeHighlightType.COMMENT,
                codeContent: line + nl
            });
            continue;
        }
        const regex =
            /(\/\/.*$|#.*$)|(["'`](?:[^"'`\\]|\\.)*["'`])|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][\w$]*\b)|([^\s\w$"'`]+)|(\s+)/g;
        let match;
        const tokens = [];
        while ((match = regex.exec(line)) !== null) {
            const val = match[0];
            if (match[1]) {
                tokens.push({
                    highlightType: CodeHighlightType.COMMENT,
                    codeContent: val
                });
            }
            else if (match[2]) {
                tokens.push({
                    highlightType: CodeHighlightType.STRING,
                    codeContent: val
                });
            }
            else if (match[3]) {
                tokens.push({
                    highlightType: CodeHighlightType.NUMBER,
                    codeContent: val
                });
            }
            else if (match[4]) {
                if (keywords.has(val)) {
                    tokens.push({
                        highlightType: CodeHighlightType.KEYWORD,
                        codeContent: val
                    });
                }
                else {
                    const after = line.slice(regex.lastIndex).trimStart();
                    if (after.startsWith('(')) {
                        tokens.push({
                            highlightType: CodeHighlightType.METHOD,
                            codeContent: val
                        });
                    }
                    else {
                        tokens.push({
                            highlightType: CodeHighlightType.DEFAULT,
                            codeContent: val
                        });
                    }
                }
            }
            else {
                tokens.push({
                    highlightType: CodeHighlightType.DEFAULT,
                    codeContent: val
                });
            }
        }
        if (tokens.length === 0) {
            blocks.push({
                highlightType: CodeHighlightType.DEFAULT,
                codeContent: line + nl
            });
            continue;
        }
        const merged = [];
        for (const t of tokens) {
            const prev = merged.length > 0 ? merged[merged.length - 1] : undefined;
            if (prev && prev.highlightType === t.highlightType) {
                prev.codeContent += t.codeContent;
            }
            else {
                merged.push({ ...t });
            }
        }
        if (merged.length > 0) {
            merged[merged.length - 1].codeContent += nl;
        }
        blocks.push(...merged);
    }
    return blocks;
};

const buildRichContextInfo = (quoted, options = {}) => {
    const ctxInfo = {
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: options.botJid ? options.botJid : '867051314767696@bot' },
        forwardOrigin: 4,
        ...(options.mentions ? { mentionedJid: options.mentions } : {})
    };
    if (quoted?.key) {
        ctxInfo.stanzaId = quoted.key.id;
        ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
        ctxInfo.quotedMessage = quoted.message;
    }
    return ctxInfo;
};

const buildBotForwardedMessage = (submessages, contextInfo, unifiedResponse) => {
    const richResponse = {
        messageType: 1,
        submessages,
        contextInfo
    };
    if (unifiedResponse) {
        richResponse.unifiedResponse = unifiedResponse;
    }
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: richResponse
            }
        }
    };
};

export const generateTableContent = (title, headers, rows, quoted, options = {}) => {
    const { footer, headerText } = options;
    const safeHeaders = Array.isArray(headers) ? headers.map(String) : [];
    const safeRows = Array.isArray(rows) ? rows : [];
    const tableRows = [
        { items: safeHeaders, isHeading: true },
        ...safeRows.map(row => ({ items: Array.isArray(row) ? row.map(String) : [String(row)] }))
    ];
    const submessages = [];
    if (headerText) {
        submessages.push({ messageType: 2, messageText: headerText });
    }
    submessages.push({
        messageType: 4,
        tableMetadata: { title, rows: tableRows }
    });
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

export const generateListContent = (title, items, quoted, options = {}) => {
    const { footer, headerText } = options;
    const tableRows = items.map(item => ({
        items: Array.isArray(item) ? item.map(String) : [String(item)]
    }));
    const submessages = [];
    if (headerText) {
        submessages.push({ messageType: 2, messageText: headerText });
    }
    submessages.push({
        messageType: 4,
        tableMetadata: { title, rows: tableRows }
    });
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

export const generateCodeBlockContent = (code, quoted, options = {}) => {
    const { title, footer, language = 'javascript' } = options;
    const submessages = [];
    if (title) {
        submessages.push({ messageType: 2, messageText: title });
    }
    submessages.push({
        messageType: 5,
        codeMetadata: {
            codeLanguage: language,
            codeBlocks: tokenizeCode(code, language)
        }
    });
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

export const generateLatexContent = (quoted, options = {}) => {
    const { text, expressions = [], headerText, footer } = options;
    const submessages = [];
    if (headerText) {
        submessages.push({ messageType: 2, messageText: headerText });
    }
    const latexExpressions = expressions.map(expr => {
        const entry = {
            latexExpression: expr.latexExpression,
            url: expr.url,
            width: expr.width,
            height: expr.height
        };
        if (expr.fontHeight !== undefined) entry.fontHeight = expr.fontHeight;
        if (expr.imageTopPadding !== undefined) entry.imageTopPadding = expr.imageTopPadding;
        if (expr.imageLeadingPadding !== undefined) entry.imageLeadingPadding = expr.imageLeadingPadding;
        if (expr.imageBottomPadding !== undefined) entry.imageBottomPadding = expr.imageBottomPadding;
        if (expr.imageTrailingPadding !== undefined) entry.imageTrailingPadding = expr.imageTrailingPadding;
        return entry;
    });
    submessages.push({
        messageType: 8,
        latexMetadata: {
            text: text || '',
            expressions: latexExpressions
        }
    });
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

const extractRichSubmessages = (generated) => generated?.message?.botForwardedMessage?.message?.richResponseMessage?.submessages || [];

/**
 * Compose ordered RichAI submessage types into one forwarded rich response.
 * `sections` preserves caller order; supported types include text, table, list,
 * code, LaTeX, images, dynamic media, maps, and content-item carousels.
 */
export const generateRichAIResponseContent = (content, quoted, options = {}) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new TypeError('sendRichAIResponse content must be an object');
    }
    const shorthandTypes = ['table', 'list', 'codeBlock', 'latex', 'plain', 'text', 'gridImage', 'inlineImage', 'dynamic', 'map', 'contentItems'];
    const sections = Array.isArray(content.sections)
        ? content.sections
        : shorthandTypes
            .filter(type => Object.hasOwn(content, type))
            .map(type => ({ type, value: content[type] }));
    if (sections.length === 0) {
        throw new TypeError(`sendRichAIResponse expected one or more of: ${shorthandTypes.join(', ')}`);
    }
    const submessages = [];
    const normalizeImageUrl = (value, fieldName) => {
        const descriptor = typeof value === 'string' ? { sourceUrl: value } : value;
        if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
            throw new TypeError(`sendRichAIResponse ${fieldName} must be a URL string or image URL object`);
        }
        const baseUrl = descriptor.sourceUrl || descriptor.source_url || descriptor.url || descriptor.imageUrl || descriptor.image || '';
        const previewUrl = descriptor.imagePreviewUrl || descriptor.previewUrl || descriptor.preview_url || baseUrl;
        const highResUrl = descriptor.imageHighResUrl || descriptor.highResUrl || descriptor.high_res_url || descriptor.fullUrl || descriptor.full_url || baseUrl;
        const sourceUrl = descriptor.sourceUrl || descriptor.source_url || baseUrl || previewUrl || highResUrl;
        if (!previewUrl && !highResUrl && !sourceUrl) {
            throw new TypeError(`sendRichAIResponse ${fieldName} requires an image URL`);
        }
        return {
            ...(previewUrl ? { imagePreviewUrl: String(previewUrl) } : {}),
            ...(highResUrl ? { imageHighResUrl: String(highResUrl) } : {}),
            ...(sourceUrl ? { sourceUrl: String(sourceUrl) } : {})
        };
    };
    for (const [index, section] of sections.entries()) {
        if (!section || typeof section !== 'object' || Array.isArray(section)) {
            throw new TypeError(`sendRichAIResponse section ${index} must be an object`);
        }
        const { type, options: sectionOptions, value: explicitValue, ...inlinePayload } = section;
        const payload = Object.hasOwn(section, 'value')
            ? explicitValue
            : (type && Object.hasOwn(section, type) ? section[type] : inlinePayload);
        const generatorOptions = {
            ...options,
            ...(sectionOptions && typeof sectionOptions === 'object' && !Array.isArray(sectionOptions) ? sectionOptions : {})
        };
        let generated;
        const sectionSubmessages = [];
        if (type === 'table') {
            const { title = '', headers = [], rows = [], ...rest } = payload && typeof payload === 'object' ? payload : {};
            generated = generateTableContent(title, headers, rows, quoted, { ...generatorOptions, ...rest });
        }
        else if (type === 'list') {
            const { title = '', items = [], ...rest } = payload && typeof payload === 'object' ? payload : {};
            if (!Array.isArray(items)) {
                throw new TypeError(`sendRichAIResponse section ${index} list.items must be an array`);
            }
            generated = generateListContent(title, items, quoted, { ...generatorOptions, ...rest });
        }
        else if (type === 'codeBlock') {
            const { language = 'javascript', code = '', ...rest } = payload && typeof payload === 'object' ? payload : {};
            generated = generateCodeBlockContent(code || '', quoted, { ...generatorOptions, language, ...rest });
        }
        else if (type === 'latex') {
            const latex = payload;
            const text = typeof latex === 'string' ? latex : latex?.text || '';
            const expressions = typeof latex === 'string'
                ? [{ latexExpression: latex }]
                : latex?.expressions || [{ latexExpression: text }];
            generated = generateLatexContent(quoted, {
                ...generatorOptions,
                text,
                expressions,
                ...(latex && typeof latex === 'object' && !Array.isArray(latex) ? latex : {})
            });
        }
        else if (type === 'plain' || type === 'text') {
            const text = typeof payload === 'string' ? payload : payload?.text ?? payload?.messageText;
            if (text === undefined || text === null) {
                throw new TypeError(`sendRichAIResponse section ${index} plain text requires text or value`);
            }
            sectionSubmessages.push({
                messageType: RichSubMessageType.TEXT,
                messageText: String(text),
                ...(Array.isArray(payload?.inlineEntities) ? { inlineEntities: payload.inlineEntities } : {})
            });
        }
        else if (type === 'gridImage') {
            const grid = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            const rawImageUrls = Array.isArray(payload) ? payload : grid.imageUrls ?? grid.images;
            const rawGridImageUrl = grid.gridImageUrl;
            if (rawImageUrls !== undefined && !Array.isArray(rawImageUrls)) {
                throw new TypeError(`sendRichAIResponse section ${index} gridImage.imageUrls must be an array`);
            }
            if ((!rawImageUrls || rawImageUrls.length === 0) && !rawGridImageUrl) {
                throw new TypeError(`sendRichAIResponse section ${index} gridImage requires imageUrls or gridImageUrl`);
            }
            if (rawImageUrls && rawImageUrls.length > 0 && rawImageUrls.length < 2) {
                throw new TypeError(`sendRichAIResponse section ${index} gridImage.imageUrls requires at least two images`);
            }
            sectionSubmessages.push({
                messageType: RichSubMessageType.GRID_IMAGE,
                gridImageMetadata: {
                    ...(rawGridImageUrl ? { gridImageUrl: normalizeImageUrl(rawGridImageUrl, 'gridImage.gridImageUrl') } : {}),
                    ...(rawImageUrls?.length ? { imageUrls: rawImageUrls.map((image) => normalizeImageUrl(image, 'gridImage.imageUrls')) } : {})
                }
            });
        }
        else if (type === 'inlineImage') {
            const image = typeof payload === 'string' ? { url: payload } : (payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {});
            const rawImageUrl = image.imageUrl ?? image.url ?? image.image;
            if (rawImageUrl === undefined || rawImageUrl === null || rawImageUrl === '') {
                throw new TypeError(`sendRichAIResponse section ${index} inlineImage requires imageUrl or url`);
            }
            sectionSubmessages.push({
                messageType: RichSubMessageType.INLINE_IMAGE,
                imageMetadata: {
                    imageUrl: normalizeImageUrl(rawImageUrl, 'inlineImage.imageUrl'),
                    ...(image.imageText ?? image.text ? { imageText: String(image.imageText ?? image.text) } : {}),
                    ...(image.alignment !== undefined ? { alignment: image.alignment } : {}),
                    ...(image.tapLinkUrl ? { tapLinkUrl: String(image.tapLinkUrl) } : {})
                }
            });
        }
        else if (type === 'dynamic') {
            const dynamic = typeof payload === 'string' ? { url: payload } : (payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {});
            const url = dynamic.url || dynamic.imageUrl || dynamic.mediaUrl;
            if (typeof url !== 'string' || !url.trim()) {
                throw new TypeError(`sendRichAIResponse section ${index} dynamic requires a URL`);
            }
            const dynamicTypeName = String(dynamic.mediaType || dynamic.dynamicType || dynamic.kind || dynamic.type || 'IMAGE').toUpperCase();
            const dynamicTypes = proto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType;
            const dynamicType = dynamicTypeName === 'GIF'
                ? dynamicTypes.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF
                : dynamicTypeName === 'IMAGE'
                    ? dynamicTypes.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_IMAGE
                    : undefined;
            if (dynamicType === undefined) {
                throw new TypeError(`sendRichAIResponse section ${index} dynamic mediaType must be IMAGE or GIF`);
            }
            const version = Number(dynamic.version ?? 1);
            if (!Number.isFinite(version) || version < 0) {
                throw new TypeError(`sendRichAIResponse section ${index} dynamic.version must be a non-negative number`);
            }
            const loopCount = dynamic.loopCount == null ? undefined : Number(dynamic.loopCount);
            if (loopCount !== undefined && (!Number.isFinite(loopCount) || loopCount < 0)) {
                throw new TypeError(`sendRichAIResponse section ${index} dynamic.loopCount must be a non-negative number`);
            }
            sectionSubmessages.push({
                messageType: RichSubMessageType.DYNAMIC,
                dynamicMetadata: {
                    type: dynamicType,
                    version,
                    url,
                    ...(loopCount === undefined ? {} : { loopCount })
                }
            });
        }
        else if (type === 'map') {
            const map = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.mapMetadata || payload : {};
            if (map.centerLatitude == null || map.centerLongitude == null ||
                !Number.isFinite(Number(map.centerLatitude)) || !Number.isFinite(Number(map.centerLongitude))) {
                throw new TypeError(`sendRichAIResponse section ${index} map requires finite centerLatitude and centerLongitude`);
            }
            const mapText = map.text ?? (payload && typeof payload === 'object' ? payload.text : undefined);
            if (mapText) sectionSubmessages.push({ messageType: RichSubMessageType.TEXT, messageText: String(mapText) });
            sectionSubmessages.push({
                messageType: RichSubMessageType.MAP,
                mapMetadata: {
                    centerLatitude: Number(map.centerLatitude),
                    centerLongitude: Number(map.centerLongitude),
                    ...(map.latitudeDelta == null ? {} : { latitudeDelta: Number(map.latitudeDelta) }),
                    ...(map.longitudeDelta == null ? {} : { longitudeDelta: Number(map.longitudeDelta) }),
                    showInfoList: Boolean(map.showInfoList),
                    annotations: (Array.isArray(map.annotations) ? map.annotations : []).map((annotation, annotationIndex) => ({
                        annotationNumber: annotation?.annotationNumber ?? annotationIndex + 1,
                        latitude: Number(annotation?.latitude),
                        longitude: Number(annotation?.longitude),
                        title: String(annotation?.title || ''),
                        body: String(annotation?.body || '')
                    }))
                }
            });
        }
        else if (type === 'contentItems') {
            const items = Array.isArray(payload) ? payload : payload?.itemsMetadata ?? payload?.items;
            if (!Array.isArray(items) || items.length === 0) {
                throw new TypeError(`sendRichAIResponse section ${index} contentItems requires a non-empty items or itemsMetadata array`);
            }
            const contentType = payload && typeof payload === 'object' && !Array.isArray(payload)
                ? payload.contentType ?? proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
                : proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL;
            sectionSubmessages.push({
                messageType: RichSubMessageType.CONTENT_ITEMS,
                contentItemsMetadata: {
                    itemsMetadata: items.map((item) => {
                        if (!item || typeof item !== 'object' || Array.isArray(item)) {
                            throw new TypeError(`sendRichAIResponse section ${index} contentItems entries must be objects`);
                        }
                        return Object.hasOwn(item, 'reelItem') ? item : { reelItem: item };
                    }),
                    contentType
                }
            });
        }
        else {
            throw new TypeError(`sendRichAIResponse section ${index} has unknown type '${String(type)}'; expected ${shorthandTypes.join(', ')}`);
        }
        if (generated) sectionSubmessages.push(...extractRichSubmessages(generated));
        submessages.push(...sectionSubmessages);
    }
    if (submessages.length === 0) {
        throw new TypeError('sendRichAIResponse did not produce any rich content sections');
    }
    return {
        message: buildBotForwardedMessage(submessages, buildRichContextInfo(quoted, options)),
        messageId: generateMessageIDV2()
    };
};

export const generateLatexImageContent = async (quoted, options, uploadFn, renderLatexToPng) => {
    const { text, expressions, headerText, footer } = options;
    const submessages = [];
    if (headerText) {
        submessages.push({ messageType: 2, messageText: headerText });
    }
    const latexExpressions = await Promise.all(
        expressions.map(async expr => {
            const { buffer, width, height } = await renderLatexToPng(expr.latexExpression);
            const uploadResult = await uploadFn(buffer, 'image');
            const imageUrl = uploadResult.url || uploadResult.directPath;
            return {
                latexExpression: expr.latexExpression,
                url: imageUrl,
                width,
                height
            };
        })
    );
    submessages.push({
        messageType: 8,
        latexMetadata: {
            text: text || '',
            expressions: latexExpressions
        }
    });
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

export const generateLatexInlineImageContent = async (quoted, options, uploadFn, renderLatexToPng) => {
    const { text, expressions, headerText, footer } = options;
    const submessages = [];
    if (headerText) {
        submessages.push({ messageType: 2, messageText: headerText });
    }
    if (text) {
        submessages.push({ messageType: 2, messageText: text });
    }
    for (const expr of expressions) {
        const { buffer, width, height } = await renderLatexToPng(expr.latexExpression);
        const uploadResult = await uploadFn(buffer, 'image');
        const imageUrl = uploadResult.url || uploadResult.directPath;
        submessages.push({
            messageType: 3,
            imageMetadata: {
                imageUrl: {
                    imagePreviewUrl: imageUrl,
                    imageHighResUrl: imageUrl
                },
                imageText: expr.latexExpression,
                alignment: 2
            }
        });
    }
    if (footer) {
        submessages.push({ messageType: 2, messageText: footer });
    }
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};

export const captureUnifiedResponse = (msg) => {
    const botFwd = msg?.botForwardedMessage?.message;
    if (!botFwd) return null;
    const rich = botFwd.richResponseMessage;
    if (!rich?.unifiedResponse?.data) return null;
    return {
        unifiedResponse: { data: rich.unifiedResponse.data },
        submessages: rich.submessages || [],
        contextInfo: rich.contextInfo || {}
    };
};

export const generateUnifiedResponseContent = (quoted, captured) => {
    const ctxInfo = buildRichContextInfo(quoted);
    return {
        message: buildBotForwardedMessage(captured.submessages, ctxInfo, captured.unifiedResponse),
        messageId: generateMessageIDV2()
    };
};

export const generateRichMessageContent = (submessages, quoted, options) => {
    const ctxInfo = buildRichContextInfo(quoted, options);
    return {
        message: buildBotForwardedMessage(submessages, ctxInfo),
        messageId: generateMessageIDV2()
    };
};
