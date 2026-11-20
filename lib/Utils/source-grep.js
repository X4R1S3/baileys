/**
 * @X4R1S3
 *
 * File: lib/Utils/source-grep.js
 * About: Source grep module for the X4R1S3 WhatsApp protocol client.
 * Important exports: grepSource
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DIRS = ['lib', 'WAProto'];
const DEFAULT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.d.ts', '.proto', '.md', '.json']);

const walk = (directory, files) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath, files);
        else if (DEFAULT_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
    }
};

/**
 * Find a literal or regular-expression pattern in package source.
 * Returns exact relative file, line, column, and matching source line.
 */
export const grepSource = (pattern, options = {}) => {
    if (typeof pattern !== 'string' || !pattern.trim()) {
        throw new TypeError('grepSource requires a non-empty search string');
    }
    const expression = options.regex ? new RegExp(pattern, options.flags || 'i') : null;
    const needle = options.caseSensitive ? pattern : pattern.toLowerCase();
    const files = [];
    for (const relativeDir of options.dirs || DEFAULT_DIRS) walk(path.resolve(PACKAGE_ROOT, relativeDir), files);
    if (options.includeReadme) files.push(path.resolve(PACKAGE_ROOT, 'README.md'));
    const matches = [];
    for (const file of files.sort()) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            const found = expression ? expression.test(line) : (options.caseSensitive ? line.includes(pattern) : line.toLowerCase().includes(needle));
            if (found) {
                const column = expression ? Math.max(0, line.search(expression)) : (options.caseSensitive ? line.indexOf(pattern) : line.toLowerCase().indexOf(needle));
                matches.push({ file: path.relative(PACKAGE_ROOT, file), line: index + 1, column: column + 1, text: line.trim() });
            }
            if (expression) expression.lastIndex = 0;
        });
    }
    return matches.slice(0, Math.max(1, options.maxResults || 200));
};
