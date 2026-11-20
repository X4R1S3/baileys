/**
 * @X4R1S3
 *
 * File: lib/Utils/make-mutex.js
 * About: Make mutex module for the X4R1S3 WhatsApp protocol client.
 * Important exports: makeMutex, makeKeyedMutex
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { Mutex as AsyncMutex } from 'async-mutex';
export const makeMutex = () => {
    const mutex = new AsyncMutex();
    return {
        mutex(code) {
            return mutex.runExclusive(code);
        }
    };
};
export const makeKeyedMutex = () => {
    const map = new Map();
    return {
        async mutex(key, task) {
            let entry = map.get(key);
            if (!entry) {
                entry = { mutex: new AsyncMutex(), refCount: 0 };
                map.set(key, entry);
            }
            entry.refCount++;
            try {
                return await entry.mutex.runExclusive(task);
            }
            finally {
                entry.refCount--;
                // only delete it if this is still the current entry
                if (entry.refCount === 0 && map.get(key) === entry) {
                    map.delete(key);
                }
            }
        }
    };
};