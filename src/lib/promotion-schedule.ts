import { spawn } from 'node:child_process';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { desc, eq, gte, ne } from 'drizzle-orm';
import { databasePath, db as defaultDb } from '@/db';
import { promotionCandidates, promotionCollectionRuns } from '@/db/schema';
import type { PromotionCollectionRunStatus } from '@/types';
import { sendOpsAlert } from './ops-alerts';

/**
 * Production schedule for official promotion collection. After the one-time handover the
 * server is the only writer of promotions, so it runs the existing collector CLI as a child
 * process at fixed Korea times, one run at a time, and reports failures to Discord.
 */

export interface ScheduleTime {
    hour: number;
    minute: number;
}

type Database = typeof defaultDb;

export const DEFAULT_SCHEDULE_TIMES: ScheduleTime[] = [
    { hour: 5, minute: 15 },
    { hour: 8, minute: 15 },
];
export const GOODDEAL_PROVIDER_ID = 'kakaopay-gooddeal';
export const COLLECTION_LOCK_FILE = 'promotion-collect.lock';
export const LOCK_STALE_MS = 2 * 60 * 60 * 1_000;
export const COLLECTOR_TIMEOUT_MS = 45 * 60 * 1_000;
export const STALE_CATALOG_MS = 36 * 60 * 60 * 1_000;
export const COLLECTOR_HEAP_MB = 320;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const OUTPUT_TAIL_LINES = 40;
const ALERT_OUTPUT_LINES = 5;
const ALERT_LINE_LENGTH = 200;
const KILL_GRACE_MS = 10_000;
// Long timers are split so a changed wall clock is noticed within this window.
const MAX_TIMER_MS = 60 * 60 * 1_000;
const RUN_START_SKEW_MS = 5_000;
const LOG_PREFIX = '[promotion-schedule]';
const ALERT_PREFIX = '[체리피커]';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FAILED_SOURCE_LINE = /^(.+?): failed(?:\s|$)/;

const pad = (value: number) => String(value).padStart(2, '0');

