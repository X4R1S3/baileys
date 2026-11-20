/**
 * Copyright (c) 2026 X4R1S3x — @X4R1S3/baileys
 */
const MAX_CARDS = 10;

export class Carousel {
    #socket;

    static MAX_CARDS = MAX_CARDS;

    constructor(socket) {
        if (!socket) throw new Error('Socket is required');
        this.#socket = socket;
        this._cards = [];
        this._body = '';
        this._footer = '';
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

    addCard(cardOrCards) {
        const cards = Array.isArray(cardOrCards) ? cardOrCards : [cardOrCards];
        for (const [index, card] of cards.entries()) {
            if (!card || typeof card !== 'object' || Array.isArray(card)) {
                throw new TypeError(`Carousel card ${index + 1} must be an object`);
            }
        }
        if (this._cards.length + cards.length > MAX_CARDS) {
            throw new Error(`Carousel supports at most ${MAX_CARDS} cards`);
        }
        this._cards.push(...cards);
        return this;
    }

    clearCards() {
        this._cards = [];
        return this;
    }

    countCards() {
        return this._cards.length;
    }

    getCards() {
        return [...this._cards];
    }

    validate() {
        const errors = [];
        if (!this._cards.length) errors.push('Add at least one card');
        if (this._cards.length > MAX_CARDS) errors.push(`Maximum is ${MAX_CARDS} cards`);
        for (const [index, card] of this._cards.entries()) {
            const hasMedia = !!(card.image || card.video || card.product);
            if (!hasMedia) errors.push(`Card ${index + 1} requires image, video, or product media`);
        }
        return { ok: errors.length === 0, errors, warnings: [] };
    }

    async send(jid, options = {}) {
        const validation = this.validate();
        if (!validation.ok) throw new Error(`Carousel.validate failed:\n- ${validation.errors.join('\n- ')}`);
        if (typeof this.#socket.sendCarousel !== 'function') {
            throw new Error('Socket does not provide sendCarousel; use a compatible X4R1S3 socket');
        }
        return this.#socket.sendCarousel(jid, this._cards, {
            ...options,
            text: options.text ?? this._body,
            footer: options.footer ?? this._footer
        });
    }
}
