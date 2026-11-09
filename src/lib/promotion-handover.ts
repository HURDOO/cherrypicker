import { randomUUID } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
    backupLiveDatabase,
    CATALOG_ID_PATTERN,
    readMigrationTag,
    sha256Hex,
    stableStringify,
    syncDataDirectory,
} from '@/lib/catalog-sync-common';
import { HttpError } from '@/lib/http-error';

/*
 * One-time promotion handover: the promotion collection state built and reviewed on the Mac
 * (providers, products, offers, original documents, candidates with their review records and
 * AI results, run history) moves to production once. After that production is the only writer
 * and collects on its own. GoodDeal is production's own data and never moves.
 *
 * Rows travel as raw SQLite values, table by table, in gzip chunks small enough for the
 * ingress limit. Production checks every column against its own schema before inserting.
 */

export const GOODDEAL_PROVIDER_ID = 'kakaopay-gooddeal';
export const HANDOVER_SCHEMA_VERSION = 1;
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_CHUNK_JSON_BYTES = 160 * 1024 * 1024;
const DEFAULT_TARGET_CHUNK_JSON_BYTES = 12 * 1024 * 1024;

interface HandoverTable {
    name: string;
    /** Rows that stay behind: GoodDeal belongs to production. */
    exclude: string;
    mode: 'upsert' | 'insert';
    idColumn?: string;
    jsonColumns: string[];
}

