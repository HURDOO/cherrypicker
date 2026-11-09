import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './catalog-sync-common';
import {
    commitPromotionHandover,
    exportPromotionHandover,
    startPromotionHandover,
    storePromotionHandoverChunk,
    type HandoverManifest,
} from './promotion-handover';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const migrated = () => {
    const client = new Database(':memory:');
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        client.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    client.pragma('foreign_keys = ON');
    return client;
};

const now = 1_793_000_000_000;

const addProvider = (client: Database.Database, id: string) => client.prepare(
    `insert into promotion_providers (id, name, kind, source_url, is_active, sort_order)
     values (?, ?, 'TELECOM', 'https://example.com', 1, 0)`,
).run(id, id);

const addOffer = (client: Database.Database, id: string, providerId: string) => client.prepare(
    `insert into promotion_offers (id, provider_id, layer, title, description, brand_ids, category_ids,
       channels, action, condition, compatibility, limit_config, certainty, status, source_url,
       created_at, updated_at)
     values (?, ?, 'DISCOUNT', ?, '', '["cu"]', '[]', '["OFFLINE"]', '{"type":"PERCENT","value":10}',
       '{}', '{}', '{}', 'CONFIRMED', 'PUBLISHED', 'https://example.com', ?, ?)`,
).run(id, providerId, id, now, now);

const addDocumentAndBundle = (client: Database.Database, sourceId: string, suffix: string) => {
    client.prepare(
        `insert into promotion_source_documents (id, collection_source_id, source_url, media_type,
           content_hash, version, raw_content, extracted_text, response_metadata, collected_at)
         values (?, ?, 'https://example.com/list', 'text/html', ?, 1, ?, '', '{}', ?)`,
    ).run(`doc-${suffix}`, sourceId, `hash-${suffix}`, `<html>${'원문 '.repeat(200)}</html>`, now);
    client.prepare(
        `insert into promotion_source_bundles (id, collection_source_id, source_bundle_hash, collected_at)
         values (?, ?, ?, ?)`,
    ).run(`bundle-${suffix}`, sourceId, `bundle-hash-${suffix}`, now);
    client.prepare(
        'insert into promotion_source_bundle_documents (bundle_id, document_id) values (?, ?)',
    ).run(`bundle-${suffix}`, `doc-${suffix}`);
};

const addCandidate = (
    client: Database.Database,
    id: string,
    providerId: string,
    linkedPromotionId: string,
    reviewerId: string | null,
) => client.prepare(
    `insert into promotion_candidates (id, provider_id, source_url, source_hash, source_title, raw_content,
       parsed_offer, diff, source_bundle_hash, audit, status, linked_promotion_id, reviewer_id,
       discovered_at, reviewed_at)
     values (?, ?, 'https://example.com/list', ?, '제목', '본문', '{}', '{"semanticAnalysis":{"x":1}}', '',
       null, 'APPROVED', ?, ?, ?, ?)`,
).run(id, providerId, `hash-${id}`, linkedPromotionId, reviewerId, now, reviewerId ? now : null);

const addUser = (client: Database.Database, id: string) => client.prepare(
    'insert into "user" (id, name, email) values (?, ?, ?)',
).run(id, id, `${id}@example.com`);

function localCatalog() {
    const client = migrated();
    addUser(client, 'local-reviewer');
    ['skt', 'naverpay', 'kakaopay-gooddeal'].forEach(id => addProvider(client, id));
    Array.from({ length: 12 }, (_, index) => addOffer(client, `promotion-auto-skt-${index}`, 'skt'));
    addOffer(client, 'promotion-auto-gooddeal-local', 'kakaopay-gooddeal');
    addDocumentAndBundle(client, 'skt-membership', 'skt');
    addDocumentAndBundle(client, 'kakaopay-gooddeal', 'gooddeal');
    Array.from({ length: 12 }, (_, index) => addCandidate(
        client,
        `candidate-skt-${index}`,
        'skt',
        `promotion-auto-skt-${index}`,
        index % 2 === 0 ? 'local-reviewer' : null,
    ));
    addCandidate(client, 'candidate-gooddeal-local', 'kakaopay-gooddeal', 'promotion-auto-gooddeal-local', null);
    client.prepare(
        `insert into promotion_collection_runs (id, status, started_at, finished_at, source_count,
           successful_source_count, failed_source_count, skipped_source_count, discovered_count,
           published_count, review_required_count, unchanged_count, expired_count)
         values ('run-1', 'SUCCEEDED', ?, ?, 3, 3, 0, 0, 12, 12, 0, 0, 0)`,
    ).run(now, now);
    return client;
}

function productionCatalog() {
    const client = migrated();
    addUser(client, 'prod-admin');
    ['skt', 'kakaopay-gooddeal'].forEach(id => addProvider(client, id));
    addOffer(client, 'promotion-auto-gooddeal-prod', 'kakaopay-gooddeal');
    addDocumentAndBundle(client, 'kakaopay-gooddeal', 'gooddeal-prod');
    addCandidate(client, 'candidate-gooddeal-prod', 'kakaopay-gooddeal', 'promotion-auto-gooddeal-prod', null);
    return client;
}

const context = (client: Database.Database, reviewerId: string | null = 'prod-admin') => ({
    client,
    databasePath: join(mkdtempSync(join(tmpdir(), 'cherrypicker-handover-')), 'cherrypicker.db'),
    reviewerId,
    backup: async () => 'test-backup.db',
});

