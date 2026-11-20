/**
 * @X4R1S3
 *
 * File: lib/index.d.ts
 * About: Index.d module for the X4R1S3 WhatsApp protocol client.
 * Important exports: WAMessageKey, StatusOptions, PollVoteEvent, StatusContent, GroupStatusContent, StatusPrivacyList, StatusCustomList, BroadcastListQuota; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export interface WAMessageKey {
    remoteJid?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
    participant?: string | null;
}

export type StatusFont = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface StatusOptions {
    /** Users allowed to receive the status. At least one valid user JID is required. */
    statusJidList: string[];
    /** Hex, named, or ARGB status background color. */
    backgroundColor?: string | number;
    font?: StatusFont;
    messageId?: string;
    additionalAttributes?: Record<string, string>;
    additionalNodes?: unknown[];
}

export interface PollVoteEvent {
    pollUpdateMessageKey: WAMessageKey;
    pollCreationMessageKey: WAMessageKey;
    vote: unknown;
    voterJid?: string;
    pollCreatorJid?: string;
    selectedOptions: string[];
    selectedOptionHashes: string[];
    unselectedOptions: string[];
    senderTimestampMs?: number;
}

export interface StatusContent {
    /** Convenience flag; alternatively send to `status@broadcast`. */
    status?: true;
    statusJidList?: string[];
    backgroundColor?: string | number;
    font?: StatusFont;
    text?: string;
    image?: unknown;
    video?: unknown;
    audio?: unknown;
    caption?: string;
    mimetype?: string;
    ptt?: boolean;
    seconds?: number;
    waveform?: Uint8Array;
    [key: string]: unknown;
}