export function formatKst(date: Date): string {
    const kst = new Date(date.getTime() + KST_OFFSET_MS);
    return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ` +
        `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} KST`;
}

/** Reads `HH:MM,HH:MM` (Korea time). Unset or blank means the default 05:15 and 08:15. */
export function parseScheduleTimes(value: string | undefined): ScheduleTime[] {
    if (!value?.trim()) return DEFAULT_SCHEDULE_TIMES.map(time => ({ ...time }));

    const times = value.split(',').map(item => {
        const match = TIME_PATTERN.exec(item.trim());
        if (!match) {
            throw new Error('PROMOTION_SCHEDULE_TIMES는 HH:MM,HH:MM 형식(한국 시간)이어야 합니다.');
        }
        return { hour: Number(match[1]), minute: Number(match[2]) };
    });
    const unique = new Map(times.map(time => [time.hour * 60 + time.minute, time]));
    return [...unique.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, time]) => time);
}

/** The first slot strictly after `now`, in Korea time (no daylight saving). */
export function nextScheduledRun(now: Date, times: ScheduleTime[]): Date {
    if (times.length === 0) throw new Error('수집 시각이 하나 이상 필요합니다.');
    const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
    const sorted = [...times].sort((left, right) =>
        left.hour * 60 + left.minute - (right.hour * 60 + right.minute));

    for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
        for (const time of sorted) {
            const candidate = Date.UTC(
                kstNow.getUTCFullYear(),
                kstNow.getUTCMonth(),
                kstNow.getUTCDate() + dayOffset,
                time.hour,
                time.minute,
            ) - KST_OFFSET_MS;
            if (candidate > now.getTime()) return new Date(candidate);
        }
    }
    throw new Error('다음 수집 시각을 계산하지 못했습니다.');
}

export function shouldStartPromotionSchedule(env: NodeJS.ProcessEnv): boolean {
    return env.NEXT_RUNTIME === 'nodejs' &&
        env.NODE_ENV === 'production' &&
        env.PROMOTION_SCHEDULE?.trim().toLowerCase() !== 'off';
}

/** Collection waits until the one-time handover has brought the local collection history. */
export function hasPromotionHandover(database: Database = defaultDb): boolean {
    return Boolean(database.select({ id: promotionCandidates.id })
        .from(promotionCandidates)
        .where(ne(promotionCandidates.providerId, GOODDEAL_PROVIDER_ID))
        .limit(1)
        .get());
}

const errorCode = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined;

const lockStartedAt = (lockPath: string): number | undefined => {
    try {
        const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { startedAt?: unknown };
        const startedAt = typeof parsed.startedAt === 'string'
            ? Date.parse(parsed.startedAt)
            : Number.NaN;
        if (Number.isFinite(startedAt)) return startedAt;
    } catch (error) {
        if (errorCode(error) === 'ENOENT') return undefined;
    }
    try {
        return statSync(lockPath).mtimeMs;
    } catch {
        return undefined;
    }
};

/**
 * Takes the collection lock file in `directory`. Returns a release function, or null while
 * another run holds it. A lock older than `staleMs` is left from a crashed run and is replaced.
 */
export function acquireCollectionLock(
    directory: string,
    now = new Date(),
    staleMs = LOCK_STALE_MS,
): (() => void) | null {
    const lockPath = path.join(directory, COLLECTION_LOCK_FILE);
    const content = JSON.stringify({ pid: process.pid, startedAt: now.toISOString() });

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            writeFileSync(lockPath, content, { flag: 'wx', mode: 0o600 });
            return () => {
                try {
                    // Only remove our own lock, never one another run took over as stale.
                    if (readFileSync(lockPath, 'utf8') === content) unlinkSync(lockPath);
                } catch (error) {
                    if (errorCode(error) !== 'ENOENT') {
                        console.error(`${LOG_PREFIX} 수집 잠금 파일을 지우지 못했습니다.`);
                    }
                }
            };
        } catch (error) {
            if (errorCode(error) !== 'EEXIST') throw error;
            const startedAt = lockStartedAt(lockPath);
            if (startedAt !== undefined && now.getTime() - startedAt < staleMs) return null;
            try {
                unlinkSync(lockPath);
            } catch (unlinkError) {
                if (errorCode(unlinkError) !== 'ENOENT') throw unlinkError;
            }
        }
    }
    return null;
}

/** Source labels the collector CLI printed as `<label>: failed ...`. */
export function parseFailedSourceLabels(lines: string[]): string[] {
    const labels = lines.flatMap(line => {
        const match = FAILED_SOURCE_LINE.exec(line.trim());
        return match ? [match[1]] : [];
    });
    return [...new Set(labels)];
}

/** Runs counted from the latest backwards until the first SUCCEEDED one. */
export function countConsecutiveFailures(statusesLatestFirst: PromotionCollectionRunStatus[]): number {
    const index = statusesLatestFirst.findIndex(status => status === 'SUCCEEDED');
    return index === -1 ? statusesLatestFirst.length : index;
}

export interface CollectorProcessResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
    durationMs: number;
    outputTail: string[];
    spawnError?: string;
}

export interface CollectionRunSummary {
    status: PromotionCollectionRunStatus;
    sourceCount: number;
    failedSourceCount: number;
    discoveredCount: number;
    publishedCount: number;
    reviewRequiredCount: number;
    expiredCount: number;
}

const truncate = (line: string) => line.length > ALERT_LINE_LENGTH
    ? `${line.slice(0, ALERT_LINE_LENGTH - 1)}…`
    : line;

/** The Discord message for one finished run, or null when nothing needs attention. */
export function describeCollectionAlert({
    processResult,
    run,
    consecutiveFailures,
    failedLabels,
}: {
    processResult: CollectorProcessResult;
    run?: CollectionRunSummary;
    consecutiveFailures: number;
    failedLabels: string[];
}): string | null {
    const lines: string[] = [];
    const processFailed = processResult.timedOut ||
        Boolean(processResult.spawnError) ||
        processResult.exitCode !== 0;

    if (processResult.timedOut) {
        lines.push(`${ALERT_PREFIX} 프로모션 수집이 ${Math.round(COLLECTOR_TIMEOUT_MS / 60_000)}분 안에 끝나지 않아 중단했어요.`);
    } else if (processResult.spawnError) {
        lines.push(`${ALERT_PREFIX} 프로모션 수집 프로세스를 시작하지 못했어요 (${processResult.spawnError}).`);
    } else if (processResult.exitCode !== 0) {
        const reason = processResult.signal
            ? `신호 ${processResult.signal}`
            : `종료 코드 ${processResult.exitCode}`;
        lines.push(`${ALERT_PREFIX} 프로모션 수집 프로세스가 실패했어요 (${reason}).`);
    } else if (!run) {
        lines.push(`${ALERT_PREFIX} 프로모션 수집이 끝났지만 실행 기록이 남지 않았어요.`);
    } else if (run.status === 'SUCCEEDED') {
        return null;
    }

    if (run && run.status !== 'SUCCEEDED') {
        const kind = run.status === 'FAILED' ? '전체 실패' : '부분 실패';
        lines.push(
            `${processFailed ? '' : `${ALERT_PREFIX} `}프로모션 수집 ${kind}: ` +
            `출처 ${run.failedSourceCount}/${run.sourceCount}곳 실패` +
            (failedLabels.length > 0 ? ` (${failedLabels.join(', ')})` : ''),
        );
        lines.push(
            `새 후보 ${run.discoveredCount} · 게시 ${run.publishedCount} · ` +
            `검수 대기 ${run.reviewRequiredCount} · 만료 ${run.expiredCount}`,
        );
    } else if (failedLabels.length > 0) {
        lines.push(`실패한 출처: ${failedLabels.join(', ')}`);
    }
    if (processFailed && processResult.outputTail.length > 0) {
        lines.push('마지막 출력:');
        lines.push(...processResult.outputTail.slice(-ALERT_OUTPUT_LINES).map(truncate));
    }
    if (consecutiveFailures >= 2) {
        lines.push(`연속 ${consecutiveFailures}회 정상 완료되지 않았어요. 기존 게시본은 그대로 유지돼요.`);
    } else {
        lines.push('기존 게시본은 그대로 유지돼요.');
    }
    return lines.join('\n');
}

/** Warns before a run when the last successful collection is older than `staleMs`. */
export function describeStaleCatalogAlert(
    lastSucceededAt: Date | undefined,
    now: Date,
    staleMs = STALE_CATALOG_MS,
): string | null {
    if (!lastSucceededAt) {
        return `${ALERT_PREFIX} 오래된 카탈로그: 정상 완료된 프로모션 수집 기록이 없어요.`;
    }
    const ageMs = now.getTime() - lastSucceededAt.getTime();
    if (ageMs <= staleMs) return null;
    return `${ALERT_PREFIX} 오래된 카탈로그: 마지막 정상 수집이 ${Math.floor(ageMs / 3_600_000)}시간 전` +
        `(${formatKst(lastSucceededAt)})이에요.`;
}

/** Starts the collector CLI and keeps only the last lines of its output. */
export function runCollectorProcess({
    cwd,
    timeoutMs = COLLECTOR_TIMEOUT_MS,
    platform = process.platform,
}: {
    cwd: string;
    timeoutMs?: number;
    platform?: NodeJS.Platform;
}): Promise<CollectorProcessResult> {
    const tsx = path.join(cwd, 'node_modules', '.bin', 'tsx');
    const script = 'scripts/collect-promotions.ts';
    const [command, args] = platform === 'linux'
        // Raise the child's OOM score so a container OOM takes the collector, not the web server.
        ? ['sh', ['-c', 'echo 1000 > /proc/self/oom_score_adj 2>/dev/null; exec "$@"', 'sh', tsx, script]]
        : [tsx, [script]];
    const startedAt = Date.now();
    const tail: string[] = [];
    const pending = { stdout: '', stderr: '' };
    const pushLines = (stream: 'stdout' | 'stderr', chunk: Buffer | string) => {
        const text = pending[stream] + chunk.toString();
        const parts = text.split(/\r?\n/);
        pending[stream] = parts.pop() ?? '';
        parts.filter(Boolean).forEach(line => {
            tail.push(line);
            if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
        });
    };

    return new Promise(resolve => {
        let settled = false;
        let timedOut = false;
        let killTimer: NodeJS.Timeout | undefined;
        const child = spawn(command as string, args as string[], {
            cwd,
            env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${COLLECTOR_HEAP_MB}` },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
        });
        const killGroup = (signal: NodeJS.Signals) => {
            try {
                if (child.pid) process.kill(-child.pid, signal);
            } catch {
                child.kill(signal);
            }
        };
        const timeout = setTimeout(() => {
            timedOut = true;
            killGroup('SIGTERM');
            killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
        }, timeoutMs);
        const finish = (result: Omit<CollectorProcessResult, 'durationMs' | 'outputTail' | 'timedOut'>) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (killTimer) clearTimeout(killTimer);
            (['stdout', 'stderr'] as const).forEach(stream => {
                if (pending[stream]) pushLines(stream, '\n');
            });
            resolve({
                ...result,
                timedOut,
                durationMs: Date.now() - startedAt,
                outputTail: [...tail],
            });
        };

        child.stdout?.on('data', chunk => pushLines('stdout', chunk));
        child.stderr?.on('data', chunk => pushLines('stderr', chunk));
        child.on('error', error => finish({
            exitCode: null,
            signal: null,
            spawnError: errorCode(error) ?? error.name,
        }));
        child.on('close', (exitCode, signal) => finish({ exitCode, signal }));
    });
}

