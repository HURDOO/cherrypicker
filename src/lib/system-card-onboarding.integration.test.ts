import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { publishedSystemCard } from './card-visibility';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let onboarding: typeof import('./system-card-onboarding');

const applyMigrations = () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;

    journal.entries.forEach(entry => {
        const migrationSql = readFileSync(
            resolve('drizzle', `${entry.tag}.sql`),
            'utf8',
        ).replaceAll('--> statement-breakpoint', '');
        sqlite.exec(migrationSql);
    });
    sqlite.pragma('foreign_keys = ON');
};

beforeAll(async () => {
    applyMigrations();
    vi.doMock('@/db', () => ({
        db: integrationDb,
        sqlite,
        databasePath: ':memory:',
    }));
    onboarding = await import('./system-card-onboarding');
});

afterAll(() => {
    vi.doUnmock('@/db');
    sqlite.close();
});

describe('system card onboarding', () => {
    it('rejects non-public and ambiguous official source URLs', () => {
        const baseInput = {
            id: 'test_card',
            name: '테스트 카드',
            company: '테스트카드',
            color: 'bg-blue-500',
            sources: [{
                label: '대표 출처',
                sourceUrl: 'https://127.0.0.1/card',
                sourceKind: 'PRODUCT_PAGE',
                candidateRole: 'PRIMARY',
                required: true,
                discoverLinkedPdfs: false,
            }],
        };

        expect(() => onboarding.parseSystemCardDraftInput(baseInput)).toThrow(
            '공개된 공식 사이트 URL만 등록할 수 있습니다.',
        );
        expect(() => onboarding.parseSystemCardDraftInput({
            ...baseInput,
            sources: [{
                ...baseInput.sources[0],
                sourceUrl: 'http://card.example.com/product',
            }],
        })).toThrow('HTTPS URL이어야 합니다.');
    });

    it('stores a managed card as a private draft with normalized source settings', () => {
        const input = onboarding.parseSystemCardDraftInput({
            id: 'test_card',
            name: '테스트 체크카드',
            company: '테스트카드',
            color: 'bg-violet-500',
            network: 'VISA',
            issueStatus: 'ACTIVE',
            issuerProductCode: 'TEST-001',
            catalogCaveat: '일부 선택 서비스는 별도 확인',
            sources: [
                {
                    label: '공식 상품 페이지',
                    sourceUrl: 'https://cards.example.co.kr/products/test#benefits',
                    sourceKind: 'PRODUCT_PAGE',
                    candidateRole: 'PRIMARY',
                    required: true,
                    discoverLinkedPdfs: true,
                },
                {
                    label: '상품 안내 PDF',
                    sourceUrl: 'https://files.example.co.kr/guides/test.pdf',
                    sourceKind: 'PRODUCT_GUIDE_PDF',
                    candidateRole: 'SUPPORTING',
                    required: false,
                    discoverLinkedPdfs: false,
                },
            ],
        });

        const created = onboarding.createSystemCardDraft(input);
        const storedCard = integrationDb.select().from(schema.cards)
            .all()
            .find(card => card.id === 'test_card');
        const storedSources = integrationDb.select().from(schema.cardBenefitSourceConfigs)
            .all()
            .filter(source => source.cardId === 'test_card');

        expect(created).toMatchObject({
            id: 'test_card',
            catalogStatus: 'DRAFT',
            issueStatus: 'ACTIVE',
            activeRevision: undefined,
        });
        expect(storedCard).toMatchObject({
            userId: null,
            catalogStatus: 'DRAFT',
            limitTable: [],
            issuerProductCode: 'TEST-001',
        });
        expect(integrationDb.select({ id: schema.cards.id }).from(schema.cards)
            .where(publishedSystemCard())
            .all()).not.toContainEqual({ id: 'test_card' });
        expect(storedSources).toHaveLength(2);
        expect(storedSources[0]).toMatchObject({
            candidateRole: 'PRIMARY',
            required: true,
            allowedHosts: ['example.co.kr'],
        });
        expect(storedSources[0].sourceUrl).not.toContain('#benefits');
        expect(onboarding.getManagedSystemCardBenefitSources('test_card')).toMatchObject([
            {
                label: '공식 상품 페이지',
                format: 'html',
                candidateRole: 'PRIMARY',
            },
            {
                label: '상품 안내 PDF',
                format: 'pdf',
                candidateRole: 'SUPPORTING',
            },
        ]);
        expect(onboarding.getManagedSystemCardBenefitSourceInventory()).toContainEqual(
            expect.objectContaining({
                cardId: 'test_card',
                revisionReviewEnabled: true,
            }),
        );
    });

    it('rejects duplicate IDs and duplicate issuer product codes', () => {
        const validSource = [{
            label: '대표 출처',
            sourceUrl: 'https://card.example.com/product',
            sourceKind: 'PRODUCT_PAGE',
            candidateRole: 'PRIMARY',
            required: true,
            discoverLinkedPdfs: false,
        }];
        const duplicateId = onboarding.parseSystemCardDraftInput({
            id: 'test_card',
            name: '다른 이름',
            company: '테스트카드',
            color: 'bg-blue-500',
            sources: validSource,
        });
        const duplicateProduct = onboarding.parseSystemCardDraftInput({
            id: 'other_card',
            name: '다른 이름',
            company: '테스트카드',
            issuerProductCode: 'TEST-001',
            color: 'bg-blue-500',
            sources: validSource,
        });

        expect(() => onboarding.createSystemCardDraft(duplicateId)).toThrow(
            '이미 같은 카드 ID가 존재합니다.',
        );
        expect(() => onboarding.createSystemCardDraft(duplicateProduct)).toThrow(
            '같은 카드사 상품 코드로 등록된 시스템 카드가 있습니다.',
        );
    });
});