// Parents before children so foreign keys hold inside the single commit transaction.
export const HANDOVER_TABLES: HandoverTable[] = [
    {
        name: 'promotion_providers',
        exclude: `id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'upsert',
        idColumn: 'id',
        jsonColumns: [],
    },
    {
        name: 'subscription_products',
        exclude: `provider_id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'upsert',
        idColumn: 'id',
        jsonColumns: ['aliases'],
    },
    {
        name: 'promotion_offers',
        exclude: `provider_id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'upsert',
        idColumn: 'id',
        jsonColumns: ['brand_ids', 'category_ids', 'channels', 'action', 'condition', 'compatibility', 'limit_config'],
    },
    {
        name: 'promotion_source_documents',
        exclude: `collection_source_id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'insert',
        idColumn: 'id',
        jsonColumns: ['response_metadata'],
    },
    {
        name: 'promotion_source_bundles',
        exclude: `collection_source_id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'insert',
        idColumn: 'id',
        jsonColumns: [],
    },
    {
        name: 'promotion_source_bundle_documents',
        exclude: `bundle_id in (select id from promotion_source_bundles where collection_source_id = '${GOODDEAL_PROVIDER_ID}')`,
        mode: 'insert',
        jsonColumns: [],
    },
    {
        name: 'promotion_candidates',
        exclude: `provider_id = '${GOODDEAL_PROVIDER_ID}'`,
        mode: 'insert',
        idColumn: 'id',
        jsonColumns: ['parsed_offer', 'diff', 'audit'],
    },
    {
        name: 'promotion_collection_runs',
        exclude: '0',
        mode: 'insert',
        idColumn: 'id',
        jsonColumns: [],
    },
];

const tableNames = HANDOVER_TABLES.map(table => table.name) as [string, ...string[]];

const manifestSchema = z.strictObject({
    schemaVersion: z.literal(HANDOVER_SCHEMA_VERSION),
    handoverId: z.uuid(),
    createdAt: z.iso.datetime(),
    sourceCommit: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
    migration: z.strictObject({
        count: z.number().int().nonnegative(),
        lastHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    }),
    tables: z.record(z.enum(tableNames), z.number().int().nonnegative()),
    chunks: z.array(z.strictObject({
        index: z.number().int().nonnegative(),
        table: z.enum(tableNames),
        rowCount: z.number().int().positive(),
        bytes: z.number().int().positive().max(MAX_CHUNK_BYTES),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })).max(10_000),
});

export type HandoverManifest = z.infer<typeof manifestSchema>;
type RawRow = Record<string, string | number | null>;

export interface HandoverChunk {
    index: number;
    table: string;
    rowCount: number;
    gzip: Buffer;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Mac side: the handover as gzip chunks plus the manifest that names and hashes them. */
export function exportPromotionHandover(
    client: Database.Database,
    options: { sourceCommit?: string | null; targetChunkJsonBytes?: number; now?: Date } = {},
): { manifest: HandoverManifest; chunks: HandoverChunk[] } {
    const target = options.targetChunkJsonBytes ?? DEFAULT_TARGET_CHUNK_JSON_BYTES;
    const chunks: HandoverChunk[] = [];
    const tables: Record<string, number> = {};
    const flush = (table: string, rows: string[]) => {
        if (rows.length === 0) return;
        const gzip = gzipSync(Buffer.from(`[${rows.join(',')}]`), { level: 9 });
        if (gzip.byteLength > MAX_CHUNK_BYTES) {
            throw new Error(`${table} 조각이 업로드 한도를 넘습니다. 조각 크기를 줄이세요.`);
        }
        chunks.push({ index: chunks.length, table, rowCount: rows.length, gzip });
    };

    HANDOVER_TABLES.forEach(table => {
        let rows: string[] = [];
        let size = 0;
        let count = 0;
        const statement = client.prepare(
            `select * from ${quote(table.name)} where not (${table.exclude}) order by rowid`,
        );
        for (const row of statement.iterate() as Iterable<RawRow>) {
            const text = JSON.stringify(row);
            if (rows.length > 0 && size + text.length > target) {
                flush(table.name, rows);
                rows = [];
                size = 0;
            }
            rows.push(text);
            size += text.length + 1;
            count += 1;
        }
        flush(table.name, rows);
        tables[table.name] = count;
    });

    return {
        manifest: {
            schemaVersion: HANDOVER_SCHEMA_VERSION,
            handoverId: randomUUID(),
            createdAt: (options.now ?? new Date()).toISOString(),
            sourceCommit: options.sourceCommit ?? null,
            migration: readMigrationTag(client),
            tables,
            chunks: chunks.map(chunk => ({
                index: chunk.index,
                table: chunk.table,
                rowCount: chunk.rowCount,
                bytes: chunk.gzip.byteLength,
                sha256: sha256Hex(chunk.gzip),
            })),
        },
        chunks,
    };
}

export function parseHandoverManifest(value: unknown): HandoverManifest {
    const parsed = manifestSchema.safeParse(value);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, `이관 목록 형식 오류: ${issue?.path.join('.') || '본문'} ${issue?.message ?? ''}`.trim());
    }
    const manifest = parsed.data;
    const order = new Map(HANDOVER_TABLES.map((table, index) => [table.name, index]));
    manifest.chunks.forEach((chunk, position) => {
        if (chunk.index !== position) throw new HttpError(400, '조각 번호가 0부터 이어지지 않습니다.');
        const previous = manifest.chunks[position - 1];
        if (previous && order.get(previous.table)! > order.get(chunk.table)!) {
            throw new HttpError(400, '조각이 표 순서대로 정렬되어 있지 않습니다.');
        }
    });
    HANDOVER_TABLES.forEach(table => {
        const declared = manifest.tables[table.name];
        if (declared === undefined) throw new HttpError(400, `${table.name} 건수가 없습니다.`);
        const inChunks = manifest.chunks
            .filter(chunk => chunk.table === table.name)
            .reduce((sum, chunk) => sum + chunk.rowCount, 0);
        if (inChunks !== declared) throw new HttpError(400, `${table.name} 건수와 조각 합계가 다릅니다.`);
    });
    return manifest;
}

interface HandoverContext {
    client: Database.Database;
    databasePath: string;
    now?: Date;
    reviewerId: string | null;
    backup?: () => Promise<string | undefined>;
}

const handoverRoot = (databasePath: string) =>
    path.join(syncDataDirectory(databasePath), 'catalog-sync');
const stagingDirectory = (databasePath: string, handoverId: string) => {
    if (!z.uuid().safeParse(handoverId).success) throw new HttpError(400, '이관 ID 형식이 올바르지 않습니다.');
    return path.join(handoverRoot(databasePath), 'promotion-handover', handoverId);
};
const completionPath = (databasePath: string) =>
    path.join(handoverRoot(databasePath), 'promotion-handover-completed.json');

const countWhere = (client: Database.Database, sql: string) =>
    (client.prepare(sql).get() as { count: number }).count;

/** Production already collects promotions itself once any non-GoodDeal collection state exists. */
export function productionPromotionState(client: Database.Database, databasePath: string) {
    const candidates = countWhere(
        client,
        `select count(*) as count from promotion_candidates where provider_id <> '${GOODDEAL_PROVIDER_ID}'`,
    );
    const documents = countWhere(
        client,
        `select count(*) as count from promotion_source_documents where collection_source_id <> '${GOODDEAL_PROVIDER_ID}'`,
    );
    const marker = completionPath(databasePath);
    return {
        empty: candidates === 0 && documents === 0,
        completed: existsSync(marker)
            ? JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>
            : null,
        candidates,
        documents,
    };
}

function assertReady(context: HandoverContext, manifest: HandoverManifest) {
    const state = productionPromotionState(context.client, context.databasePath);
    if (state.completed || !state.empty) {
        throw new HttpError(409, '운영에 이미 프로모션 수집 기록이 있어 이관하지 않습니다(1회만 가능).');
    }
    if (stableStringify(readMigrationTag(context.client)) !== stableStringify(manifest.migration)) {
        throw new HttpError(409, '운영과 이관 자료의 DB migration이 다릅니다. 같은 버전을 먼저 배포하세요.');
    }
    if (!context.reviewerId) {
        throw new HttpError(409, '운영 관리자 계정이 없어 검수 기록을 옮길 수 없습니다.');
    }
}

export function startPromotionHandover(context: HandoverContext, manifestValue: unknown) {
    const manifest = parseHandoverManifest(manifestValue);
    assertReady(context, manifest);
    const directory = stagingDirectory(context.databasePath, manifest.handoverId);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    return { handoverId: manifest.handoverId, chunkCount: manifest.chunks.length };
}

const readManifest = (databasePath: string, handoverId: string) => {
    const file = path.join(stagingDirectory(databasePath, handoverId), 'manifest.json');
    if (!existsSync(file)) throw new HttpError(404, '시작하지 않은 이관입니다.');
    return parseHandoverManifest(JSON.parse(readFileSync(file, 'utf8')));
};

const chunkPath = (databasePath: string, handoverId: string, index: number) =>
    path.join(stagingDirectory(databasePath, handoverId), `chunk-${index}.json.gz`);

export function storePromotionHandoverChunk(
    context: Pick<HandoverContext, 'databasePath'>,
    handoverId: string,
    index: number,
    body: Buffer,
) {
    const manifest = readManifest(context.databasePath, handoverId);
    const expected = manifest.chunks[index];
    if (!expected) throw new HttpError(404, '이관 목록에 없는 조각입니다.');
    if (body.byteLength !== expected.bytes || sha256Hex(body) !== expected.sha256) {
        throw new HttpError(400, '조각 hash가 이관 목록과 다릅니다.');
    }
    writeFileSync(chunkPath(context.databasePath, handoverId, index), body, { mode: 0o600 });
    return { index, stored: true };
}

interface ColumnInfo {
    name: string;
    type: string;
    notnull: number;
    pk: number;
}

function validateRows(
    table: HandoverTable,
    columns: ColumnInfo[],
    rows: unknown,
    reviewerId: string,
): RawRow[] {
    if (!Array.isArray(rows)) throw new HttpError(400, `${table.name} 조각이 배열이 아닙니다.`);
    const names = columns.map(column => column.name);
    const nameSet = new Set(names);
    return rows.map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new HttpError(400, `${table.name} 행 형식이 올바르지 않습니다.`);
        }
        const row = value as Record<string, unknown>;
        const keys = Object.keys(row);
        if (keys.length !== names.length || keys.some(key => !nameSet.has(key))) {
            throw new HttpError(400, `${table.name} 열이 운영 DB와 다릅니다.`);
        }
        columns.forEach(column => {
            const cell = row[column.name];
            const type = column.type.toUpperCase();
            if (cell === null) {
                if (column.notnull) throw new HttpError(400, `${table.name}.${column.name}는 비울 수 없습니다.`);
                return;
            }
            const ok = type.includes('INT')
                ? typeof cell === 'number' && Number.isSafeInteger(cell)
                : type.includes('REAL')
                    ? typeof cell === 'number' && Number.isFinite(cell)
                    : typeof cell === 'string';
            if (!ok) throw new HttpError(400, `${table.name}.${column.name} 값 형식이 올바르지 않습니다.`);
            if (table.jsonColumns.includes(column.name)) {
                try {
                    JSON.parse(cell as string);
                } catch {
                    throw new HttpError(400, `${table.name}.${column.name}가 JSON이 아닙니다.`);
                }
            }
        });
        if (table.idColumn && !CATALOG_ID_PATTERN.test(String(row[table.idColumn]))) {
            throw new HttpError(400, `${table.name} ID 형식이 올바르지 않습니다.`);
        }
        const touchesGoodDeal = [row.id, row.provider_id, row.collection_source_id]
            .includes(GOODDEAL_PROVIDER_ID);
        if (touchesGoodDeal && table.name !== 'promotion_source_bundle_documents') {
            throw new HttpError(400, '굿딜 자료는 이관하지 않습니다.');
        }
        // Review records point to the production admin; local accounts do not exist there.
        if (table.name === 'promotion_candidates' && row.reviewer_id !== null) {
            return { ...row, reviewer_id: reviewerId } as RawRow;
        }
        return row as RawRow;
    });
}

export interface HandoverCommitResult {
    handoverId: string;
    backup?: string;
    tables: Record<string, number>;
    reviewerRecords: number;
}

export async function commitPromotionHandover(context: HandoverContext, handoverId: string) {
    const manifest = readManifest(context.databasePath, handoverId);
    assertReady(context, manifest);
    manifest.chunks.forEach(chunk => {
        const file = chunkPath(context.databasePath, handoverId, chunk.index);
        if (!existsSync(file)) throw new HttpError(409, `${chunk.index}번 조각을 아직 받지 못했습니다.`);
        if (sha256Hex(readFileSync(file)) !== chunk.sha256) {
            throw new HttpError(409, `${chunk.index}번 조각이 손상되었습니다.`);
        }
    });
    const reviewerId = context.reviewerId!;
    const backup = context.backup
        ? await context.backup()
        : await backupLiveDatabase(context.client, context.databasePath, 'pre-promotion-handover', context.now);
    const tableByName = new Map(HANDOVER_TABLES.map(table => [table.name, table]));
    const written: Record<string, number> = Object.fromEntries(HANDOVER_TABLES.map(table => [table.name, 0]));
    let reviewerRecords = 0;

    context.client.transaction(() => {
        HANDOVER_TABLES.forEach(table => {
            const columns = context.client.prepare(`pragma table_info(${quote(table.name)})`).all() as ColumnInfo[];
            const names = columns.map(column => column.name);
            const insert = `insert into ${quote(table.name)} (${names.map(quote).join(', ')}) values (${names.map(() => '?').join(', ')})`;
            const statement = context.client.prepare(table.mode === 'upsert'
                ? `${insert} on conflict(${quote(table.idColumn!)}) do update set ${names
                    .filter(name => name !== table.idColumn)
                    .map(name => `${quote(name)} = excluded.${quote(name)}`)
                    .join(', ')}`
                : insert);
            manifest.chunks.filter(chunk => chunk.table === table.name).forEach(chunk => {
                const text = gunzipSync(readFileSync(chunkPath(context.databasePath, handoverId, chunk.index)), {
                    maxOutputLength: MAX_CHUNK_JSON_BYTES,
                }).toString('utf8');
                const rows = validateRows(tableByName.get(table.name)!, columns, JSON.parse(text), reviewerId);
                if (rows.length !== chunk.rowCount) throw new HttpError(400, `${chunk.index}번 조각의 행 수가 다릅니다.`);
                rows.forEach(row => {
                    statement.run(names.map(name => row[name]));
                    if (table.name === 'promotion_candidates' && row.reviewer_id !== null) reviewerRecords += 1;
                });
                written[table.name] += rows.length;
            });
            if (written[table.name] !== manifest.tables[table.name]) {
                throw new HttpError(400, `${table.name} 건수가 이관 목록과 달라 되돌렸습니다.`);
            }
        });
        const problems = context.client.pragma('foreign_key_check') as unknown[];
        if (problems.length > 0) {
            throw new HttpError(409, `이관 후 연결 오류 ${problems.length}건이 있어 되돌렸습니다.`);
        }
    })();

    const result: HandoverCommitResult = { handoverId, backup, tables: written, reviewerRecords };
    writeFileSync(
        completionPath(context.databasePath),
        JSON.stringify({ completedAt: (context.now ?? new Date()).toISOString(), ...result }),
        { mode: 0o600 },
    );
    rmSync(stagingDirectory(context.databasePath, handoverId), { recursive: true, force: true });
    return result;
}
