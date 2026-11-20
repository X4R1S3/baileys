/**
 * @X4R1S3
 *
 * File: lib/index.js
 * About: Lib module for the X4R1S3 WhatsApp protocol client.
 * Important exports: makeWASocket, checkStatusWA
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import makeWASocket, { checkStatusWA } from './Socket/index.js';
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Defaults/index.js';
export * from './Store/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
export { Button } from './Builders/Button.js';
export { Carousel } from './Builders/Carousel.js';
export { AIRich } from './Builders/AIRich.js';
export { A2UI, sendA2UIWidget } from './Builders/A2UI.js';
export { makeWASocket, checkStatusWA };
export default makeWASocket;
