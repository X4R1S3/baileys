// Based on velowa (https://github.com/7ucg/velowa) by Baron - velowa License; see THIRD_PARTY_NOTICES.md.
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary/index.js';

/**
 * Parse live counters from a newsletter notification. The first update after a
 * subscription is a snapshot; later updates contain only changed messages.
 * Missing messages in a delta therefore mean "unchanged", not zeroed.
 */
export const parseNewsletterLiveUpdate = node => {
    const newsletter = node?.attrs?.from;
    if (!newsletter) {
        return undefined;
    }

    const liveUpdatesNode = getBinaryNodeChild(node, 'live_updates');
    const messagesNode = getBinaryNodeChild(liveUpdatesNode, 'messages');
    const messages = getBinaryNodeChildren(messagesNode, 'message')
        .map(messageNode => {
            const serverId = Number(messageNode.attrs?.server_id);
            if (!serverId) {
                return undefined;
            }

            const reactionsNode = getBinaryNodeChild(messageNode, 'reactions');
            const votesNode = getBinaryNodeChild(messageNode, 'votes');
            const forwardsNode = getBinaryNodeChild(messageNode, 'forwards_count');
            const forwardsCount = forwardsNode?.attrs?.count;

            return {
                serverId,
                ...(forwardsCount !== undefined ? { forwardsCount: Number(forwardsCount) } : {}),
                ...(Array.isArray(reactionsNode?.content)
                    ? {
                        reactions: getBinaryNodeChildren(reactionsNode, 'reaction')
                            .filter(reaction => reaction.attrs?.code)
                            .map(reaction => ({
                                code: reaction.attrs.code,
                                count: Number(reaction.attrs.count ?? 0)
                            }))
                    }
                    : {}),
                ...(Array.isArray(votesNode?.content)
                    ? {
                        votes: getBinaryNodeChildren(votesNode, 'vote')
                            .filter(vote =>
                                (Buffer.isBuffer(vote.content) || vote.content instanceof Uint8Array) &&
                                vote.attrs?.count !== undefined
                            )
                            .map(vote => ({
                                optionHash: Buffer.from(vote.content).toString('hex'),
                                count: Number(vote.attrs.count)
                            }))
                    }
                    : {})
            };
        })
        .filter(message => message !== undefined);

    if (!messages.length) {
        return undefined;
    }

    return { newsletter, messages };
};

export const emitNewsletterLiveUpdate = (ev, node) => {
    const update = parseNewsletterLiveUpdate(node);
    if (!update) {
        return undefined;
    }

    ev.emit('newsletter.live-update', update);
    return update;
};
