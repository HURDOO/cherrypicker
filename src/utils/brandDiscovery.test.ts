import { describe, expect, it } from 'vitest';
import type { Brand, TransactionHistory } from '@/types';
import { INITIAL_BRANDS } from './seedData';
import {
    BRAND_BROWSE_GROUPS,
    getBrandBrowseGroupId,
    getBrandIndexKeys,
    getKoreanInitials,
    getNearbyBrandIds,
    LATIN_BRAND_INDEX_KEYS,
    normalizeBrandSearch,
    parseBrandDiscoveryPreferences,
    rankBrands,
    searchAndRankBrands,
    toCoarseLocation,
} from './brandDiscovery';

const brands: Brand[] = [
    { id: 'baskin_robbins', name: '배스킨라빈스', categoryId: 'cafe' },
    { id: 'gs25', name: 'GS25', categoryId: 'convenience' },
    { id: 'daiso', name: '다이소', categoryId: 'life' },
];

const transaction = (
    brandId: string,
    date: string,
    id: number
): TransactionHistory => ({
    id,
    brandId,
    date,
    amount: 10_000,
    discountAmount: 1_000,
});

describe('brand discovery search', () => {
    it('normalizes case, spacing, and punctuation', () => {
        expect(normalizeBrandSearch(' GS 25! ')).toBe('gs25');
    });

    it('extracts Korean initials', () => {
        expect(getKoreanInitials('배스킨라빈스')).toBe('ㅂㅅㅋㄹㅂㅅ');
    });

    it.each(['배라', '베라', 'ㅂㅅㅋ'])(
        'finds a brand with alias or initials: %s',
        query => {
            const ranked = rankBrands(brands, [], []);
            const results = searchAndRankBrands(ranked, query);
            expect(results[0]?.brand.id).toBe('baskin_robbins');
            expect(results).toHaveLength(1);
        }
    );

    it('prefers an exact normalized match', () => {
        const expandedBrands = [
            ...brands,
            { id: 'gs25_event', name: 'GS25 행사상품', categoryId: 'convenience' },
        ];
        const ranked = rankBrands(expandedBrands, [], []);
        expect(searchAndRankBrands(ranked, 'GS 25')[0]?.brand.id).toBe('gs25');
    });

    it('indexes an English brand under both its letter and Korean alias', () => {
        const cu: Brand = { id: 'cu', name: 'CU', categoryId: 'convenience' };
        const gs25: Brand = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };

        expect(getBrandIndexKeys(cu)).toEqual(expect.arrayContaining(['C', 'ㅅ']));
        expect(getBrandIndexKeys(cu)).not.toContain('ㅆ');
        expect(getBrandIndexKeys(gs25)).toEqual(expect.arrayContaining(['G', 'ㅈ']));
    });

    it('keeps a fixed non-scrolling English index order', () => {
        expect(LATIN_BRAND_INDEX_KEYS).toHaveLength(27);
        expect(LATIN_BRAND_INDEX_KEYS.slice(0, 7)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
        expect(LATIN_BRAND_INDEX_KEYS.at(-1)).toBe('0-9');
    });

    it('does not index a brand by consonants inside its official name', () => {
        const netflix: Brand = {
            id: 'netflix',
            name: '넷플릭스',
            categoryId: 'subscription',
        };
        const naverPlus: Brand = {
            id: 'naver_plus',
            name: '네이버플러스 멤버십',
            categoryId: 'subscription',
        };

        expect(getBrandIndexKeys(netflix)).toContain('ㄴ');
        expect(getBrandIndexKeys(netflix)).not.toContain('ㅅ');
        expect(getBrandIndexKeys(naverPlus)).toContain('ㄴ');
        expect(getBrandIndexKeys(naverPlus)).not.toContain('ㅅ');
    });

    it.each(['씨유', '시유', 'c'])('finds CU by alias or English prefix: %s', query => {
        const cu: Brand = { id: 'cu', name: 'CU', categoryId: 'convenience' };
        const ranked = rankBrands([cu], [], []);

        expect(searchAndRankBrands(ranked, query)[0]?.brand.id).toBe('cu');
    });
});

