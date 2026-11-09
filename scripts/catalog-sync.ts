import './load-env';

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sqlite } from '../src/db';
import { buildCatalogReleaseBundle, parseCatalogReleaseBundle } from '../src/lib/catalog-release';
import { stableStringify } from '../src/lib/catalog-sync-common';
import { exportPromotionHandover, GOODDEAL_PROVIDER_ID } from '../src/lib/promotion-handover';

/**
 * Mac → production catalog sync (TASK-06). The token comes from CATALOG_SYNC_TOKEN in
 * .env.local and is never printed.
 *   npm run catalog:sync -- status --target=https://cherrypicker.app.hurdoo.kr
 *   npm run catalog:sync -- release --target=<url> [--dry-run] [--allow-shrink] [--bundle=<saved bundle>]
 *   npm run catalog:sync -- handover --target=<url>
 *   npm run catalog:sync -- verify --reference=<local server url> --target=<url>
 */

const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const command = process.argv[2];
const REQUEST_TIMEOUT_MS = 180_000;

function targetUrl(name = 'target') {
    const value = argument(name);
    if (!value) throw new Error(`--${name}=<https://...>가 필요합니다.`);
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) || /^192\.168\./.test(url.hostname);
    if (url.protocol !== 'https:' && !local) throw new Error('운영 주소는 https여야 합니다.');
    return url.origin;
}

function token() {
    const value = process.env.CATALOG_SYNC_TOKEN;
    if (!value || value.length < 32) throw new Error('.env.local에 CATALOG_SYNC_TOKEN(32자 이상)이 필요합니다.');
    return value;
}

