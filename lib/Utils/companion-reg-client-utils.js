/**
 * @X4R1S3
 *
 * File: lib/Utils/companion-reg-client-utils.js
 * About: Companion reg client utils module for the X4R1S3 WhatsApp protocol client.
 * Important exports: CompanionWebClientType, getCompanionWebClientType, getCompanionPlatformId, buildPairingQRData
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export const CompanionWebClientType = {
    UNKNOWN: 0,
    CHROME: 1,
    EDGE: 2,
    FIREFOX: 3,
    IE: 4,
    OPERA: 5,
    SAFARI: 6,
    ELECTRON: 7,
    UWP: 8,
    OTHER_WEB_CLIENT: 9
};
const BROWSER_TO_COMPANION_WEB_CLIENT = {
    Chrome: CompanionWebClientType.CHROME,
    Edge: CompanionWebClientType.EDGE,
    Firefox: CompanionWebClientType.FIREFOX,
    IE: CompanionWebClientType.IE,
    Opera: CompanionWebClientType.OPERA,
    Safari: CompanionWebClientType.SAFARI
};
export const getCompanionWebClientType = ([os, browserName]) => {
    if (browserName === 'Desktop') {
        return os === 'Windows' ? CompanionWebClientType.UWP : CompanionWebClientType.ELECTRON;
    }
    return BROWSER_TO_COMPANION_WEB_CLIENT[browserName] || CompanionWebClientType.OTHER_WEB_CLIENT;
};
export const getCompanionPlatformId = (browser) => {
    return getCompanionWebClientType(browser).toString();
};
export const buildPairingQRData = (ref, noiseKeyB64, identityKeyB64, advB64, browser) => {
    return [ref, noiseKeyB64, identityKeyB64, advB64, getCompanionPlatformId(browser)].join(',');
};