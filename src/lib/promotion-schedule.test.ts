import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { CollectorProcessResult, CollectionRunSummary } from './promotion-schedule';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const testDb = drizzle(sqlite, { schema });
let schedule: typeof import('./promotion-schedule');

const applyMigrations = () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        sqlite.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    sqlite.pragma('foreign_keys = ON');
};

// 2026-11-10 05:15 KST is 2026-11-09 20:15 UTC.
const kst = (day: number, hour: number, minute: number, second = 0) =>
    new Date(Date.UTC(2026, 10, day, hour - 9, minute, second));

const okProcess = (outputTail: string[] = []): CollectorProcessResult => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    durationMs: 1_000,
    outputTail,
});

const run = (status: CollectionRunSummary['status']): CollectionRunSummary => ({
    status,
    sourceCount: 8,
    failedSourceCount: status === 'SUCCEEDED' ? 0 : status === 'FAILED' ? 8 : 2,
    discoveredCount: 1,
    publishedCount: 1,
    reviewRequiredCount: 0,
    expiredCount: 0,
});

const insertRun = (status: CollectionRunSummary['status'], startedAt: Date, finishedAt: Date) => {
    testDb.insert(schema.promotionCollectionRuns).values({
        id: `run-${startedAt.getTime()}-${Math.random()}`,
        status,
        startedAt,
        finishedAt,
        sourceCount: 8,
        successfulSourceCount: status === 'SUCCEEDED' ? 8 : 6,
        failedSourceCount: status === 'SUCCEEDED' ? 0 : 2,
        skippedSourceCount: 0,
        discoveredCount: 0,
        publishedCount: 0,
        reviewRequiredCount: 0,
        unchangedCount: 0,
        expiredCount: 0,
    }).run();
};

const insertCandidate = (id: string, providerId: string) => {
    testDb.insert(schema.promotionCandidates).values({
        id,
        providerId,
        sourceUrl: `https://example.com/${id}`,
        sourceHash: id,
        sourceTitle: id,
        rawContent: '',
        parsedOffer: {},
        diff: {},
    }).run();
};

beforeAll(async () => {
    applyMigrations();
    testDb.insert(schema.promotionProviders).values([
        { id: 'kakaopay-gooddeal', name: '카카오페이 굿딜', kind: 'GOODDEAL', isActive: true, sortOrder: 0 },
        { id: 'skt', name: 'T 멤버십', kind: 'TELECOM', isActive: true, sortOrder: 1 },
    ]).run();
    vi.doMock('@/db', () => ({ db: testDb, sqlite, databasePath: ':memory:' }));
    schedule = await import('./promotion-schedule');
});

beforeEach(() => {
    sqlite.exec('DELETE FROM promotion_candidates; DELETE FROM promotion_collection_runs;');
});

describe('parseScheduleTimes', () => {
    it('defaults to 05:15 and 08:15 Korea time', () => {
        expect(schedule.parseScheduleTimes(undefined)).toEqual([
            { hour: 5, minute: 15 },
            { hour: 8, minute: 15 },
        ]);
        expect(schedule.parseScheduleTimes('  ')).toHaveLength(2);
    });

    it('reads, sorts and dedupes an override', () => {
        expect(schedule.parseScheduleTimes('23:05, 01:30,23:05')).toEqual([
            { hour: 1, minute: 30 },
            { hour: 23, minute: 5 },
        ]);
    });

    it.each(['5:15', '24:00', '08:60', '08:15,', 'morning', '08:15;09:00'])(
        'rejects %s',
        value => {
            expect(() => schedule.parseScheduleTimes(value)).toThrow(/HH:MM/);
        },
    );
});

