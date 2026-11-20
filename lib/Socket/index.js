/**
 * @X4R1S3
 *
 * File: lib/Socket/index.js
 * About: Socket module for the X4R1S3 WhatsApp protocol client.
 * Important exports: checkStatusWA
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { makeCommunitiesSocket } from './communities.js';
import { makeInteropSocket } from './interop.js';
import { makePrivacySocket } from './privacy.js';
import { makeRegistrationSocket } from './registration.js';
import { makeManagedAccountSocket } from './managed-account.js';
import { makeGraphQLSocket } from './graphql.js';
import { checkStatusWA } from './ban-checker.js';

// export the last socket layer
const makeWASocket = (config) => {
    const userExplicitSyncFlag = typeof config?.syncFullHistory === 'boolean';
    const initialFullSyncDone = !!config?.auth?.creds?.initialFullSyncDone;
    const effectiveSyncFullHistory = userExplicitSyncFlag ? config.syncFullHistory : !initialFullSyncDone;
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config,
        syncFullHistory: effectiveSyncFullHistory
    };
    newConfig.logger?.debug?.(
        { initialFullSyncDone, effectiveSyncFullHistory, userExplicitSyncFlag },
        'computed syncFullHistory policy'
    );

    const baseSock = makeCommunitiesSocket(newConfig);
    const interopSock = makeInteropSocket(baseSock);
    const privacySock = makePrivacySocket(interopSock);
    const registrationSock = makeRegistrationSocket(privacySock);
    const managedSock = makeManagedAccountSocket(registrationSock);
    const sock = makeGraphQLSocket(managedSock);
    sock.checkStatusWA = checkStatusWA;

    return sock;
};

export { checkStatusWA };
export default makeWASocket;
