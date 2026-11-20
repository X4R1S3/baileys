/**
 * @X4R1S3
 *
 * File: lib/Utils/lt-hash.js
 * About: Lt hash module for the X4R1S3 WhatsApp protocol client.
 * Important exports: LT_HASH_ANTI_TAMPERING
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { LTHashAntiTampering } from 'whatsapp-rust-bridge';
/**
 * LT Hash is a summation based hash algorithm that maintains the integrity of a piece of data
 * over a series of mutations. You can add/remove mutations and it'll return a hash equal to
 * if the same series of mutations was made sequentially.
 */
export const LT_HASH_ANTI_TAMPERING = new LTHashAntiTampering();