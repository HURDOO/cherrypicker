import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entrypoint = resolve('scripts/docker-entrypoint.sh');

function startWithEnvironment(environment: Record<string, string>) {
    const directory = mkdtempSync(join(tmpdir(), 'cherrypicker-entrypoint-'));
    const binDirectory = join(directory, 'node_modules', '.bin');
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(join(binDirectory, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    writeFileSync(join(binDirectory, 'next'), '#!/bin/sh\nprintf "%s\\n" "$BETTER_AUTH_URL"\n', {
        mode: 0o700,
    });

    return execFileSync('/bin/sh', [entrypoint], {
        cwd: directory,
        env: {
            NODE_ENV: 'test',
            PATH: `${binDirectory}:/usr/bin:/bin`,
            BETTER_AUTH_SECRET: 'entrypoint-test-placeholder-not-a-real-secret',
            DATABASE_PATH: join(directory, 'absent.db'),
            ...environment,
        },
        encoding: 'utf8',
    }).trim();
}

describe('container authentication origin', () => {
    it.each([
        'https://cherrypicker.app.hurdoo.kr',
        'https://cherrypicker-promotion.app.hurdoo.kr',
    ])('uses the managed runtime origin %s', (origin) => {
        expect(startWithEnvironment({ APP_BASE_URL: origin })).toBe(origin);
    });

    it('preserves an explicit authentication origin', () => {
        expect(startWithEnvironment({
            BETTER_AUTH_URL: 'https://cards.example.com',
            APP_BASE_URL: 'https://cherrypicker.app.hurdoo.kr',
        })).toBe('https://cards.example.com');
    });

    it('uses the Cherrypicker address when no runtime origin is provided', () => {
        expect(startWithEnvironment({})).toBe('https://cherrypicker.app.hurdoo.kr');
    });
});
