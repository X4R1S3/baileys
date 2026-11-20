/**
 * @X4R1S3
 *
 * File: lib/Socket/ban-checker.js
 * About: Ban checker module for the X4R1S3 WhatsApp protocol client.
 * Important exports: checkStatusWA, getBanDetails, normalizePhone
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { randomBytes, randomUUID } from 'crypto';
import { initAuthCreds } from '../Utils/auth-utils.js';
import { Curve, md5, signedKeyPair } from '../Utils/crypto.js';
import {
    GRAPHQL_ACCESS_TOKEN,
    GRAPHQL_BAN_STATUS_DOC_ID,
    GRAPHQL_ENDPOINT,
    MOBILE_COUNTRY_CODE,
    MOBILE_REGISTRATION_ENDPOINT,
    MOBILE_TOKEN,
    MOBILE_USERAGENT
} from '../Defaults/ban-checker.js';

const COUNTRY_CODES = [
    '1', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
    '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86',
    '90', '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225',
    '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242',
    '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261',
    '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353',
    '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381',
    '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507',
    '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675',
    '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
    '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
    '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'
].sort((a, b) => b.length - a.length);

const PLACEHOLDER = /^REPLACE_WITH_/;

const cleanNumber = (value) => String(value || '').replace(/[\s().\-/]/g, '').replace(/^00/, '');

const normalizePhone = (value, options = {}) => {
    const raw = cleanNumber(typeof value === 'object' ? value.number : value).replace(/^\+/, '');
    if (!/^\d{6,15}$/.test(raw)) throw new TypeError('number must be an international phone number');
    const requestedCountry = String(options.countryCode || MOBILE_COUNTRY_CODE || '').replace(/\D/g, '');
    const countryCode = requestedCountry || COUNTRY_CODES.find((code) => raw.startsWith(code));
    if (!countryCode || !raw.startsWith(countryCode)) throw new TypeError('number must include a recognized country calling code');
    const nationalNumber = raw.slice(countryCode.length);
    if (!nationalNumber) throw new TypeError('number is missing its national part');
    return { countryCode, nationalNumber, e164: `+${raw}` };
};

const urlEncode = (value) => encodeURIComponent(String(value)).replace(/%25([0-9a-f]{2})/gi, '%$1');
const urlHex = (buffer) => [...buffer].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');

const makeRegistrationParams = (countryCode, nationalNumber) => {
    const creds = initAuthCreds();
    const eRegId = Buffer.alloc(4);
    eRegId.writeInt32BE(creds.registrationId);
    const eSkeyId = Buffer.alloc(3);
    eSkeyId.writeInt16BE(creds.signedPreKey.keyId);
    return {
        cc: countryCode,
        in: nationalNumber,
        Rc: '0', lg: 'en', lc: 'GB', mistyped: '6',
        authkey: Buffer.from(creds.noiseKey.public).toString('base64url'),
        e_regid: eRegId.toString('base64url'),
        e_keytype: 'BQ',
        e_ident: Buffer.from(creds.signedIdentityKey.public).toString('base64url'),
        e_skey_id: eSkeyId.toString('base64url'),
        e_skey_val: Buffer.from(creds.signedPreKey.keyPair.public).toString('base64url'),
        e_skey_sig: Buffer.from(creds.signedPreKey.signature).toString('base64url'),
        fdid: randomUUID(),
        network_ratio_type: '1', expid: randomUUID(), simnum: '1', hasinrc: '1',
        pid: String(Math.floor(Math.random() * 1000)),
        id: urlHex(randomBytes(16)),
        backup_token: urlHex(randomBytes(32)),
        token: Buffer.from(md5(Buffer.concat([MOBILE_TOKEN, Buffer.from(nationalNumber)]))).toString('hex')
    };
};

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'User-Agent': MOBILE_USERAGENT, ...(options.headers || {}) } });
    let body = null;
    try { body = await response.json(); } catch { body = {}; }
    return { response, body };
};

const getBanDetails = async (appealToken) => {
    if (!appealToken || PLACEHOLDER.test(GRAPHQL_ACCESS_TOKEN) || PLACEHOLDER.test(GRAPHQL_BAN_STATUS_DOC_ID)) return null;
    const { response, body } = await requestJson(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            variables: JSON.stringify({ app_id: 'dev.app.id', request_token: appealToken }),
            access_token: GRAPHQL_ACCESS_TOKEN,
            doc_id: GRAPHQL_BAN_STATUS_DOC_ID,
            lang: 'en_GB'
        })
    });
    if (!response.ok) return null;
    return body?.data?.whatsapp_support_ban_appeal_status || null;
};

const result = (number, status, isBanned = false, isNeedOfficialWa = false, banInfo = null) => ({ number, status, isBanned, isNeedOfficialWa, banInfo });

const getDiagnostic = (response, body) => {
    const bodyObject = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nestedData = bodyObject.data && typeof bodyObject.data === 'object' && !Array.isArray(bodyObject.data)
        ? bodyObject.data
        : {};
    const keys = Object.keys(bodyObject).sort();
    return {
        httpStatus: Number.isInteger(response?.status) ? response.status : null,
        ok: response?.ok === true,
        contentType: response?.headers?.get?.('content-type') || null,
        bodyKeys: keys,
        dataKeys: Object.keys(nestedData).sort(),
        signals: {
            hasReason: Object.prototype.hasOwnProperty.call(bodyObject, 'reason'),
            hasError: Object.prototype.hasOwnProperty.call(bodyObject, 'error'),
            hasStatus: Object.prototype.hasOwnProperty.call(bodyObject, 'status'),
            hasAppealToken: Boolean(bodyObject.appeal_token || bodyObject.appealToken || nestedData.appeal_token),
            hasBanFields: Boolean(bodyObject.ban_type || bodyObject.banType || bodyObject.violation_type || bodyObject.violationType)
        }
    };
};

const withDiagnostic = (value, diagnostic) => diagnostic ? { ...value, diagnostics: diagnostic } : value;

export const checkStatusWA = async (number, options = {}) => {
    const normalized = normalizePhone(number, options);
    const params = makeRegistrationParams(normalized.countryCode, normalized.nationalNumber);
    const query = Object.entries(params).map(([key, value]) => `${key}=${urlEncode(value)}`).join('&');
    const { response, body } = await requestJson(`${MOBILE_REGISTRATION_ENDPOINT}/exist?${query}`);
    const diagnostic = options.diagnostic === true ? getDiagnostic(response, body) : null;
    const reason = String(body?.reason || body?.error || body?.status || '').toLowerCase();
    const appealToken = body?.appeal_token || body?.appealToken || body?.data?.appeal_token;

    if (response.status === 429 || /rate.?limit|too many/.test(reason)) return withDiagnostic(result(normalized.e164, 'rate_limited'), diagnostic);
    if (/blocked|official/.test(reason) && !appealToken) return withDiagnostic(result(normalized.e164, 'blocked', false, true), diagnostic);
    if (appealToken || /banned|ban|temporar|perman/.test(reason)) {
        const details = await getBanDetails(appealToken);
        const banType = details?.ban_type || details?.banType || body?.ban_type || body?.banType || (reason.includes('perman') ? 'permanent' : 'temporary');
        return withDiagnostic(result(normalized.e164, 'banned', true, false, {
            banType,
            violationType: body?.violation_type || body?.violationType || null,
            violationReason: body?.violation_reason || body?.violationReason || null,
            canAppeal: banType !== 'permanent',
            appealToken: appealToken || null,
            banTime: details?.ban_time || details?.banTime || null,
            banDate: details?.ban_date || details?.banDate || null,
            appealStatus: details?.appeal_status || details?.appealStatus || null,
            appealCreatedAt: details?.appeal_created_at || details?.appealCreatedAt || null
        }), diagnostic);
    }
    if (response.ok && (!body?.reason || /^(ok|sent|active|registered)$/.test(reason))) return withDiagnostic(result(normalized.e164, 'active'), diagnostic);
    if (/not.?registered|does.?not.?exist/.test(reason)) return withDiagnostic(result(normalized.e164, 'not_registered'), diagnostic);
    return withDiagnostic(result(normalized.e164, 'unknown'), diagnostic);
};

export { getBanDetails, normalizePhone };
