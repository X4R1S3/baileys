/**
 * Copyright (c) 2026 X4R1S3x — @X4R1S3/baileys
 */
export class Button {
    #socket;

    constructor(socket) {
        if (!socket) throw new Error('Socket is required');
        this.#socket = socket;
        this._media = {};
        this._title = '';
        this._subtitle = '';
        this._body = '';
        this._footer = '';
        this._buttons = [];
    }

    setImage(source, options = {}) {
        if (!source) throw new Error('Image URL or buffer is required');
        this._media = { image: Buffer.isBuffer(source) ? source : { url: source }, ...options };
        return this;
    }

    setVideo(source, options = {}) {
        if (!source) throw new Error('Video URL or buffer is required');
        this._media = { video: Buffer.isBuffer(source) ? source : { url: source }, ...options };
        return this;
    }

    setTitle(title) {
        if (typeof title !== 'string') throw new TypeError('Title must be a string');
        this._title = title;
        return this;
    }

    setSubtitle(subtitle) {
        if (typeof subtitle !== 'string') throw new TypeError('Subtitle must be a string');
        this._subtitle = subtitle;
        return this;
    }

    setBody(body) {
        if (typeof body !== 'string') throw new TypeError('Body must be a string');
        this._body = body;
        return this;
    }

    setFooter(footer) {
        if (typeof footer !== 'string') throw new TypeError('Footer must be a string');
        this._footer = footer;
        return this;
    }

    addUrl(displayText, url, useWebview = false) {
        if (!displayText || !url) throw new TypeError('addUrl(displayText, url) requires both values');
        this._buttons.push({ text: displayText, url, useWebview });
        return this;
    }

    addReply(displayText, id) {
        if (!displayText || !id) throw new TypeError('addReply(displayText, id) requires both values');
        this._buttons.push({ text: displayText, id });
        return this;
    }

    addReminder(displayText, id, options = {}) {
        if (!displayText || !id) throw new TypeError('addReminder(displayText, id) requires both values');
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('addReminder options must be an object');
        }
        this._buttons.push({
            name: 'cta_reminder',
            buttonParamsJson: JSON.stringify({ ...options, display_text: displayText, id })
        });
        return this;
    }

    addCancelReminder(displayText, id, options = {}) {
        if (!displayText || !id) throw new TypeError('addCancelReminder(displayText, id) requires both values');
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('addCancelReminder options must be an object');
        }
        this._buttons.push({
            name: 'cta_cancel_reminder',
            buttonParamsJson: JSON.stringify({ ...options, display_text: displayText, id })
        });
        return this;
    }

    async toCard() {
        return {
            ...this._media,
            title: this._title,
            subtitle: this._subtitle,
            ...(this._body ? { text: this._body } : {}),
            ...(this._footer ? { footer: this._footer } : {}),
            ...(this._buttons.length ? { nativeFlow: [...this._buttons] } : {})
        };
    }

    async send(jid, options = {}) {
        if (typeof this.#socket.sendMessage !== 'function') {
            throw new Error('Socket does not provide sendMessage');
        }
        const card = await this.toCard();
        return this.#socket.sendMessage(jid, card, options);
    }
}
