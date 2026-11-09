import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertCatalogSyncToken } from './catalog-sync-auth';
import { backupTimestamp, contentHash, pruneDatabaseBackups, stableStringify } from './catalog-sync-common';

const token = 'x'.repeat(40);
const request = (authorization?: string) => new Request('https://example.com/api/catalog-sync/status', {
    headers: authorization ? { authorization } : {},
});

describe('catalog sync token', () => {
    it('is off until a long token is configured', () => {
        expect(() => assertCatalogSyncToken(request(`Bearer ${token}`), undefined)).toThrow('설정');
        expect(() => assertCatalogSyncToken(request('Bearer short'), 'short')).toThrow('설정');
    });

    it('accepts only the exact bearer token', () => {
        expect(() => assertCatalogSyncToken(request(`Bearer ${token}`), token)).not.toThrow();
        expect(() => assertCatalogSyncToken(request(), token)).toThrow('토큰');
        expect(() => assertCatalogSyncToken(request(token), token)).toThrow('토큰');
        expect(() => assertCatalogSyncToken(request(`Bearer ${token}y`), token)).toThrow('토큰');
    });
});

describe('stable hashing', () => {
    it('does not depend on key order and drops undefined', () => {
        expect(stableStringify({ b: 1, a: { d: undefined, c: [2, { y: 1, x: 0 }] } }))
            .toBe('{"a":{"c":[2,{"x":0,"y":1}]},"b":1}');
        expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    });

    it('names backups with a sortable UTC timestamp', () => {
        expect(backupTimestamp(new Date('2026-11-10T01:02:03.456Z'))).toBe('20261110T010203456Z');
    });
});

describe('backup retention', () => {
    it('keeps the newest app backups and never touches other files', () => {
        const directory = mkdtempSync(join(tmpdir(), 'cherrypicker-backups-'));
        const names = [
            ...Array.from({ length: 8 }, (_, index) => `pre-start-2026110${index}.db`),
            'pre-catalog-release-a.db',
            'pre-promotion-handover-b.db',
            'pre-start-old.db',
            'manual-before-migration.db',
            'notes.txt',
        ];
        names.forEach((name, index) => {
            const file = join(directory, name);
            writeFileSync(file, '');
            const time = name === 'pre-start-old.db' ? 1 : 1_000 + index;
            utimesSync(file, time, time);
        });

        expect(pruneDatabaseBackups(directory, 10)).toEqual(['pre-start-old.db']);
        expect(readdirSync(directory)).toContain('manual-before-migration.db');
        expect(readdirSync(directory)).toContain('notes.txt');
        expect(readdirSync(directory).filter(name => name.startsWith('pre-'))).toHaveLength(10);
    });
});