describe('nextScheduledRun', () => {
    const times = [{ hour: 5, minute: 15 }, { hour: 8, minute: 15 }];

    it('picks the next slot on the same Korea day', () => {
        expect(schedule.nextScheduledRun(kst(10, 1, 0), times)).toEqual(kst(10, 5, 15));
        expect(schedule.nextScheduledRun(kst(10, 6, 0), times)).toEqual(kst(10, 8, 15));
    });

    it('moves past a slot that is exactly now', () => {
        expect(schedule.nextScheduledRun(kst(10, 5, 15), times)).toEqual(kst(10, 8, 15));
    });

    it('rolls over to the next Korea day after the last slot', () => {
        expect(schedule.nextScheduledRun(kst(10, 8, 15, 1), times)).toEqual(kst(11, 5, 15));
        expect(schedule.nextScheduledRun(kst(10, 23, 59), times)).toEqual(kst(11, 5, 15));
    });

    it('treats UTC evening as the next Korea morning', () => {
        // 2026-11-09 19:00 UTC is 2026-11-10 04:00 KST.
        expect(schedule.nextScheduledRun(new Date(Date.UTC(2026, 10, 9, 19, 0)), times))
            .toEqual(kst(10, 5, 15));
    });

    it('crosses a month end', () => {
        expect(schedule.nextScheduledRun(kst(30, 9, 0), times))
            .toEqual(new Date(Date.UTC(2026, 11, 1, 5 - 9, 15)));
    });
});

describe('shouldStartPromotionSchedule', () => {
    it('runs only in the production Node.js server unless turned off', () => {
        expect(schedule.shouldStartPromotionSchedule({ NEXT_RUNTIME: 'nodejs', NODE_ENV: 'production' }))
            .toBe(true);
        expect(schedule.shouldStartPromotionSchedule({ NEXT_RUNTIME: 'edge', NODE_ENV: 'production' }))
            .toBe(false);
        expect(schedule.shouldStartPromotionSchedule({ NEXT_RUNTIME: 'nodejs', NODE_ENV: 'development' }))
            .toBe(false);
        expect(schedule.shouldStartPromotionSchedule({
            NEXT_RUNTIME: 'nodejs',
            NODE_ENV: 'production',
            PROMOTION_SCHEDULE: 'OFF',
        })).toBe(false);
    });
});

describe('hasPromotionHandover', () => {
    it('waits while only GoodDeal candidates exist', () => {
        expect(schedule.hasPromotionHandover(testDb)).toBe(false);
        insertCandidate('gooddeal-1', 'kakaopay-gooddeal');
        expect(schedule.hasPromotionHandover(testDb)).toBe(false);
        insertCandidate('skt-1', 'skt');
        expect(schedule.hasPromotionHandover(testDb)).toBe(true);
    });
});

describe('acquireCollectionLock', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'promotion-lock-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('holds the lock until released', () => {
        const now = kst(10, 5, 15);
        const release = schedule.acquireCollectionLock(directory, now);
        expect(release).toBeTypeOf('function');
        expect(schedule.acquireCollectionLock(directory, now)).toBeNull();
        release!();
        expect(existsSync(path.join(directory, schedule.COLLECTION_LOCK_FILE))).toBe(false);
        const again = schedule.acquireCollectionLock(directory, now);
        expect(again).toBeTypeOf('function');
        again!();
    });

    it('replaces a lock left by a crashed run after two hours', () => {
        const lockPath = path.join(directory, schedule.COLLECTION_LOCK_FILE);
        writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: kst(10, 2, 0).toISOString() }));

        expect(schedule.acquireCollectionLock(directory, kst(10, 3, 59))).toBeNull();
        const release = schedule.acquireCollectionLock(directory, kst(10, 4, 1));
        expect(release).toBeTypeOf('function');
        expect(JSON.parse(readFileSync(lockPath, 'utf8')).startedAt).toBe(kst(10, 4, 1).toISOString());
        release!();
    });

    it('uses the file time when the lock content is unreadable', () => {
        const lockPath = path.join(directory, schedule.COLLECTION_LOCK_FILE);
        writeFileSync(lockPath, 'garbage');
        const old = kst(10, 0, 0);
        utimesSync(lockPath, old, old);

        expect(schedule.acquireCollectionLock(directory, kst(10, 1, 0))).toBeNull();
        const release = schedule.acquireCollectionLock(directory, kst(10, 3, 0));
        expect(release).toBeTypeOf('function');
        release!();
    });

    it('does not remove a lock another run took over', () => {
        const lockPath = path.join(directory, schedule.COLLECTION_LOCK_FILE);
        const release = schedule.acquireCollectionLock(directory, kst(10, 1, 0));
        writeFileSync(lockPath, JSON.stringify({ pid: 2, startedAt: kst(10, 3, 1).toISOString() }));
        release!();
        expect(existsSync(lockPath)).toBe(true);
    });
});

