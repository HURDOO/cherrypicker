import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';

vi.mock('server-only', () => ({}));

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let catalogServer: typeof import('./benefit-catalog-server');

beforeAll(async () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        sqlite.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    sqlite.pragma('foreign_keys = ON');
    vi.doMock('@/db', () => ({ db: integrationDb, sqlite, databasePath: ':memory:' }));
    catalogServer = await import('./benefit-catalog-server');
});

afterAll(() => {
    vi.doUnmock('@/db');
    sqlite.close();
});

const rule = (id: string, cardId: string) => ({
    id,
    cardId,
    userId: null,
    category: 'cafe',
    includedBrands: [],
    excludedBrands: [],
    platformType: 'ALL' as const,
    usesCardLimit: false,
    description: `${id} 5% 할인`,
    detail: `${id} 5% 할인`,
    condition: {},
    action: { type: 'PERCENT' as const, value: 5 },
    limitConfig: {},
    isActive: true,
});

describe('public benefit catalog', () => {
    it('leaves out the rules of a card taken back to DRAFT', () => {
        integrationDb.insert(schema.categories).values({ id: 'cafe', name: '카페', userId: null, sortOrder: 0 }).run();
        integrationDb.insert(schema.cards).values([
            { id: 'pack_card', name: '팩 카드', company: '카드사', color: 'bg-blue-500', limitTable: [], userId: null },
            { id: 'retired_card', name: '이전 카드', company: '카드사', color: 'bg-blue-500', limitTable: [], userId: null },
        ]).run();
        integrationDb.insert(schema.benefitRules)
            .values([rule('pack_rule', 'pack_card'), rule('retired_rule', 'retired_card')])
            .run();
        integrationDb.update(schema.cards)
            .set({ catalogStatus: 'DRAFT' })
            .where(eq(schema.cards.id, 'retired_card'))
            .run();

        const snapshot = catalogServer.getBenefitCatalogSnapshot();

        expect(snapshot.cards.map(card => card.id)).toEqual(['pack_card']);
        expect(snapshot.rules.map(item => item.id)).toEqual(['pack_rule']);
    });
});