const sendAll = (
    target: ReturnType<typeof context>,
    manifest: HandoverManifest,
    chunks: ReturnType<typeof exportPromotionHandover>['chunks'],
) => {
    startPromotionHandover(target, manifest);
    chunks.forEach(chunk => storePromotionHandoverChunk(target, manifest.handoverId, chunk.index, chunk.gzip));
};

const count = (client: Database.Database, sql: string) =>
    (client.prepare(sql).get() as { count: number }).count;

describe('promotion handover', () => {
    it('moves the collection state once, maps reviewers to the admin and leaves GoodDeal alone', async () => {
        const { manifest, chunks } = exportPromotionHandover(localCatalog(), { targetChunkJsonBytes: 2_000 });
        expect(manifest.tables).toMatchObject({
            promotion_providers: 2,
            promotion_offers: 12,
            promotion_source_documents: 1,
            promotion_source_bundle_documents: 1,
            promotion_candidates: 12,
            promotion_collection_runs: 1,
        });
        expect(chunks.length).toBeGreaterThan(HANDOVER_TABLE_COUNT);

        const production = productionCatalog();
        const target = context(production);
        sendAll(target, manifest, chunks);
        const result = await commitPromotionHandover(target, manifest.handoverId);

        expect(result).toMatchObject({ backup: 'test-backup.db', reviewerRecords: 6 });
        expect(count(production, "select count(*) as count from promotion_candidates where provider_id = 'skt'"))
            .toBe(12);
        expect(count(production, "select count(*) as count from promotion_candidates where reviewer_id = 'prod-admin'"))
            .toBe(6);
        expect(count(production, "select count(*) as count from promotion_candidates where provider_id = 'kakaopay-gooddeal'"))
            .toBe(1);
        expect(count(production, "select count(*) as count from promotion_offers where id = 'promotion-auto-gooddeal-local'"))
            .toBe(0);
        expect(count(production, "select count(*) as count from promotion_offers where id = 'promotion-auto-gooddeal-prod'"))
            .toBe(1);
        expect(existsSync(join(target.databasePath, '..', 'catalog-sync', 'promotion-handover', manifest.handoverId)))
            .toBe(false);
        expect(existsSync(join(target.databasePath, '..', 'catalog-sync', 'promotion-handover-completed.json')))
            .toBe(true);

        const second = exportPromotionHandover(localCatalog());
        expect(() => startPromotionHandover(target, second.manifest)).toThrow('1회만');
    });

    it('rejects a chunk whose bytes do not match the manifest', () => {
        const { manifest, chunks } = exportPromotionHandover(localCatalog());
        const target = context(productionCatalog());
        startPromotionHandover(target, manifest);
        expect(() => storePromotionHandoverChunk(
            target,
            manifest.handoverId,
            0,
            Buffer.concat([chunks[0].gzip, Buffer.from('x')]),
        )).toThrow('hash');
        expect(() => storePromotionHandoverChunk(target, '../escape', 0, chunks[0].gzip)).toThrow('ID');
    });

    it('does not commit with a missing chunk, without an admin or with another migration', async () => {
        const local = localCatalog();
        const { manifest, chunks } = exportPromotionHandover(local);

        const missing = context(productionCatalog());
        startPromotionHandover(missing, manifest);
        storePromotionHandoverChunk(missing, manifest.handoverId, 0, chunks[0].gzip);
        await expect(commitPromotionHandover(missing, manifest.handoverId)).rejects.toThrow('조각');

        expect(() => startPromotionHandover(context(productionCatalog(), null), manifest)).toThrow('관리자');

        const otherVersion = productionCatalog();
        otherVersion.exec(`create table __drizzle_migrations (id integer primary key, hash text not null, created_at numeric);
            insert into __drizzle_migrations (hash, created_at) values ('${'b'.repeat(64)}', 1);`);
        expect(() => startPromotionHandover(context(otherVersion), manifest)).toThrow('migration');
    });

    it('rolls everything back when a row does not fit the production schema', async () => {
        const { manifest, chunks } = exportPromotionHandover(localCatalog());
        const offerChunk = chunks.find(chunk => chunk.table === 'promotion_offers')!;
        const tampered = gzipSync(Buffer.from(JSON.stringify(
            Array.from({ length: offerChunk.rowCount }, (_, index) => ({ id: `x-${index}`, injected: 1 })),
        )));
        const tamperedManifest: HandoverManifest = {
            ...manifest,
            chunks: manifest.chunks.map(chunk => chunk.index === offerChunk.index
                ? { ...chunk, bytes: tampered.byteLength, sha256: sha256Hex(tampered) }
                : chunk),
        };
        const production = productionCatalog();
        const target = context(production);
        startPromotionHandover(target, tamperedManifest);
        chunks.forEach(chunk => storePromotionHandoverChunk(
            target,
            manifest.handoverId,
            chunk.index,
            chunk.index === offerChunk.index ? tampered : chunk.gzip,
        ));
        await expect(commitPromotionHandover(target, manifest.handoverId)).rejects.toThrow('열');
        expect(count(production, "select count(*) as count from promotion_providers")).toBe(2);
        expect(count(production, "select count(*) as count from promotion_candidates")).toBe(1);
    });
});

const HANDOVER_TABLE_COUNT = 8;