describe('alert decisions', () => {
    it('reads failed source labels from the collector output', () => {
        expect(schedule.parseFailedSourceLabels([
            'Promotion collection: 1 discovered, 0 published, 0 review required, 3 unchanged, 0 expired, 2 failed, 0 skipped.',
            'T 멤버십 제휴처: created (1 new)',
            'U+ 멤버십 제휴 혜택: failed - 서버 직접 요청 시간 초과',
            '네이버페이 혜택: failed',
            'U+ 멤버십 제휴 혜택: failed - again',
        ])).toEqual(['U+ 멤버십 제휴 혜택', '네이버페이 혜택']);
    });

    it('counts runs since the last success', () => {
        expect(schedule.countConsecutiveFailures([])).toBe(0);
        expect(schedule.countConsecutiveFailures(['SUCCEEDED', 'FAILED'])).toBe(0);
        expect(schedule.countConsecutiveFailures(['PARTIAL', 'FAILED', 'SUCCEEDED', 'FAILED'])).toBe(2);
        expect(schedule.countConsecutiveFailures(['PARTIAL', 'FAILED'])).toBe(2);
    });

    it('stays quiet after a successful run', () => {
        expect(schedule.describeCollectionAlert({
            processResult: okProcess(),
            run: run('SUCCEEDED'),
            consecutiveFailures: 0,
            failedLabels: [],
        })).toBeNull();
    });

    it('reports a partial run with failed sources and counts', () => {
        const text = schedule.describeCollectionAlert({
            processResult: okProcess(),
            run: run('PARTIAL'),
            consecutiveFailures: 1,
            failedLabels: ['네이버페이 혜택'],
        });
        expect(text).toContain('부분 실패');
        expect(text).toContain('출처 2/8곳 실패 (네이버페이 혜택)');
        expect(text).toContain('새 후보 1');
        expect(text).not.toContain('연속');
    });

    it('adds the streak once two or more runs in a row did not succeed', () => {
        const text = schedule.describeCollectionAlert({
            processResult: okProcess(),
            run: run('FAILED'),
            consecutiveFailures: 3,
            failedLabels: [],
        });
        expect(text).toContain('전체 실패');
        expect(text).toContain('연속 3회');
    });

    it('reports a crashed or timed-out collector with its last output', () => {
        const crashed = schedule.describeCollectionAlert({
            processResult: { ...okProcess(['line 1', 'FATAL ERROR: heap out of memory']), exitCode: 134 },
            consecutiveFailures: 0,
            failedLabels: [],
        });
        expect(crashed).toContain('종료 코드 134');
        expect(crashed).toContain('heap out of memory');

        const timedOut = schedule.describeCollectionAlert({
            processResult: { ...okProcess(), exitCode: null, signal: 'SIGTERM', timedOut: true },
            consecutiveFailures: 0,
            failedLabels: [],
        });
        expect(timedOut).toContain('45분');
    });

    it('reports a clean exit that left no run record', () => {
        expect(schedule.describeCollectionAlert({
            processResult: okProcess(),
            consecutiveFailures: 0,
            failedLabels: [],
        })).toContain('실행 기록이 남지 않았어요');
    });

    it('warns when the last successful run is older than 36 hours', () => {
        const now = kst(12, 5, 15);
        expect(schedule.describeStaleCatalogAlert(kst(10, 18, 0), now)).toBeNull();
        expect(schedule.describeStaleCatalogAlert(kst(10, 16, 0), now)).toContain('37시간 전');
        expect(schedule.describeStaleCatalogAlert(undefined, now)).toContain('기록이 없어요');
    });
});