export interface NewsletterStatusContent {
    text?: string;
    backgroundColor?: string | number;
    font?: StatusFont;
    image?: unknown;
    video?: unknown;
    caption?: string;
    mimetype?: string;
    seconds?: number;
    contextInfo?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface NewsletterStatusSendOptions {
    /** Optional status stanza id; generated automatically by default. */
    messageId?: string;
    /** Maximum time to wait for WhatsApp's status ACK. Defaults to 20 seconds. */
    ackTimeoutMs?: number;
    /** Wait for the separate status echo and resolve newsletterStatusServerId; defaults to true. */
    resolveServerId?: boolean;
    /** Maximum echo wait after ACK when resolveServerId is enabled. Defaults to 8 seconds. */
    serverIdTimeoutMs?: number;
    /** Maximum time for media upload, when content contains an image or video. */
    mediaUploadTimeoutMs?: number;
}

export interface NewsletterStatusEligibility {
    canPost: boolean;
    capabilities: string[];
}

export interface GroupStatusContent extends StatusContent {
    groupStatus: true;
    /** Select the legacy groupStatusMessage envelope for compatibility testing. */
    groupStatusVersion?: 'legacy' | 'v1' | 'v2';
}

/** One status distribution list entry as returned by `getStatusPrivacy`. */
export interface StatusPrivacyList {
    type?: string;
    id?: string;
    listname?: string;
    emoji?: string;
    selected?: boolean;
    deleted?: boolean;
    members: string[];
}

/** Custom named status list passed to `setStatusPrivacy`. */
export interface StatusCustomList {
    id: string;
    listname: string;
    emoji?: string;
    selected?: boolean;
    deleted?: boolean;
    members?: string[];
}

/** Result of `fetchBroadcastListQuota`. */
export interface BroadcastListQuota {
    messagesLeft: number;
    totalLimit: number;
    isHeavySender: boolean;
    startTs: number;
    endTs: number;
    resetTs: number;
}

/** Entry accepted by `storePrivacyTokens`. */
export interface PrivacyTokenEntry {
    jid: string;
    privacyToken: Buffer;
    privacyModeTs?: number | string;
}

/** A bot (persona) entry as returned by `getBotListV2` / `getBotProfile`. */
export interface BotProfile {
    jid?: string;
    personaId?: string;
    name?: string;
    description?: string;
}

/** A group profile picture as returned by `getGroupProfilePictures`. */
export interface GroupProfilePicture {
    jid?: string;
    type?: string;
    directPath?: string;
    url?: string;
}

/** Result of `groupJoinLinked`. */
export interface GroupJoinLinkedResult {
    approvalRequested: boolean;
}

/** Options for `aiGroupCreate`. */
export interface AIGroupCreateOptions {
    ephemeralExpiration?: number;
    memberAddMode?: string;
    memberShareGroupHistoryMode?: string;
    memberLinkMode?: string;
}

/** Options for `aiPrompt`. */
export interface AIPromptOptions {
    /** ms to wait for the bot response before rejecting (default 60000). */
    timeout?: number;
    /** Best-effort streaming hook — called with each bot message edit in the chat. */
    onPartial?: (message: unknown, key: WAMessageKey) => void;
    /** Canonical Meta AI bot JID (default `867051314767696@bot`). */
    botUser?: string;
    /** Extra JIDs to mention alongside the bot in group prompts. */
    mentions?: string[];
    /** Extra options forwarded to `sendMessage` (quoted, linkPreview, ...). */
    [key: string]: unknown;
}
/** Options for the verified Meta AI (Hatch) send path. */
export interface MetaAISendOptions {
    /** Destination JID; defaults to `867051314767696@bot` for a direct prompt. */
    jid?: string;
    invokerJid?: string;
    sessionId?: string;
    messageSecret?: Buffer;
    capabilities?: number[];
    /** F-BID used when invoking Meta AI in a group. */
    botFbid?: string;
    /** Add a visible Meta AI mention to a group prompt. */
    mention?: boolean;
    personaType?: string;
    agentEngagementType?: string;
    modeSelected?: string;
    conversationContext?: Uint8Array | Buffer;
    quoted?: unknown;
    links?: unknown;
}

export interface RichMenuButton {
    id?: string;
    text?: string;
    label?: string;
    toast?: string;
    url?: string;
    useWebview?: boolean;
    call?: string;
    copy?: string;
    icon?: string;
    sections?: unknown[];
}

export interface RichMenuContent {
    header?: {
        title?: string;
        disclaimer?: boolean;
        disclaimerText?: string;
        image?: { url: string; mime_type?: string; mimeType?: string; width?: number; height?: number; inline?: boolean };
    };
    body?: {
        title?: string;
        toast?: string;
        carousel?: boolean;
        row?: boolean;
        buttons?: Array<string | RichMenuButton>;
        cards?: Array<{ title?: string; toast?: string; buttons?: Array<string | RichMenuButton> }>;
    };
    footer?: {
        text?: string;
        url?: string;
        image?: { url: string; mime_type?: string; mimeType?: string; width?: number; height?: number };
    };
}

export interface RichGenerationContent {
    text?: string;
    mediaType?: 'image' | 'video' | string;
    url?: string;
    thumbnail?: string | Uint8Array | Record<string, unknown>;
    mimeType?: string;
    fileLength?: number;
    duration?: number;
    status?: 'GENERATING' | 'READY' | 'FAILED' | string;
    estimatedMs?: number;
    itemId?: string;
}

export interface RichGenerationResult {
    message: unknown;
    messageId: string;
    responseId: string;
    itemId: string;
    targetId?: string;
}

export interface WhatsAppFlowResponse {
    name: string;
    version?: number;
    paramsJson: string;
    params: Record<string, unknown>;
    isFlow: boolean;
    flowId?: string;
    flowToken?: string;
    screen?: string;
    action?: string;
    actionPayload: Record<string, unknown>;
    data: Record<string, unknown>;
    buttonId?: string;
    displayText?: string;
    raw: Record<string, unknown>;
}

export interface RelayMessageOptions {
    messageId?: string;
    /** Recipient-only delivery: skip the sender's own devices in a one-to-one chat. */
    participant?: { jid: string };
    /** Retry resend target; requires a device JID and retry count. */
    participants?: { jid: string; count: number };
    retryParticipants?: { jid: string; count: number };
    /** Keep only the target's primary device in supported private-chat fan-out paths; not encryption. */
    isSecret?: boolean;
    /** Skip the target's linked devices in supported private-chat fan-out paths; enforcement is client-dependent. */
    protected?: boolean;
    /** Keep only the sender's own devices in supported private-chat fan-out paths. */
    me?: boolean;
    [key: string]: unknown;
}

export interface AlbumMediaInput {
    image?: unknown;
    video?: unknown;
    type?: 'image' | 'video';
    data?: unknown;
    sourceUrl?: string;
    imagePreviewUrl?: string;
    imageHighResUrl?: string;
    darkModePreviewUrl?: string;
    darkModeHighResUrl?: string;
    width?: number;
    height?: number;
    darkWidth?: number;
    darkHeight?: number;
    caption?: string;
    [key: string]: unknown;
}

export interface AnimatedWallpaperInput {
    id?: string;
    animatedWallpaperId?: string;
    dimLevel?: number;
    opacity?: number;
}

export interface A2UIMessageContent {
    image?: unknown;
    bloksWidget?: { type?: string; data?: unknown; fallback?: string };
    nativeFlowMessage?: { messageParamsJson?: string; buttons?: unknown[]; [key: string]: unknown };
    [key: string]: unknown;
}

export interface A2UIBuildOptions {
    uuid?: string;
    surfaceId?: string;
    type?: string;
    wrapped?: boolean;
}

export interface A2UIBuildResult {
    uuid: string;
    data: string;
    type: string;
    fallback?: string;
}

export interface A2UIWidgetSendOptions {
    a2ui: A2UI;
    bodyText?: string;
    fallback?: string;
    footer?: string;
    buttons?: Array<{ name?: string; params?: string | Record<string, unknown> }>;
    contextInfo?: Record<string, unknown>;
    expiration?: number;
    quoted?: unknown;
    type?: string;
    wrapped?: boolean;
    singleScreen?: boolean;
}

export class A2UI {
    constructor(options?: { catalogId?: string; version?: string });
    text(text: string, options?: { id?: string; variant?: string }): string;
    image(url: string, options?: { id?: string; variant?: string; fit?: string }): string;
    /** Add an Image component with variant="header" unless a variant is explicitly supplied. */
    header(url: string, options?: { id?: string; variant?: string; fit?: string }): string;
    video(url: string, options?: { id?: string }): string;
    checkbox(label: string, options?: { id?: string; value?: boolean }): string;
    textField(label: string, options?: { id?: string; variant?: string }): string;
    button(childId: string, options?: { id?: string; variant?: string; action?: Record<string, unknown> }): string;
    card(childId: string, options?: { id?: string }): string;
    column(children?: string[], options?: { id?: string; justify?: string; align?: string }): string;
    row(children?: string[], options?: { id?: string }): string;
    divider(options?: { id?: string }): string;
    choicePicker(label: string, options: Array<Record<string, unknown>>, settings?: { id?: string; variant?: string; value?: unknown; displayStyle?: string; filterable?: boolean }): string;
    root(children: string[]): this;
    only(componentId: string): this;
    /** Creates and roots a standalone image with variant="header" by default. */
    imageOnly(url: string, options?: { id?: string; variant?: string; fit?: string }): this;
    /** Creates and roots a standalone video component. */
    videoOnly(url: string, options?: { id?: string }): this;
    headerOnly(url: string, options?: { id?: string; variant?: string; fit?: string }): this;
    cardOnly(childId: string, options?: { id?: string }): this;
    listCard(options: { title: string; items: Array<{ assetId?: string; assetType?: string; title?: string; price?: string; trailingLabel?: string; emphasis?: string }>; fallbackText?: string; uuid?: string }): this;
    build(options?: A2UIBuildOptions): A2UIBuildResult;
}

export function sendA2UIWidget(client: { relayMessage(jid: string, message: unknown, options?: Record<string, unknown>): Promise<unknown> }, jid: string, options: A2UIWidgetSendOptions): Promise<unknown>;

export interface A2UICommandMenuContent {
    image?: unknown;
    title?: string;
    rows?: Array<[string, string, string?] | { title?: string; description?: string; id?: string }>;
    buttons?: Array<{ text?: string; label?: string; url?: string }>;
    fallback?: string;
}

export interface InteractiveContactCardContent {
    /** Text shown in interactiveMessage.header.title. */
    title: string;
    /** Full body text; when omitted it is composed from title, detailLabel, and description. */
    body?: string;
    detailLabel?: string;
    description?: string;
    /** Defaults to inapp_signup; changing it can change client rendering and behavior. */
    buttonName?: string;
    /** Serialized to nativeFlowMessage.buttons[0].buttonParamsJson. */
    buttonParams?: Record<string, unknown>;
    footer?: string;
    /** Optional image media rendered in the interactive header. */
    image?: unknown;
    /** Optional video media rendered in the interactive header. */
    video?: unknown;
    /** Optional MP4/video media rendered with GIF playback enabled in the header. */
    gif?: unknown;
    /** Sends the card followed by a separate associated still-image/motion-video pair. */
    livePhoto?: {
        video: unknown;
        image?: unknown;
        thumbnail?: unknown;
        videoThumbnail?: Uint8Array;
        imageThumbnail?: Uint8Array;
        caption?: string;
        text?: string;
        motionPhotoPresentationOffsetMs?: number;
        presentationOffsetMs?: number;
    };
}

export interface LocationButtonCardContent {
    /** LocationMessage.name rendered in the card header. */
    title: string;
    /** LocationMessage.address rendered below the title. */
    subtitle?: string;
    /** Main message body shown below the thumbnail header. */
    text: string;
    /** JPEG thumbnail bytes embedded in LocationMessage.jpegThumbnail. */
    thumbnail?: Uint8Array;
    /** Defaults to 0,0 to match the observed payload; these are real location fields. */
    latitude?: number;
    longitude?: number;
    buttons: Array<{ id: string; text: string }>;
    footer?: string;
}

export interface MenuButtonCardContent {
    /** Non-empty title rendered in the card caption below the image. */
    title: string;
    /** Optional subtitle rendered on its own caption line. */
    subtitle?: string;
    /** Optional additional menu text rendered below the title and subtitle. */
    text?: string;
    /** Image bytes uploaded as a normal image header; this is not a location thumbnail. */
    image: Uint8Array;
    buttons: Array<{ id: string; text: string }>;
    footer?: string;
}

export interface StickerAnnotationContent {
    /** Key of the existing message this sticker should be associated with. */
    parentMessageKey: WAMessageKey & { id: string };
    /** Prepared StickerMessage protobuf fields, including URL/directPath and matching encryption metadata. */
    stickerMessage: Record<string, unknown> & { url?: string; directPath?: string; isAnimated?: boolean };
    /** Number of identical annotation messages to relay (1–20; defaults to 1). */
    count?: number;
    /** Delay between sends in milliseconds (0–60000; defaults to 1000). */
    intervalMs?: number;
}

export interface SocialEntityContent {
    username?: string;
    platform?: string;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    entityId?: string | number;
    entityUrl?: string;
    entityType?: string;
    fullName?: string;
    isVerified?: boolean;
    resultText?: string;
    botJid?: string;
    responseId?: string;
}

export interface RichMapAnnotation {
    annotationNumber?: number;
    latitude: number;
    longitude: number;
    title?: string;
    body?: string;
}

export interface RichMapContent {
    centerLatitude: number;
    centerLongitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
    annotations?: RichMapAnnotation[];
    showInfoList?: boolean;
    verificationMetadata?: Record<string, unknown>;
}

export interface BotPromptSuggestionsContent {
    text?: string;
    suggestions: string[];
    selectedPromptIndex?: number;
    selectedPromptId?: string;
    verificationMetadata?: Record<string, unknown>;
}

export interface BotSourceContent {
    provider?: number;
    thumbnailCdnUrl?: string;
    thumbnailUrl?: string;
    sourceProviderUrl?: string;
    url?: string;
    sourceQuery?: string;
    query?: string;
    faviconCdnUrl?: string;
    faviconUrl?: string;
    citationNumber?: number;
    sourceTitle?: string;
    title?: string;
}

export interface BotSourcesContent {
    text?: string;
    sources: BotSourceContent[];
    verificationMetadata?: Record<string, unknown>;
}

export interface RichDynamicMediaContent {
    url: string;
    type?: 'IMAGE' | 'GIF' | string;
    version?: number;
    loopCount?: number;
    verificationMetadata?: Record<string, unknown>;
}

export interface BotPttTranscriptContent {
    transcript: string;
    text?: string;
    verificationMetadata?: Record<string, unknown>;
}

export interface AIRichCommandMenuContent {
    image: string;
    title?: string;
    subtitle?: string;
    code?: string;
    rows?: Array<[string, string] | { command?: string; description?: string }>;
    latexImage?: string;
    latexExpression?: string;
    buttons?: Array<{ id?: string; text?: string; label?: string; url?: string; toast?: string }>;
    footer?: string;
}

export declare function parseUnifiedResponseData(data: unknown): Record<string, unknown> | null;
export declare function textFromUnifiedResponse(data: unknown): string | null;
export declare function textFromRichResponse(message: unknown): string | null;
export declare function extractMetaAiText(message: unknown): string | null;
export declare function decodeUnifiedResponseInPlace<T extends Record<string, unknown>>(message: T): T;
export interface MetaCompositedOptions {
    thinkingMs?: number;
    description?: string;
    steps?: Array<Record<string, unknown>>;
    estimatedMs?: number;
    placeholderText?: string;
    sendOptions?: Record<string, unknown>;
    useNativeMeta?: boolean;
    streamUpdates?: Array<string | Record<string, unknown>>;
    streamUpdateDelayMs?: number;
    streamContext?: Record<string, unknown>;
}
export declare function editMetaMessage(sock: WASocket, jid: string, key: WAMessageKey, content: Record<string, unknown>, sendOptions?: Record<string, unknown>, streamContext?: Record<string, unknown>): Promise<unknown>;
export declare function sendMetaComposited(sock: WASocket, jid: string, content: Record<string, unknown>, options?: MetaCompositedOptions): Promise<unknown>;

export type X4R1S3SimpleTable = unknown[][];
export interface X4R1S3RichTable {
    title?: string;
    headers: unknown[];
    rows: unknown[][];
    headerText?: string;
    footer?: string;
}
export type X4R1S3TableInput = X4R1S3SimpleTable | X4R1S3RichTable;
export interface X4R1S3CalendarWidgetAction {
    label: string;
    state?: string;
    kind?: string;
    id?: string;
    toolCallId?: string;
    tool_call_id?: string;
    toast?: string | { label?: string };
}
export interface X4R1S3CalendarWidget {
    title?: string;
    /** Pass-through GenAI calendar event-list section objects; the exact event schema is not yet documented. */
    sections?: Array<Record<string, unknown>>;
    actions?: X4R1S3CalendarWidgetAction[];
}
export interface X4R1S3EmbeddedScreenTab {
    id?: string;
    tab_header?: string;
    title?: string;
    sections: Array<Record<string, unknown>>;
    step_entries?: unknown[];
}
export interface X4R1S3EmbeddedScreen extends Record<string, unknown> {
    title?: string;
    /** Pass a complete embedded-screen content array, or use tabs for a FOAIDNixelButtonSheets wrapper. */
    content?: Array<Record<string, unknown>>;
    tabs?: X4R1S3EmbeddedScreenTab[];
}
export type X4R1S3ReminderAction = 'NOTIFY' | 'CREATE' | 'DELETE' | 'UPDATE' | 1 | 2 | 3 | 4;
export type X4R1S3ReminderFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 1 | 2 | 3 | 4 | 5;
export interface X4R1S3ReminderMetadata {
    requestMessageKey?: Record<string, unknown>;
    action?: X4R1S3ReminderAction;
    name?: string;
    /** Raw non-negative protobuf uint64; timestamp units are not inferred by this library. */
    nextTriggerTimestamp?: number | string;
    frequency?: X4R1S3ReminderFrequency;
}
export interface RichMediaItem extends Record<string, unknown> {
    type?: 'image' | 'photo' | 'video' | string;
    url?: string;
    imageUrl?: string;
    videoUrl?: string;
    reelsUrl?: string;
    thumbnailUrl?: string;
    thumbnail?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    duration?: number;
    progressiveUrls?: string[];
    dashManifests?: string[];
}
export interface RichMediaTab extends Record<string, unknown> {
    id?: string;
    tab_header?: string;
    tabHeader?: string;
    title?: string;
    media?: RichMediaItem | string | Array<RichMediaItem | string>;
    html?: string;
    trustedSources?: string[];
    sections?: Array<Record<string, unknown>>;
    step_entries?: unknown[];
}
export interface RichMediaMessageContent extends Record<string, unknown> {
    title?: string;
    tabHeader?: string;
    media?: RichMediaItem | string | Array<RichMediaItem | string>;
    tabs?: RichMediaTab[];
    trustedSources?: string[];
    verificationMetadata?: Record<string, unknown>;
}
export interface RichAIResponseSection extends Record<string, unknown> {
    type: 'table' | 'list' | 'codeBlock' | 'latex' | 'plain' | 'text' | 'gridImage' | 'inlineImage' | 'dynamic' | 'map' | 'contentItems';
    value?: unknown;
    options?: Record<string, unknown>;
}
export interface RichAIResponseContent extends Record<string, unknown> {
    sections?: RichAIResponseSection[];
    table?: X4R1S3TableInput;
    list?: { title?: string; items: unknown[]; [key: string]: unknown };
    codeBlock?: { code?: string; language?: string; [key: string]: unknown };
    latex?: string | Record<string, unknown>;
    plain?: string | Record<string, unknown>;
    text?: string | Record<string, unknown>;
    gridImage?: unknown;
    inlineImage?: unknown;
    dynamic?: unknown;
    map?: unknown;
    contentItems?: unknown;
}
export interface X4R1S3MessageContent extends Record<string, unknown> {
    /** Exclusive A2UI mode routed to sendA2UIMessage; do not combine with AIRich sections. */
    a2ui?: A2UIMessageContent;
    table?: X4R1S3TableInput;
    richTable?: X4R1S3RichTable;
    tables?: X4R1S3TableInput[];
    /** Experimental calendar-event-list widget, composable with other AIRich sections. */
    calendarWidget?: X4R1S3CalendarWidget;
    /** Add one or more embedded screens alongside ordinary AIRich sections. */
    embeddedScreen?: X4R1S3EmbeddedScreen;
    embeddedScreens?: X4R1S3EmbeddedScreen[];
    /** Experimental BotReminderMetadata attached to the AIRich bot envelope. */
    reminderMetadata?: X4R1S3ReminderMetadata;
    /** Compose a colored GenAI label primitive into the same unified AIRich response as other sections. */
    richLabel?: {
        text?: string;
        variant?: string;
        backgroundColor?: string;
        textColor?: string;
        responseId?: string;
    };
}
export interface UnifiedThemedMessageContent extends X4R1S3MessageContent {
    /** Title displayed at the top of the themed unified-response card. */
    title?: string;
    /** Optional secondary line displayed below the title. */
    subtitle?: string;
    /** Main Markdown-capable text body. */
    text?: string;
    /** Alias for text. */
    body?: string;
    /** Optional trailing text line. */
    footer?: string;
    /** Existing AIRich fields such as inlineImage, inlineVideo, dynamicMedia,
     * reels, links, html, table, richMap, and richSections may be included. */
}

export type StatusActionKey = WAMessageKey & {
    remoteJidAlt?: string;
    participantAlt?: string;
};
export interface StatusActionMessage {
    key: StatusActionKey;
    message?: Record<string, unknown>;
    fakeObj?: { key?: StatusActionKey; message?: Record<string, unknown> };
    sender?: string;
    from?: string;
    mtype?: string;
}
export interface StatusMessageEvent {
    message: StatusActionMessage;
    authorJid?: string;
    kind: 'status' | 'group';
    type?: string;
}
export interface StatusSubscriptionOptions {
    from?: 'all' | '*' | string | string[];
    includeGroupStatus?: boolean;
}

export type C2582Target = string | { id?: string | null; stanzaId?: string | null };
export interface C2582Result {
    key: { remoteJid: string; id: string };
    status: 'vanished';
}

export interface ScheduledMediaPair {
    parent: Record<string, unknown>;
    child: Record<string, unknown>;
    /** MessageAssociation enum value or enum name; defaults to MOTION_PHOTO. */
    associationType?: number | string;
}

/** Content for the experimental native MusicMessage protobuf slot. */
export type MusicMessageContent = ({
    embeddedMusic?: Record<string, unknown>;
    songUri?: string;
    artworkUri?: string;
    /** Use proto.Message.MusicMessage.MusicMessageStyle values when specifying a style. */
    style?: number;
} & ({ embeddedMusic: Record<string, unknown> } | { songUri: string } | { artworkUri: string }));

/** Add one option to an existing poll using its original message key. */
export type PollAddOptionContent = ({
    key: WAMessageKey;
    pollCreationMessageKey?: never;
} | {
    key?: never;
    pollCreationMessageKey: WAMessageKey;
}) & ({
    optionName: string;
    optionHash?: string;
    option?: never;
    addOption?: never;
} | {
    option?: string | { optionName: string; optionHash?: string };
    addOption?: never;
    optionName?: never;
    optionHash?: never;
} | {
    addOption: { optionName: string; optionHash?: string };
    option?: never;
    optionName?: never;
    optionHash?: never;
}) & {
    metadata?: { pollNameHash?: Uint8Array; lastEditStanzaId?: string };
};

export interface SendMessageContent extends Record<string, unknown> {
    /** Experimental native WhatsApp music message. */
    music?: MusicMessageContent;
    /** Alias for music. */
    musicMessage?: MusicMessageContent;
    /** Experimental additional option for an existing poll. */
    pollAddOption?: PollAddOptionContent;
    /** Alias for pollAddOption. */
    pollAddOptionMessage?: PollAddOptionContent;
}

export type ScheduleMessageContent = Record<string, unknown> & {
    /** Set true and provide video/image/caption fields alongside it, or pass an options object. */
    livePhoto?: boolean | {
        video: unknown;
        image?: unknown;
        thumbnail?: unknown;
        videoThumbnail?: Uint8Array;
        imageThumbnail?: Uint8Array;
        caption?: string;
        text?: string;
        motionPhotoPresentationOffsetMs?: number;
        presentationOffsetMs?: number;
    };
    photo_live?: boolean;
    photoLive?: boolean;
    pairedMedia?: ScheduledMediaPair;
};

export interface WASocket {
    sendMessage(jid: string | string[], content: StatusContent | GroupStatusContent | SendMessageContent, options?: Partial<StatusOptions> & Record<string, unknown>): Promise<unknown>;
    /** Schedule a generated message or associated Live Photo/media pair at a Date, ISO-8601 string, or Unix timestamp in seconds/milliseconds. */
    scheduleMessage(jid: string, content: ScheduleMessageContent, scheduledAt: Date | string | number, options?: Record<string, unknown>): Promise<unknown>;
    /** Run the experimental C2582 protocol sequence for a target message. */
    C2582(jid: string, target: C2582Target): Promise<C2582Result>;
    X4R1S3(jid: string, target: string | { id?: string | null; stanzaId?: string | null }): Promise<{ key: { remoteJid: string; id: string }; status: 'vanished' }>;
    /** Send legacy reply buttons with one optional image, video, document, or location header. */
    replyButton(jid: string, buttons: Array<Record<string, unknown>>, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a file; set photo_live to send it as an associated still-image/motion-video pair. */
    sendFile(jid: string, media: unknown, filename?: string, caption?: string, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a motion photo from a video, optionally supplying its still image or thumbnail. */
    sendPhotoLive(jid: string, content: { video: unknown; image?: unknown; thumbnail?: unknown; videoThumbnail?: Uint8Array; imageThumbnail?: Uint8Array; caption?: string; text?: string; motionPhotoPresentationOffsetMs?: number; presentationOffsetMs?: number }, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send or edit a textual progress bar. Set messageKey to update a prior progress message. */
    sendProgress(jid: string, text: string, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send text with an external preview card using custom URL, title, thumbnail, and attribution. */
    sendMessageModify(jid: string, text: string, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Compatibility alias for sendMessageModify. */
    sendMessageModifyV2(jid: string, text: string, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send at least two image/video URL items as a full-width AIRich vertical album. */
    sendAlbumMessage(jid: string, medias: AlbumMediaInput[], options?: Record<string, unknown>): Promise<unknown>;
    /** Send an AIRich unified-response grid of GenAIVideoPrimitive items. Requires at least two video URLs. */
    sendVideoGridMessage(jid: string, videos: Array<string | {
        url?: string;
        videoUrl?: string;
        reelsUrl?: string;
        postId?: string | number;
        title?: string;
        thumbnailUrl?: string;
        thumbnail?: string;
        creator?: string;
        avatarUrl?: string;
        contentHash?: string;
        likes?: number;
        comments?: number;
        shares?: number;
        isVerified?: boolean;
        sourceApp?: string;
        progressiveUrls?: string[];
        dashManifests?: string[];
    }>, options?: Record<string, unknown>): Promise<unknown>;
    /** Update the connected account's WhatsApp About/profile status. */
    updateProfileStatus(status: string): Promise<void>;
    /** Update the connected account's profile name. */
    updateProfileName(name: string): Promise<void>;
    /** Set or clear the connected account's own custom label in a group. */
    updateMemberLabel(groupJid: string, memberLabel: string): Promise<unknown>;
    /** Relay a prepared message with optional recipient/device-scoping compatibility controls. */
    relayMessage(jid: string, message: Record<string, unknown>, options?: RelayMessageOptions): Promise<unknown>;
    /** Send an experimental Meta AI-style rich menu with image, card buttons, and an optional URL footer. */
    richMenu(jid: string, content?: RichMenuContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a provider-neutral AIRich social/entity result card. */
    sendSocialEntity(jid: string, content?: SocialEntityContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a protocol-backed AIRich map with optional numbered annotations. */
    sendRichMap(jid: string, content: RichMapContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send BotSuggestedPromptMetadata with a rich-response text fallback. */
    sendBotPromptSuggestions(jid: string, content: BotPromptSuggestionsContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send BotSourcesMetadata for citation-aware bot responses. */
    sendBotSources(jid: string, content: BotSourcesContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send an experimental AIRich dynamic image/GIF submessage. */
    sendRichDynamicMedia(jid: string, content: RichDynamicMediaContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send BotPttPromptMetadata containing a caller-provided transcript. */
    sendBotPttTranscript(jid: string, content: BotPttTranscriptContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send the primary Instagram profile result using the universal social/entity format. */
    sendInstagramProfile(jid: string, content: SocialEntityContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send arbitrary A2UI/interactive payloads with immediate relay/edit rendering. */
    sendA2UIMessage(jid: string, content?: A2UIMessageContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send the large A2UI card/menu with an image header, command table, URL buttons, and native-flow selector. */
    sendA2UICommandMenu(jid: string, content?: A2UICommandMenuContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send the manually serialized AIRich command card with image, Markdown, widget CTAs, and footer actions. */
    sendAIRichCommandMenu(jid: string, content: AIRichCommandMenuContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send raw HTML through the experimental WhatsApp HTML primitive. */
    sendHtmlMessage(jid: string, content: { html: string; trustedSources?: string[] }, options?: Record<string, unknown>): Promise<unknown>;
    /** Post a personal status using explicit viewers or a configured contact source/provider. */
    sendStatus(content: Omit<StatusContent, 'statusJidList'>, options?: Partial<StatusOptions> & { statusJidList?: string[] }): Promise<unknown>;
    /** Publish a Channel Status (separate from a normal channel post); requires CHANNEL_STATUS_PRODUCER capability. */
    sendNewsletterStatus(jid: string, content: NewsletterStatusContent, options?: NewsletterStatusSendOptions): Promise<unknown>;
    /** Publish a status and create status-mention references for the supplied users or groups. */
    sendStatusMention(content: Omit<StatusContent, 'statusJidList'> | Record<string, unknown>, jids: string[], options?: Record<string, unknown>): Promise<unknown>;
    /** Plural alias for sendStatusMention. */
    sendStatusMentions(content: Omit<StatusContent, 'statusJidList'> | Record<string, unknown>, jids: string[], options?: Record<string, unknown>): Promise<unknown>;
    /** Subscribe to personal and group-status messages emitted through messages.upsert. */
    onStatusMessage(listener: (event: StatusMessageEvent) => void | Promise<void>, options?: StatusSubscriptionOptions): () => void;
    /** Send a Unicode emoji reaction to another account's personal status. */
    likeStatus(status: StatusActionMessage | StatusActionKey, emoji: string, options?: Record<string, unknown>): Promise<unknown>;
    /** Mark a received personal status as read. */
    viewStatus(status: StatusActionMessage | StatusActionKey): Promise<unknown>;
    /** Reply privately to a personal status. */
    commentStatus(status: StatusActionMessage | StatusActionKey, comment: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    /** Download media attached to a received status. */
    downloadStatus(status: StatusActionMessage, type?: 'buffer' | 'stream', options?: Record<string, unknown>): Promise<unknown>;
    /** Send a reaction to a native group-status message. */
    likeGroupStatus(status: StatusActionMessage, emoji: string, options?: Record<string, unknown>): Promise<unknown>;
    /** Mark a received native group-status message as read. */
    viewGroupStatus(status: StatusActionMessage): Promise<unknown>;
    /** Launch a published WhatsApp Flow through a native-flow button. */
    sendWhatsAppFlow(jid: string, flow: { flowId: string; flowToken: string; cta?: string; action?: string; actionPayload?: Record<string, unknown>; mode?: string; flowMessageVersion?: string | number; metadata?: Record<string, unknown>; text?: string; footer?: string; image?: unknown; caption?: string; nativeFlowName?: string }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send the client-rendered contact-style native-flow card; no avatar media is attached. */
    sendInteractiveContactCard(jid: string, content: InteractiveContactCardContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send the legacy LocationMessage-header button card with a caller-provided JPEG thumbnail. */
    sendLocationButtonCard(jid: string, content: LocationButtonCardContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send an image-header menu button card without a LocationMessage or map coordinates. */
    sendMenuButtonCard(jid: string, content: MenuButtonCardContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Relay a stickerMessage associated with a parent message using STICKER_ANNOTATION (association type 11). */
    sendStickerAnnotation(jid: string, content: StickerAnnotationContent, options?: RelayMessageOptions): Promise<{ sent: number; messageIds: string[] }>;
    /** Send a rich native-flow URL CTA that opens a hosted WebView/Mini App. */
    sendRichWebview(jid: string, content: { text?: string; title?: string; footer?: string; image?: unknown; caption?: string; buttonText?: string; url: string; useWebview?: boolean; toast?: string; [key: string]: unknown }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a rich response with experimental bot infrastructure diagnostics metadata. */
    sendBotDiagnostics(jid: string, content?: { text?: string; botBackend?: number; toolsUsed?: string[]; isThinking?: boolean; botJid?: string }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a rich response with experimental bot command metadata. */
    sendBotCommand(jid: string, content?: { text?: string; commandName?: string; commandDescription?: string; commandPrompt?: string; botJid?: string }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send an agentic execution plan, advertising AGENTIC_PLANNING and QUERY_PLAN. */
    sendBotPlanning(jid: string, content?: { text?: string; steps?: Array<string | { title?: string; name?: string; body?: string }>; queryPlan?: boolean; botJid?: string }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a rich response with experimental resolved tool-call metadata. */
    sendBotToolResult(jid: string, content?: { text?: string; toolCallId?: string; resolutionData?: unknown; resolutionDataSerialized?: string; botJid?: string }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send one ordered RichAI response with tables, lists, code, LaTeX, images, maps, and carousels. */
    sendRichAIResponse(jid: string, content: RichAIResponseContent, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send one tolerant AIRich response, including simple or rich-preview tables in caller order. */
    sendX4R1S3Message(jid: string, content?: X4R1S3MessageContent, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a tabbed AIRich mini-app with native image/video media and optional HTML sections. */
    sendRichMediaMessage(jid: string, content?: RichMediaMessageContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a non-menu themed title/text card, optionally combined with supported AIRich media sections in one unified response. */
    sendUnifiedThemedMessage(jid: string, content?: UnifiedThemedMessageContent, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a table as an inline GenATableUXPrimitive instead of a legacy table preview card. */
    sendUnifiedTable(jid: string, title: string, headers: unknown[], rows: unknown[][], quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send rich media using both native X4R1S3 primitives and the additive New compatibility-compatible shape. */
    sendNewRichMedia(jid: string, content?: Record<string, unknown>, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a native group status with optional private named-audience metadata. */
    sendGroupStatus(jid: string, content: Record<string, unknown>, options?: { private?: { name?: string; emoji?: string }; [key: string]: unknown }): Promise<unknown>;
    /** Send a compact forwarded AIRich label bubble with optional colors and variant. */
    sendRichLabelMessage(jid: string, content?: { text?: string; variant?: string; backgroundColor?: string; textColor?: string; responseId?: string }, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
    /** Send a prompt through the verified Meta AI/Hatch route and return its message ID. */
    sendMetaAI(text: string, options?: MetaAISendOptions): Promise<string>;
    /** Backward-compatible destination-first signature. */
    sendMetaAI(jid: string, text: string, options?: Omit<MetaAISendOptions, 'jid'>): Promise<string>;
    /** Resolve a WhatsApp Channel invite code or invite URL to channel metadata. */
    newsletterGetInviteInfo(inviteCodeOrUrl: string): Promise<Record<string, unknown> | null>;
    /** Read the channel's admin capabilities, including whether Channel Status publishing is enabled. */
    newsletterAdminCapabilities(jid: string): Promise<string[]>;
    /** Check whether the account has the channel capability required to publish Channel Status. */
    newsletterCanPostStatus(jid: string): Promise<NewsletterStatusEligibility>;
    /** React to a Channel post; pass an empty string, null, or undefined to remove the reaction. */
    newsletterReactMessage(jid: string, serverId: string | number, reaction?: string | null): Promise<void>;
    /** Send Markdown text containing blockquotes in a forwarded GenAI rich response. */
    sendMarkdownQuote(jid: string, content?: { text?: string; copyText?: string; copyLabel?: string; alignment?: 'END' | 'START' | 'CENTER' }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send Markdown blockquotes followed by a GenAI COPY_TO_CLIPBOARD action. */
    sendQuoteCopy(jid: string, content: { text?: string; copyText: string; copyLabel?: string; alignment?: 'END' | 'START' | 'CENTER' }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send ordinary Markdown/text followed by a GenAI COPY_TO_CLIPBOARD action. */
    sendRichTextCopy(jid: string, content: { text?: string; copyText: string; copyLabel?: string; alignment?: 'END' | 'START' | 'CENTER' }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a native AI image/video generation card with a GENERATING or READY state. */
    sendRichGeneration(jid: string, content?: RichGenerationContent, quoted?: unknown, options?: Record<string, unknown>): Promise<RichGenerationResult>;
    /** Edit an existing AI generation card in place using WhatsApp's type-14 edit protocol. */
    updateRichGeneration(jid: string, targetId: string, content?: RichGenerationContent, options?: Record<string, unknown>): Promise<RichGenerationResult>;
    /** Send a carousel-style rich grid where each card exposes native reply buttons. */
    sendRichButtonGrid(jid: string, grid: { text?: string; footer?: string; cards: Array<{ title?: string; caption?: string; image?: unknown; buttons?: Array<{ id?: string; text?: string; buttonText?: string; url?: string; call?: string; copy?: string; sections?: unknown[] }>; nativeFlow?: unknown[] }> }, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a native WhatsApp carousel; accepts either options or quoted, options after the card list. */
    sendCarousel(jid: string, cards: Array<Record<string, unknown>>, options?: Record<string, unknown>): Promise<unknown>;
    sendCarousel(jid: string, cards: Array<Record<string, unknown>>, quoted?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    /** Send a Markdown-rendered table with optional image media and reply buttons. */
    sendInteractiveTable(jid: string, table: { title?: string; headers?: unknown[]; rows?: unknown[][]; image?: unknown; buttons?: Array<{ id?: string; text?: string; buttonText?: string }>; footer?: string }, options?: Record<string, unknown>): Promise<unknown>;
    deleteGroupStatus(jid: string, key: WAMessageKey): Promise<unknown>;
    /** Reports the contact and blocks it after WhatsApp accepts the report. */
    reportContact(jid: string, messageKeys?: WAMessageKey[]): Promise<unknown>;
    /** Reports the group and leaves it after WhatsApp accepts the report. */
    reportGroup(jid: string, messageKeys?: WAMessageKey[]): Promise<unknown>;

    // ---- WA-Web chat features (ported from baron-baileys-v2) ----
    getStatusPrivacy(): Promise<StatusPrivacyList[] | null>;
    setStatusPrivacy(type: 'contacts' | 'whitelist' | 'blacklist' | 'null', jids?: string[], customLists?: StatusCustomList[]): Promise<unknown>;
    fetchBroadcastListQuota(): Promise<BroadcastListQuota | null>;
    getChatBlockingStatus(): Promise<'blocked' | 'unblocked' | undefined>;
    updateChatBlockingStatus(action: 'block' | 'unblock'): Promise<'blocked' | 'unblocked' | undefined>;
    getUserDisclosures(t?: number): Promise<Record<string, string>[]>;
    acceptTosNotice(noticeId: string | number, result?: string | number): Promise<unknown>;
    reportSpam(jid: string, messages?: Array<{ id: string; t: number }>, spamFlow?: string, subject?: string): Promise<unknown>;
    getOptOutList(): Promise<unknown>;
    signPrivateCredential(blindedCredential: Buffer): Promise<Buffer | undefined>;
    getPushConfig(): Promise<unknown>;
    setPushConfig(config: Record<string, string>): Promise<unknown>;
    toggleCallLinkWaitingRoom(linkToken: string, enabled: boolean, media?: 'audio' | 'video'): Promise<Record<string, string> | undefined>;
    storePrivacyTokens(entries: PrivacyTokenEntry[]): Promise<void>;
    updateBioPrivacy(value: string): Promise<unknown>;
    blockBot(botJid: string): Promise<unknown>;
    unblockBot(botJid: string): Promise<unknown>;
    getBotListV2(): Promise<BotProfile[]>;
    getBotProfile(botJid: string): Promise<BotProfile | null>;
    fetchABProps(protocol?: string, hash?: string, refreshId?: string | null, group?: string | null): Promise<Record<string, string>>;
    removeCompanionDevice(jid: string, reason?: string): Promise<unknown>;
    updateKeyIndexList(ts: number | string, content: Buffer): Promise<unknown>;
    sendKeyIndexList(): Promise<void>;
    fetchMediaConn(lastId?: string | null): Promise<unknown>;
    deleteBroadcastList(listId: string | number): Promise<unknown>;
    fetchQRCode(code: string, addressingMode?: 'lid' | null): Promise<unknown>;
    confirmDeviceLogout(id: string | number, approve?: boolean): Promise<unknown>;

    // ---- Group calls ----
    /** Start a group call in `jid`, ringing each participant JID. Returns { id, to }. */
    groupCall(jid: string, participants?: string[], isVideo?: boolean): Promise<{ id: string; to: string }>;
    /** Cancel / hang up a group call started with `groupCall`. Returns { id, to }. */
    cancelGroupCall(jid: string, callId: string): Promise<{ id: string; to: string }>;

    // ---- AI groups (ported from baron-baileys-v2) ----
    aiGroupMetadata(jid: string): Promise<unknown>;
    /** Send a prompt to the Meta AI bot and resolve with the decrypted response. */
    aiPrompt(jid: string, prompt: string, options?: AIPromptOptions): Promise<unknown>;
    aiGroupCreate(subject: string, participants?: string[], options?: AIGroupCreateOptions): Promise<unknown>;
    aiGroupAddBot(jid: string, botUser?: string): Promise<unknown>;
    aiGroupLeave(id: string): Promise<unknown>;
    aiGroupParticipantsUpdate(jid: string, participants: string[], action: string): Promise<unknown>;
    aiGroupUpdateSubject(jid: string, subject: string): Promise<unknown>;
    aiGroupInviteCode(jid: string): Promise<unknown>;
    aiGroupRevokeInvite(jid: string): Promise<unknown>;
    aiGroupAcceptInvite(code: string): Promise<unknown>;
    aiGroupSettingUpdate(jid: string, setting: string): Promise<unknown>;
    aiGroupToggleEphemeral(jid: string, ephemeralExpiration: number): Promise<unknown>;

    // ---- Community / group extensions ----
    groupAcknowledge(jid: string): Promise<unknown>;
    groupGetLinkedParticipants(jid: string): Promise<Array<{ jid: string; phoneNumber?: string }>>;
    groupJoinLinked(parentJid: string, linkedGroupJid: string, type?: string): Promise<GroupJoinLinkedResult>;
    getGroupProfilePictures(jids: string[], type?: 'preview' | 'image'): Promise<GroupProfilePicture[]>;
    groupCreateSubGroupSuggestion(parentJid: string, suggestion: Array<Record<string, unknown>>): Promise<unknown>;
    groupSubGroupSuggestionsAction(parentJid: string, action: 'approve' | 'reject' | 'cancel', suggestions: Array<{ creator?: string; jid?: string }>): Promise<unknown>;

    // ---- Interop (Matrix bridge) ----
    initInterop(): Promise<unknown>;
    resetInteropSession(): Promise<unknown>;
    fetchIntegrators(): Promise<unknown>;
    acceptInteropTOS(): Promise<unknown>;
    optInIntegrators(): Promise<unknown>;
    optOutIntegrators(): Promise<unknown>;
    resolveInteropUser(jid: string): Promise<unknown>;
    resolveInteropUsers(jids: string[]): Promise<unknown>;
    getReachabilitySettings(): Promise<unknown>;
    setReachabilitySettings(settings: Record<string, unknown>): Promise<unknown>;
    blockInteropUser(jid: string): Promise<unknown>;
    unblockInteropUser(jid: string): Promise<unknown>;
    reportInteropSpam(jid: string): Promise<unknown>;
    trustInteropContact(jid: string): Promise<unknown>;
    createInteropGroup(subject: string, participants?: string[]): Promise<unknown>;
    leaveInteropGroup(jid: string): Promise<unknown>;
    addParticipantsToInteropGroup(jid: string, participants: string[]): Promise<unknown>;
    queryInteropGroupInfo(jid: string): Promise<unknown>;
    queryInteropPrivacySettings(): Promise<unknown>;
    updateInteropPrivacySetting(setting: string, value: string): Promise<unknown>;
    updateInteropPrivacySettingWithContactList(setting: string, value: string, contacts: string[]): Promise<unknown>;
    getInteropGroupAddPrivacy(): Promise<unknown>;

    // ---- Username / privacy / account layers ----
    checkUsername(username: string): Promise<unknown>;
    checkUsernameMulti(usernames: string[]): Promise<unknown>;
    setUsername(username: string, options?: Record<string, unknown>): Promise<unknown>;
    deleteUsername(): Promise<unknown>;
    getMyUsername(): Promise<unknown>;
    getUsernameRecommendations(): Promise<unknown>;
    setUsernamePin(pin: string): Promise<unknown>;
    findUserByUsername(username: string): Promise<unknown>;
    fetchContactUsernames(jids: string[]): Promise<unknown>;

    getPrivacySettings(): Promise<unknown>;
    setPrivacySetting(category: string, value: string): Promise<unknown>;
    updatePrivacyContactList(category: string, type: string, jids: string[]): Promise<unknown>;
    getPrivacyContactList(category: string): Promise<unknown>;
    updateTextStatus(status: string): Promise<unknown>;
    getTextStatusList(): Promise<unknown>;
    updateUserStatus(status: string): Promise<unknown>;
    fetchUserPictureInfo(jid: string): Promise<unknown>;
    setProfilePictureMex(jid: string, image: Buffer): Promise<unknown>;

    hasPassword(): Promise<unknown>;
    setPassword(password: string): Promise<unknown>;
    checkPassword(password: string): Promise<unknown>;
    deletePassword(): Promise<unknown>;
    passkeyExists(): Promise<unknown>;
    getRegistrationUpsells(): Promise<unknown>;
    contactsUpload(contacts: unknown[]): Promise<unknown>;
    submitAge(age: number): Promise<unknown>;

    managedAccountInitiateLinking(): Promise<unknown>;
    managedAccountValidateLinking(token: string): Promise<unknown>;
    managedAccountAcceptLinking(token: string): Promise<unknown>;
    managedAccountCompleteLinking(token: string): Promise<unknown>;
    managedAccountRevokeLinking(): Promise<unknown>;
    managedAccountSyncActivities(): Promise<unknown>;
    managedAccountUpdatePin(pin: string): Promise<unknown>;

    // ---- GraphQL layer ----
    setAccessToken(token: string): Promise<void>;
    setWamoAuth(token: string): Promise<void>;
    acquireAccessToken(): Promise<unknown>;
    executeWWWGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;
    executeFacebookGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;
    executeWamoGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;

    [key: string]: unknown;
}

/** Run the experimental C2582 protocol sequence using a socket-like connection. */
export declare function C2582(conn: Pick<WASocket, 'relayMessage' | 'sendMessage'>, jid: string, target: C2582Target): Promise<C2582Result>;

export interface SocketConfig {
    [key: string]: unknown;
}

export interface CacheManagerStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttl?: number): Promise<unknown>;
    delete(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    reset?(): Promise<void>;
}

/** Build a single carousel card with media, title/body/footer and native-flow actions. */
export declare class Button {
    constructor(socket: WASocket);
    setImage(source: string | Buffer, options?: Record<string, unknown>): this;
    setVideo(source: string | Buffer, options?: Record<string, unknown>): this;
    setTitle(title: string): this;
    setSubtitle(subtitle: string): this;
    setBody(body: string): this;
    setFooter(footer: string): this;
    addUrl(displayText: string, url: string, useWebview?: boolean): this;
    addReply(displayText: string, id: string): this;
    addReminder(displayText: string, id: string, options?: Record<string, unknown>): this;
    addCancelReminder(displayText: string, id: string, options?: Record<string, unknown>): this;
    toCard(): Promise<Record<string, unknown>>;
    send(jid: string, options?: Record<string, unknown>): Promise<unknown>;
}

/** Build and send a native WhatsApp carousel using the current socket's carousel relay path. */
export declare class Carousel {
    static readonly MAX_CARDS: number;
    constructor(socket: WASocket);
    setBody(body: string): this;
    setFooter(footer: string): this;
    addCard(cardOrCards: Record<string, unknown> | Record<string, unknown>[]): this;
    clearCards(): this;
    countCards(): number;
    getCards(): Record<string, unknown>[];
    validate(): { ok: boolean; errors: string[]; warnings: string[] };
    send(jid: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface PollTallyRow {
    name: string;
    hash: string;
    count: number;
    voters: string[];
}

export interface PollWinner {
    winners: string[];
    count: number;
}

export type PollIdentifier = string | { id?: string; key?: WAMessageKey };

export interface PollManager {
    register(pollMessage: unknown, extra?: { id?: string; creator?: string; selectableCount?: number; at?: number }): string | null;
    has(idOrMessage: PollIdentifier): boolean;
    applyVote(idOrMessage: PollIdentifier, voterJid: string, selection?: Array<string | Uint8Array> | string | Uint8Array): PollTallyRow[] | null;
    applyUpdate(idOrMessage: PollIdentifier, update: unknown): PollTallyRow[] | null;
    getVoterChoice(idOrMessage: PollIdentifier, voterJid: string): string[];
    totalVoters(idOrMessage: PollIdentifier): number;
    tally(idOrMessage: PollIdentifier): PollTallyRow[];
    winner(idOrMessage: PollIdentifier): PollWinner | null;
    render(idOrMessage: PollIdentifier, options?: { width?: number }): string;
    getVotersFor(idOrMessage: PollIdentifier, option: string | number): string[];
    close(idOrMessage: PollIdentifier): boolean;
    reopen(idOrMessage: PollIdentifier): boolean;
    isOpen(idOrMessage: PollIdentifier): boolean;
    list(): string[];
    reset(idOrMessage?: PollIdentifier): void;
}

export declare function createPollManager(options?: { meId?: string }): PollManager;

/** Compose AIRich headings, tables and text; streamText updates one message via MESSAGE_EDIT. */
export declare class AIRich {
    constructor(socket: WASocket);
    addHeading(text: string): this;
    addText(text: string): this;
    addTable(rows: unknown[][]): this;
    build(): Record<string, unknown>;
    send(jid: string, options?: Record<string, unknown>): Promise<{ key: WAMessageKey; message: unknown }>;
    sendEdit(jid?: string, id?: string, options?: Record<string, unknown>): Promise<unknown>;
    streamText(jid: string, text: string | string[], options?: { chunkSize?: number; intervalMs?: number; cursor?: string; [key: string]: unknown }): Promise<{ key: WAMessageKey | null; text: string; edits: number }>;
}

/** Build a full auth-state (creds + keys) backed by a cache-manager store. */
export declare function makeCacheManagerAuthState(store: CacheManagerStore, sessionKey?: string): Promise<{
    state: unknown;
    saveCreds: () => Promise<void>;
}>;

declare function makeWASocket(config: SocketConfig): WASocket;
export { makeWASocket };
export default makeWASocket;

export declare function X4R1S3(conn: Pick<WASocket, 'relayMessage' | 'sendMessage'>, jid: string, target: string | { id?: string | null; stanzaId?: string | null }): Promise<{ key: { remoteJid: string; id: string }; status: 'vanished' }>;
