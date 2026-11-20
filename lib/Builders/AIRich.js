/**
 * Copyright (c) 2026 X4R1S3x — @X4R1S3/baileys
 */
import { randomUUID } from 'crypto';
import { proto } from '../../WAProto/index.js';
import { generateMessageIDV2 } from '../Utils/generics.js';
import { generateWAMessageFromContent } from '../Utils/messages.js';
import { prepareRichResponseMessage } from '../Utils/rich-message-utils.js';

const splitAtWords = (text, chunkSize) => {
    const size = Math.max(1, Number(chunkSize) || 120);
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        if (text.length - start <= size) {
            chunks.push(text.slice(start));
            break;
        }
        let end = start + size;
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) end = lastSpace + 1;
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
};

const readUnified = richResponse => {
    const data = richResponse?.unifiedResponse?.data;
    if (!data) return null;
    try {
        return JSON.parse(Buffer.from(data).toString('utf8'));
    }
    catch {
        return null;
    }
};

/**
 * Compose AIRich-compatible headings, text, and tables. streamText() sends the
 * first version once, then applies type-14 edits to that same message key.
 */
export class AIRich {
    #client;

    constructor(client) {
        if (!client || typeof client.relayMessage !== 'function') {
            throw new Error('AIRich requires a socket with relayMessage');
        }
        this.#client = client;
        this._blocks = [];
        this._responseId = randomUUID();
        this._lastMessageKey = null;
    }

    addHeading(text) {
        if (typeof text !== 'string' || !text.trim()) throw new TypeError('addHeading(text) requires non-empty text');
        this._blocks.push({ type: 'heading', text });
        return this;
    }

    addText(text) {
        if (typeof text !== 'string') throw new TypeError('addText(text) requires a string');
        this._blocks.push({ type: 'text', text });
        return this;
    }

    addTable(rows) {
        if (!Array.isArray(rows) || !rows.length || rows.some(row => !Array.isArray(row))) {
            throw new TypeError('addTable(rows) requires a non-empty array of row arrays');
        }
        this._blocks.push({ type: 'table', rows: rows.map(row => [...row]) });
        return this;
    }

    build() {
        if (!this._blocks.length) throw new Error('AIRich has no content to build');
        const prepared = prepareRichResponseMessage({
            richResponse: this._blocks.map(block => block.type === 'table' ? { table: block.rows } : { text: block.text }),
            noDonation: true
        });
        const richResponse = prepared?.botForwardedMessage?.message?.richResponseMessage;
        const unified = readUnified(richResponse);
        if (!richResponse || !unified) throw new Error('AIRich could not compose the unified response');

        unified.response_id = this._responseId;
        let sectionIndex = 0;
        for (const block of this._blocks) {
            const section = unified.sections?.[sectionIndex];
            if (block.type === 'heading' && section?.view_model?.primitive) {
                section.view_model.primitive.__typename = 'FOATextPrimitive';
            }
            sectionIndex += 1;
        }
        richResponse.unifiedResponse.data = Buffer.from(JSON.stringify(unified));
        const botMetadata = prepared.messageContextInfo?.botMetadata;
        if (botMetadata) botMetadata.botResponseId = this._responseId;
        return prepared;
    }

    async send(jid, options = {}) {
        if (!jid) throw new TypeError('AIRich.send(jid) requires a target JID');
        const { quoted, messageId, ...relayOptions } = options;
        const id = messageId || generateMessageIDV2(this.#client.user?.id || jid);
        const generated = generateWAMessageFromContent(jid, this.build(), {
            logger: this.#client.logger,
            userJid: this.#client.user?.id,
            messageId: id,
            quoted,
            ...relayOptions
        });
        await this.#client.relayMessage(jid, generated.message, {
            ...relayOptions,
            messageId: generated.key.id
        });
        this._lastMessageKey = { remoteJid: jid, fromMe: true, id: generated.key.id };
        return { key: this._lastMessageKey, message: generated.message };
    }

    async sendEdit(jid, id, options = {}) {
        jid = jid ?? this._lastMessageKey?.remoteJid;
        id = id ?? this._lastMessageKey?.id;
        if (!jid) throw new Error('sendEdit: no jid — pass one explicitly, or call send() first');
        if (!id) throw new Error('sendEdit: no message id — pass one explicitly, or call send() first');
        const { quoted: _quoted, messageId, ...relayOptions } = options;
        const edit = generateWAMessageFromContent(jid, {
            botForwardedMessage: {
                message: {
                    protocolMessage: {
                        key: { remoteJid: jid, fromMe: true, id },
                        type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                        editedMessage: this.build()
                    }
                }
            }
        }, {
            logger: this.#client.logger,
            userJid: this.#client.user?.id,
            messageId: messageId || generateMessageIDV2(this.#client.user?.id || jid),
            ...relayOptions
        });
        await this.#client.relayMessage(jid, edit.message, {
            ...relayOptions,
            messageId: edit.key.id
        });
        return edit;
    }

    async streamText(jid, text, { chunkSize = 120, intervalMs = 900, cursor = ' ▍', ...sendOptions } = {}) {
        if (!jid) throw new TypeError('streamText(jid, text) requires a jid');
        const chunks = (Array.isArray(text) ? text.map(String) : splitAtWords(String(text ?? ''), chunkSize))
            .filter(chunk => chunk.length > 0);
        if (!chunks.length || chunks.every(chunk => !chunk.trim())) {
            throw new TypeError('streamText(jid, text) requires non-empty text');
        }

        const waitMs = Math.max(300, Number(intervalMs) || 0);
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        let revealed = '';
        let edits = 0;
        const block = { type: 'text', text: '' };
        this._blocks.push(block);

        for (let index = 0; index < chunks.length; index += 1) {
            revealed += chunks[index];
            const isLast = index === chunks.length - 1;
            block.text = isLast ? revealed : revealed + (cursor || '');
            if (index === 0) {
                await this.send(jid, sendOptions);
            }
            else {
                await wait(waitMs);
                await this.sendEdit(undefined, undefined, sendOptions);
                edits += 1;
            }
        }
        return { key: this._lastMessageKey, text: revealed, edits };
    }
}
