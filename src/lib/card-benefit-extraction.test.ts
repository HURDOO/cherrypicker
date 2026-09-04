import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    BenefitRule,
    Card,
    CardBenefitEvidence,
    CardBenefitExtraction,
} from '@/types';
import {
    benefitClaimChecklistFrom,
    cardBenefitOpenAIExtractionSchema,
    cardBenefitOpenAIInventorySchema,
    completeDerivedRuleCoverage,
    completeInventoryExclusionChecklist,
    completeInventoryStackingChecklist,
    completeInventoryTransactionTargetChecklist,
    evidenceRepresentsBenefitClaim,
    extractShinhanSolTravelWithRules,
    normalizeInventoryBackedRuleSemantics,
    normalizeEvidenceBackedRuleMechanics,
    normalizeEvidenceBackedCardBenefitExtraction,
    normalizeInventoryReferences,
    OpenAICardBenefitExtractionProvider,
    repairInventoryQuotes,
    stabilizeExtractionRuleIds,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { calculateBestCards } from '@/utils/calculation';
import { shinhanSolSourceText } from '@/test/fixtures/shinhan-sol-source';

const card: Card = {
    id: 'shinhan_sol',
    name: '신한 SOL트래블 체크카드',
    company: '신한카드',
    color: 'bg-blue-400',
    limitTable: [],
    network: 'MASTERCARD',
};

const sourceText = shinhanSolSourceText;

const input = {
    card,
    sourceUrl: 'https://www.shinhancard.com/sol-travel',
    sourceText,
};

const references = {
    categoryIds: new Set(['cafe', 'etc', 'transport', 'convenience']),
    brandIds: new Set([
        'overseas_payment',
        'overseas_atm',
        'overseas_transport',
        'cu',
        'gs25',
        'seveneleven',
        'emart24',
        'transport_public',
        'cu_event',
        'airport_lounge',
        'master_travel_rewards',
        'japan_convenience',
        'vietnam_lottemart',
        'vietnam_grab',
        'usa_starbucks',
    ]),
};

const openAIResponse = (value: unknown) => ({
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    status: 'completed',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: 32_000,
    model: 'gpt-5.6-luna',
    output: [{
        id: 'msg_test',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{
            type: 'output_text',
            text: JSON.stringify(value),
            annotations: [],
            logprobs: [],
        }],
    }],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: 'medium', summary: null },
    store: false,
    temperature: 1,
    text: { format: { type: 'json_schema' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
    },
});

const toOpenAIExtraction = (
    extraction: ReturnType<typeof extractShinhanSolTravelWithRules>['extraction'],
) => {
    return {
        schemaVersion: extraction.schemaVersion,
        completeness: extraction.completeness,
        notes: extraction.notes,
        card: { ...extraction.card, network: extraction.card.network ?? null },
        rules: extraction.rules.map(rule => ({
        ...rule,
        category: rule.category ?? null,
        sharedGroupId: rule.sharedGroupId ?? null,
        condition: {
            minSpend: rule.condition.minSpend ?? null,
            maxSpend: rule.condition.maxSpend ?? null,
            maxSpendExclusive: rule.condition.maxSpendExclusive ?? null,
            minPerformance: rule.condition.minPerformance ?? null,
            startsAt: rule.condition.startsAt ?? null,
            endsAt: rule.condition.endsAt ?? null,
            daysOfWeek: rule.condition.daysOfWeek ?? null,
            timeRanges: rule.condition.timeRanges ?? null,
            requiredCardNetwork: rule.condition.requiredCardNetwork ?? null,
            performanceWaiver: rule.condition.performanceWaiver ?? null,
            confirmationRequired: rule.condition.confirmationRequired ?? null,
            stackableWithRuleIds: rule.condition.stackableWithRuleIds ?? null,
            applicationOrder: rule.condition.applicationOrder ?? null,
            manualCheckRequired: rule.condition.manualCheckRequired ?? null,
            requiredNote: rule.condition.requiredNote ?? null,
            itemSpecific: rule.condition.itemSpecific ?? null,
            eligibleItemSummary: rule.condition.eligibleItemSummary ?? null,
        },
        action: {
            ...rule.action,
            maxDiscount: rule.action.maxDiscount ?? null,
            amountBasis: rule.action.amountBasis ?? null,
        },
        limitConfig: {
            dailyCount: rule.limitConfig.dailyCount ?? null,
            dailyAmount: rule.limitConfig.dailyAmount ?? null,
            monthlyCount: rule.limitConfig.monthlyCount ?? null,
            yearlyCount: rule.limitConfig.yearlyCount ?? null,
            monthlyAmount: rule.limitConfig.monthlyAmount ?? null,
            monthlyAmountByPerformance: rule.limitConfig.monthlyAmountByPerformance ?? null,
            sharedFields: rule.limitConfig.sharedFields ?? null,
        },
        })),
    };
};

