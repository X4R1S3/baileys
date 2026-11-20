// Based on velowa (https://github.com/7ucg/velowa) by Baron - velowa License; see THIRD_PARTY_NOTICES.md.
import { makeMutex } from './make-mutex.js';
import { areJidsSameUser, jidNormalizedUser } from '../WABinary/index.js';
import { normalizeMessageContent } from './messages.js';

const STORE_TYPE = 'baileys-message-security';
const STORE_ID = 'recent';
const MAX_ENTRIES = 5000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 250;

const normalizeJid = (jid) => {
    if (!jid || typeof jid !== 'string') return undefined;
    try {
        return jidNormalizedUser(jid);
    }
    catch {
        return jid;
    }
};

const hasIdentityMatch = (left, right) => {
    const a = [...new Set(left.filter(Boolean).map(normalizeJid))];
    const b = [...new Set(right.filter(Boolean).map(normalizeJid))];
    return a.some(x => b.some(y => x === y || areJidsSameUser(x, y)));
};

/**
 * Persists recent sent IDs and authenticated message origins in the auth key store.
 * The store is advisory for suspicious-receipt events, but fail-closed for edit authorization.
 */
export class MessageSecurityStore {
    #keys;
    #logger;
    #sent = new Map();
    #origins = new Map();
    #mutex = makeMutex();
    #flushTimer;

    constructor(keys, logger) {
        this.#keys = keys;
        this.#logger = logger;
        this.ready = this.#load();
    }

    async #load() {
        if (!this.#keys?.get) return;
        try {
            const records = await this.#keys.get(STORE_TYPE, [STORE_ID]);
            let state = records?.[STORE_ID];
            if (typeof state === 'string') state = JSON.parse(state);
            const now = Date.now();
            for (const [id, at] of Object.entries(state?.sent || {})) {
                if (typeof at === 'number' && now - at <= MAX_AGE_MS) this.#sent.set(id, at);
            }
            for (const [id, entry] of Object.entries(state?.origins || {})) {
                if (entry && typeof entry.at === 'number' && now - entry.at <= MAX_AGE_MS && entry.chat && entry.author) {
                    this.#origins.set(id, entry);
                }
            }
            this.#trim(this.#sent);
            this.#trim(this.#origins);
        }
        catch (error) {
            this.#logger?.warn?.({ error }, 'unable to load recent message-security metadata');
        }
    }

    #trim(map) {
        while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
    }

    #scheduleFlush() {
        if (!this.#keys?.set || this.#flushTimer) return;
        this.#flushTimer = setTimeout(() => {
            this.#flushTimer = undefined;
            this.#persist().catch(error => this.#logger?.warn?.({ error }, 'unable to persist message-security metadata'));
        }, FLUSH_DELAY_MS);
        this.#flushTimer.unref?.();
    }

    async #persist() {
        if (!this.#keys?.set) return;
        await this.ready;
        return this.#mutex.mutex(async () => {
            const state = {
                version: 1,
                sent: Object.fromEntries(this.#sent),
                origins: Object.fromEntries(this.#origins)
            };
            await this.#keys.set({ [STORE_TYPE]: { [STORE_ID]: JSON.stringify(state) } });
        });
    }

    async flush() {
        if (this.#flushTimer) {
            clearTimeout(this.#flushTimer);
            this.#flushTimer = undefined;
        }
        await this.#persist();
    }

    #rememberOrigin(id, chat, chatAlt, author, authorAlt, fromMe) {
        if (!id || !chat || !author) return;
        this.#origins.delete(id);
        this.#origins.set(id, { chat, chatAlt, author, authorAlt, fromMe: !!fromMe, at: Date.now() });
        this.#trim(this.#origins);
    }

    async recordSent(id, chat, author, chatAlt, authorAlt) {
        if (!id) return;
        await this.ready;
        const now = Date.now();
        this.#sent.delete(id);
        this.#sent.set(id, now);
        this.#trim(this.#sent);
        this.#rememberOrigin(id, chat, chatAlt, author, authorAlt, true);
        this.#scheduleFlush();
    }

    async hasSent(id) {
        await this.ready;
        return this.#sent.has(id);
    }

    async rememberMessage(message, me) {
        await this.ready;
        const key = message?.key;
        const content = normalizeMessageContent(message?.message);
        if (!key?.id || !key.remoteJid || !content || content.protocolMessage || content.reactionMessage || content.pollUpdateMessage) return;
        const author = key.participant || (key.fromMe ? me?.id : key.remoteJid);
        const authorAlt = key.participantAlt || (key.fromMe ? me?.lid : key.remoteJidAlt);
        this.#rememberOrigin(key.id, key.remoteJid, key.remoteJidAlt, author, authorAlt, key.fromMe);
        if (key.fromMe) {
            this.#sent.delete(key.id);
            this.#sent.set(key.id, Date.now());
            this.#trim(this.#sent);
        }
        this.#scheduleFlush();
    }

    async isEditAuthorized(targetId, message, me) {
        await this.ready;
        const origin = this.#origins.get(targetId);
        const key = message?.key;
        if (!origin || !key?.remoteJid) return false;
        const originChats = [origin.chat, origin.chatAlt];
        const editChats = [key.remoteJid, key.remoteJidAlt];
        if (!hasIdentityMatch(originChats, editChats)) return false;
        const originAuthors = [origin.author, origin.authorAlt];
        if (origin.fromMe) originAuthors.push(me?.id, me?.lid);
        const editAuthor = key.participant || (key.fromMe ? me?.id : key.remoteJid);
        const editAuthors = [editAuthor, key.participantAlt, key.remoteJidAlt];
        if (key.fromMe) editAuthors.push(me?.id, me?.lid);
        return hasIdentityMatch(originAuthors, editAuthors);
    }
}

/** Return receipt IDs which are not known to have been sent by this account. */
export async function findUnknownReceiptIds(ids, store) {
    if (!store) return [];
    const unknown = [];
    for (const id of ids) {
        if (id && !(await store.hasSent(id))) unknown.push(id);
    }
    return unknown;
}