export interface PromotionScheduleDeps {
    database?: Database;
    lockDirectory?: string;
    cwd?: string;
    now?: () => Date;
    runCollector?: (options: { cwd: string; timeoutMs: number }) => Promise<CollectorProcessResult>;
    sendAlert?: (text: string) => Promise<boolean>;
    log?: (line: string) => void;
    collectorTimeoutMs?: number;
    staleCatalogMs?: number;
}

export type ScheduledCollectionOutcome = 'skipped-handover' | 'skipped-locked' | 'completed' | 'error';

/** One scheduled slot: gate, stale check, lock, collector child, alerts. Never throws. */
export async function runScheduledPromotionCollection(
    deps: PromotionScheduleDeps = {},
): Promise<ScheduledCollectionOutcome> {
    const database = deps.database ?? defaultDb;
    const now = deps.now ?? (() => new Date());
    const log = deps.log ?? ((line: string) => console.log(`${LOG_PREFIX} ${line}`));
    const sendAlert = deps.sendAlert ?? sendOpsAlert;
    const runCollector = deps.runCollector ?? runCollectorProcess;
    const lockDirectory = deps.lockDirectory ?? path.dirname(path.resolve(databasePath));
    const cwd = deps.cwd ?? process.cwd();

    try {
        if (!hasPromotionHandover(database)) {
            log('운영 이관 전이라 프로모션 수집을 건너뜁니다.');
            return 'skipped-handover';
        }

        const lastSucceeded = database.select({ finishedAt: promotionCollectionRuns.finishedAt })
            .from(promotionCollectionRuns)
            .where(eq(promotionCollectionRuns.status, 'SUCCEEDED'))
            .orderBy(desc(promotionCollectionRuns.finishedAt))
            .get();
        const staleAlert = describeStaleCatalogAlert(
            lastSucceeded?.finishedAt,
            now(),
            deps.staleCatalogMs ?? STALE_CATALOG_MS,
        );
        if (staleAlert) await sendAlert(staleAlert);

        const release = acquireCollectionLock(lockDirectory, now());
        if (!release) {
            log('다른 프로모션 수집이 진행 중이라 이번 차례는 건너뜁니다.');
            return 'skipped-locked';
        }
        log('수집 잠금을 잡고 프로모션 수집을 시작합니다.');

        try {
            const startedAt = now();
            const processResult = await runCollector({
                cwd,
                timeoutMs: deps.collectorTimeoutMs ?? COLLECTOR_TIMEOUT_MS,
            });
            log(
                `수집 프로세스 종료: 코드 ${processResult.exitCode ?? '-'}` +
                `${processResult.signal ? `, 신호 ${processResult.signal}` : ''}` +
                `${processResult.timedOut ? ', 시간 초과' : ''}` +
                `${processResult.spawnError ? `, 시작 실패 ${processResult.spawnError}` : ''}` +
                `, ${Math.round(processResult.durationMs / 1_000)}초`,
            );
            processResult.outputTail.forEach(line => log(`  ${line}`));

            const run = database.select().from(promotionCollectionRuns)
                .where(gte(
                    promotionCollectionRuns.startedAt,
                    new Date(startedAt.getTime() - RUN_START_SKEW_MS),
                ))
                .orderBy(desc(promotionCollectionRuns.finishedAt))
                .get();
            const recentStatuses = database.select({ status: promotionCollectionRuns.status })
                .from(promotionCollectionRuns)
                .orderBy(desc(promotionCollectionRuns.finishedAt))
                .limit(20)
                .all()
                .map(row => row.status);
            if (run) {
                log(`실행 기록: ${run.status}, 출처 ${run.successfulSourceCount}/${run.sourceCount}곳 성공`);
            }
            const alert = describeCollectionAlert({
                processResult,
                run,
                consecutiveFailures: countConsecutiveFailures(recentStatuses),
                failedLabels: parseFailedSourceLabels(processResult.outputTail),
            });
            if (alert) await sendAlert(alert);
        } finally {
            release();
            log('수집 잠금을 풀었습니다.');
        }
        return 'completed';
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log(`예상하지 못한 오류로 이번 수집을 마치지 못했습니다: ${reason}`);
        await sendAlert(`${ALERT_PREFIX} 프로모션 수집 스케줄러 오류로 이번 수집을 마치지 못했어요.`);
        return 'error';
    }
}