describe('runScheduledPromotionCollection', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'promotion-run-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    const deps = (overrides: Partial<import('./promotion-schedule').PromotionScheduleDeps> = {}) => {
        const sendAlert = vi.fn(async () => true);
        const runCollector = vi.fn(async () => okProcess());
        return {
            sendAlert,
            runCollector,
            options: {
                database: testDb,
                lockDirectory: directory,
                cwd: directory,
                now: () => kst(10, 5, 15),
                log: () => undefined,
                sendAlert,
                runCollector,
                ...overrides,
            },
        };
    };

    it('skips before the handover without spawning or alerting', async () => {
        const { options, sendAlert, runCollector } = deps();

        await expect(schedule.runScheduledPromotionCollection(options)).resolves.toBe('skipped-handover');
        expect(runCollector).not.toHaveBeenCalled();
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('skips while another run holds the lock', async () => {
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(10, 4, 0), kst(10, 4, 5));
        const held = schedule.acquireCollectionLock(directory, kst(10, 5, 0));
        const { options, runCollector } = deps();

        await expect(schedule.runScheduledPromotionCollection(options)).resolves.toBe('skipped-locked');
        expect(runCollector).not.toHaveBeenCalled();
        held!();
    });

    it('runs the collector, alerts on a partial run and releases the lock', async () => {
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(9, 8, 15), kst(9, 8, 20));
        const runCollector = vi.fn(async () => {
            insertRun('PARTIAL', kst(10, 5, 15, 2), kst(10, 5, 20));
            return okProcess(['네이버페이 혜택: failed - 시간 초과']);
        });
        const { options, sendAlert } = deps({ runCollector });

        await expect(schedule.runScheduledPromotionCollection(options)).resolves.toBe('completed');
        expect(runCollector).toHaveBeenCalledTimes(1);
        expect(sendAlert).toHaveBeenCalledTimes(1);
        expect(sendAlert.mock.calls[0]).toEqual([expect.stringContaining('네이버페이 혜택')]);
        expect(existsSync(path.join(directory, schedule.COLLECTION_LOCK_FILE))).toBe(false);
    });

    it('does not alert after a successful run', async () => {
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(9, 8, 15), kst(9, 8, 20));
        const runCollector = vi.fn(async () => {
            insertRun('SUCCEEDED', kst(10, 5, 15, 2), kst(10, 5, 20));
            return okProcess();
        });
        const { options, sendAlert } = deps({ runCollector });

        await expect(schedule.runScheduledPromotionCollection(options)).resolves.toBe('completed');
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('warns about a stale catalog before running', async () => {
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(8, 5, 15), kst(8, 5, 20));
        const runCollector = vi.fn(async () => {
            insertRun('SUCCEEDED', kst(10, 5, 15, 2), kst(10, 5, 20));
            return okProcess();
        });
        const { options, sendAlert } = deps({ runCollector });

        await schedule.runScheduledPromotionCollection(options);
        expect(sendAlert).toHaveBeenCalledTimes(1);
        expect(sendAlert.mock.calls[0]).toEqual([expect.stringContaining('오래된 카탈로그')]);
    });

    it('releases the lock and alerts when the collector cannot start', async () => {
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(9, 8, 15), kst(9, 8, 20));
        const runCollector = vi.fn(async (): Promise<CollectorProcessResult> => ({
            ...okProcess(),
            exitCode: null,
            spawnError: 'ENOENT',
        }));
        const { options, sendAlert } = deps({ runCollector });

        await expect(schedule.runScheduledPromotionCollection(options)).resolves.toBe('completed');
        expect(sendAlert.mock.calls[0]).toEqual([expect.stringContaining('ENOENT')]);
        expect(existsSync(path.join(directory, schedule.COLLECTION_LOCK_FILE))).toBe(false);
    });
});

