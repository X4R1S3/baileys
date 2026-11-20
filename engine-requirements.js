/**
 * @X4R1S3
 *
 * File: engine-requirements.js
 * About: Engine requirements module for the X4R1S3 WhatsApp protocol client.
 * Important exports: No public exports detected; module side effects or declarations are local.
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { readFileSync } from 'fs';

const major = parseInt(
    process.versions.node.split('.')[0],
    10
);

if (major < 20) {
    console.error(
        `\n⚉ This package requires Node.js 20+ to run reliably.\n` +
        `   You are using Node.js ${process.versions.node}.\n` +
        `   Please upgrade to Node.js 20+ to proceed.\n`
    );
    process.exit(1);
}
