/**
 * @X4R1S3
 *
 * File: lib/WAUSync/Protocols/UsyncBotProfileProtocol.js
 * About: UsyncBotProfileProtocol module for the X4R1S3 WhatsApp protocol client.
 * Important exports: USyncBotProfileProtocol
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString } from '../../WABinary/index.js';
import { USyncUser } from '../USyncUser.js';
export class USyncBotProfileProtocol {
    constructor() {
        this.name = 'bot';
    }
    getQueryElement() {
        return {
            tag: 'bot',
            attrs: {},
            content: [{ tag: 'profile', attrs: { v: '1' } }]
        };
    }
    getUserElement(user) {
        return {
            tag: 'bot',
            attrs: {},
            content: [{ tag: 'profile', attrs: { persona_id: user.personaId } }]
        };
    }
    parser(node) {
        const botNode = getBinaryNodeChild(node, 'bot');
        const profile = getBinaryNodeChild(botNode, 'profile');
        const commandsNode = getBinaryNodeChild(profile, 'commands');
        const promptsNode = getBinaryNodeChild(profile, 'prompts');
        const commands = [];
        const prompts = [];
        for (const command of getBinaryNodeChildren(commandsNode, 'command')) {
            commands.push({
                name: getBinaryNodeChildString(command, 'name'),
                description: getBinaryNodeChildString(command, 'description')
            });
        }
        for (const prompt of getBinaryNodeChildren(promptsNode, 'prompt')) {
            prompts.push(`${getBinaryNodeChildString(prompt, 'emoji')} ${getBinaryNodeChildString(prompt, 'text')}`);
        }
        return {
            isDefault: !!getBinaryNodeChild(profile, 'default'),
            jid: node.attrs.jid,
            name: getBinaryNodeChildString(profile, 'name'),
            attributes: getBinaryNodeChildString(profile, 'attributes'),
            description: getBinaryNodeChildString(profile, 'description'),
            category: getBinaryNodeChildString(profile, 'category'),
            personaId: profile.attrs['persona_id'],
            commandsDescription: getBinaryNodeChildString(commandsNode, 'description'),
            commands,
            prompts
        };
    }
}