import { describe, expect, it } from 'vitest';
import {
    checkGoodDealGate,
    goodDealPromotions,
    goodDealSourceDocument,
    parseGoodDealUpload,
    type GoodDealObservation,
} from './gooddeal-observation';

const now = new Date('2026-10-20T00:00:00.000Z');

const brands = (count: number, prefix = '브랜드') =>
    Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

const observation = (
    names: string[],
    overrides: Partial<GoodDealObservation> = {},
): GoodDealObservation => ({
    observedAt: new Date('2026-10-19T23:30:00.000Z'),
    kakaopayVersion: '26.8.10',
    parserVersion: 2,
    items: names.map(brand => ({ brand, rate: 5 })),
    structure: [],
    ...overrides,
});

describe('parseGoodDealUpload', () => {
    const upload = {
        observedAt: '2026-10-20T08:30:00+09:00',
        kakaopayVersion: '26.8.10',
        parserVersion: 2,
        status: 'ok',
        reason: null,
        itemCount: 1,
        items: [{ brand: ' 투썸플레이스 ', rate: 20, boosted: false, isNew: false }],
        structure: ['items=124 badgeNodes=0', '113x <10 Button{t=I,x.chromeRole=button}'],
    };

    it('keeps the brands, rates and text-free structure of a successful observation', () => {
        expect(parseGoodDealUpload(upload)).toEqual({
            observedAt: new Date('2026-10-19T23:30:00.000Z'),
            kakaopayVersion: '26.8.10',
            parserVersion: 2,
            items: [{ brand: '투썸플레이스', rate: 20 }],
            structure: upload.structure,
        });
    });

    it('rejects failed observations, personal markers and structure lines with text', () => {
        expect(() => parseGoodDealUpload({ ...upload, status: 'failed' }))
            .toThrow('성공한 관측만');
        expect(() => parseGoodDealUpload({
            ...upload,
            items: [{ brand: '홍길동님을 위한 추천', rate: 5 }],
        })).toThrow('개인 표시');
        expect(() => parseGoodDealUpload({ ...upload, structure: ['투썸플레이스 20% 할인'] }))
            .toThrow('구조 요약');
        expect(parseGoodDealUpload({ ...upload, structure: ['1x 10+ View{t=혜택}'] }).structure)
            .toEqual(['1x 10+ View{t=혜택}']);
    });
});

describe('checkGoodDealGate', () => {
    it('accepts a first observation of a plausible size and a small weekly change', () => {
        const first = brands(108);
        expect(checkGoodDealGate(observation(first), { now })).toEqual([]);
        expect(checkGoodDealGate(
            observation([...first.slice(1), '새 브랜드', '또 새 브랜드']),
            { now, previousBrands: first },
        )).toEqual([]);
    });

    it('holds observations that look like a broken parser', () => {
        const previous = brands(108);
        expect(checkGoodDealGate(observation(brands(20)), { now })).toEqual([
            '첫 반영 항목 수가 50~300개 밖입니다: 20개',
        ]);
        expect(checkGoodDealGate(
            observation([...previous, ...brands(14, '추천')]),
            { now, previousBrands: previous },
        )).toEqual(['항목 수가 직전 반영본(108개)과 10% 넘게 다릅니다: 122개']);
        expect(checkGoodDealGate(
            observation([...brands(100), ...brands(8, '다른')]),
            { now, previousBrands: previous },
        )).toEqual(['직전 반영 브랜드 중 93%만 남았습니다.']);
        expect(checkGoodDealGate(
            observation([...previous.slice(0, 107), '브랜드 1']),
            { now, previousBrands: previous },
        )).toEqual(['같은 브랜드가 두 번 있습니다: 브랜드 1']);
    });

    it('holds unknown parsers, odd rates and observations out of order or out of time', () => {
        const names = brands(108);
        const odd = observation(names, {
            parserVersion: 1,
            items: names.map((brand, index) => ({ brand, rate: index === 0 ? 80 : 5 })),
        });
        expect(checkGoodDealGate(odd, { now })).toEqual([
            '알 수 없는 파서 버전입니다: v1',
            '할인율이 1~50% 밖입니다: 브랜드1 80%',
        ]);
        expect(checkGoodDealGate(observation(names, {
            observedAt: new Date('2026-10-20T00:10:00.000Z'),
        }), { now })).toEqual(['관측 시각이 미래입니다.']);
        expect(checkGoodDealGate(observation(names, {
            observedAt: new Date('2026-10-18T23:00:00.000Z'),
        }), { now })).toEqual(['관측한 지 24시간이 지났습니다.']);
        expect(checkGoodDealGate(observation(names), {
            now,
            latestObservedAt: new Date('2026-10-19T23:30:00.000Z'),
        })).toEqual(['이미 받은 관측보다 오래된 기록입니다.']);
    });
});

describe('goodDealPromotions', () => {
    it('publishes each brand as offline information that never enters a total', () => {
        const [twosome, unknown] = goodDealPromotions(observation(['투썸플레이스', '노랑통닭']));
        expect(twosome).toMatchObject({
            sourceKey: 'gooddeal:투썸플레이스',
            evidence: '투썸플레이스 5% 할인',
            autoPublish: true,
            offer: {
                providerId: 'kakaopay-gooddeal',
                brandIds: ['twosome'],
                channels: ['OFFLINE'],
                action: { type: 'PERCENT', value: 5 },
                condition: {
                    applicabilityScope: 'STORE_WIDE',
                    calculationMode: 'INFORMATION_ONLY',
                },
                compatibility: { requiredPayProviderIds: ['kakaopay-gooddeal'] },
            },
        });
        expect(twosome.discoveredBrand).toBeUndefined();
        expect(unknown.discoveredBrand).toMatchObject({ name: '노랑통닭', categoryId: 'food' });
        expect(unknown.offer.brandIds).toEqual([unknown.discoveredBrand!.id]);
    });

    it('stores each item as an evidence line next to the gate result', () => {
        const document = goodDealSourceDocument(observation(['투썸플레이스']), ['보류 이유']);
        expect(document.extractedText).toBe('투썸플레이스 5% 할인');
        expect(document.responseMetadata.appObservation).toMatchObject({
            parserVersion: 2,
            itemCount: 1,
            gate: { passed: false, reasons: ['보류 이유'] },
        });
        expect(goodDealSourceDocument(observation(['투썸플레이스']), []).contentHash)
            .toBe(document.contentHash);
    });
});