function sourceCommit() {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

async function call(target: string, pathname: string, init: RequestInit = {}) {
    const response = await fetch(`${target}${pathname}`, {
        ...init,
        headers: { Authorization: `Bearer ${token()}`, ...init.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
        body = JSON.parse(text);
    } catch {
        // Keep the text; error pages are not JSON.
    }
    if (!response.ok) {
        const message = typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : text.slice(0, 300);
        throw new Error(`${pathname} ${response.status}: ${message}`);
    }
    return body;
}

const save = (folder: string, name: string, value: string | Buffer) => {
    const directory = path.resolve('backups', folder);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, name);
    writeFileSync(file, value, { mode: 0o600 });
    return path.relative(process.cwd(), file);
};

async function status() {
    console.log(JSON.stringify(await call(targetUrl(), '/api/catalog-sync/status'), null, 2));
}

async function release() {
    const target = targetUrl();
    const saved = argument('bundle');
    const bundle = saved
        ? parseCatalogReleaseBundle(JSON.parse(readFileSync(saved, 'utf8')))
        : buildCatalogReleaseBundle({ sourceCommit: sourceCommit(), allowShrink: flag('allow-shrink') });
    const published = bundle.content.cards.filter(entry => entry.card.catalogStatus === 'PUBLISHED').length;
    console.log(
        `Release ${bundle.releaseId}: ${bundle.content.cards.length} cards (${published} published), ` +
        `${bundle.content.brands.length} brands, hash ${bundle.contentHash.slice(0, 12)}`,
    );
    if (!saved) {
        console.log(`Saved bundle: ${save(
            'catalog-releases',
            `${bundle.createdAt.replace(/[:.]/g, '-')}-${bundle.releaseId}.json`,
            JSON.stringify(bundle),
        )}`);
    }
    const result = await call(target, `/api/catalog-sync/card-release${flag('dry-run') ? '?dryRun=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
    });
    console.log(JSON.stringify(result, null, 2));
}

async function handover() {
    const target = targetUrl();
    const { manifest, chunks } = exportPromotionHandover(sqlite, { sourceCommit: sourceCommit() });
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.gzip.byteLength, 0);
    console.log(
        `Handover ${manifest.handoverId}: ${chunks.length} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB gzip`,
    );
    Object.entries(manifest.tables).forEach(([table, count]) => console.log(`  ${table}: ${count}`));
    console.log(`Saved manifest: ${save('promotion-handover', `${manifest.handoverId}.json`, JSON.stringify(manifest))}`);

    await call(target, '/api/catalog-sync/promotion-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
    });
    for (const chunk of chunks) {
        await call(target, `/api/catalog-sync/promotion-handover/${manifest.handoverId}/chunks/${chunk.index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/gzip' },
            body: new Uint8Array(chunk.gzip),
        });
        process.stdout.write(`  sent ${chunk.index + 1}/${chunks.length}\r`);
    }
    console.log('');
    const result = await call(target, `/api/catalog-sync/promotion-handover/${manifest.handoverId}/commit`, {
        method: 'POST',
    });
    console.log(JSON.stringify(result, null, 2));
}

type CatalogItem = Record<string, unknown> & { id?: string; cardId?: string };
type Catalog = Record<string, CatalogItem[]>;

async function fetchCatalog(origin: string): Promise<Catalog> {
    const response = await fetch(`${origin}/api/catalog`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${origin}/api/catalog ${response.status}`);
    return await response.json() as Catalog;
}

const keyOf = (item: CatalogItem) => String(item.id ?? item.cardId ?? stableStringify(item));

function compare(label: string, reference: CatalogItem[], target: CatalogItem[], allowExtra: boolean) {
    const targetByKey = new Map(target.map(item => [keyOf(item), item]));
    const referenceKeys = new Set(reference.map(keyOf));
    const missing = reference.filter(item => !targetByKey.has(keyOf(item))).map(keyOf);
    const different = reference
        .filter(item => targetByKey.has(keyOf(item)) && stableStringify(item) !== stableStringify(targetByKey.get(keyOf(item))))
        .map(keyOf);
    const extra = target.filter(item => !referenceKeys.has(keyOf(item))).map(keyOf);
    const ok = missing.length === 0 && different.length === 0 && (allowExtra || extra.length === 0);
    console.log(
        `${ok ? 'OK ' : 'DIFF'} ${label}: reference ${reference.length}, target ${target.length}` +
        `${missing.length ? `, missing ${missing.length} (${missing.slice(0, 5).join(', ')})` : ''}` +
        `${different.length ? `, different ${different.length} (${different.slice(0, 5).join(', ')})` : ''}` +
        `${extra.length ? `, extra ${extra.length}${allowExtra ? ' (allowed)' : ` (${extra.slice(0, 5).join(', ')})`}` : ''}`,
    );
    return ok;
}

async function verify() {
    const [reference, target] = await Promise.all([
        fetchCatalog(targetUrl('reference')),
        fetchCatalog(targetUrl('target')),
    ]);
    const notGoodDeal = (items: CatalogItem[] = []) =>
        items.filter(item => item.providerId !== GOODDEAL_PROVIDER_ID && item.id !== GOODDEAL_PROVIDER_ID);
    // Brand browse state depends on which promotions exist, and production also has GoodDeal.
    const brandIdentity = (items: CatalogItem[] = []) => items.map(item => ({
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
    }));
    const results = [
        compare('categories', reference.categories ?? [], target.categories ?? [], false),
        compare('cards', reference.cards ?? [], target.cards ?? [], false),
        compare('rules', reference.rules ?? [], target.rules ?? [], false),
        compare('cardBenefitSupports', reference.cardBenefitSupports ?? [], target.cardBenefitSupports ?? [], false),
        compare('brands (id, name, category)', brandIdentity(reference.brands), brandIdentity(target.brands), true),
        compare('providers', notGoodDeal(reference.providers), notGoodDeal(target.providers), false),
        compare('subscriptionProducts', reference.subscriptionProducts ?? [], target.subscriptionProducts ?? [], false),
        compare('promotions (without GoodDeal)', notGoodDeal(reference.promotions), notGoodDeal(target.promotions), false),
    ];
    if (results.includes(false)) process.exitCode = 1;
}

const commands: Record<string, () => Promise<void>> = { status, release, handover, verify };

void (async () => {
    const run = command ? commands[command] : undefined;
    if (!run) throw new Error(`명령: ${Object.keys(commands).join(' | ')}`);
    await run();
})().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
