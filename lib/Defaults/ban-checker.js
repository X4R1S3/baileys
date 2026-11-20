/**
 * @X4R1S3
 *
 * File: lib/Defaults/ban-checker.js
 * About: Ban checker module for the X4R1S3 WhatsApp protocol client.
 * Important exports: MOBILE_ENDPOINT, MOBILE_PORT, WA_VERSION, WA_VERSION_HASH, MOBILE_TOKEN, MOBILE_REGISTRATION_ENDPOINT, MOBILE_USERAGENT, GRAPHQL_ENDPOINT; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { createHash } from 'crypto';

export const MOBILE_ENDPOINT =
  process.env.X4R1S3_MOBILE_ENDPOINT || 'g.whatsapp.net';

export const MOBILE_PORT = Number(
  process.env.X4R1S3_MOBILE_PORT || 443
);

export const WA_VERSION =
  process.env.X4R1S3_WA_VERSION || '2.2413.51';

// Must be declared before MOBILE_TOKEN.
export const WA_VERSION_HASH = createHash('md5')
  .update(WA_VERSION)
  .digest('hex');

// Supply only the private prefix through the runtime environment.
export const MOBILE_TOKEN = Buffer.from(
  `${process.env.X4R1S3_MOBILE_TOKEN_PREFIX || '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM'}${WA_VERSION_HASH}`
);

export const MOBILE_REGISTRATION_ENDPOINT =
  process.env.X4R1S3_MOBILE_REGISTRATION_ENDPOINT ||
  'https://v.whatsapp.net/v2';

export const MOBILE_USERAGENT =
  process.env.X4R1S3_MOBILE_USERAGENT ||
  `WhatsApp/${WA_VERSION} iOS/17.5.1 Device/Apple-iPhone_13`;

export const GRAPHQL_ENDPOINT =
  process.env.X4R1S3_GRAPHQL_ENDPOINT ||
  'https://graph.whatsapp.com/graphql';

export const GRAPHQL_ACCESS_TOKEN =
  process.env.X4R1S3_GRAPHQL_ACCESS_TOKEN ||
  'WA|1015890928915437|3201f239340c1c8ec6262a6dad04200e';

export const GRAPHQL_BAN_STATUS_DOC_ID =
  process.env.X4R1S3_GRAPHQL_BAN_STATUS_DOC_ID ||
  '25573756098908502';

export const MOBILE_COUNTRY_CODE =
  process.env.X4R1S3_PHONE_COUNTRY_CODE || '';