type ScheduleGlobal = typeof globalThis & {
    cherryPickerPromotionSchedule?: { timer?: NodeJS.Timeout; running: boolean };
};

const scheduleGlobal = globalThis as ScheduleGlobal;

/**
 * Arms the schedule once per server process. Times come from PROMOTION_SCHEDULE_TIMES
 * (Korea time) or default to 05:15 and 08:15; a malformed value falls back to the default.
 */
export function startPromotionSchedule(
    env: NodeJS.ProcessEnv = process.env,
    deps: PromotionScheduleDeps = {},
): boolean {
    if (!shouldStartPromotionSchedule(env) || scheduleGlobal.cherryPickerPromotionSchedule) return false;
    const log = deps.log ?? ((line: string) => console.log(`${LOG_PREFIX} ${line}`));
    const now = deps.now ?? (() => new Date());

    let times: ScheduleTime[];
    try {
        times = parseScheduleTimes(env.PROMOTION_SCHEDULE_TIMES);
    } catch (error) {
        log(`${error instanceof Error ? error.message : String(error)} 기본 시각(05:15, 08:15)을 씁니다.`);
        times = parseScheduleTimes(undefined);
    }

    const state: { timer?: NodeJS.Timeout; running: boolean } = { running: false };
    scheduleGlobal.cherryPickerPromotionSchedule = state;

    const arm = () => {
        const target = nextScheduledRun(now(), times);
        log(`다음 프로모션 수집: ${formatKst(target)}`);
        wait(target);
    };
    const wait = (target: Date) => {
        const remaining = target.getTime() - now().getTime();
        state.timer = setTimeout(() => {
            // Timers can wake a little early or late; only run once the slot has passed, so the
            // next slot computed afterwards is always a later one.
            if (now().getTime() < target.getTime()) {
                wait(target);
                return;
            }
            if (state.running) {
                arm();
                return;
            }
            state.running = true;
            void runScheduledPromotionCollection(deps).finally(() => {
                state.running = false;
                arm();
            });
        }, Math.max(0, Math.min(remaining, MAX_TIMER_MS)));
        state.timer.unref();
    };

    arm();
    return true;
}

/** Test helper: clears the armed timer so another start can run. */
export function stopPromotionSchedule(): void {
    const state = scheduleGlobal.cherryPickerPromotionSchedule;
    if (state?.timer) clearTimeout(state.timer);
    delete scheduleGlobal.cherryPickerPromotionSchedule;
}
