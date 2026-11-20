/**
 * Copyright (c) 2026 X4R1S3x — @X4R1S3/baileys
 */
import { createHash } from 'crypto';
import { getKeyAuthor } from './generics.js';

const hashName = name => createHash('sha256').update(Buffer.from(String(name ?? ''))).digest('hex');

const toHashHex = value => {
    if (value === null || value === undefined) return null;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('hex');
    const text = String(value);
    if (/^[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    return hashName(text);
};

const unwrapMessage = message => {
    let current = message;
    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage',
        'editedMessage'
    ];
    for (let depth = 0; depth < 8 && current; depth++) {
        const wrapper = wrappers.find(key => current[key]?.message);
        if (!wrapper) break;
        current = current[wrapper].message;
    }
    return current;
};

const extractOptions = source => {
    const message = unwrapMessage(source?.message || source);
    const creation = message?.pollCreationMessage
        || message?.pollCreationMessageV2
        || message?.pollCreationMessageV3
        || message?.pollCreationMessageV4
        || message?.pollCreationMessageV5
        || message?.pollCreationMessageV6
        || source?.pollCreationMessage
        || null;
    if (creation) {
        return {
            names: (creation.options || []).map(option => option?.optionName || ''),
            selectableCount: creation.selectableOptionsCount ?? 0
        };
    }
    const names = source?.options || source?.values || [];
    return {
        names: Array.isArray(names) ? [...names] : [],
        selectableCount: source?.selectableCount ?? source?.selectableOptionsCount ?? 0
    };
};

const resolvePollId = idOrMessage => typeof idOrMessage === 'string'
    ? idOrMessage
    : idOrMessage?.key?.id || idOrMessage?.id || null;

/**
 * Create an in-memory poll tracker. Register poll-creation messages, then call
 * applyVote/applyUpdate with decrypted poll selections. Each voter is counted
 * once and a new selection replaces their previous one.
 */
export const createPollManager = ({ meId = 'me' } = {}) => {
    const polls = new Map();

    const getPoll = idOrMessage => polls.get(resolvePollId(idOrMessage));
    const tallyPoll = poll => {
        if (!poll) return [];
        const rows = poll.options.map(option => ({ name: option.name, hash: option.hash, count: 0, voters: [] }));
        const byName = new Map(rows.map(row => [row.name, row]));
        for (const [voter, names] of poll.votes) {
            for (const name of names) {
                const row = byName.get(name);
                if (row) {
                    row.count += 1;
                    row.voters.push(voter);
                }
            }
        }
        return rows;
    };

    const manager = {
        register(pollMessage, extra = {}) {
            const id = extra.id || pollMessage?.key?.id || pollMessage?.id;
            const { names, selectableCount } = extractOptions(pollMessage);
            if (!id || !names.length) return null;
            const key = pollMessage?.key;
            const creator = extra.creator || (key
                ? (key.fromMe ? meId : (key.participant || key.remoteJid))
                : undefined);
            polls.set(id, {
                id,
                options: names.map(name => ({ name, hash: hashName(name) })),
                selectableCount: extra.selectableCount ?? selectableCount ?? 0,
                creator,
                createdAt: extra.at ?? Date.now(),
                closed: false,
                votes: new Map()
            });
            return id;
        },

        has(idOrMessage) {
            return polls.has(resolvePollId(idOrMessage));
        },

        applyVote(idOrMessage, voterJid, selection = []) {
            const poll = getPoll(idOrMessage);
            if (!poll || !voterJid) return null;
            if (poll.closed) return tallyPoll(poll);
            const wanted = (Array.isArray(selection) ? selection : [selection])
                .map(toHashHex)
                .filter(Boolean);
            let names = poll.options.filter(option => wanted.includes(option.hash)).map(option => option.name);
            if (poll.selectableCount > 0 && names.length > poll.selectableCount) {
                names = names.slice(0, poll.selectableCount);
            }
            if (!names.length) poll.votes.delete(voterJid);
            else poll.votes.set(voterJid, names);
            return tallyPoll(poll);
        },

        applyUpdate(idOrMessage, update) {
            const voter = update?.voterJid || getKeyAuthor(update?.pollUpdateMessageKey, meId);
            const selected = update?.vote?.selectedOptions || update?.selectedOptions || [];
            return manager.applyVote(idOrMessage, voter, selected);
        },

        getVoterChoice(idOrMessage, voterJid) {
            return getPoll(idOrMessage)?.votes.get(voterJid)?.slice() || [];
        },

        totalVoters(idOrMessage) {
            return getPoll(idOrMessage)?.votes.size || 0;
        },

        tally(idOrMessage) {
            return tallyPoll(getPoll(idOrMessage));
        },

        winner(idOrMessage) {
            const rows = manager.tally(idOrMessage);
            const count = rows.reduce((max, row) => Math.max(max, row.count), 0);
            return count === 0 ? null : { winners: rows.filter(row => row.count === count).map(row => row.name), count };
        },

        render(idOrMessage, { width = 16 } = {}) {
            const rows = manager.tally(idOrMessage);
            const total = rows.reduce((sum, row) => sum + row.count, 0);
            const barWidth = Math.max(0, Math.min(80, Math.floor(Number(width) || 0)));
            return rows.map(row => {
                const percentage = total ? row.count / total : 0;
                const filled = Math.round(percentage * barWidth);
                const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barWidth - filled));
                return `${row.name}\n${bar} ${row.count} (${Math.round(percentage * 100)}%)`;
            }).join('\n');
        },

        getVotersFor(idOrMessage, option) {
            const poll = getPoll(idOrMessage);
            if (!poll) return [];
            const name = typeof option === 'number' ? poll.options[option]?.name : option;
            if (name === undefined) return [];
            const voters = [];
            for (const [voter, names] of poll.votes) {
                if (names.includes(name)) voters.push(voter);
            }
            return voters;
        },

        close(idOrMessage) {
            const poll = getPoll(idOrMessage);
            if (!poll) return false;
            poll.closed = true;
            return true;
        },

        reopen(idOrMessage) {
            const poll = getPoll(idOrMessage);
            if (!poll) return false;
            poll.closed = false;
            return true;
        },

        isOpen(idOrMessage) {
            const poll = getPoll(idOrMessage);
            return !!poll && !poll.closed;
        },

        list() {
            return [...polls.keys()];
        },

        reset(idOrMessage) {
            if (idOrMessage === undefined) polls.clear();
            else polls.delete(resolvePollId(idOrMessage));
        }
    };

    return manager;
};