describe('runCollectorProcess', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'promotion-child-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    const fakeTsx = (body: string) => {
        const bin = path.join(directory, 'node_modules', '.bin');
        mkdirSync(bin, { recursive: true });
        writeFileSync(path.join(bin, 'tsx'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    };

    it('keeps the last 40 output lines and the exit code', async () => {
        fakeTsx('i=1; while [ $i -le 60 ]; do echo "line $i"; i=$((i+1)); done; echo "oops" >&2; exit 3');

        const result = await schedule.runCollectorProcess({ cwd: directory, timeoutMs: 10_000 });
        expect(result.exitCode).toBe(3);
        expect(result.timedOut).toBe(false);
        expect(result.outputTail).toHaveLength(40);
        expect(result.outputTail.at(-1)).toBe('oops');
        expect(result.outputTail).not.toContain('line 1');
    });

    it('passes the heap cap to the child', async () => {
        fakeTsx('echo "$NODE_OPTIONS"');

        const result = await schedule.runCollectorProcess({ cwd: directory, timeoutMs: 10_000 });
        expect(result.exitCode).toBe(0);
        expect(result.outputTail).toEqual(['--max-old-space-size=320']);
    });

    it('stops a collector that runs past the timeout', async () => {
        fakeTsx('echo started; sleep 30');

        const result = await schedule.runCollectorProcess({ cwd: directory, timeoutMs: 2_000 });
        expect(result.timedOut).toBe(true);
        expect(result.signal).toBe('SIGTERM');
        expect(result.outputTail).toEqual(['started']);
    }, 15_000);

    it('reports a missing collector instead of throwing', async () => {
        const result = await schedule.runCollectorProcess({
            cwd: directory,
            timeoutMs: 1_000,
            platform: 'darwin',
        });
        expect(result.spawnError).toBe('ENOENT');
    });
});

describe('startPromotionSchedule', () => {
    const env = { NEXT_RUNTIME: 'nodejs', NODE_ENV: 'production' } as NodeJS.ProcessEnv;

    afterEach(() => {
        schedule.stopPromotionSchedule();
        vi.useRealTimers();
    });

    it('starts once per process and falls back to default times on a bad override', () => {
        const lines: string[] = [];
        const options = { now: () => kst(10, 1, 0), log: (line: string) => lines.push(line) };

        expect(schedule.startPromotionSchedule({ ...env, PROMOTION_SCHEDULE_TIMES: '5:15' }, options))
            .toBe(true);
        expect(schedule.startPromotionSchedule(env, options)).toBe(false);
        expect(lines[0]).toContain('기본 시각');
        expect(lines[1]).toBe('다음 프로모션 수집: 2026-11-10 05:15 KST');
    });

    it('does not start outside production or when turned off', () => {
        expect(schedule.startPromotionSchedule({ ...env, PROMOTION_SCHEDULE: 'off' })).toBe(false);
        expect(schedule.startPromotionSchedule({ ...env, NODE_ENV: 'development' })).toBe(false);
    });

    it('runs at the slot and arms the next one', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(kst(10, 8, 14));
        const lines: string[] = [];
        insertCandidate('skt-1', 'skt');
        insertRun('SUCCEEDED', kst(10, 5, 15), kst(10, 5, 20));
        const runCollector = vi.fn(async () => okProcess());
        const lockDirectory = mkdtempSync(path.join(tmpdir(), 'promotion-start-'));

        schedule.startPromotionSchedule({ ...env, PROMOTION_SCHEDULE_TIMES: '08:15' }, {
            database: testDb,
            lockDirectory,
            log: line => lines.push(line),
            runCollector,
            sendAlert: async () => true,
        });
        expect(lines.at(-1)).toBe('다음 프로모션 수집: 2026-11-10 08:15 KST');

        await vi.advanceTimersByTimeAsync(61_000);
        expect(runCollector).toHaveBeenCalledTimes(1);
        expect(lines.at(-1)).toBe('다음 프로모션 수집: 2026-11-11 08:15 KST');
        rmSync(lockDirectory, { recursive: true, force: true });
    });
});