describe('card benefit extraction', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('tracks active PDF benefit lines and skips expired benefit groups', () => {
        const pageText = [
            '카타르항공 쿠폰 코드 입력 시 최대 15% 할인 (1. 1 ~ 10. 31)',
            '해외 렌터카 할인 – Hertz (1. 1 ~ 3. 31)',
            '• Hertz 프로모션 사이트 예약 시 10% 할인 및 추가 혜택 제공',
            '해외 렌터카 할인 - AVIS',
            '• AVIS 프로모션 사이트 예약 시 할인 혜택 제공',
            '프라이빗 이동 서비스 - movv',
            '• 인천공항 이동 : 이용금액에서 2만 5천원 할인',
        ].join('\n');
        const claims = benefitClaimChecklistFrom({
            card,
            sourceUrl: 'https://example.com/card',
            sourceText: pageText,
            sources: [{
                sourceUrl: 'https://example.com/guide.pdf',
                sourceText: pageText,
                mediaType: 'application/pdf',
                pageTexts: [pageText],
            }],
        }, new Date('2026-08-24T00:00:00+09:00')).map(claim => claim.quote);

        expect(claims).toEqual(expect.arrayContaining([
            expect.stringContaining('카타르항공'),
            expect.stringContaining('AVIS'),
            expect.stringContaining('2만 5천원 할인'),
        ]));
        expect(claims.some(claim => /Hertz/.test(claim))).toBe(false);
    });

    it('keeps a service heading as context for a following membership rate', () => {
        const pdfUrl = 'https://example.com/visa-platinum.pdf';
        const pageText = [
            '아시아 태평양 지역 공항 픽업 서비스 - TBR Global',
            '• 프로모션 전용 사이트에서 TBR Global 픽업 서비스 예약 시 할인 혜택 제공',
            '• 플래티늄 등급 : 10%',
            '트립쿠폰 이용 멤버십 7일권 무료 제공',
        ].join('\n');
        const claims = benefitClaimChecklistFrom({
            card,
            sourceUrl: pdfUrl,
            sourceText: pageText,
            sources: [{
                sourceUrl: pdfUrl,
                sourceText: pageText,
                mediaType: 'application/pdf',
                pageTexts: [pageText],
            }],
        }, new Date('2026-08-24T03:00:00Z'));
        const quotes = claims.map(claim => claim.quote);

        expect(quotes).toContain([
            '아시아 태평양 지역 공항 픽업 서비스 - TBR Global',
            '• 플래티늄 등급 : 10%',
        ].join('\n'));
        expect(quotes).toContain('트립쿠폰 이용 멤버십 7일권 무료 제공');
    });

    it('recognizes semantically equivalent and split benefit evidence', () => {
        const evidence: CardBenefitEvidence[] = [
            {
                id: 'limit',
                ruleIds: ['easy-pay'],
                fields: ['limitConfig'],
                quote: '월 최대 5천원까지 캐시백 제공',
                sourceUrl: 'https://example.com/card',
            },
            {
                id: 'service',
                ruleIds: ['airport'],
                fields: ['description'],
                quote: '공항 의전 할인 서비스 - yQ Meet&Assist',
                sourceUrl: 'https://example.com/guide.pdf',
            },
            {
                id: 'rate',
                ruleIds: ['airport'],
                fields: ['action'],
                quote: '• 플래티늄 등급 : 15%',
                sourceUrl: 'https://example.com/guide.pdf',
            },
        ];

        expect(evidenceRepresentsBenefitClaim(
            evidence,
            '최대 5천원 캐시백 제공',
        )).toBe(true);
        expect(evidenceRepresentsBenefitClaim(
            evidence,
            '공항 의전 할인 서비스 - yQ Meet&Assist\n• 플래티늄 등급 : 15%',
        )).toBe(true);

        const splitFuelEvidence: CardBenefitEvidence[] = [
            {
                id: 'soil',
                ruleIds: ['soil'],
                fields: ['description', 'action'],
                quote: 'S-OIL 리터 당 60원 적립',
                sourceUrl: 'https://example.com/card',
            },
            {
                id: 'oilbank',
                ruleIds: ['oilbank'],
                fields: ['description', 'action'],
                quote: '에이치디현대오일뱅크 리터 당 60원 적립',
                sourceUrl: 'https://example.com/card',
            },
            {
                id: 'fuel-limit',
                ruleIds: ['soil', 'oilbank'],
                fields: ['limitConfig'],
                quote: 'S-OIL 정유사별 월 2회, 주유금액 20만원까지 적립\n' +
                    '에이치디현대오일뱅크 정유사별 월 2회, 주유금액 20만원까지 적립',
                sourceUrl: 'https://example.com/card',
            },
        ];
        expect(evidenceRepresentsBenefitClaim(
            splitFuelEvidence,
            'S-Oil, 에이치디현대오일뱅크 리터당 60원 적립',
        )).toBe(true);
        expect(evidenceRepresentsBenefitClaim(
            splitFuelEvidence,
            '주유사별 월 2회, 주유금액 20만원까지 적립',
        )).toBe(true);
    });

    it('adds source-backed VISA scope evidence and promotes a split rate to action evidence', () => {
        const pdfUrl = 'https://example.com/visa-platinum.pdf';
        const networkQuote = '※ 발급 받으신 카드는 비자카드 Platinum 등급의 국제 브랜드 서비스가 제공됩니다.';
        const periodQuote = '※ 본 서비스는 이용기간 별도 표기한 경우 외에는 2026년 1월 1일 ~ 12월 31일까지';
        const benefitQuote = '공항 의전 할인 서비스 - yQ Meet&Assist';
        const rateQuote = '• 플래티늄 등급 : 15%';
        const pageText = [networkQuote, periodQuote, benefitQuote, rateQuote].join('\n');
        const scopedCard = { ...card, id: 'hey-young', network: 'VISA' as const };
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: scopedCard,
            rules: [{
                id: 'hey-young-airport',
                cardId: scopedCard.id,
                includedBrands: [],
                excludedBrands: [],
                platformType: 'OFFICIAL_SITE',
                usesCardLimit: false,
                description: 'VISA Platinum 공항 의전 15% 할인',
                detail: '',
                condition: {
                    startsAt: '2026-01-01',
                    endsAt: '2026-12-31',
                    requiredCardNetwork: 'VISA',
                },
                action: { type: 'PERCENT', value: 15 },
                limitConfig: {},
            }],
            evidence: [
                {
                    id: 'benefit',
                    ruleIds: ['hey-young-airport'],
                    fields: ['description'],
                    quote: benefitQuote,
                    sourceUrl: pdfUrl,
                    page: 1,
                },
                {
                    id: 'rate',
                    ruleIds: ['hey-young-airport'],
                    fields: ['condition'],
                    quote: rateQuote,
                    sourceUrl: pdfUrl,
                    page: 1,
                },
            ],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: scopedCard,
            sourceUrl: pdfUrl,
            sourceText: pageText,
            sources: [{
                sourceUrl: pdfUrl,
                sourceText: pageText,
                mediaType: 'application/pdf',
                pageTexts: [pageText],
            }],
        });

        expect(normalized.evidence.find(item => item.id === 'rate')?.fields)
            .toEqual(expect.arrayContaining(['condition', 'action']));
        expect(normalized.evidence.filter(item => item.id.startsWith('source-shared-condition')))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ quote: networkQuote, fields: ['condition'] }),
                expect.objectContaining({ quote: periodQuote, fields: ['condition'] }),
            ]));
    });

    it('splits a named offline merchant and removes an ambiguous subtype brand mapping', () => {
        const sourceUrl = 'https://example.com/card';
        const sourceText = [
            '생활 가맹점 : 올리브영, 다이소',
            '생활 가맹점 건당 1만원 이상 결제 시 1천원 캐시백',
            '다이소는 오프라인 매장에 한하여 캐시백이 적용됩니다.',
            'Trip.com 호텔 6% 항공 3% 할인',
            '마을/시내/시외/공항버스/지하철(고속버스 제외)',
            '간편결제(Pay)로 국내 이용 시 1% 캐시백',
        ].join('\n');
        const testCard = { ...card, id: 'channel-card' };
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: testCard,
            rules: [
                {
                    id: 'life',
                    cardId: testCard.id,
                    includedBrands: ['oliveyoung', 'daiso'],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: true,
                    description: '올리브영·다이소 1천원 캐시백',
                    detail: '',
                    condition: { minSpend: 10_000 },
                    action: { type: 'FLAT', value: 1_000 },
                    limitConfig: { dailyCount: 1, monthlyCount: 5 },
                },
                ...[6, 3].map((value, index) => ({
                    id: `trip-${index}`,
                    cardId: testCard.id,
                    includedBrands: ['trip'],
                    excludedBrands: [],
                    platformType: 'ONLINE' as const,
                    usesCardLimit: false,
                    description: `Trip.com ${index === 0 ? '호텔' : '항공'} ${value}% 할인`,
                    detail: '',
                    condition: { manualCheckRequired: true },
                    action: { type: 'PERCENT' as const, value },
                    limitConfig: {},
                })),
                {
                    id: 'transport',
                    cardId: testCard.id,
                    includedBrands: ['public-transport'],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: false,
                    description: '대중교통 5% 캐시백',
                    detail: '마을·시내·시외·공항버스 및 지하철 대상이며 고속버스는 제외됩니다.',
                    condition: {},
                    action: { type: 'PERCENT', value: 5 },
                    limitConfig: {},
                },
                {
                    id: 'easy-pay',
                    cardId: testCard.id,
                    category: 'shopping',
                    includedBrands: [],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: true,
                    description: '국내 간편결제 1% 캐시백',
                    detail: '',
                    condition: { manualCheckRequired: true },
                    action: { type: 'PERCENT', value: 1 },
                    limitConfig: {},
                },
            ],
            evidence: [
                {
                    id: 'life-evidence',
                    ruleIds: ['life'],
                    fields: ['description', 'action', 'condition', 'limitConfig'],
                    quote: sourceText.split('\n').slice(0, 3).join('\n'),
                    sourceUrl,
                },
                {
                    id: 'trip-evidence',
                    ruleIds: ['trip-0', 'trip-1'],
                    fields: ['description', 'action'],
                    quote: 'Trip.com 호텔 6% 항공 3% 할인',
                    sourceUrl,
                },
                {
                    id: 'transport-evidence',
                    ruleIds: ['transport'],
                    fields: ['description', 'condition', 'action'],
                    quote: '마을/시내/시외/공항버스/지하철(고속버스 제외)',
                    sourceUrl,
                },
                {
                    id: 'easy-pay-evidence',
                    ruleIds: ['easy-pay'],
                    fields: ['description', 'condition', 'action'],
                    quote: '간편결제(Pay)로 국내 이용 시 1% 캐시백',
                    sourceUrl,
                },
            ],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl,
            sourceText,
            catalog: {
                categories: [],
                brands: [
                    { id: 'oliveyoung', name: '올리브영', categoryId: 'life' },
                    { id: 'daiso', name: '다이소', categoryId: 'life' },
                    { id: 'trip', name: '트립닷컴', categoryId: 'travel' },
                    { id: 'public-transport', name: '버스/지하철', categoryId: 'transport' },
                ],
            },
        });

        expect(normalized.rules.find(rule => rule.id === 'life')).toMatchObject({
            includedBrands: ['oliveyoung'],
            description: '올리브영 1천원 캐시백',
            sharedGroupId: 'shared_life_merchant_channel',
        });
        expect(normalized.rules.find(rule => rule.id === 'life_daiso_offline')).toMatchObject({
            includedBrands: ['daiso'],
            platformType: 'OFFLINE',
            description: '다이소 1천원 캐시백',
            sharedGroupId: 'shared_life_merchant_channel',
        });
        expect(normalized.rules.filter(rule => rule.id.startsWith('trip-'))
            .every(rule => (rule.includedBrands ?? []).length === 0)).toBe(true);
        expect(normalized.evidence.find(item => item.id === 'life-evidence')?.ruleIds)
            .toContain('life_daiso_offline');
        expect(normalized.rules.find(rule => rule.id === 'transport')?.condition.requiredNote)
            .toBeUndefined();
        expect(normalized.rules.find(rule => rule.id === 'easy-pay')?.category)
            .toBeUndefined();
    });

    it('repairs mixed Korean money evidence, a no-performance tier, and one-sided stacking', () => {
        const sourceUrl = 'https://example.com/nori2';
        const sourceText = [
            '커피, 모바일, 문화 10% 할인',
            '커피 10% 할인 월 할인한도 3천원',
            '이동통신요금 건당 5만원 이상 결제 시 2,500원 할인 월 1회 할인한도 2천5백원',
            '놀이공원 건당 3만원 이상 결제 시 15,000원 할인 월 1회 할인한도 1만5천원',
            '전월 이용실적 구간별 통합할인은 상품설명서 참조',
            'KB Pay 결제 시 2% 추가 할인',
        ].join('\n');
        const testCard: Card = {
            ...card,
            id: 'kb_nori2_student',
            limitTable: [
                { threshold: 200_000, limit: 20_000 },
                { threshold: 0, limit: 0 },
            ],
        };
        const rule = (overrides: Partial<BenefitRule>): BenefitRule => ({
            id: 'rule',
            cardId: testCard.id,
            includedBrands: [],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: true,
            description: '혜택',
            detail: '',
            condition: {},
            action: { type: 'PERCENT', value: 10 },
            limitConfig: {},
            ...overrides,
        });
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: { ...testCard },
            rules: [
                rule({
                    id: 'coffee',
                    description: '커피 10% 할인',
                    limitConfig: { monthlyAmount: 3_000 },
                }),
                rule({
                    id: 'mobile',
                    description: '모바일 10% 할인',
                    condition: { minPerformance: 200_000 },
                    limitConfig: { monthlyAmount: 5_000 },
                }),
                rule({
                    id: 'culture',
                    description: '문화 10% 할인',
                    condition: { minPerformance: 200_000 },
                    limitConfig: { monthlyAmount: 7_000 },
                }),
                rule({
                    id: 'telecom',
                    description: '이동통신요금 2,500원 할인',
                    condition: { minSpend: 50_000, minPerformance: 200_000 },
                    action: { type: 'FLAT', value: 2_500 },
                    limitConfig: { monthlyCount: 1, monthlyAmount: 2_500 },
                }),
                rule({
                    id: 'amusement',
                    description: '놀이공원 15,000원 할인',
                    condition: { minSpend: 30_000, minPerformance: 200_000 },
                    action: { type: 'FLAT', value: 15_000 },
                    limitConfig: { monthlyCount: 1, monthlyAmount: 15_000 },
                }),
                rule({
                    id: 'kbpay',
                    description: 'KB Pay 2% 추가 할인',
                    condition: { stackableWithRuleIds: ['coffee'] },
                    action: { type: 'PERCENT', value: 2 },
                    limitConfig: { monthlyAmount: 3_000 },
                }),
            ],
            evidence: [
                {
                    id: 'coffee',
                    ruleIds: ['coffee'],
                    fields: ['description', 'action', 'limitConfig'],
                    quote: '커피 10% 할인 월 할인한도 3천원',
                    sourceUrl,
                },
                {
                    id: 'telecom',
                    ruleIds: ['telecom'],
                    fields: ['description', 'action'],
                    quote: '이동통신요금 건당 5만원 이상 결제 시 2,500원 할인 월 1회 할인한도 2천5백원',
                    sourceUrl,
                },
                {
                    id: 'amusement',
                    ruleIds: ['amusement'],
                    fields: ['description', 'action'],
                    quote: '놀이공원 건당 3만원 이상 결제 시 15,000원 할인 월 1회 할인한도 1만5천원',
                    sourceUrl,
                },
                {
                    id: 'kbpay',
                    ruleIds: ['kbpay'],
                    fields: ['description', 'action'],
                    quote: 'KB Pay 결제 시 2% 추가 할인',
                    sourceUrl,
                },
            ],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl,
            sourceText,
        });
        const byId = new Map(normalized.rules.map(ruleRow => [ruleRow.id, ruleRow]));

        expect(normalized.card.limitTable.find(tier => tier.threshold === 0)?.limit).toBe(3_000);
        expect(byId.get('coffee')?.condition.stackableWithRuleIds).toContain('kbpay');
        expect(normalized.evidence.find(item => item.id === 'telecom')?.fields)
            .toEqual(expect.arrayContaining(['condition', 'limitConfig']));
        expect(normalized.evidence.find(item => item.id === 'amusement')?.fields)
            .toEqual(expect.arrayContaining(['condition', 'limitConfig']));
        expect(evidenceRepresentsBenefitClaim(
            normalized.evidence,
            '커피, 모바일, 문화 10% 할인',
        )).toBe(true);
    });

    it('does not treat foreign-currency thresholds as won and strips informational amount caps', () => {
        const sourceUrl = 'https://example.com/travel';
        const testCard = { ...card, id: 'travel-card' };
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: testCard,
            rules: [
                {
                    id: 'yen-promotion',
                    cardId: testCard.id,
                    includedBrands: [],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: false,
                    description: '30,000엔 이상 20,000 포인트 적립',
                    detail: '일본 현지 이용금액 30,000엔 이상이면 제공됩니다.',
                    condition: { minSpend: 30_000, manualCheckRequired: true },
                    action: { type: 'FLAT', value: 20_000 },
                    limitConfig: {},
                },
                {
                    id: 'information',
                    cardId: testCard.id,
                    includedBrands: [],
                    excludedBrands: [],
                    platformType: 'ALL',
                    usesCardLimit: false,
                    description: '금액별 5~20% 수동 확인 혜택',
                    detail: '월 최대 5만원 한도입니다.',
                    condition: { manualCheckRequired: true },
                    action: { type: 'FLAT', value: 0 },
                    limitConfig: { monthlyAmount: 50_000 },
                },
            ],
            evidence: [
                {
                    id: 'yen',
                    ruleIds: ['yen-promotion'],
                    fields: ['description', 'condition', 'action'],
                    quote: '이용금액 30,000엔 이상 20,000 포인트 적립',
                    sourceUrl,
                },
                {
                    id: 'information',
                    ruleIds: ['information'],
                    fields: ['description', 'limitConfig'],
                    quote: '금액별 5~20% 할인, 월 최대 5만원',
                    sourceUrl,
                },
            ],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl,
            sourceText: extraction.evidence.map(item => item.quote).join('\n'),
        });
        const yenRule = normalized.rules.find(ruleRow => ruleRow.id === 'yen-promotion')!;
        const informationRule = normalized.rules.find(ruleRow => ruleRow.id === 'information')!;

        expect(yenRule.condition.minSpend).toBeUndefined();
        expect(yenRule.action).toMatchObject({ type: 'FLAT', value: 0 });
        expect(yenRule.condition.requiredNote).toContain('현지 통화');
        expect(informationRule.limitConfig.monthlyAmount).toBeUndefined();
        expect(informationRule.condition.requiredNote).toContain('자동 계산 한도');
    });

    it('repairs card-specific rules that would otherwise overcalculate or miss official channels', () => {
        const makeRule = (
            cardId: string,
            overrides: Partial<BenefitRule>,
        ): BenefitRule => ({
            id: 'rule',
            cardId,
            includedBrands: [],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description: '혜택',
            detail: '',
            condition: {},
            action: { type: 'PERCENT', value: 10, amountBasis: 'ORIGINAL_AMOUNT' },
            limitConfig: {},
            ...overrides,
        });
        const normalize = (
            cardId: string,
            rules: BenefitRule[],
            brands: Array<{ id: string; name: string; categoryId: string }> = [],
        ) => normalizeEvidenceBackedCardBenefitExtraction({
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: cardId,
                name: cardId,
                company: '테스트',
                limitTable: [],
            },
            rules,
            evidence: rules.map(ruleRow => ({
                id: `evidence-${ruleRow.id}`,
                ruleIds: [ruleRow.id],
                fields: ['description', 'condition', 'action', 'limitConfig'],
                quote: ruleRow.description,
                sourceUrl: 'https://example.com/card',
            })),
            notes: [],
        }, {
            card: {
                id: cardId,
                name: cardId,
                company: '테스트',
                color: 'bg-black',
                limitTable: [],
            },
            sourceUrl: 'https://example.com/card',
            sourceText: rules.map(ruleRow => ruleRow.description).join('\n'),
            catalog: { categories: [], brands },
        });

        const deepDream = normalize('shinhan_deep_dream', [
            makeRule('shinhan_deep_dream', {
                id: 'dd_challenge_dream',
                includedBrands: ['overseas_payment'],
                description: '챙겨드림 최다 이용 DREAM 영역 1.0% 적립',
                action: { type: 'PERCENT', value: 1 },
            }),
            makeRule('shinhan_deep_dream', {
                id: 'dd_welcome_points',
                category: 'etc',
                description: '반겨드림 3천 포인트 적립',
                condition: { minSpend: 800_000, manualCheckRequired: true },
                action: { type: 'FLAT', value: 3_000 },
            }),
        ]);
        expect(deepDream.rules.find(rule => rule.id === 'dd_challenge_dream')
            ?.includedBrands).toContain('telecom');
        expect(deepDream.rules.find(rule => rule.id === 'dd_welcome_points')).toMatchObject({
            condition: { manualCheckRequired: true },
            action: { value: 0 },
        });
        expect(deepDream.rules.find(rule => rule.id === 'dd_welcome_points')
            ?.condition.minSpend).toBeUndefined();

        const kbNara = normalize('kb_nara', [
            makeRule('kb_nara', {
                id: 'kb_nara_px',
                includedBrands: ['military_px', 'gs25'],
                description: '군마트(PX)·GS25 해군마트 10% 환급 할인',
            }),
            makeRule('kb_nara', {
                id: 'kb_nara_transport',
                includedBrands: ['transport_public'],
                description: '전국 버스·지하철 20% 청구 할인',
                condition: { startsAt: '2024-08-01' },
            }),
            makeRule('kb_nara', {
                id: 'kb_nara_kt_phone',
                category: 'etc',
                description: '군 KT공중전화 자동이체 10% 환급 할인',
                condition: { manualCheckRequired: true },
                limitConfig: { monthlyAmount: 10_000 },
            }),
        ]);
        expect(kbNara.rules.find(rule => rule.id === 'kb_nara_px')?.includedBrands)
            .toEqual(['military_px']);
        expect(kbNara.rules.find(rule => rule.id === 'kb_nara_transport')
            ?.condition.startsAt).toBeUndefined();
        expect(kbNara.rules.find(rule => rule.id === 'kb_nara_kt_phone')?.action.value)
            .toBe(0);

        const shinhanNara = normalize('shinhan_nara', [
            makeRule('shinhan_nara', {
                id: 'sh_nara_book',
                includedBrands: ['aladin'],
                platformType: 'OFFLINE',
                description: '알라딘 온라인 서점 5% 캐시백',
                action: { type: 'PERCENT', value: 5 },
            }),
            makeRule('shinhan_nara', {
                id: 'sh_nara_book_yes24_offline',
                includedBrands: ['yes24'],
                platformType: 'OFFLINE',
                description: 'YES24 온라인 서점 5% 캐시백',
                action: { type: 'PERCENT', value: 5 },
            }),
            makeRule('shinhan_nara', {
                id: 'sh_nara_fashion',
                includedBrands: ['29cm'],
                platformType: 'OFFLINE',
                description: '29CM 10% 캐시백',
            }),
            makeRule('shinhan_nara', {
                id: 'sh_nara_fashion_musinsa_offline',
                includedBrands: ['musinsa'],
                platformType: 'OFFLINE',
                description: '무신사 10% 캐시백',
            }),
            makeRule('shinhan_nara', {
                id: 'sh_nara_amusement',
                includedBrands: ['everland', 'lotte_world', 'seoul_land'],
                description: '테마파크별 자유이용권 50% 할인',
                condition: { itemSpecific: true },
                limitConfig: { dailyCount: 1, yearlyCount: 3 },
                action: { type: 'PERCENT', value: 50 },
            }),
        ]);
        expect(shinhanNara.rules.find(rule => rule.id === 'sh_nara_book')).toMatchObject({
            includedBrands: ['aladin', 'yes24'],
            platformType: 'OFFICIAL_SITE',
        });
        expect(shinhanNara.rules.some(rule => rule.id === 'sh_nara_book_yes24_offline'))
            .toBe(false);
        expect(shinhanNara.rules.find(rule => rule.id === 'sh_nara_fashion')).toMatchObject({
            includedBrands: ['musinsa', '29cm'],
            platformType: 'OFFICIAL_SITE',
        });
        expect(shinhanNara.rules.filter(rule => rule.id.startsWith('sh_nara_amusement'))
            .map(rule => rule.includedBrands)).toEqual([
            ['everland'],
            ['lotte_world'],
            ['seoul_land'],
        ]);

        const hanaNara = normalize('hana_nara', [
            makeRule('hana_nara', {
                id: 'hana_nara_cu_event',
                category: 'convenience',
                description: 'CU 행사품목 10% 현장할인',
                condition: { itemSpecific: true, manualCheckRequired: true },
            }),
            makeRule('hana_nara', {
                id: 'hana_nara_cu_event_special',
                category: 'convenience',
                description: '국군의날·현충일 CU 행사품목 30% 현장할인',
                condition: { itemSpecific: true, manualCheckRequired: true },
                action: { type: 'PERCENT', value: 30 },
            }),
            makeRule('hana_nara', {
                id: 'hana_nara_military_resort',
                includedBrands: ['military_resort'],
                description: '국군 콘도 20% 캐시백',
                condition: {
                    manualCheckRequired: true,
                    requiredNote: '선택한 통합 브랜드에 공식 제외 대상(콘도)이 섞입니다.',
                },
                action: { type: 'PERCENT', value: 20 },
            }),
        ]);
        expect(hanaNara.rules.find(rule => rule.id === 'hana_nara_cu_event')
            ?.includedBrands).toEqual(['cu_event']);
        expect(hanaNara.rules.find(rule => rule.id === 'hana_nara_cu_event_special')
            ?.action.value).toBe(0);
        expect(hanaNara.rules.find(rule => rule.id === 'hana_nara_military_resort')
            ?.condition.requiredNote).toContain('F&B');

        const heyYoung = normalize('shinhan_heyoung', [
            makeRule('shinhan_heyoung', {
                id: 'hy_conv',
                includedBrands: ['cu'],
                description: '편의점 1천원 캐시백',
                action: { type: 'FLAT', value: 1_000 },
            }),
            makeRule('shinhan_heyoung', {
                id: 'hy_easy_pay',
                description: '국내 간편결제 1% 캐시백',
                condition: { manualCheckRequired: true },
                action: { type: 'PERCENT', value: 1 },
            }),
            makeRule('shinhan_heyoung', {
                id: 'shinhan_heyoung_movv_airport',
                category: 'transport',
                description: 'movv 인천공항 이동 2만5천원 할인',
                condition: { manualCheckRequired: true },
                action: { type: 'FLAT', value: 25_000 },
            }),
        ]);
        expect(heyYoung.rules.find(rule => rule.id === 'hy_easy_pay')?.excludedBrands)
            .toEqual(expect.arrayContaining(['cu', 'overseas_payment', 'overseas_atm']));
        const movvRule = heyYoung.rules.find(rule => (
            rule.id === 'shinhan_heyoung_movv_airport'
        ))!;
        expect(movvRule).toMatchObject({
            action: { value: 0 },
            condition: { manualCheckRequired: true },
        });
        expect(movvRule.condition.requiredNote).toContain('자동 계산에서 제외');

        const travelog = normalize('hana_travelog_student', [
            makeRule('hana_travelog_student', {
                id: 'hana_travelog_domestic',
                description: '국내 가맹점 0.3% 하나머니 적립',
                condition: { manualCheckRequired: true },
                action: { type: 'PERCENT', value: 0.3 },
            }),
        ]);
        expect(travelog.rules[0].excludedBrands).toEqual(expect.arrayContaining([
            'overseas_payment',
            'overseas_atm',
            'japan_convenience',
        ]));

        const hiPoint = normalize('shinhan_hi_point', [
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_favorite_shopping_2',
                category: 'shopping',
                description: '잘 가는 곳 쇼핑 이용금액 2.0% 적립',
                condition: { minPerformance: 500_000 },
                action: { type: 'PERCENT', value: 2 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_favorite_telecom_2',
                category: 'transport',
                includedBrands: ['wrong-telecom'],
                description: 'SKT·KT·LG U+ 이동통신요금 자동이체 2.0% 적립',
                condition: { minPerformance: 500_000 },
                action: { type: 'PERCENT', value: 2 },
                limitConfig: { monthlyAmount: 100_000 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_general_2',
                description: '국내외 가맹점 일시불·할부 0.8% 적립',
                condition: { minPerformance: 500_000 },
                action: { type: 'PERCENT', value: 0.8 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_cma',
                description: '신한투자증권 CMA 결제계좌 지정 시 0.2% 추가 적립',
                condition: { manualCheckRequired: true },
                action: { type: 'PERCENT', value: 0.2 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_fuel_soil',
                category: 'transport',
                includedBrands: ['sk_energy'],
                description: 'S-OIL 리터당 60원 적립',
                action: { type: 'FLAT', value: 0 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_lotteworld_recredit',
                includedBrands: ['lotte_world'],
                description: '롯데월드 포인트 사용분 60% 재적립',
                condition: { itemSpecific: true, eligibleItemSummary: '롯데월드 입장권' },
                action: { type: 'PERCENT', value: 60 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_movie_offline',
                includedBrands: ['cgv'],
                platformType: 'OFFLINE',
                description: '영화 1,500원 할인',
                action: { type: 'FLAT', value: 1_500 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_movie_online_1500',
                includedBrands: ['cgv'],
                platformType: 'OFFICIAL_SITE',
                description: '온라인 영화 1,500원 할인',
                action: { type: 'FLAT', value: 1_500 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_interest_free',
                includedBrands: ['lotte_mart'],
                description: '4대 백화점·3대 할인점 2~3개월 무이자할부',
                action: { type: 'FLAT', value: 0 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_monthly_cap',
                description: '마이신한포인트 월 최대 5만원 적립',
                condition: { manualCheckRequired: true },
                action: { type: 'FLAT', value: 0 },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_theme_park_50',
                includedBrands: ['lotte_world'],
                sharedGroupId: 'theme-limits',
                description: '테마파크 자유이용권 50% 할인',
                action: { type: 'PERCENT', value: 50 },
                limitConfig: {
                    dailyCount: 1,
                    yearlyCount: 3,
                    sharedFields: ['dailyCount', 'yearlyCount'],
                },
            }),
            makeRule('shinhan_hi_point', {
                id: 'shinhan_hi_point_caribbean',
                includedBrands: ['caribbean'],
                sharedGroupId: 'theme-limits',
                description: '캐리비안베이 입장권 30% 할인',
                action: { type: 'PERCENT', value: 30 },
                limitConfig: {
                    dailyCount: 1,
                    yearlyCount: 3,
                    sharedFields: ['dailyCount', 'yearlyCount'],
                },
            }),
        ], [
            { id: 'lotte_department', name: '롯데백화점', categoryId: 'shopping' },
            { id: 'hyundai_department', name: '현대백화점', categoryId: 'shopping' },
            { id: 'shinsegae_department', name: '신세계백화점', categoryId: 'shopping' },
            { id: 'galleria_department', name: '갤러리아백화점', categoryId: 'shopping' },
            { id: 'lotte_mart', name: '롯데마트', categoryId: 'convenience' },
            { id: 'emart', name: '이마트', categoryId: 'convenience' },
            { id: 'homeplus', name: '홈플러스', categoryId: 'convenience' },
            { id: 'toysrus', name: '토이저러스', categoryId: 'shopping' },
            { id: 'cj_onstyle', name: 'CJ온스타일', categoryId: 'shopping' },
            { id: 'telecom', name: '통신요금', categoryId: 'transport' },
            { id: 's_oil', name: 'S-OIL', categoryId: 'transport' },
            { id: 'cgv', name: 'CGV', categoryId: 'movie' },
            { id: 'megabox', name: '메가박스', categoryId: 'movie' },
            { id: 'lotte_world', name: '롯데월드', categoryId: 'movie' },
            { id: 'caribbean', name: '캐리비안베이', categoryId: 'movie' },
        ]);
        const hiPointById = new Map(hiPoint.rules.map(ruleRow => [ruleRow.id, ruleRow]));
        expect(hiPointById.get('shinhan_hi_point_favorite_shopping_2')).toMatchObject({
            includedBrands: expect.arrayContaining(['lotte_mart', 'emart', 'homeplus']),
            platformType: 'OFFLINE',
            condition: { performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW' },
        });
        expect(hiPointById.get('shinhan_hi_point_favorite_cj_onstyle_2')).toMatchObject({
            includedBrands: ['cj_onstyle'],
            platformType: 'ONLINE',
        });
        expect(hiPointById.get('shinhan_hi_point_favorite_telecom_2')).toMatchObject({
            includedBrands: ['telecom'],
            sharedGroupId: 'shinhan_hi_point_telecom_monthly',
            limitConfig: {
                monthlyAmountByPerformance: [
                    { threshold: 0, limit: 1_000 },
                    { threshold: 500_000, limit: 2_000 },
                    { threshold: 1_000_000, limit: 3_500 },
                    { threshold: 1_500_000, limit: 5_000 },
                ],
            },
        });
        expect(hiPointById.get('shinhan_hi_point_general_2')?.condition.performanceWaiver)
            .toBe('NEW_CARD_REGISTRATION_WINDOW');
        expect(hiPointById.get('shinhan_hi_point_general_2')).toMatchObject({
            excludedBrands: ['s_oil'],
            condition: {
                stackableWithRuleIds: ['shinhan_hi_point_cma'],
                fallbackAfterRuleIds: ['shinhan_hi_point_favorite_telecom_2'],
            },
        });
        expect(hiPointById.get('shinhan_hi_point_cma')?.condition.stackableWithRuleIds)
            .toEqual(expect.arrayContaining([
                'shinhan_hi_point_favorite_shopping_2',
                'shinhan_hi_point_favorite_cj_onstyle_2',
                'shinhan_hi_point_favorite_telecom_2',
                'shinhan_hi_point_general_2',
            ]));
        expect(hiPointById.get('shinhan_hi_point_fuel_soil')).toMatchObject({
            includedBrands: ['s_oil'],
            action: { type: 'FLAT', value: 0 },
        });
        expect(hiPointById.get('shinhan_hi_point_fuel_soil')?.condition.requiredNote)
            .toContain('주유금액 20만원');
        expect(hiPointById.get('shinhan_hi_point_lotteworld_recredit')).toMatchObject({
            action: { type: 'FLAT', value: 0 },
            condition: { manualCheckRequired: true },
        });
        expect(hiPointById.has('shinhan_hi_point_movie_offline')).toBe(false);
        expect(hiPointById.get('shinhan_hi_point_movie_online_1500')).toMatchObject({
            includedBrands: ['cgv', 'megabox'],
            platformType: 'OFFICIAL_SITE',
        });
        expect(hiPointById.get('shinhan_hi_point_interest_free')).toMatchObject({
            includedBrands: [
                'lotte_department',
                'hyundai_department',
                'shinsegae_department',
                'galleria_department',
                'lotte_mart',
                'emart',
                'homeplus',
            ],
            platformType: 'OFFLINE',
            action: { type: 'FLAT', value: 0 },
        });
        expect(hiPointById.get('shinhan_hi_point_monthly_cap')?.condition.requiredNote)
            .toContain('카드 계산에 반영');
        expect(hiPointById.get('shinhan_hi_point_theme_park_50')?.sharedGroupId)
            .toBeUndefined();
        expect(hiPointById.get('shinhan_hi_point_caribbean')?.sharedGroupId)
            .toBeUndefined();
    });

    it('creates a fully evidenced representative SOL Travel candidate', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(
            result.extraction,
            input,
            references,
        );

        expect(validation.errors).toEqual([]);
        expect(result.extraction.rules).toHaveLength(13);
        expect(result.extraction.rules.find(rule => rule.id === 'sol_domestic_convenience'))
            .toMatchObject({
                condition: {
                    minPerformance: 300_000,
                    requiredNote: expect.stringContaining('CU 행사상품 중복 외'),
                },
                action: { type: 'PERCENT', value: 5 },
                limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            });
        expect(result.extraction.rules.find(rule => rule.id === 'sol_overseas_fee'))
            .toMatchObject({
                condition: {
                    confirmationRequired: true,
                    requiredNote: expect.stringContaining('수수료가 실제 부과되는 거래'),
                },
            });
        expect(result.extraction.evidence.map(item => item.id)).toEqual(
            expect.arrayContaining([
                'overseas-fee-exclusion',
                'discount-service-exclusions',
            ]),
        );
        const normalizedFixture = sourceText.replace(/\s+/g, ' ');
        expect(result.extraction.evidence.every(item => normalizedFixture.includes(item.quote)))
            .toBe(true);
    });

    it('holds a candidate when a rule has no official-source evidence', () => {
        const result = extractShinhanSolTravelWithRules({
            ...input,
            sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', ''),
        });
        const validation = validateCardBenefitExtraction(
            result.extraction,
            { ...input, sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', '') },
            references,
        );

        expect(validation.errors).toContain('규칙 sol_lounge의 혜택·계산 근거가 없습니다.');
    });

    it('rejects evidence quotes that are not present in the raw source', () => {
        const result = extractShinhanSolTravelWithRules(input);
        result.extraction.evidence[0] = {
            ...result.extraction.evidence[0],
            quote: '원문에는 없는 99% 할인',
        };

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('근거 1 문장이 공식 원문에서 확인되지 않습니다.');
    });

    it('links a supporting PDF quote to its exact source URL and page', () => {
        const primaryText = sourceText.replace(
            '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
            '',
        );
        const pdfUrl = 'https://www.shinhancard.com/guides/sol-travel.pdf';
        const pdfPages = [
            '표지와 카드 상품 기본 정보입니다.',
            '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
        ];
        const multiSourceInput = {
            ...input,
            sourceText: primaryText,
            sources: [
                { sourceUrl: input.sourceUrl, sourceText: primaryText, mediaType: 'text/html' },
                {
                    sourceUrl: pdfUrl,
                    sourceText: pdfPages.join('\n'),
                    mediaType: 'application/pdf',
                    pageTexts: pdfPages,
                },
            ],
        };
        const result = extractShinhanSolTravelWithRules(multiSourceInput);
        const loungeEvidence = result.extraction.evidence.find(item => item.id === 'lounge');

        expect(loungeEvidence).toMatchObject({ sourceUrl: pdfUrl, page: 2 });
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual([]);

        delete loungeEvidence!.page;
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual(expect.arrayContaining([
            expect.stringContaining('PDF 페이지 번호가 없습니다.'),
        ]));

        loungeEvidence!.page = 1;
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual(expect.arrayContaining([
            expect.stringContaining('지정한 PDF 페이지에서 확인되지 않습니다.'),
        ]));
    });

    it('rejects rule IDs owned by another card or a user', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(result.extraction, input, {
            ...references,
            ruleOwners: new Map([
                ['sol_domestic_convenience', { cardId: 'other_card', userId: null }],
                ['sol_lounge', { cardId: card.id, userId: 'user-1' }],
            ]),
        });

        expect(validation.errors).toContain(
            '규칙 5 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
        expect(validation.errors).toContain(
            '규칙 8 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
    });

    it('rejects a FULL candidate that omits an official representative benefit', () => {
        const result = extractShinhanSolTravelWithRules(input);
        result.extraction.rules = result.extraction.rules
            .filter(rule => rule.id !== 'sol_overseas_atm');
        result.extraction.evidence = result.extraction.evidence
            .filter(item => !item.ruleIds.includes('sol_overseas_atm'));

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('공식 혜택 sol_overseas_atm 규칙이 누락되었습니다.');
    });

    it('rejects a representative rule whose official amount is changed', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const promotion = result.extraction.rules
            .find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.limitConfig.monthlyAmount = 50_000;

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('공식 혜택 sol_japan_convenience의 계산 조건·한도가 공식 기준과 다릅니다.');
    });

    it('rejects impossible calendar dates in a period condition', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const promotion = result.extraction.rules
            .find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.condition.endsAt = '2026-02-31';

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('규칙 10 endsAt 날짜가 올바르지 않습니다.');
    });

    it('rejects monetary daily limits encoded as counts or per-transaction caps', () => {
        const genericCard: Card = {
            id: 'generic-card',
            name: '테스트 카드',
            company: '테스트',
            color: 'bg-black',
            limitTable: [],
        };
        const quote = [
            '쿠팡 20% 캐시백',
            '할인율',
            '일 한도',
            '월 한도',
            '20%',
            '1천원',
            '3천원',
        ].join('\n');
        const extraction = {
            schemaVersion: 2 as const,
            completeness: 'FULL' as const,
            card: {
                id: genericCard.id,
                name: genericCard.name,
                company: genericCard.company,
                limitTable: [],
            },
            rules: [{
                id: 'generic-shopping',
                cardId: genericCard.id,
                includedBrands: ['coupang'],
                excludedBrands: [],
                platformType: 'ONLINE' as const,
                usesCardLimit: false,
                description: '쿠팡 20% 캐시백',
                detail: '',
                condition: {},
                action: { type: 'PERCENT' as const, value: 20, maxDiscount: 1_000 },
                limitConfig: { dailyCount: 1, monthlyAmount: 3_000 },
            }],
            evidence: [{
                id: 'shopping-limit',
                ruleIds: ['generic-shopping'],
                fields: ['description', 'action', 'limitConfig'] as const,
                quote,
                sourceUrl: 'https://example.com/card',
                location: '쿠팡 할인 한도',
            }],
            notes: [],
        };

        const validation = validateCardBenefitExtraction(extraction, {
            card: genericCard,
            sourceUrl: 'https://example.com/card',
            sourceText: quote,
        }, {
            brandIds: new Set(['coupang']),
        });

        expect(validation.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('일 횟수 한도의 공식 근거가 없습니다'),
            expect.stringContaining('건별 최대 혜택이 일·월 한도에서 잘못 파생'),
        ]));
    });

    it('rejects a numeric performance condition absent from its official evidence', () => {
        const genericCard: Card = {
            id: 'generic-card',
            name: '테스트 카드',
            company: '테스트',
            color: 'bg-black',
            limitTable: [],
        };
        const benefitQuote = '택시 20% 캐시백';
        const conditionQuote = '군 급여이체 시에만 다음달에 서비스가 제공됨';
        const extraction = {
            schemaVersion: 2 as const,
            completeness: 'FULL' as const,
            card: {
                id: genericCard.id,
                name: genericCard.name,
                company: genericCard.company,
                limitTable: [],
            },
            rules: [{
                id: 'generic-taxi',
                cardId: genericCard.id,
                includedBrands: [],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: false,
                description: benefitQuote,
                detail: '',
                condition: {
                    minPerformance: 100_000,
                    manualCheckRequired: true,
                    requiredNote: '군 급여이체 여부 확인 필요',
                },
                action: { type: 'PERCENT' as const, value: 20 },
                limitConfig: {},
            }],
            evidence: [
                {
                    id: 'taxi-benefit',
                    ruleIds: ['generic-taxi'],
                    fields: ['description', 'action'] as const,
                    quote: benefitQuote,
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'taxi-condition',
                    ruleIds: ['generic-taxi'],
                    fields: ['condition'] as const,
                    quote: conditionQuote,
                    sourceUrl: 'https://example.com/card',
                },
            ],
            notes: [],
        };

        const validation = validateCardBenefitExtraction(extraction, {
            card: genericCard,
            sourceUrl: 'https://example.com/card',
            sourceText: `${benefitQuote}\n${conditionQuote}`,
        });

        expect(validation.errors).toContain(
            '최소 실적 100,000원의 공식 숫자 근거가 없습니다: 택시 20% 캐시백',
        );
    });

    it('restores a compatible published rule ID after AI renames the rule', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const candidate = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const renamed = candidate.rules.find(rule => rule.id === 'sol_domestic_convenience')!;
        renamed.id = 'sol_domestic_convenience_recreated';

        const stabilized = stabilizeExtractionRuleIds(
            candidate,
            [{
                sectionId: 'domestic-convenience',
                ruleIds: ['sol_domestic_convenience_recreated'],
            }],
            baselineExtraction.rules,
        );

        expect(stabilized.extraction.rules).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'sol_domestic_convenience' }),
        ]));
        expect(stabilized.coverage).toEqual([{
            sectionId: 'domestic-convenience',
            ruleIds: ['sol_domestic_convenience'],
        }]);
    });

    it('adds an omitted official exclusion to the nearest preceding benefit section', () => {
        const benefitQuote = '광역교통 5% 캐시백';
        const exclusionQuote = '공식 홈페이지 및 오프라인 결제만 대상이며 여행사 결제는 서비스에서 제외됨';
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'wide_transport',
                title: benefitQuote,
                summary: benefitQuote,
                kind: 'BENEFIT',
                appliesToSectionIds: [],
                sourceUrl: 'https://example.com/card',
                quote: benefitQuote,
                page: null,
            }],
            notes: [],
        });

        const completed = completeInventoryExclusionChecklist(inventory, {
            card: { ...card, id: 'generic-card' },
            sourceUrl: 'https://example.com/card',
            sourceText: `${benefitQuote}\n${exclusionQuote}`,
        });

        expect(completed.sections).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'EXCLUSION',
                appliesToSectionIds: ['wide_transport'],
                quote: exclusionQuote,
            }),
        ]));
    });

    it('adds an omitted overseas ATM target to the nearest preceding benefit section', () => {
        const benefitQuote = '트래블로그 스위치 무료 제공';
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'travel_switch',
                title: benefitQuote,
                summary: benefitQuote,
                kind: 'BENEFIT',
                appliesToSectionIds: [],
                sourceUrl: 'https://example.com/card',
                quote: benefitQuote,
                page: null,
            }],
            notes: [],
        });
        const sourceText = [
            benefitQuote,
            '트래블로그 스위치 서비스 안내',
            '해외 ATM 인출 시',
            '면제',
            '(건당 US $3)',
            '면제',
            '(이용금액의 1.1%)',
        ].join('\n');

        const completed = completeInventoryTransactionTargetChecklist(inventory, {
            card: { ...card, id: 'generic-card' },
            sourceUrl: 'https://example.com/card',
            sourceText,
        });

        expect(completed.sections).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'CONDITION',
                appliesToSectionIds: ['travel_switch'],
                quote: expect.stringContaining('해외 ATM 인출 시'),
            }),
        ]));
    });

    it('expands a condition that points through an integrated-limit section', () => {
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'benefit_starbucks',
                    title: '스타벅스 20% 캐시백',
                    summary: '스타벅스 혜택',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '스타벅스 20% 캐시백',
                    page: null,
                },
                {
                    id: 'basic_integrated_limit',
                    title: 'Basic 서비스 월간 통합 할인한도',
                    summary: '통합한도 적용 대상 서비스: 스타벅스',
                    kind: 'LIMIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '월간 통합 할인한도 적용 대상 서비스 : 스타벅스',
                    page: null,
                },
                {
                    id: 'starbucks_minimum',
                    title: '스타벅스 최소 결제금액',
                    summary: '1만원 이상',
                    kind: 'CONDITION',
                    appliesToSectionIds: ['basic_integrated_limit'],
                    sourceUrl: 'https://example.com/card',
                    quote: '건당 결제금액이 10,000원 이상인 경우에 한하여 서비스 제공',
                    page: null,
                },
            ],
            notes: [],
        });

        const normalized = normalizeInventoryReferences(inventory);

        expect(normalized.sections.find(section => (
            section.id === 'basic_integrated_limit'
        ))?.appliesToSectionIds).toEqual(['benefit_starbucks']);
        expect(normalized.sections.find(section => (
            section.id === 'starbucks_minimum'
        ))?.appliesToSectionIds).toEqual(['benefit_starbucks']);
    });

    it('repairs an ambiguous missing target ID from the referring section text', () => {
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'b2_online',
                    title: '쿠팡·네이버플러스스토어 20% 캐시백',
                    summary: '쿠팡·네이버플러스스토어 혜택',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '쿠팡/네이버플러스스토어 20% 캐시백',
                    page: null,
                },
                {
                    id: 'b13_online',
                    title: '온라인 쇼핑 10% 캐시백',
                    summary: '온라인 쇼핑 혜택',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '온라인 쇼핑 10% 캐시백',
                    page: null,
                },
                {
                    id: 'x1_online',
                    title: '쿠팡·네이버플러스스토어 결제 채널 및 제외 조건',
                    summary: '쿠팡·네이버플러스스토어 공식 앱 결제만 대상',
                    kind: 'EXCLUSION',
                    appliesToSectionIds: ['b14_online'],
                    sourceUrl: 'https://example.com/card',
                    quote: '쿠팡·네이버플러스스토어 공식 홈페이지 결제만 혜택 제공',
                    page: null,
                },
            ],
            notes: [],
        });

        const normalized = normalizeInventoryReferences(inventory);

        expect(normalized.sections.find(section => section.id === 'x1_online')
            ?.appliesToSectionIds).toEqual(['b2_online']);
    });

    it('repairs a near-exact inventory quote with the actual official source line', () => {
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'fee_table',
                title: '해외 이용 수수료 면제',
                summary: '해외 가맹점 수수료 면제',
                kind: 'CONDITION',
                appliesToSectionIds: ['travel_switch'],
                sourceUrl: 'https://example.com/card',
                quote: [
                    '해외 이용 수수료 면제 서비스를 나타내는 표입니다.',
                    '구분',
                    '해외서비스 수수료',
                ].join('\n'),
                page: null,
            }],
            notes: [],
        });
        const officialLine = '해외 이용 수수료 면제 서비스를 나타내는 안내 표입니다.';

        const repaired = repairInventoryQuotes(inventory, {
            card: { ...card, id: 'generic-card' },
            sourceUrl: 'https://example.com/card',
            sourceText: [officialLine, '구분', '해외서비스 수수료'].join('\n'),
        });

        expect(repaired.sections[0].quote).toBe([
            officialLine,
            '구분',
            '해외서비스 수수료',
        ].join('\n'));
    });

    it('repairs a malformed model source URL only when its quote uniquely matches', () => {
        const officialUrl = 'https://card.example/guide.pdf';
        const malformedUrl = 'https://card.example/가이드북.pdf';
        const quote = '실적 및 한도 제한 없이 국내외 가맹점 이용 금액의 0.8% 청구 할인';
        const testCard = { ...card, id: 'generic-card' };
        const source = {
            sourceUrl: officialUrl,
            sourceText: quote,
            mediaType: 'application/pdf',
            pageTexts: [quote],
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'basic-discount',
                title: '기본 할인',
                summary: '국내외 0.8% 할인',
                kind: 'BENEFIT',
                appliesToSectionIds: [],
                sourceUrl: malformedUrl,
                quote,
                page: 1,
            }],
            notes: [],
        });

        expect(repairInventoryQuotes(inventory, {
            card: testCard,
            sourceUrl: officialUrl,
            sourceText: quote,
            sources: [source],
        }).sections[0].sourceUrl).toBe(officialUrl);

        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: testCard,
            rules: [{
                id: 'basic-discount',
                cardId: testCard.id,
                includedBrands: [],
                excludedBrands: [],
                platformType: 'ALL',
                usesCardLimit: false,
                description: '국내외 가맹점 0.8% 청구 할인',
                detail: '',
                condition: {},
                action: { type: 'PERCENT', value: 0.8 },
                limitConfig: {},
            }],
            evidence: [{
                id: 'valid-benefit',
                ruleIds: ['basic-discount'],
                fields: ['description', 'action'],
                quote,
                sourceUrl: malformedUrl,
                page: 1,
            }, {
                id: 'card-metadata',
                ruleIds: ['_none'],
                fields: ['condition'],
                quote,
                sourceUrl: malformedUrl,
                page: 1,
            }],
            notes: [],
        };
        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl: officialUrl,
            sourceText: quote,
            sources: [source],
        });

        expect(normalized.evidence).toEqual([
            expect.objectContaining({
                id: 'valid-benefit',
                sourceUrl: officialUrl,
                ruleIds: ['basic-discount'],
            }),
        ]);
    });

    it('normalizes Samsung iD ON merchant scopes and overseas fallback without global discounts', () => {
        const testCard = { ...card, id: 'samsung_id_on', name: '삼성 iD ON 카드' };
        const rule = (
            id: string,
            description: string,
            action: BenefitRule['action'],
            overrides: Partial<BenefitRule> = {},
        ): BenefitRule => ({
            id,
            cardId: testCard.id,
            includedBrands: [],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description,
            detail: '',
            condition: {},
            action,
            limitConfig: {},
            ...overrides,
        });
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: testCard,
            rules: [
                rule('samsung_id_on_b1_coffee', '커피전문점 월 이용금액이 가장 큰 영역에 30% 결제일할인', { type: 'PERCENT', value: 30 }, {
                    includedBrands: ['ediya', 'mega'],
                    limitConfig: { monthlyAmount: 10_000, sharedFields: ['monthlyAmount'] },
                }),
                rule('samsung_id_on_b1_delivery', '배달앱 월 이용금액이 가장 큰 영역에 30% 결제일할인', { type: 'PERCENT', value: 30 }, {
                    limitConfig: { monthlyAmount: 10_000, sharedFields: ['monthlyAmount'] },
                }),
                rule('samsung_id_on_b1_deli', '델리 월 이용금액이 가장 큰 영역에 30% 결제일할인', { type: 'PERCENT', value: 30 }, {
                    limitConfig: { monthlyAmount: 10_000, sharedFields: ['monthlyAmount'] },
                }),
                rule('samsung_id_on_b1_starbucks_siren', '스타벅스 사이렌오더 결제에 30% 결제일할인', { type: 'PERCENT', value: 30 }, {
                    limitConfig: { monthlyAmount: 10_000, sharedFields: ['monthlyAmount'] },
                }),
                rule('samsung_id_on_b3_low', '전월 이용금액 30만원 미만 또는 한도 초과 후 1% 할인', { type: 'PERCENT', value: 1 }),
                rule('samsung_id_on_b3_standard', '전월 이용금액 30만원 이상 온라인 간편결제·해외 3% 할인', { type: 'PERCENT', value: 3 }, {
                    condition: { minPerformance: 300_000 },
                }),
                rule('samsung_id_on_b3_overlimit', '3% 할인 월 한도 초과 후 1% 할인', { type: 'PERCENT', value: 1 }),
                rule('samsung_id_on_b3_overseas', '해외 가맹점 3%·1% 할인', { type: 'PERCENT', value: 3 }),
                rule('samsung_id_on_b3_online_unmapped', '온라인 간편결제 할인 대상', { type: 'FLAT', value: 0 }),
            ],
            evidence: [],
            notes: [],
        };
        const catalogBrands = [
            ['starbucks', '스타벅스', 'cafe'],
            ['ediya', '이디야', 'cafe'],
            ['coffeebean', '커피빈', 'cafe'],
            ['twosome', '투썸플레이스', 'cafe'],
            ['baemin', '배달의민족', 'delivery'],
            ['yogiyo', '요기요', 'delivery'],
            ['subway', '써브웨이', 'food'],
            ['paris_baguette', '파리바게뜨', 'cafe'],
            ['baskin_robbins', '배스킨라빈스', 'cafe'],
            ['dunkin', '던킨', 'cafe'],
            ['overseas_payment', '해외 가맹점', 'etc'],
        ].map(([id, name, categoryId]) => ({ id, name, categoryId }));

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl: 'https://static11.samsungcard.com/wcms/svc/card.html',
            sourceText: '삼성 iD ON 카드 공식 혜택 상세',
            catalog: { categories: [], brands: catalogBrands },
        });
        const byId = new Map(normalized.rules.map(ruleRow => [ruleRow.id, ruleRow]));

        expect(byId.get('samsung_id_on_b1_coffee')?.includedBrands).toEqual([
            'starbucks', 'ediya', 'coffeebean', 'twosome',
        ]);
        expect(byId.get('samsung_id_on_b1_delivery')).toMatchObject({
            includedBrands: ['baemin', 'yogiyo'],
            platformType: 'OFFICIAL_SITE',
            sharedGroupId: 'samsung_id_on_b1_monthly',
        });
        expect(byId.get('samsung_id_on_b3_low')?.includedBrands)
            .toEqual(['overseas_payment']);
        expect(byId.get('samsung_id_on_b3_standard')?.includedBrands)
            .toEqual(['overseas_payment']);
        expect(byId.has('samsung_id_on_b3_overlimit')).toBe(false);
        expect(byId.has('samsung_id_on_b3_overseas')).toBe(false);
        expect(normalized.rules.filter(ruleRow => (
            ruleRow.action.value > 0 &&
            !ruleRow.category &&
            (ruleRow.includedBrands?.length ?? 0) === 0
        ))).toEqual([]);
    });

    it('repairs a uniquely abbreviated coverage rule ID', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const candidate = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const delivery = candidate.rules[0];
        delivery.id = 'hana_nara_salary_delivery_special';

        const stabilized = stabilizeExtractionRuleIds(
            { ...candidate, card: { ...candidate.card, id: 'hana_nara' }, rules: [delivery] },
            [{ sectionId: 'delivery_special', ruleIds: ['hana_nara_delivery_special'] }],
            [],
        );

        expect(stabilized.coverage).toEqual([{
            sectionId: 'delivery_special',
            ruleIds: ['hana_nara_salary_delivery_special'],
        }]);
    });

    it('repairs an expanded coverage ID to its unique abbreviated rule suffix', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const candidate = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const regular = { ...candidate.rules[0], id: 'hana_nara_salary_delivery' };
        const special = { ...candidate.rules[1], id: 'hana_nara_delivery_special' };

        const stabilized = stabilizeExtractionRuleIds(
            { ...candidate, card: { ...candidate.card, id: 'hana_nara' }, rules: [regular, special] },
            [{ sectionId: 'delivery_special', ruleIds: ['hana_nara_salary_delivery_special'] }],
            [],
        );

        expect(stabilized.coverage[0].ruleIds).toEqual(['hana_nara_delivery_special']);
    });

    it('keeps stable IDs for uniquely described informational rules without brands', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const candidate = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const phone = {
            ...candidate.rules[0],
            id: 'hana_nara_phone',
            category: 'etc',
            includedBrands: [],
            description: '나라사랑 휴대폰케어 서비스',
            action: { ...candidate.rules[0].action, type: 'FLAT' as const, value: 0 },
        };
        const insurance = {
            ...phone,
            id: 'hana_nara_insurance',
            description: '현역병 상해보험 무료 자동가입',
        };
        const baselinePhone = {
            ...baselineExtraction.rules[0],
            id: 'hana_nara_phone_care',
            category: 'etc',
            includedBrands: [],
            description: phone.description,
            action: { type: 'FLAT' as const, value: 0 },
        };

        const stabilized = stabilizeExtractionRuleIds(
            { ...candidate, card: { ...candidate.card, id: 'hana_nara' }, rules: [phone, insurance] },
            [{ sectionId: 'phone', ruleIds: [phone.id] }],
            [baselinePhone],
        );

        expect(stabilized.extraction.rules.map(rule => rule.id)).toContain('hana_nara_phone_care');
        expect(stabilized.coverage[0].ruleIds).toEqual(['hana_nara_phone_care']);
    });

    it('recovers an omitted derived tier from its uniquely matching benefit family', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const openAIExtraction = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const lowTier = {
            ...openAIExtraction.rules[0],
            id: 'hana_nara_px',
            category: 'etc',
            includedBrands: ['military_px'],
            condition: { ...openAIExtraction.rules[0].condition, maxSpendExclusive: 30_000 },
            action: { ...openAIExtraction.rules[0].action, type: 'PERCENT' as const, value: 30 },
        };
        const highTier = {
            ...lowTier,
            id: 'hana_nara_px_30k',
            description: '군마트(PX) 3만원 이상 결제 20% 캐시백',
            condition: { ...lowTier.condition, minSpend: 30_000 },
            action: { ...lowTier.action, value: 20 },
        };
        const unrelatedRule = {
            ...lowTier,
            id: 'hana_nara_px_unrelated',
            description: '군마트 별도 상시 혜택',
            condition: { ...lowTier.condition, maxSpendExclusive: null },
            action: { ...lowTier.action, value: 20 },
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'px_benefit',
                    title: '군마트(PX) 20~30% 캐시백',
                    summary: '군마트 캐시백',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '군마트(PX) 20~30% 캐시백',
                    page: null,
                },
                {
                    id: 'px_limit',
                    title: '군마트 캐시백 한도 및 할인율',
                    summary: '3만원 미만 30%, 3만원 이상 20%',
                    kind: 'LIMIT',
                    appliesToSectionIds: ['px_benefit'],
                    sourceUrl: 'https://example.com/card',
                    quote: '3만원 미만 30% 5천원 1만원 3만원 이상 20% 2만원 10만원',
                    page: null,
                },
            ],
            notes: [],
        });

        const completed = completeDerivedRuleCoverage(
            inventory,
            [
                { sectionId: 'px_benefit', ruleIds: [lowTier.id] },
                { sectionId: 'px_limit', ruleIds: [lowTier.id] },
            ],
            [lowTier, highTier, unrelatedRule],
        );

        expect(completed).toEqual([
            { sectionId: 'px_benefit', ruleIds: [lowTier.id, highTier.id] },
            { sectionId: 'px_limit', ruleIds: [lowTier.id, highTier.id] },
        ]);
    });

    it('normalizes explicit offline channels and named transaction targets from inventory', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const openAIExtraction = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const amusement = {
            ...openAIExtraction.rules[0],
            id: 'generic_amusement',
            category: 'movie',
            includedBrands: ['everland'],
            platformType: 'ALL' as const,
            sharedGroupId: 'generic_integrated',
            usesCardLimit: false,
            description: '에버랜드 이용권 50% 현장할인',
            limitConfig: {
                dailyCount: null,
                dailyAmount: null,
                monthlyCount: 1,
                yearlyCount: null,
                monthlyAmount: null,
                monthlyAmountByPerformance: null,
                sharedFields: null,
            },
        };
        const travel = {
            ...openAIExtraction.rules[1],
            id: 'generic_travel',
            category: 'etc',
            includedBrands: ['overseas_payment'],
            sharedGroupId: 'generic_integrated',
            usesCardLimit: true,
            description: '트래블로그 스위치 해외 수수료 면제',
            action: {
                ...openAIExtraction.rules[1].action,
                type: 'FIXED_PRICE' as const,
                value: 0,
            },
            limitConfig: {
                dailyCount: null,
                dailyAmount: null,
                monthlyCount: null,
                yearlyCount: null,
                monthlyAmount: 100_000,
                monthlyAmountByPerformance: null,
                sharedFields: null,
            },
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'amusement',
                    title: '에버랜드 이용권 50% 현장할인',
                    summary: '에버랜드 이용권 50% 현장할인',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '에버랜드 이용권 50% 현장할인',
                    page: null,
                },
                {
                    id: 'travel',
                    title: '트래블로그 스위치 해외 수수료 면제',
                    summary: '해외 ATM도 수수료 면제',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '해외 가맹점과 해외 ATM 수수료 면제',
                    page: null,
                },
            ],
            notes: [],
        });

        const normalized = normalizeInventoryBackedRuleSemantics(
            { ...openAIExtraction, rules: [amusement, travel] },
            inventory,
            [
                { sectionId: 'amusement', ruleIds: [amusement.id] },
                { sectionId: 'travel', ruleIds: [travel.id] },
            ],
            [
                { id: 'everland', name: '에버랜드', categoryId: 'movie' },
                { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' },
                { id: 'overseas_atm', name: '해외 ATM', categoryId: 'etc' },
            ],
        );

        expect(normalized.rules.find(rule => rule.id === amusement.id)?.platformType)
            .toBe('OFFLINE');
        expect(normalized.rules.find(rule => rule.id === travel.id)?.includedBrands)
            .toEqual(['overseas_payment', 'overseas_atm']);
        expect(normalized.rules.find(rule => rule.id === travel.id)).toMatchObject({
            action: { type: 'FLAT', value: 0 },
            limitConfig: {
                dailyCount: travel.limitConfig.dailyCount,
                dailyAmount: null,
                monthlyCount: travel.limitConfig.monthlyCount,
                yearlyCount: travel.limitConfig.yearlyCount,
                monthlyAmount: null,
            },
        });
        expect(normalized.rules.map(rule => rule.sharedGroupId)).toEqual([null, null]);
    });

    it('does not copy sibling service brands from shared limit evidence', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const openAIExtraction = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const convenience = {
            ...openAIExtraction.rules[0],
            id: 'time-convenience',
            category: 'convenience',
            includedBrands: [],
            description: 'All Day 편의점 10% 할인',
            condition: {
                ...openAIExtraction.rules[0].condition,
                eligibleItemSummary: '편의점 업종',
            },
        };
        const medical = {
            ...openAIExtraction.rules[1],
            id: 'time-medical',
            category: 'life',
            includedBrands: [],
            description: 'All Day 병원·약국 10% 할인',
            condition: {
                ...openAIExtraction.rules[1].condition,
                eligibleItemSummary: '병원/약국 업종',
            },
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'shared-limit',
                title: 'TIME 할인 통합한도',
                summary: '편의점, 병원/약국, 세탁소가 월 한도를 공유',
                kind: 'LIMIT',
                appliesToSectionIds: [],
                sourceUrl: 'https://example.com/card',
                quote: '편의점 업종, 병원/약국 업종, 세탁소 업종 월 통합한도',
                page: null,
            }],
            notes: [],
        });

        const normalized = normalizeInventoryBackedRuleSemantics(
            { ...openAIExtraction, rules: [convenience, medical] },
            inventory,
            [{
                sectionId: 'shared-limit',
                ruleIds: [convenience.id, medical.id],
            }],
            [
                { id: 'gs25', name: 'GS25', categoryId: 'convenience' },
                { id: 'cu', name: 'CU', categoryId: 'convenience' },
                { id: 'medical', name: '병원/약국 업종', categoryId: 'life' },
                { id: 'laundry', name: '세탁소 업종', categoryId: 'life' },
            ],
        );

        expect(normalized.rules[0].includedBrands).toEqual(['gs25', 'cu']);
        expect(normalized.rules[1].includedBrands).toEqual(['medical']);
    });

    it('turns unknown AI brand references into a manual condition instead of invalid IDs', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const openAIExtraction = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const rule = {
            ...openAIExtraction.rules[0],
            id: 'generic_online_pay',
            includedBrands: ['known_brand', 'NH페이'],
            platformType: 'ONLINE' as const,
            description: '대상 간편결제 온라인 할인',
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [{
                id: 'online-pay',
                title: '대상 간편결제 온라인 할인',
                summary: 'NH페이 온라인 결제 할인',
                kind: 'BENEFIT',
                appliesToSectionIds: [],
                sourceUrl: 'https://example.com/card',
                quote: 'NH페이에 등록한 카드로 국내 온라인 결제 시 할인',
                page: null,
            }],
            notes: [],
        });

        const normalized = normalizeInventoryBackedRuleSemantics(
            { ...openAIExtraction, rules: [rule] },
            inventory,
            [{ sectionId: 'online-pay', ruleIds: [rule.id] }],
            [{ id: 'known_brand', name: '알려진 브랜드', categoryId: 'etc' }],
        );

        expect(normalized.rules[0].includedBrands).toEqual(['known_brand']);
        expect(normalized.rules[0].condition).toMatchObject({
            manualCheckRequired: true,
        });
        expect(normalized.rules[0].condition.requiredNote).toContain('NH페이');
    });

    it('repairs unknown cached brands without treating exclusions as included brands', () => {
        const testCard = { ...card, id: 'generic-pay-card' };
        const sourceUrl = 'https://example.com/card';
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: testCard,
            rules: [{
                id: 'online-pay',
                cardId: testCard.id,
                includedBrands: ['NH페이'],
                excludedBrands: [],
                platformType: 'ONLINE',
                usesCardLimit: false,
                description: '간편결제 온라인 1.7% 할인',
                detail: '전기요금과 도시가스 이용금액은 제외됩니다. 제외·유의: 카드 이용 시 제공되는 추가적인 혜택 등 부가서비스 제공에 소요된 비용은 연회비 반환 금액에서 제외됩니다.',
                condition: { requiredCardNetwork: 'DOMESTIC' },
                action: { type: 'PERCENT', value: 1.7 },
                limitConfig: {},
            }],
            evidence: [{
                id: 'online-pay-evidence',
                ruleIds: ['online-pay'],
                fields: ['description', 'condition', 'action'],
                quote: 'NH페이에 등록한 카드로 국내 온라인 결제 시 1.7% 할인',
                sourceUrl,
            }],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: testCard,
            sourceUrl,
            sourceText: `${extraction.evidence[0].quote}\n전기요금과 도시가스 이용금액은 제외`,
            catalog: {
                categories: [],
                brands: [
                    { id: 'electric_utility', name: '전기요금', categoryId: 'etc' },
                    { id: 'city_gas', name: '도시가스', categoryId: 'etc' },
                ],
            },
        });

        expect(normalized.rules[0].includedBrands).toEqual([]);
        expect(normalized.rules[0].condition.requiredCardNetwork).toBeUndefined();
        expect(normalized.rules[0].condition.manualCheckRequired).toBe(true);
        expect(normalized.rules[0].condition.requiredNote).toContain('NH페이');
        expect(normalized.rules[0].detail).toContain('전기요금과 도시가스');
        expect(normalized.rules[0].detail).not.toContain('연회비 반환');
    });

    it('marks both sides of a special-day alternative for manual confirmation', () => {
        const baselineExtraction = extractShinhanSolTravelWithRules(input).extraction;
        const openAIExtraction = cardBenefitOpenAIExtractionSchema.parse({
            confidence: 0.9,
            coverage: [],
            extraction: toOpenAIExtraction(baselineExtraction),
        }).extraction;
        const baseRule = {
            ...openAIExtraction.rules[0],
            id: 'generic_cu_base',
            category: 'convenience',
            includedBrands: ['cu_event'],
            sharedGroupId: null,
            description: 'CU 행사품목 10% 현장할인',
            condition: {
                ...openAIExtraction.rules[0].condition,
                manualCheckRequired: null,
                requiredNote: null,
            },
        };
        const specialRule = {
            ...openAIExtraction.rules[1],
            id: 'generic_cu_special',
            category: 'convenience',
            includedBrands: ['cu_event'],
            sharedGroupId: null,
            description: '국군의날·현충일 CU 행사품목 30% 현장할인',
            condition: {
                ...openAIExtraction.rules[1].condition,
                manualCheckRequired: true,
                requiredNote: '특별일 여부 확인',
            },
        };
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'cu_base',
                    title: baseRule.description,
                    summary: baseRule.description,
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: baseRule.description,
                    page: null,
                },
                {
                    id: 'cu_special',
                    title: specialRule.description,
                    summary: specialRule.description,
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: specialRule.description,
                    page: null,
                },
            ],
            notes: [],
        });

        const normalized = normalizeInventoryBackedRuleSemantics(
            { ...openAIExtraction, rules: [baseRule, specialRule] },
            inventory,
            [
                { sectionId: 'cu_base', ruleIds: [baseRule.id] },
                { sectionId: 'cu_special', ruleIds: [specialRule.id] },
            ],
            [],
        );
        const normalizedBase = normalized.rules.find(rule => rule.id === baseRule.id)!;

        expect(normalizedBase.condition.manualCheckRequired).toBe(true);
        expect(normalizedBase.condition.requiredNote).toContain('특별일 대체 혜택');
    });

    it('repairs grounded limits, tier boundaries, integrated scope, waivers, and stacking locally', () => {
        const genericRule = (overrides: Partial<BenefitRule>): BenefitRule => ({
            id: 'rule',
            cardId: 'shinhan_nara',
            category: 'etc',
            includedBrands: [],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: true,
            description: '혜택',
            detail: '',
            condition: {},
            action: { type: 'PERCENT', value: 10, amountBasis: 'ORIGINAL_AMOUNT' },
            limitConfig: {},
            ...overrides,
        });
        const rules: BenefitRule[] = [
            genericRule({
                id: 'px_low',
                includedBrands: ['military_px'],
                usesCardLimit: false,
                description: '군마트 20% 캐시백',
                condition: { maxSpend: 30_000 },
                action: { type: 'PERCENT', value: 20 },
                limitConfig: { dailyCount: 1, monthlyAmount: 100_000 },
            }),
            genericRule({
                id: 'px_high',
                includedBrands: ['military_px'],
                usesCardLimit: false,
                description: '군마트 20% 캐시백',
                detail: '건당 3만원 초과 이용 시 적용합니다. 원문 표의 3만원 이상 행에 근거하며, 금액 구간이 겹치지 않도록 3만원 초과로 구조화했습니다.',
                condition: { minSpend: 30_001 },
                action: { type: 'PERCENT', value: 20 },
                limitConfig: { monthlyAmount: 100_000 },
            }),
            genericRule({
                id: 'convenience',
                category: 'convenience',
                includedBrands: ['cu', 'gs25'],
                description: '편의점 20% 캐시백',
                condition: {
                    minPerformance: 100_000,
                    performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                    stackableWithRuleIds: ['cu_event'],
                },
                action: { type: 'PERCENT', value: 20, amountBasis: 'ORIGINAL_AMOUNT' },
                limitConfig: { dailyCount: 1, monthlyCount: 5, monthlyAmount: 5_000 },
            }),
            genericRule({
                id: 'cafe',
                category: 'cafe',
                includedBrands: ['starbucks', 'ediya'],
                platformType: 'OFFLINE',
                description: '주요 커피 브랜드 5% 캐시백',
                detail: '오프라인 매장만 대상이며 스타벅스 사이렌 오더는 예외입니다.',
                condition: {
                    minPerformance: 100_000,
                    performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                },
                action: { type: 'PERCENT', value: 5, amountBasis: 'ORIGINAL_AMOUNT' },
                limitConfig: {
                    dailyCount: 1,
                    dailyAmount: 2_000,
                    monthlyCount: 3,
                    monthlyAmount: 6_000,
                },
            }),
            genericRule({
                id: 'cu_event',
                category: 'convenience',
                includedBrands: ['cu_event'],
                usesCardLimit: false,
                description: 'CU 행사상품 10% 즉시할인',
                condition: {
                    stackableWithRuleIds: ['convenience'],
                    itemSpecific: true,
                    eligibleItemSummary: 'CU 행사상품',
                },
                action: { type: 'PERCENT', value: 10, amountBasis: 'ORIGINAL_AMOUNT' },
                limitConfig: { monthlyAmount: 5_000 },
            }),
            genericRule({
                id: 'cgv',
                category: 'movie',
                includedBrands: ['cgv'],
                description: 'CGV 2D 관람권 6천원 정액 제공',
                detail: '본인 포함 최대 2매까지 적용됩니다.',
                condition: {
                    minPerformance: 100_000,
                    itemSpecific: true,
                    eligibleItemSummary: 'CGV 2D 영화 관람권',
                },
                action: { type: 'FIXED_PRICE', value: 6_000 },
            }),
            genericRule({
                id: 'amusement',
                category: 'movie',
                includedBrands: ['everland', 'caribbean'],
                description: '에버랜드·롯데월드·서울랜드 자유이용권 50% 할인',
                condition: { minPerformance: 300_000 },
                action: { type: 'PERCENT', value: 50 },
            }),
            genericRule({
                id: 'caribbean',
                category: 'movie',
                includedBrands: ['caribbean'],
                description: '캐리비안베이 입장권 30% 할인',
                condition: { minPerformance: 300_000 },
                action: { type: 'PERCENT', value: 30 },
            }),
            genericRule({
                id: 'wide_transport',
                category: 'transport',
                includedBrands: ['rail', 'intercity_bus'],
                description: '광역교통 10% 캐시백',
                detail: '고속버스와 KTX·ITX는 대상이며 시외버스와 SRT는 제외됩니다.',
                condition: { minPerformance: 100_000 },
            }),
            genericRule({
                id: 'public_transport',
                category: 'transport',
                includedBrands: ['transport_public'],
                description: '대중교통 20% 캐시백',
                detail: '시내버스·지하철 대상이며 시외버스·공항버스는 제외됩니다.',
                condition: {
                    minPerformance: 100_000,
                    manualCheckRequired: true,
                    requiredNote: '선택한 통합 브랜드에 공식 제외 대상(버스)이 섞일 수 있어 실제 이용 대상을 확인해야 합니다.',
                },
                action: { type: 'PERCENT', value: 20 },
            }),
            genericRule({
                id: 'ott',
                category: 'subscription',
                includedBrands: ['youtube'],
                platformType: 'OFFICIAL_SITE',
                description: 'OTT 10% 캐시백',
                detail: '유튜브 프리미엄 PC 정기결제는 대상이며 모바일 인앱결제는 제외됩니다.',
                condition: {
                    minPerformance: 100_000,
                    manualCheckRequired: true,
                    requiredNote: '결제 경로가 공식 홈페이지의 자동납부인지 확인해야 합니다. 선택한 통합 브랜드에 공식 제외 대상(유튜브·프리미엄)이 섞일 수 있어 실제 이용 대상을 확인해야 합니다.',
                },
            }),
        ];
        const benefitEvidence: CardBenefitExtraction['evidence'] = rules.map(ruleRow => ({
            id: `benefit-${ruleRow.id}`,
            ruleIds: [ruleRow.id],
            fields: ['description', 'action'],
            quote: ruleRow.description,
            sourceUrl: 'https://example.com/card',
            location: ruleRow.description,
        }));
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: 'shinhan_nara',
                name: '신한 나라사랑카드',
                company: '신한카드',
                limitTable: [
                    { threshold: 100_000, limit: 5_000 },
                    { threshold: 200_000, limit: 20_000 },
                ],
            },
            rules,
            evidence: [
                ...benefitEvidence,
                {
                    id: 'px-limit',
                    ruleIds: ['px_low', 'px_high'],
                    fields: ['condition', 'limitConfig'],
                    quote: '건당 3만원 이하 일 1회 최대 1천원 월 최대 10만원 건당 3만원 이상 -',
                    sourceUrl: 'https://example.com/card',
                    location: '군마트 캐시백 한도',
                },
                {
                    id: 'convenience-limit',
                    ruleIds: ['convenience'],
                    fields: ['limitConfig'],
                    quote: '일 1회 최대 1천원, 월 5회 최대 5천원',
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'cafe-limit',
                    ruleIds: ['cafe'],
                    fields: ['limitConfig'],
                    quote: '일 1회 최대 2천원, 월 3회 최대 6천원',
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'cafe-channel',
                    ruleIds: ['cafe'],
                    fields: ['condition'],
                    quote: '오프라인 매장 이용금액만 캐시백이 제공되며, 앱/웹 이용금액은 제공되지 않습니다. (스타벅스 사이렌 오더 제외)',
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'life-limit',
                    ruleIds: ['convenience', 'cafe', 'wide_transport', 'public_transport', 'ott'],
                    fields: ['condition', 'limitConfig'],
                    quote: '전월 이용금액 Life 서비스 통합 캐시백 한도 10만원 이상 5천원',
                    sourceUrl: 'https://example.com/card',
                    location: 'Life 서비스 통합 캐시백 한도',
                },
                {
                    id: 'new-card',
                    ruleIds: [
                        'convenience',
                        'cafe',
                        'wide_transport',
                        'public_transport',
                        'ott',
                        'cgv',
                        'amusement',
                        'caribbean',
                    ],
                    fields: ['condition'],
                    quote: '최초 신규 발급 회원은 카드 사용 등록월의 다음 달 말까지 10만원 이상 구간 서비스가 적용됩니다.',
                    sourceUrl: 'https://example.com/card',
                },
            ],
            notes: [],
        };
        const sourceText = [
            ...extraction.evidence.map(item => item.quote),
            '편의점 20% 캐시백과 중복 적용이 가능합니다. 중복 적용될 경우 캐시백은 즉시할인 금액이 차감된 금액에서 적용됩니다.',
            '해군 부대 내 입점 된 GS25 해군마트의 경우, ‘슈퍼쏠저’의 군마트(P.X.) 20% 캐시백 서비스가 적용되며, 서비스 횟수 및 한도 초과 시, ‘Life 서비스’의 편의점 20% 캐시백이 적용됩니다.',
        ].join('\n');

        const normalizationInput = {
            card: {
                id: 'shinhan_nara',
                name: '신한 나라사랑카드',
                company: '신한카드',
                color: 'bg-blue-500',
                limitTable: extraction.card.limitTable,
            },
            sourceUrl: 'https://example.com/card',
            sourceText,
            catalog: {
                categories: [],
                brands: [
                    { id: 'cu', name: 'CU', categoryId: 'convenience' },
                    { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' },
                    { id: 'gs25', name: 'GS25', categoryId: 'convenience' },
                    { id: 'starbucks', name: '스타벅스', categoryId: 'cafe' },
                    { id: 'ediya', name: '이디야', categoryId: 'cafe' },
                    { id: 'caribbean', name: '캐리비안베이', categoryId: 'movie' },
                    { id: 'rail', name: '철도(KTX/SRT/ITX 등)', categoryId: 'transport' },
                    { id: 'intercity_bus', name: '고속/시외버스', categoryId: 'transport' },
                    { id: 'transport_public', name: '버스/지하철', categoryId: 'transport' },
                    { id: 'youtube', name: '유튜브/유튜브 프리미엄', categoryId: 'subscription' },
                ],
            },
        };
        const normalized = normalizeEvidenceBackedCardBenefitExtraction(
            extraction,
            normalizationInput,
        );
        const byId = new Map(normalized.rules.map(ruleRow => [ruleRow.id, ruleRow]));

        expect(byId.get('px_low')).toMatchObject({
            condition: { maxSpendExclusive: 30_000 },
            limitConfig: { dailyAmount: 1_000 },
        });
        expect(byId.get('px_low')?.condition.maxSpend).toBeUndefined();
        expect(byId.get('px_high')?.condition.minSpend).toBe(30_000);
        expect(byId.get('px_low')?.sharedGroupId).toBe(
            'shared_px_low_px_high_monthly'
        );
        expect(byId.get('px_high')?.sharedGroupId).toBe(
            'shared_px_low_px_high_monthly'
        );
        expect(byId.get('px_high')?.detail).not.toContain('초과');
        expect(byId.get('convenience')).toMatchObject({
            includedBrands: ['cu', 'gs25', 'cu_event'],
            usesCardLimit: true,
            condition: { applicationOrder: 2 },
            action: { amountBasis: 'REMAINING_AMOUNT' },
            limitConfig: { dailyAmount: 1_000 },
        });
        expect(byId.get('cafe')).toMatchObject({
            platformType: 'OFFLINE',
            sharedGroupId: 'shared_cafe_channel_limits',
        });
        expect(byId.get('cafe_siren_order')).toMatchObject({
            includedBrands: ['starbucks'],
            platformType: 'ONLINE',
            sharedGroupId: 'shared_cafe_channel_limits',
            condition: {
                minPerformance: 100_000,
                manualCheckRequired: true,
            },
            limitConfig: {
                dailyCount: 1,
                dailyAmount: 2_000,
                monthlyCount: 3,
                monthlyAmount: 6_000,
            },
        });
        expect(byId.get('px_low_z_life_convenience_fallback')).toMatchObject({
            includedBrands: ['military_px'],
            platformType: 'OFFLINE',
            usesCardLimit: true,
            sharedGroupId: 'shared_convenience_gs25_navy_life',
            condition: {
                minPerformance: 100_000,
                manualCheckRequired: true,
            },
            action: { type: 'PERCENT', value: 20, amountBasis: 'ORIGINAL_AMOUNT' },
            limitConfig: {
                dailyCount: 1,
                monthlyCount: 5,
                monthlyAmount: 5_000,
            },
        });
        expect(byId.get('convenience')?.sharedGroupId).toBe(
            'shared_convenience_gs25_navy_life'
        );
        expect(byId.get('cu_event')).toMatchObject({
            usesCardLimit: false,
            condition: { applicationOrder: 1 },
            action: { amountBasis: 'ORIGINAL_AMOUNT' },
        });
        expect(byId.get('cgv')).toMatchObject({
            usesCardLimit: false,
            condition: {
                performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                eligibleItemSummary: 'CGV 2D 영화 관람권 1매 금액',
            },
        });
        expect(byId.get('amusement')?.condition.performanceWaiver).toBeUndefined();
        expect(byId.get('amusement')?.includedBrands).toEqual(['everland']);
        expect(byId.get('wide_transport')?.condition).toMatchObject({
            manualCheckRequired: true,
        });
        expect(byId.get('wide_transport')?.condition.requiredNote).toContain('SRT');
        expect(byId.get('wide_transport')?.condition.requiredNote).not.toContain('대상(철도');
        expect(byId.get('public_transport')?.condition.manualCheckRequired).toBeUndefined();
        expect(byId.get('public_transport')?.condition.requiredNote).toBeUndefined();
        expect(byId.get('ott')?.condition.requiredNote).toBe(
            '결제 경로가 공식 홈페이지의 자동납부인지 확인해야 합니다.'
        );
        expect(normalized.evidence.some(item => item.location === '중복 혜택 적용 순서')).toBe(true);
        expect(normalized.evidence.some(item => (
            item.location === 'GS25 해군마트 군마트 한도 초과 후 Life 편의점 적용'
        ))).toBe(true);

        const sourceCoverageErrors = validateCardBenefitExtraction(
            extraction,
            normalizationInput,
        ).errors;
        expect(sourceCoverageErrors).toEqual(expect.arrayContaining([
            '스타벅스 사이렌 오더 예외가 온라인 조건부 규칙으로 구조화되지 않았습니다.',
            'GS25 해군마트의 군마트 한도 초과 후 Life 편의점 전환 규칙이 누락됐습니다.',
        ]));
        const repairedCoverageErrors = validateCardBenefitExtraction(
            normalized,
            normalizationInput,
        ).errors;
        expect(repairedCoverageErrors).not.toEqual(expect.arrayContaining([
            expect.stringContaining('사이렌 오더 예외'),
            expect.stringContaining('해군마트의 군마트 한도 초과'),
        ]));

        const calculationCard: Card = {
            id: 'shinhan_nara',
            name: '신한 나라사랑카드',
            company: '신한카드',
            color: 'bg-blue-500',
            limitTable: extraction.card.limitTable,
        };
        const cuResult = calculateBestCards(
            5_000,
            { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' },
            [calculationCard],
            normalized.rules,
            [],
            [{ cardId: calculationCard.id, performanceMonth: '2026-08', amount: 100_000 }],
            false,
            {
                eligibleItemAmount: 5_000,
                confirmedConditionIds: ['card-rule:cu_event'],
            },
        )[0];
        expect(cuResult.calculatedDiscount).toBe(1_400);
        expect(cuResult.matchedBenefits.map(benefit => benefit.rule.id)).toEqual([
            'cu_event',
            'convenience',
        ]);

        const sirenOrderResult = calculateBestCards(
            10_000,
            { id: 'starbucks', name: '스타벅스', categoryId: 'cafe' },
            [calculationCard],
            normalized.rules,
            [],
            [{ cardId: calculationCard.id, performanceMonth: '2026-08', amount: 100_000 }],
            true,
            { confirmedConditionIds: ['card-rule:cafe_siren_order'] },
        )[0];
        expect(sirenOrderResult.calculatedDiscount).toBe(500);
        expect(sirenOrderResult.matchedBenefits[0]?.rule.id).toBe('cafe_siren_order');
        const sirenAfterOfflineCafeUse = calculateBestCards(
            10_000,
            { id: 'starbucks', name: '스타벅스', categoryId: 'cafe' },
            [calculationCard],
            normalized.rules,
            [{
                id: 'previous-cafe',
                date: new Date().toISOString(),
                brandId: 'starbucks',
                cardId: calculationCard.id,
                amount: 10_000,
                discountAmount: 500,
                combinationSnapshot: {
                    steps: [{
                        ruleId: 'cafe',
                        benefitAmount: 500,
                        certainty: 'CONFIRMED',
                    }],
                },
            }],
            [{ cardId: calculationCard.id, performanceMonth: '2026-08', amount: 100_000 }],
            true,
            { confirmedConditionIds: ['card-rule:cafe_siren_order'] },
        )[0];
        expect(sirenAfterOfflineCafeUse.calculatedDiscount).toBe(0);

        const pxBelowBoundary = calculateBestCards(
            29_999,
            { id: 'military_px', name: '군마트/PX', categoryId: 'etc' },
            [calculationCard],
            normalized.rules,
            [],
            [],
        )[0];
        const pxAtBoundary = calculateBestCards(
            30_000,
            { id: 'military_px', name: '군마트/PX', categoryId: 'etc' },
            [calculationCard],
            normalized.rules,
            [],
            [],
            false,
            { confirmedConditionIds: ['card-rule:px_high'] },
        )[0];
        expect(pxBelowBoundary.calculatedDiscount).toBe(1_000);
        expect(pxAtBoundary.calculatedDiscount).toBe(6_000);

        const pxSharedMonthlyRemaining = calculateBestCards(
            29_999,
            { id: 'military_px', name: '군마트/PX', categoryId: 'etc' },
            [calculationCard],
            normalized.rules,
            [{
                id: 'previous-px-high',
                date: new Date().toISOString(),
                brandId: 'military_px',
                cardId: calculationCard.id,
                amount: 500_000,
                discountAmount: 99_500,
                combinationSnapshot: {
                    steps: [{
                        ruleId: 'px_high',
                        benefitAmount: 99_500,
                        certainty: 'CONFIRMED',
                    }],
                },
            }],
            [],
        )[0];
        expect(pxSharedMonthlyRemaining.calculatedDiscount).toBe(500);

        const navyMartFallback = calculateBestCards(
            6_000,
            { id: 'military_px', name: '군마트/PX', categoryId: 'etc' },
            [calculationCard],
            normalized.rules,
            [{
                id: 'previous-px-low',
                date: new Date().toISOString(),
                brandId: 'military_px',
                cardId: calculationCard.id,
                amount: 10_000,
                discountAmount: 1_000,
                combinationSnapshot: {
                    steps: [{
                        ruleId: 'px_low',
                        benefitAmount: 1_000,
                        certainty: 'CONFIRMED',
                    }],
                },
            }],
            [{ cardId: calculationCard.id, performanceMonth: '2026-08', amount: 100_000 }],
            false,
            {
                confirmedConditionIds: [
                    'card-rule:px_low_z_life_convenience_fallback',
                ],
            },
        )[0];
        expect(navyMartFallback.calculatedDiscount).toBe(1_000);
        expect(navyMartFallback.matchedBenefits[0]?.rule.id).toBe(
            'px_low_z_life_convenience_fallback'
        );
    });

    it('adds a missing source-backed stacking condition to the inventory', () => {
        const inventory = cardBenefitOpenAIInventorySchema.parse({
            confidence: 0.9,
            sections: [
                {
                    id: 'convenience',
                    title: '편의점 20% 캐시백',
                    summary: '편의점 20% 캐시백',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: '편의점 20% 캐시백',
                    page: null,
                },
                {
                    id: 'cu-event',
                    title: 'CU 행사상품 10% 즉시할인',
                    summary: 'CU 행사상품 10% 즉시할인',
                    kind: 'BENEFIT',
                    appliesToSectionIds: [],
                    sourceUrl: 'https://example.com/card',
                    quote: 'CU 행사상품 10% 즉시할인',
                    page: null,
                },
            ],
            notes: [],
        });
        const stackingLine = '편의점 20% 캐시백과 중복 적용이 가능합니다. 중복 적용될 경우 캐시백은 즉시할인 금액이 차감된 금액에서 적용됩니다.';
        const completed = completeInventoryStackingChecklist(inventory, {
            card,
            sourceUrl: 'https://example.com/card',
            sourceText: `${inventory.sections.map(section => section.quote).join('\n')}\n${stackingLine}`,
        });
        const added = completed.sections.find(section => section.id.startsWith('fallback_stacking_'));

        expect(added).toMatchObject({
            kind: 'CONDITION',
            quote: stackingLine,
        });
        expect(added?.appliesToSectionIds).toEqual(expect.arrayContaining([
            'convenience',
            'cu-event',
        ]));
    });

    it('rejects a rule not named in the official integrated-limit scope', () => {
        const genericCard: Card = {
            id: 'generic-card',
            name: '테스트 카드',
            company: '테스트',
            color: 'bg-black',
            limitTable: [{ threshold: 100_000, limit: 5_000 }],
        };
        const benefitQuote = '놀이공원 이용권 50% 할인, 월 1회 제공';
        const scopeQuote = '월간 통합할인한도 적용 대상 서비스 : 대중교통, 서점';
        const extraction = {
            schemaVersion: 2 as const,
            completeness: 'FULL' as const,
            card: {
                id: genericCard.id,
                name: genericCard.name,
                company: genericCard.company,
                limitTable: genericCard.limitTable,
            },
            rules: [{
                id: 'generic-amusement',
                cardId: genericCard.id,
                includedBrands: ['everland'],
                excludedBrands: [],
                platformType: 'OFFLINE' as const,
                usesCardLimit: true,
                description: '놀이공원 이용권 50% 할인',
                detail: '',
                condition: { minPerformance: 100_000 },
                action: { type: 'PERCENT' as const, value: 50 },
                limitConfig: { monthlyCount: 1 },
            }],
            evidence: [
                {
                    id: 'amusement',
                    ruleIds: ['generic-amusement'],
                    fields: ['description', 'action', 'limitConfig'] as const,
                    quote: benefitQuote,
                    sourceUrl: 'https://example.com/card',
                    location: '놀이공원 이용권 할인',
                },
                {
                    id: 'integrated-scope',
                    ruleIds: ['generic-amusement'],
                    fields: ['condition'] as const,
                    quote: scopeQuote,
                    sourceUrl: 'https://example.com/card',
                    location: '통합한도 적용 대상 서비스',
                },
            ],
            notes: [],
        };

        const validation = validateCardBenefitExtraction(extraction, {
            card: genericCard,
            sourceUrl: 'https://example.com/card',
            sourceText: `${benefitQuote}\n${scopeQuote}`,
        }, {
            brandIds: new Set(['everland']),
        });

        expect(validation.errors).toContain(
            '공식 통합한도 대상 목록에 없는 규칙이 연결됐습니다: 놀이공원 이용권 50% 할인',
        );
    });

    it('uses two Responses API structured outputs without a JSON-string transport', async () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const firstEvidence = extraction.evidence[0];
        const inventory = {
            confidence: 0.93,
            sections: [{
                id: 'foreign_payment',
                title: '해외 결제 혜택',
                summary: '해외 결제 관련 혜택',
                kind: 'BENEFIT',
                appliesToSectionIds: [],
                sourceUrl: input.sourceUrl,
                quote: firstEvidence.quote,
                page: null,
            }],
            notes: [],
        };
        const structured = {
            confidence: 0.91,
            coverage: [{
                sectionId: 'foreign_payment',
                ruleIds: [firstEvidence.ruleIds[0]],
            }],
            extraction: toOpenAIExtraction(extraction),
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(openAIResponse(inventory)), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify(openAIResponse(structured)), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new OpenAICardBenefitExtractionProvider({
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
        }).extract(input);
        const inventoryRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        const extractionRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

        expect(cardBenefitOpenAIInventorySchema.parse(inventory)).toEqual(inventory);
        expect(cardBenefitOpenAIExtractionSchema.parse(structured)).toEqual(structured);
        expect(inventoryRequest).toMatchObject({
            model: 'gpt-5.6-luna',
            store: false,
            text: { format: { type: 'json_schema', strict: true } },
        });
        expect(extractionRequest.text.format.schema.properties)
            .toHaveProperty('extraction');
        expect(extractionRequest.text.format.schema.properties)
            .not.toHaveProperty('extractionJson');
        expect(extractionRequest.instructions).toContain(
            '전월 실적 구간에 따라 할인율·적립률 자체가 달라지는 표는 금액 한도가 아닙니다.',
        );
        expect(extractionRequest.instructions).toContain(
            '“전월 이용금액 N원 이상”을 minSpend로 옮기지 마세요.',
        );
        expect(result.extraction.rules).toHaveLength(13);
        expect(result.confidence).toBe(0.91);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('feeds the validated representative rule into the existing calculator', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const gs25 = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };
        const eligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
        )[0];
        const ineligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 299_999 }],
            false,
            { allowPerformanceWaiver: false },
        )[0];

        expect(eligible).toMatchObject({
            calculatedDiscount: 1_000,
            matchedRule: { id: 'sol_domestic_convenience' },
        });
        expect(ineligible.calculatedDiscount).toBe(0);
    });

    it('stacks the CU instant discount with the statement discount on the remaining amount', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const cuEvent = { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' };
        const result = calculateBestCards(
            20_000,
            cuEvent,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
            {
                eligibleItemAmount: 20_000,
                confirmedConditionIds: [
                    'card-rule:sol_cu_event',
                    'card-rule:sol_domestic_convenience',
                ],
            },
        )[0];

        expect(result.calculatedDiscount).toBe(1_950);
        expect(result.confirmedDiscount).toBe(1_950);
        expect(result.matchedBenefits.map(benefit => ({
            ruleId: benefit.rule.id,
            discount: benefit.discount,
        }))).toEqual([
            { ruleId: 'sol_cu_event', discount: 1_000 },
            { ruleId: 'sol_domestic_convenience', discount: 950 },
        ]);
    });

    it('caps stacked benefits at the original payment amount', () => {
        const brand = { id: 'stacked', name: '중복 혜택', categoryId: 'etc' };
        const rules = ['first', 'second'].map((id, index) => ({
            id,
            cardId: card.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: false,
            description: `${index + 1}번 혜택`,
            detail: '결제금액 초과 방지 테스트',
            condition: {
                stackableWithRuleIds: [index === 0 ? 'second' : 'first'],
                applicationOrder: index + 1,
            },
            action: { type: 'FLAT' as const, value: 80 },
            limitConfig: {},
        }));

        const result = calculateBestCards(
            100,
            brand,
            [card],
            rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(100);
        expect(result.matchedBenefits.map(benefit => benefit.discount)).toEqual([80, 20]);
    });

    it('tracks each stacked rule separately when enforcing later usage limits', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const cuEvent = { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' };
        const result = calculateBestCards(
            20_000,
            cuEvent,
            [card],
            extraction.rules,
            [{
                id: 1,
                date: new Date().toISOString(),
                brandId: cuEvent.id,
                cardId: card.id,
                ruleId: 'sol_cu_event',
                amount: 20_000,
                discountAmount: 1_950,
                combinationSnapshot: {
                    steps: [
                        {
                            ruleId: 'sol_cu_event',
                            benefitAmount: 1_000,
                            certainty: 'CONFIRMED',
                        },
                        {
                            ruleId: 'sol_domestic_convenience',
                            benefitAmount: 950,
                            certainty: 'CONFIRMED',
                        },
                    ],
                },
            }],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
            {
                eligibleItemAmount: 20_000,
                confirmedConditionIds: [
                    'card-rule:sol_cu_event',
                    'card-rule:sol_domestic_convenience',
                ],
            },
        )[0];

        expect(result.calculatedDiscount).toBe(1_000);
        expect(result.matchedBenefits.map(benefit => benefit.rule.id))
            .toEqual(['sol_cu_event']);
    });

    it('keeps a new-card performance waiver conditional until the user confirms it', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const gs25 = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };
        const conditional = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 0 }],
            false,
        )[0];
        const confirmed = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 0 }],
            false,
            { confirmedConditionIds: ['card-rule:sol_domestic_convenience'] },
        )[0];

        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_000,
        });
        expect(conditional.matchedBenefits[0].requiredChecks)
            .toContain('신규 발급 후 등록월의 다음 달 말 이내인지 확인');
        expect(confirmed).toMatchObject({
            confirmedDiscount: 1_000,
            conditionalDiscount: 0,
        });
    });

    it('uses the first integrated limit tier during a new-card performance waiver', () => {
        const waiverCard: Card = {
            ...card,
            id: 'waiver-card',
            limitTable: [
                { threshold: 100_000, limit: 5_000 },
                { threshold: 0, limit: 0 },
            ],
        };
        const starbucks = { id: 'starbucks', name: '스타벅스', categoryId: 'cafe' };
        const rules = [{
            id: 'waiver-starbucks',
            cardId: waiverCard.id,
            category: 'cafe',
            includedBrands: [starbucks.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: true,
            description: '스타벅스 20% 캐시백',
            detail: '',
            condition: {
                minPerformance: 100_000,
                performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW' as const,
            },
            action: { type: 'PERCENT' as const, value: 20 },
            limitConfig: {},
        }];

        const conditional = calculateBestCards(
            10_000,
            starbucks,
            [waiverCard],
            rules,
            [],
            [{ cardId: waiverCard.id, performanceMonth: '2026-08', amount: 0 }],
        )[0];
        const withoutWaiver = calculateBestCards(
            10_000,
            starbucks,
            [waiverCard],
            rules,
            [],
            [{ cardId: waiverCard.id, performanceMonth: '2026-08', amount: 0 }],
            false,
            { allowPerformanceWaiver: false },
        )[0];

        expect(conditional).toMatchObject({
            calculatedDiscount: 2_000,
            confirmedDiscount: 0,
            conditionalDiscount: 2_000,
            monthlyMaxLimit: 5_000,
            remainingLimit: 5_000,
        });
        expect(withoutWaiver).toMatchObject({
            calculatedDiscount: 0,
            monthlyMaxLimit: 0,
        });
    });

    it('does not match informational zero-value rules to every brand in a category', () => {
        const informationalCard = { ...card, id: 'informational-card' };
        const overseasAtm = { id: 'overseas_atm', name: '해외 ATM', categoryId: 'etc' };
        const result = calculateBestCards(
            100_000,
            overseasAtm,
            [informationalCard],
            [{
                id: 'phone-care',
                cardId: informationalCard.id,
                category: 'etc',
                includedBrands: [],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: false,
                description: '휴대폰 케어',
                detail: '',
                condition: { manualCheckRequired: true },
                action: { type: 'FIXED_PRICE' as const, value: 0 },
                limitConfig: {},
            }],
            [],
            [],
        )[0];

        expect(result).toMatchObject({
            calculatedDiscount: 0,
            isApplicable: false,
            reason: '혜택 없음',
        });
        expect(result.matchedRule).toBeUndefined();
    });

    it('does not consume one benefit limit with another benefit history', () => {
        const groupedCard: Card = {
            ...card,
            id: 'separate-limit-card',
            limitTable: [{ threshold: 100_000, limit: 20_000 }],
        };
        const starbucks = { id: 'starbucks', name: '스타벅스', categoryId: 'cafe' };
        const mcdonalds = { id: 'mcdonalds', name: '맥도날드', categoryId: 'food' };
        const rules = [
            {
                id: 'separate-starbucks',
                cardId: groupedCard.id,
                category: 'cafe',
                includedBrands: [starbucks.id],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: true,
                description: '스타벅스 20% 캐시백',
                detail: '',
                condition: { minPerformance: 100_000 },
                action: { type: 'PERCENT' as const, value: 20 },
                limitConfig: {},
            },
            {
                id: 'separate-fastfood',
                cardId: groupedCard.id,
                category: 'food',
                includedBrands: [mcdonalds.id],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: true,
                description: '패스트푸드 5% 캐시백',
                detail: '',
                condition: { minPerformance: 100_000 },
                action: { type: 'PERCENT' as const, value: 5 },
                limitConfig: { monthlyAmount: 2_000 },
            },
        ];
        const result = calculateBestCards(
            10_000,
            mcdonalds,
            [groupedCard],
            rules,
            [{
                id: 1,
                date: new Date().toISOString(),
                brandId: starbucks.id,
                cardId: groupedCard.id,
                ruleId: 'separate-starbucks',
                amount: 10_000,
                discountAmount: 2_000,
            }],
            [{ cardId: groupedCard.id, performanceMonth: '2026-08', amount: 100_000 }],
        )[0];

        expect(result).toMatchObject({
            calculatedDiscount: 500,
            reason: '5% 혜택',
        });
    });

    it('does not apply Mastercard-only benefits to a domestic card', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const overseas = { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' };
        const result = calculateBestCards(
            20_000,
            overseas,
            [{ ...card, network: 'DOMESTIC' }],
            extraction.rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(0);
        expect(result.reason).toBe('MASTERCARD 카드 전용 혜택');
    });

    it('keeps a network-scoped benefit conditional when the selected card network is unknown', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const overseas = { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' };
        const result = calculateBestCards(
            100_000,
            overseas,
            [{ ...card, network: undefined }],
            extraction.rules,
            [],
            [],
            false,
        )[0];

        expect(result).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_200,
        });
        expect(result.matchedBenefits[0].requiredChecks).toEqual(expect.arrayContaining([
            'MASTERCARD 브랜드 카드인지 확인',
            '해외가맹점에서 수수료가 실제 부과되는 거래인지 확인',
        ]));
    });

    it('keeps the overseas fee waiver conditional until fee eligibility is confirmed', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const overseas = { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' };
        const conditional = calculateBestCards(
            100_000,
            overseas,
            [card],
            extraction.rules,
            [],
            [],
            false,
        )[0];
        const confirmed = calculateBestCards(
            100_000,
            overseas,
            [card],
            extraction.rules,
            [],
            [],
            false,
            { confirmedConditionIds: ['card-rule:sol_overseas_fee'] },
        )[0];

        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_200,
        });
        expect(conditional.matchedBenefits[0].requiredChecks)
            .toContain('해외가맹점에서 수수료가 실제 부과되는 거래인지 확인');
        expect(confirmed).toMatchObject({
            confirmedDiscount: 1_200,
            conditionalDiscount: 0,
        });
    });

    it('drops an expired promotion while preserving the permanent overseas fee waiver', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const promotion = extraction.rules.find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.condition.endsAt = '2000-01-01';
        const brand = {
            id: 'japan_convenience',
            name: '일본 3대 편의점',
            categoryId: 'convenience',
        };

        const result = calculateBestCards(
            20_000,
            brand,
            [card],
            extraction.rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(240);
        expect(result.matchedBenefits.map(benefit => benefit.rule.id))
            .toEqual(['sol_overseas_fee']);
    });

    it('keeps mutually exclusive payment tiers from overlapping', () => {
        const tierCard = { ...card, id: 'tier-card' };
        const brand = { id: 'military_px', name: '군마트', categoryId: 'etc' };
        const rules = [
            {
                id: 'tier-under-30000',
                cardId: tierCard.id,
                includedBrands: [brand.id],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: false,
                description: '3만원 미만 30% 캐시백',
                detail: '',
                condition: { maxSpendExclusive: 30_000 },
                action: { type: 'PERCENT' as const, value: 30 },
                limitConfig: { dailyAmount: 5_000 },
            },
            {
                id: 'tier-from-30000',
                cardId: tierCard.id,
                includedBrands: [brand.id],
                excludedBrands: [],
                platformType: 'ALL' as const,
                usesCardLimit: false,
                description: '3만원 이상 20% 캐시백',
                detail: '',
                condition: { minSpend: 30_000 },
                action: { type: 'PERCENT' as const, value: 20 },
                limitConfig: { dailyAmount: 20_000 },
            },
        ];

        const result = calculateBestCards(
            30_000,
            brand,
            [tierCard],
            rules,
            [],
            [],
        )[0];

        expect(result).toMatchObject({
            calculatedDiscount: 6_000,
            matchedRule: { id: 'tier-from-30000' },
        });
    });

    it('calculates manual checks as conditional benefits until confirmed', () => {
        const conditionalCard = { ...card, id: 'conditional-card' };
        const brand = { id: 'taxi', name: '택시', categoryId: 'transport' };
        const rules = [{
            id: 'salary-taxi',
            cardId: conditionalCard.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: false,
            description: '택시 20% 캐시백',
            detail: '',
            condition: {
                manualCheckRequired: true,
                requiredNote: '군 급여이체 조건 확인',
            },
            action: { type: 'PERCENT' as const, value: 20 },
            limitConfig: { monthlyAmount: 5_000 },
        }];

        const conditional = calculateBestCards(
            10_000,
            brand,
            [conditionalCard],
            rules,
            [],
            [],
        )[0];
        const confirmed = calculateBestCards(
            10_000,
            brand,
            [conditionalCard],
            rules,
            [],
            [],
            false,
            { confirmedConditionIds: ['card-rule:salary-taxi'] },
        )[0];

        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 2_000,
        });
        expect(confirmed).toMatchObject({
            confirmedDiscount: 2_000,
            conditionalDiscount: 0,
        });
    });

    it('normalizes payment caps, schedules, and shared performance-tier limits from evidence', () => {
        const timeRules: BenefitRule[] = ['night-shopping', 'night-taxi'].map(id => ({
            id,
            cardId: 'mr-life',
            includedBrands: [id],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description: `Night ${id} 10% 할인`,
            detail: id === 'night-taxi'
                ? '택시 할인입니다. 제외·유의: 쿠팡은 사이트 직접 접속 시에만 할인됩니다.'
                : '쿠팡 온라인쇼핑 할인입니다.',
            condition: {
                maxSpend: 10_000,
                minPerformance: 300_000,
                eligibleItemSummary: id === 'night-taxi' ? '택시' : '쿠팡',
            },
            action: { type: 'PERCENT', value: 10 },
            limitConfig: { dailyCount: 1, monthlyCount: 10 },
        }));
        const limitQuote = '전월 이용금액 할인한도 30만원 이상 50만원 미만 1만원 ' +
            '50만원 이상 100만원 미만 2만원 100만원 이상 3만원';
        const transactionQuote = '오후 9시~오전 9시, 1회 승인금액 1만원까지 할인 적용' +
            '(1회 최대 1천원 할인)';
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: 'mr-life',
                name: 'Mr.Life',
                company: '신한카드',
                limitTable: [],
            },
            rules: timeRules,
            evidence: [
                {
                    id: 'time-benefit',
                    ruleIds: timeRules.map(ruleRow => ruleRow.id),
                    fields: ['description', 'condition', 'action'],
                    quote: transactionQuote,
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'time-limit-all-day',
                    ruleIds: [timeRules[0].id],
                    fields: ['limitConfig'],
                    quote: limitQuote,
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'time-limit-night',
                    ruleIds: [timeRules[1].id],
                    fields: ['limitConfig'],
                    quote: limitQuote,
                    sourceUrl: 'https://example.com/card',
                },
                {
                    id: 'shopping-direct-access',
                    ruleIds: timeRules.map(ruleRow => ruleRow.id),
                    fields: ['condition'],
                    quote: '쿠팡은 사이트 직접 접속 시에만 할인됩니다.',
                    sourceUrl: 'https://example.com/card',
                },
            ],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedRuleMechanics(extraction, {
            card: { ...card, id: 'mr-life', name: 'Mr.Life' },
            sourceUrl: 'https://example.com/card',
            sourceText: `${transactionQuote}\n${limitQuote}\n쿠팡은 사이트 직접 접속 시에만 할인됩니다.`,
        });

        normalized.rules.forEach(ruleRow => {
            expect(ruleRow.condition.maxSpend).toBeUndefined();
            expect(ruleRow.condition.timeRanges).toEqual([
                { startTime: '21:00', endTime: '09:00' },
            ]);
            expect(ruleRow.action.maxDiscount).toBe(1_000);
            expect(ruleRow.limitConfig.monthlyAmountByPerformance).toEqual([
                { threshold: 300_000, limit: 10_000 },
                { threshold: 500_000, limit: 20_000 },
                { threshold: 1_000_000, limit: 30_000 },
            ]);
            expect(ruleRow.limitConfig.sharedFields).toEqual(['monthlyAmount']);
        });
        expect(normalized.rules[0].sharedGroupId).toBe(normalized.rules[1].sharedGroupId);
        expect(normalized.evidence.find(item => item.id === 'shopping-direct-access')?.ruleIds)
            .toEqual(['night-shopping']);
        expect(normalized.rules[1].detail).not.toContain('쿠팡');
    });

    it('blocks a positive official-site benefit without a merchant mapping', () => {
        const quote = '인테이크몰 직접 접속 결제 시 20% 할인';
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: 'mr-life',
                name: 'Mr.Life',
                company: '신한카드',
                limitTable: [],
            },
            rules: [{
                id: 'intake',
                cardId: 'mr-life',
                includedBrands: [],
                excludedBrands: [],
                platformType: 'OFFICIAL_SITE',
                usesCardLimit: false,
                description: '인테이크몰 20% 할인',
                detail: '',
                condition: {},
                action: { type: 'PERCENT', value: 20 },
                limitConfig: {},
            }],
            evidence: [{
                id: 'intake-benefit',
                ruleIds: ['intake'],
                fields: ['description', 'action'],
                quote,
                sourceUrl: 'https://example.com/card',
            }],
            notes: [],
        };

        expect(validateCardBenefitExtraction(extraction, {
            card: { ...card, id: 'mr-life', name: 'Mr.Life' },
            sourceUrl: 'https://example.com/card',
            sourceText: quote,
        }).errors).toContain('공식 사이트 전용 혜택에 가맹점 매핑이 없습니다: 인테이크몰 20% 할인');
    });

    it('does not treat an excluded subtype as excluding its parent merchant group', () => {
        const quote = '병원/약국 10% 할인서비스 대상에서 동물병원은 제외되며 치과, 한의원은 포함됩니다.';
        const extraction: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: 'mr-life',
                name: 'Mr.Life',
                company: '신한카드',
                limitTable: [],
            },
            rules: [{
                id: 'medical',
                cardId: 'mr-life',
                includedBrands: ['medical'],
                excludedBrands: [],
                platformType: 'ALL',
                usesCardLimit: false,
                description: '병원·약국 10% 할인',
                detail: quote,
                condition: {
                    eligibleItemSummary: '병원/약국 업종',
                    manualCheckRequired: true,
                    requiredNote: '선택한 통합 브랜드에 공식 제외 대상(병원·약국)이 섞일 수 있어 실제 이용 대상을 확인해야 합니다.',
                },
                action: { type: 'PERCENT', value: 10 },
                limitConfig: {},
            }],
            evidence: [{
                id: 'medical-exclusion',
                ruleIds: ['medical'],
                fields: ['condition'],
                quote,
                sourceUrl: 'https://example.com/card',
            }],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(extraction, {
            card: { ...card, id: 'mr-life', name: 'Mr.Life' },
            sourceUrl: 'https://example.com/card',
            sourceText: quote,
            catalog: {
                categories: [{ id: 'life', name: '생활' }],
                brands: [{ id: 'medical', name: '병원/약국 업종', categoryId: 'life' }],
            },
        });

        expect(normalized.rules[0].condition.requiredNote).toBeUndefined();
    });

    it('uses only the entered eligible-item amount for a product-specific card benefit', () => {
        const itemCard = { ...card, id: 'item-card' };
        const brand = { id: 'cgv', name: 'CGV', categoryId: 'movie' };
        const rules = [{
            id: 'free-popcorn-set',
            cardId: itemCard.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: false,
            description: '팝콘 스몰세트 무료',
            detail: '',
            condition: {
                itemSpecific: true,
                eligibleItemSummary: '팝콘 스몰세트 가격',
                manualCheckRequired: true,
                requiredNote: '군 급여이체 조건 확인',
            },
            action: { type: 'FIXED_PRICE' as const, value: 0 },
            limitConfig: { monthlyCount: 1 },
        }];

        const missingAmount = calculateBestCards(
            50_000,
            brand,
            [itemCard],
            rules,
            [],
            [],
        )[0];
        const conditional = calculateBestCards(
            50_000,
            brand,
            [itemCard],
            rules,
            [],
            [],
            false,
            { eligibleItemAmount: 8_000 },
        )[0];

        expect(missingAmount.calculatedDiscount).toBe(0);
        expect(missingAmount.reason).toBe('혜택 대상 상품 금액 입력 필요');
        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 8_000,
        });
    });
});