describe('brand browse groups', () => {
    it('merges source categories into clear payment contexts', () => {
        expect(getBrandBrowseGroupId({ id: 'baemin', categoryId: 'delivery' })).toBe('food');
        expect(getBrandBrowseGroupId({ id: 'google_play', categoryId: 'shopping' })).toBe('digital');
        expect(getBrandBrowseGroupId({ id: 'interpark_ticket', categoryId: 'shopping' })).toBe('leisure');
        expect(getBrandBrowseGroupId({ id: 'toeic', categoryId: 'shopping' })).toBe('study');
        expect(getBrandBrowseGroupId({ id: 'military_px', categoryId: 'etc' })).toBe('etc');
    });

    it('defines a unique visible label for every browse group', () => {
        expect(new Set(BRAND_BROWSE_GROUPS.map(group => group.id)).size).toBe(BRAND_BROWSE_GROUPS.length);
        expect(BRAND_BROWSE_GROUPS.every(group => group.label && group.shortLabel && group.hint)).toBe(true);
    });

    it('places every seeded brand into one of the visible browse groups', () => {
        const groupIds = new Set(BRAND_BROWSE_GROUPS.map(group => group.id));
        const assignedGroups = INITIAL_BRANDS.map(brand => getBrandBrowseGroupId({
            id: brand.id,
            categoryId: brand.category_id,
        }));

        expect(assignedGroups).toHaveLength(INITIAL_BRANDS.length);
        expect(assignedGroups.every(groupId => groupIds.has(groupId))).toBe(true);
        expect(new Set(assignedGroups)).toEqual(groupIds);
    });
});

describe('brand discovery ranking', () => {
    it('combines favorite, recency, frequency, and popularity scores', () => {
        const history = [
            transaction('daiso', '2026-08-06T00:00:00.000Z', 1),
            transaction('daiso', '2026-08-05T00:00:00.000Z', 2),
            transaction('gs25', '2026-06-01T00:00:00.000Z', 3),
        ];
        const ranked = rankBrands(
            brands,
            history,
            ['baskin_robbins'],
            new Date('2026-08-08T00:00:00.000Z')
        );

        expect(ranked.map(item => item.brand.id)).toEqual([
            'baskin_robbins',
            'daiso',
            'gs25',
        ]);
        expect(ranked[0].meta.score).toBe(110);
        expect(ranked[1].meta.score).toBe(70);
        expect(ranked[2].meta.score).toBe(15);
    });
});

describe('nearby brand history', () => {
    it('keeps only recent unique brands within the radius', () => {
        const current = toCoarseLocation(37.5665, 126.9780);
        const result = getNearbyBrandIds([
            { brandId: 'daiso', ...current, usedAt: '2026-08-07T00:00:00.000Z' },
            { brandId: 'gs25', ...current, usedAt: '2026-08-08T00:00:00.000Z' },
            { brandId: 'gs25', ...current, usedAt: '2026-08-01T00:00:00.000Z' },
            { brandId: 'cu', latitude: 35.18, longitude: 129.08, usedAt: '2026-08-08T00:00:00.000Z' },
        ], current);

        expect(result).toEqual(['gs25', 'daiso']);
    });
});

describe('brand discovery preferences', () => {
    it('keeps older saved preferences compatible with the default view', () => {
        expect(parseBrandDiscoveryPreferences(JSON.stringify({
            favoriteBrandIds: ['cu'],
            locationVisits: [],
        }))).toEqual({
            favoriteBrandIds: ['cu'],
            locationVisits: [],
            defaultViewMode: 'default',
        });
    });

    it.each(['default', 'name', 'category'] as const)(
        'restores the saved %s view mode',
        defaultViewMode => {
            expect(parseBrandDiscoveryPreferences(JSON.stringify({
                favoriteBrandIds: [],
                locationVisits: [],
                defaultViewMode,
            })).defaultViewMode).toBe(defaultViewMode);
        }
    );

    it('falls back safely when the saved view mode is invalid', () => {
        expect(parseBrandDiscoveryPreferences(JSON.stringify({
            defaultViewMode: 'unknown',
        })).defaultViewMode).toBe('default');
    });
});
