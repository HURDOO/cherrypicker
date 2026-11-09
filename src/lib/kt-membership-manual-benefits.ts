import type {
    LimitConfig,
    PromotionAction,
    PromotionChannel,
    PromotionCondition,
    PromotionRequiredInput,
} from '@/types';

/**
 * KT membership standing benefits read by hand from the official partner detail pages
 * (membership.kt.com, Claude in Chrome at human pace, 2026-11-10; TASK-15 T2 option 1).
 * The KT site does not answer the collector, so these are registered as admin-made
 * candidates. Each entry keeps the detail page code; the page text excerpt is stored as
 * the candidate's raw content when registering.
 */

export const KT_PROVIDER_ID = 'kt';
export const KT_PARTNER_DETAIL_BASE = 'https://membership.kt.com/discount/partner';

export const KT_TIERS_ALL = ['VVIP', 'VIP', 'GOLD', 'SILVER', 'WHITE', '일반'] as const;
const VIP_TIERS = ['VVIP', 'VIP'];
const BASE_TIERS = ['GOLD', 'SILVER', 'WHITE', '일반'];

type CalculationMode = NonNullable<PromotionCondition['calculationMode']>;
type Scope = NonNullable<PromotionCondition['applicabilityScope']>;

export interface KtManualBenefit {
    /** Partner detail code, e.g. `C21/70`. */
    pageCode: string;
    /** Distinguishes tier variants of one page. */
    variant: string;
    brandId: string;
    brandName: string;
    title: string;
    description: string;
    tiers: string[];
    channels: PromotionChannel[];
    action: PromotionAction;
    calculationMode: CalculationMode;
    scope: Scope;
    eligibleItemSummary?: string;
    requiredNote?: string;
    minSpend?: number;
    requiresCoupon?: boolean;
    limitConfig: LimitConfig;
}

const percent = (value: number, maxBenefit?: number, unitAmount?: number): PromotionAction => ({
    type: 'PERCENT',
    value,
    valueSemantics: 'EXACT',
    ...(maxBenefit !== undefined && { maxBenefit }),
    ...(unitAmount !== undefined && { unitAmount }),
});

const dailyOnce = (maxBenefit?: number): LimitConfig => ({
    dailyCount: 1,
    ...(maxBenefit !== undefined && { dailyAmount: maxBenefit }),
    sharedFields: maxBenefit !== undefined ? ['dailyCount', 'dailyAmount'] : ['dailyCount'],
});

/** Two tier groups with the same rate shape: VVIP/VIP and GOLD/SILVER/WHITE/일반. */
function tierPair(
    base: Omit<KtManualBenefit, 'variant' | 'title' | 'tiers' | 'action' | 'limitConfig'>,
    vip: { rate: number; maxBenefit?: number; unitAmount?: number },
    rest: { rate: number; maxBenefit?: number; unitAmount?: number },
    label: (rate: number) => string = rate => `${rate}% 할인`,
): KtManualBenefit[] {
    return [
        {
            ...base,
            variant: 'vip',
            title: `${base.brandName} VVIP/VIP ${label(vip.rate)}`,
            tiers: VIP_TIERS,
            action: percent(vip.rate, vip.maxBenefit, vip.unitAmount),
            limitConfig: dailyOnce(vip.maxBenefit),
        },
        {
            ...base,
            variant: 'base',
            title: `${base.brandName} GOLD/SILVER/WHITE/일반 ${label(rest.rate)}`,
            tiers: BASE_TIERS,
            action: percent(rest.rate, rest.maxBenefit, rest.unitAmount),
            limitConfig: dailyOnce(rest.maxBenefit),
        },
    ];
}

const storeWide = {
    calculationMode: 'CALCULABLE' as const,
    scope: 'STORE_WIDE' as const,
};

const perThousand = (rate: number) => `1,000원당 ${rate * 10}원 할인`;

export const KT_MANUAL_BENEFITS: KtManualBenefit[] = [
    ...tierPair({
        pageCode: 'C21/70',
        brandId: 'outback',
        brandName: '아웃백',
        description: 'VVIP/VIP 15%, GOLD/SILVER/WHITE/일반 5% 할인, 일 1회, 결제금액 최대 20만원 한도',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '아웃백 지류상품권·기프트카드 및 일부 상품 결제 시 적용되지 않고, 타 제휴할인과 중복되지 않습니다.',
    }, { rate: 15, maxBenefit: 30_000 }, { rate: 5, maxBenefit: 10_000 }),
    {
        pageCode: 'C21/59',
        variant: 'size-up',
        brandId: 'starbucks',
        brandName: '스타벅스',
        title: '스타벅스 전 등급 음료 사이즈업',
        description: 'KT멤버십 전등급 음료 사이즈업(제조음료 1개), 월 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: { type: 'FLAT', value: 0, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '제조음료 1개 사이즈업, 월 1회',
        requiredNote: '일부 매장은 제외되고, 타 쿠폰·이용권과 중복되지 않습니다.',
        limitConfig: { monthlyCount: 1, sharedFields: ['monthlyCount'] },
    },
    {
        pageCode: 'C21/63',
        variant: 'americano-coupon',
        brandId: 'mega',
        brandName: '메가MGC커피',
        title: '메가MGC커피 전 등급 아메리카노 500원 할인 쿠폰',
        description: 'HOT/ICE 아메리카노 구매 시 500원 할인 쿠폰 3장(월 1회 다운로드), 영수증당 1장',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: { type: 'FLAT', value: 500, valueSemantics: 'EXACT', maxBenefit: 500 },
        calculationMode: 'CONDITIONAL',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: 'HOT/ICE 아메리카노(쿠폰 1장당 500원, 영수증당 1장)',
        requiredNote: 'KT멤버십 앱에서 매월 쿠폰 3장을 먼저 받아야 하고(선착순), 발급한 달 말일까지 쓸 수 있습니다. 타 제휴 쿠폰과 중복되지 않습니다.',
        requiresCoupon: true,
        limitConfig: { monthlyCount: 3, sharedFields: ['monthlyCount'] },
    },
    {
        pageCode: 'C21/184',
        variant: 'all',
        brandId: 'gongcha',
        brandName: '공차',
        title: '공차 전 등급 제조음료 10% 할인',
        description: '제조음료 10% 현장 할인, 일 1회, 최대 2만원',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: percent(10, 20_000),
        calculationMode: 'CONDITIONAL',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '제조음료(푸드·콤보·세트·행사 품목 제외)',
        requiredNote: '백화점·마트·휴게소 등 특수매장과 일부 매장은 제외되고, 타 쿠폰·제휴할인·스탬프 적립과 중복되지 않습니다.',
        limitConfig: dailyOnce(20_000),
    },
    ...tierPair({
        pageCode: 'C21/75',
        brandId: 'papa_johns',
        brandName: '파파존스피자',
        description: 'VVIP/VIP 30%, GOLD/SILVER/WHITE/일반 15% 할인, 일 1회',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '매장 주문은 KT멤버십 카드를 제시하고, 콜센터 주문은 미리 할인을 요청해야 합니다. 세트 메뉴·쿠폰·제휴 할인·매장 행사와 중복되지 않고 일부 특수 매장은 제외됩니다.',
    }, { rate: 30 }, { rate: 15 }),
    ...tierPair({
        pageCode: 'C21/68',
        brandId: 'domino',
        brandName: '도미노피자',
        description: 'VVIP/VIP 20%, GOLD/SILVER/WHITE/일반 15% 할인, 일 1회, 결제금액 최대 20만원 한도, 전 채널',
        channels: ['ALL'],
        ...storeWide,
        requiredNote: '본인 KT멤버십 카드와 신분증을 함께 제시해야 하고, 배달 주문은 미리 할인을 요청해야 합니다. 야구장·리조트 등 일부 특수점포는 제외되고 타 쿠폰·이용권과 중복되지 않습니다.',
    }, { rate: 20, maxBenefit: 40_000 }, { rate: 15, maxBenefit: 30_000 }),
    {
        pageCode: 'C21/99',
        variant: 'all',
        brandId: 'pizzahut',
        brandName: '피자헛',
        title: '피자헛 전 등급 15% 할인',
        description: '15% 할인, 일 1회, 결제금액 최대 20만원 한도, 매장·배달·온라인',
        tiers: [...KT_TIERS_ALL],
        channels: ['ALL'],
        action: percent(15, 30_000),
        ...storeWide,
        requiredNote: '본인 KT멤버십 카드와 신분증을 함께 제시해야 하고(온라인은 카드번호 인증), 익스프레스 매장(잠실야구장점, 천안삼성SDI점)은 제외됩니다.',
        limitConfig: dailyOnce(30_000),
    },
    ...tierPair({
        pageCode: 'C21/107',
        brandId: 'official_792c9f221e49eb7e',
        brandName: '미스터피자',
        description: 'VVIP/VIP 20%, GOLD/SILVER/WHITE/일반 15% 할인, 일 1회, 결제금액 최대 20만원 한도, 매장·배달·온라인',
        channels: ['ALL'],
        ...storeWide,
        requiredNote: '본인 KT멤버십 카드와 신분증을 함께 제시해야 하고, 배달 주문은 미리 할인을 요청해야 합니다. 타 쿠폰·이용권과 중복되지 않습니다.',
    }, { rate: 20, maxBenefit: 40_000 }, { rate: 15, maxBenefit: 30_000 }),
    ...tierPair({
        pageCode: 'C21/82',
        brandId: 'vips',
        brandName: 'VIPS',
        description: 'VVIP/VIP 15%, GOLD/SILVER/WHITE/일반 5% 할인, 일 1회, 할인 전 주문금액 20만원 한도',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '타 쿠폰·행사(매니아 데이 등)·타 제휴할인과 중복되지 않고, 인천공항 VIPS Express점은 제외됩니다.',
    }, { rate: 15, maxBenefit: 30_000 }, { rate: 5, maxBenefit: 10_000 }),
    {
        pageCode: 'C23/65',
        variant: 'online-booking',
        brandId: 'cgv',
        brandName: 'CGV',
        title: 'CGV 전 등급 최대 5,000원 할인',
        description: 'KT멤버십 앱/웹 예매 시 최대 5,000원 할인(동반 4인까지 같은 할인), 일 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE'],
        action: { type: 'FLAT', value: 5_000, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: 'KT멤버십 앱/웹에서 예매한 2D 영화 티켓(12,000~16,000원) 1매당 1,000~5,000원 할인, 동반 4인까지',
        requiredNote: 'KT멤버십 앱/웹 예매에만 적용되고 현장 할인은 되지 않습니다. 특별관(IMAX·Sweet Box·3D·4D)과 조조·청소년 요금은 제외됩니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C23/61',
        variant: 'online-booking',
        brandId: 'lotte_cinema',
        brandName: '롯데시네마',
        title: '롯데시네마 전 등급 최대 5,000원 할인',
        description: 'KT멤버십 앱/웹 예매 시 최대 5,000원 할인(동반 4인까지 같은 할인), 일 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE'],
        action: { type: 'FLAT', value: 5_000, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: 'KT멤버십 앱/웹에서 예매한 2D 영화 티켓 1매당 1,000~5,000원 할인(평일 10,000원·주말 11,000원에 관람), 동반 4인까지',
        requiredNote: 'KT멤버십 앱/웹 예매에만 적용되고 현장 할인은 되지 않습니다. 문화가 있는 날 17~21시 상영은 제외됩니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C23/67',
        variant: 'online-booking',
        brandId: 'megabox',
        brandName: '메가박스',
        title: '메가박스 전 등급 최대 6,000원 할인',
        description: 'KT멤버십 앱/웹 예매 시 최대 6,000원 할인(동반 4인까지 같은 할인), 일 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE'],
        action: { type: 'FLAT', value: 6_000, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: 'KT멤버십 앱/웹에서 예매한 2D 영화 티켓 1매당 1,000~6,000원 할인(평일 10,000원·주말 11,000원에 관람), 동반 4인까지',
        requiredNote: 'KT멤버십 앱/웹 예매에만 적용되고 현장 할인은 되지 않습니다. 특화관·특수좌석은 추가 금액이 들고 픽쳐하우스는 제외됩니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C23/89',
        variant: 'ticket',
        brandId: 'lotte_world',
        brandName: '롯데월드 어드벤처',
        title: '롯데월드 어드벤처 전 등급 본인 50% 할인',
        description: '본인 50% + 동반 3인 30% 할인, 일 1회, 온/오프라인 예매',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE', 'OFFLINE'],
        action: { type: 'PERCENT', value: 50, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '이용권 본인 50% + 동반 3인 30% 할인(롯데월드 어드벤처 부산 제외)',
        requiredNote: '롯데월드 온/오프라인 예매 때 멤버십 할인을 적용하고, 타 쿠폰·이용권과 중복되지 않습니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C23/106',
        variant: 'ticket',
        brandId: 'everland',
        brandName: '에버랜드',
        title: '에버랜드 전 등급 본인 40% 할인',
        description: '본인 40% + 동반 3인 20% 할인, 1일 1회, 현장 매표',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: { type: 'PERCENT', value: 40, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '현장 매표 이용권 본인 40% + 동반 3인 20% 할인',
        requiredNote: '현장 매표 때만 할인되고 온라인 예매에는 적용되지 않습니다. 타 제휴 카드·쿠폰과 중복되지 않습니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C23/120',
        variant: 'ticket',
        brandId: 'seoul_land',
        brandName: '서울랜드',
        title: '서울랜드 전 등급 본인 40% 할인',
        description: '본인 40% + 동반 2인 30% 할인, 1일 1회, 현장 매표',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: { type: 'PERCENT', value: 40, valueSemantics: 'UP_TO' },
        calculationMode: 'INFORMATION_ONLY',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '현장 매표 이용권 본인 40% + 동반 2인 30% 할인',
        requiredNote: '현장 매표 때만 할인되고 온라인에는 적용되지 않습니다. 타 제휴 카드·쿠폰과 중복되지 않습니다.',
        limitConfig: { dailyCount: 1, sharedFields: ['dailyCount'] },
    },
    {
        pageCode: 'C21/95',
        variant: 'online',
        brandId: 'official_76a65e43844b0eb2',
        brandName: '피자알볼로',
        title: '피자알볼로 전 등급 온라인 주문 15% 할인',
        description: '온라인 선결제 주문 15% 할인, 일 1회, 결제금액 최대 20만원 한도',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE'],
        action: percent(15, 30_000),
        ...storeWide,
        requiredNote: '온라인으로 선결제 주문할 때 멤버십 카드번호를 입력해야 하고, 타 쿠폰·이용권과 중복되지 않습니다.',
        limitConfig: dailyOnce(30_000),
    },
    {
        pageCode: 'C21/191',
        variant: 'online',
        brandId: 'official_57244fb148c377c6',
        brandName: '반올림피자',
        title: '반올림피자 전 등급 앱/웹 주문 20% 할인',
        description: '반올림피자 앱/웹 주문 20% 할인, 일 1회, 하루 최대 3만원',
        tiers: [...KT_TIERS_ALL],
        channels: ['ONLINE'],
        action: percent(20, 30_000),
        ...storeWide,
        requiredNote: '반올림피자 앱/웹 주문에만 적용되고(배달 앱·오프라인 매장 불가) 세트메뉴·사이드 제품은 할인되지 않습니다. 다른 쿠폰·할인·적립과 중복되지 않습니다.',
        limitConfig: dailyOnce(30_000),
    },
    ...tierPair({
        pageCode: 'C21/91',
        brandId: 'official_3990bfc5b70cb670',
        brandName: '매드포갈릭',
        description: 'VVIP/VIP 15%, GOLD/SILVER/WHITE/일반 5% 할인, 일 1회, 주문금액 10만원 한도',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '다른 프로모션·제휴 혜택과 중복되지 않습니다.',
    }, { rate: 15, maxBenefit: 15_000 }, { rate: 5, maxBenefit: 5_000 }),
    {
        pageCode: 'C21/183',
        variant: 'coupon',
        brandId: 'official_1da93338e8beedb8',
        brandName: '샐러디',
        title: '샐러디 전 등급 10% 할인 쿠폰',
        description: '10% 할인 쿠폰(최대 2만원), 일 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['ALL'],
        action: percent(10, 20_000),
        calculationMode: 'CONDITIONAL',
        scope: 'STORE_WIDE',
        requiredNote: 'KT멤버십 앱에서 받은 쿠폰을 샐러디 앱에 등록해야 쓸 수 있고, 발급한 달 말일까지 사용 가능합니다. 연세대점·조선대점·인천대점은 제외됩니다.',
        requiresCoupon: true,
        limitConfig: dailyOnce(20_000),
    },
    ...tierPair({
        pageCode: 'C22/56',
        brandId: 'gs25',
        brandName: 'GS25',
        description: 'VVIP/VIP 1,000원당 100원, GOLD/SILVER/WHITE/일반 1,000원당 50원 할인, 일 1회, 결제금액 최대 20만원 한도',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '행사상품(1+1, 2+1 등), 주류, 담배, 전화카드·택배·상품권·주류공병·종량제 봉투·안전상비의약품 등 일부 서비스 품목은 할인되지 않고, 특수·임시매장은 제외됩니다.',
    }, { rate: 10, maxBenefit: 20_000, unitAmount: 1_000 }, { rate: 5, maxBenefit: 10_000, unitAmount: 1_000 }, perThousand),
    {
        pageCode: 'C22/72',
        variant: 'morning-meal',
        brandId: 'cu',
        brandName: 'CU',
        title: 'CU 전 등급 아침 간편식 1,000원당 200원 할인',
        description: '간편식류 1,000원당 200원 할인, 매일 05~09시, 결제금액 5천원까지, 일 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: percent(20, 1_000, 1_000),
        calculationMode: 'CONDITIONAL',
        scope: 'PRODUCT_SET',
        eligibleItemSummary: '아침 간편식류(김밥·주먹밥·샌드위치·샐러드·도시락·햄버거 등), 결제금액 5천원까지',
        requiredNote: '매일 아침 5~9시에만 쓸 수 있고, 병원·리조트·휴게소 등 특수매장과 행사 품목은 제외됩니다.',
        limitConfig: dailyOnce(1_000),
    },
    ...tierPair({
        pageCode: 'C22/62',
        brandId: 'emart24',
        brandName: '이마트24',
        description: 'VVIP/VIP 1,000원당 100원, GOLD/SILVER/WHITE/일반 1,000원당 50원 할인, 일 1회, 결제금액 최대 20만원 한도',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '주류, 담배, 안전상비의약품, 서비스 등 일부 품목은 할인되지 않고 특수·임시매장은 제외됩니다.',
    }, { rate: 10, maxBenefit: 20_000, unitAmount: 1_000 }, { rate: 5, maxBenefit: 10_000, unitAmount: 1_000 }, perThousand),
    {
        pageCode: 'C21/79',
        variant: 'all',
        brandId: 'official_1d179462edccac50',
        brandName: '브레댄코',
        title: '브레댄코 전 등급 10% 할인',
        description: '10% 할인, 일 1회, 1천원 이상 구매, 결제금액 최대 20만원 한도',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: percent(10, 20_000),
        ...storeWide,
        minSpend: 1_000,
        requiredNote: '일부 매장은 제휴 혜택에서 제외됩니다.',
        limitConfig: dailyOnce(20_000),
    },
    ...tierPair({
        pageCode: 'C21/215',
        brandId: 'official_6433dbbec3b3a805',
        brandName: '라그릴리아',
        description: 'VVIP/VIP 10%, GOLD/SILVER/WHITE/일반 5% 할인(최대 2만원), 일 1회',
        channels: ['OFFLINE'],
        ...storeWide,
        requiredNote: '결제 전 매장 직원에게 KT멤버십 바코드를 제시해야 합니다. 주류·세트·행사 메뉴는 제외되고 공항점은 제외되며, 다른 쿠폰·제휴 할인과 중복되지 않습니다.',
    }, { rate: 10, maxBenefit: 20_000 }, { rate: 5, maxBenefit: 20_000 }),
    {
        pageCode: 'C22/166',
        variant: 'monthly',
        brandId: 'official_721c9dc57004b418',
        brandName: 'GS THE FRESH',
        title: 'GS THE FRESH 전 등급 3천원 할인(5만원 이상)',
        description: '5만원 이상 구매 시 3천원 할인, 월 1회',
        tiers: [...KT_TIERS_ALL],
        channels: ['OFFLINE'],
        action: { type: 'FLAT', value: 3_000, valueSemantics: 'EXACT', maxBenefit: 3_000 },
        ...storeWide,
        minSpend: 50_000,
        requiredNote: '주류, 담배, 종량제봉투, 상품권·택배 등 일부 서비스 상품은 할인되지 않고 5만원 합산에도 들어가지 않습니다.',
        limitConfig: { monthlyCount: 1, sharedFields: ['monthlyCount'] },
    },
];

export const ktPartnerDetailUrl = (pageCode: string) =>
    `${KT_PARTNER_DETAIL_BASE}/${pageCode}/PartnerDetail.do`;

/** Key of one benefit variant; registering it again with new values updates the same offer. */
export const ktManualSourceKey = (benefit: Pick<KtManualBenefit, 'pageCode' | 'variant'>) =>
    `kt-manual:${benefit.pageCode}:${benefit.variant}`;

/** The draft shape `normalizePromotionDraft` accepts, the same as the admin manual form. */
export function buildKtManualOfferDraft(benefit: KtManualBenefit): Record<string, unknown> {
    const requiredInputs: PromotionRequiredInput[] = benefit.requiresCoupon ? ['COUPON'] : [];
    return {
        providerId: KT_PROVIDER_ID,
        usageGroupId: `telecom:kt:brand:${benefit.brandId}`,
        layer: 'DISCOUNT',
        title: benefit.title,
        description: benefit.description,
        brandIds: [benefit.brandId],
        categoryIds: [],
        channels: benefit.channels,
        action: benefit.action,
        condition: {
            amountBasis: 'ORIGINAL_AMOUNT',
            applicabilityScope: benefit.scope,
            calculationMode: benefit.calculationMode,
            ...(benefit.eligibleItemSummary && { eligibleItemSummary: benefit.eligibleItemSummary }),
            requiredInputs,
            ...(benefit.minSpend !== undefined && { minSpend: benefit.minSpend }),
            telecomTiers: benefit.tiers,
            telecomModes: [],
            requiredSubscriptionProducts: [],
            requiresCoupon: Boolean(benefit.requiresCoupon),
            requiresEnrollment: false,
            firstPaymentOnly: false,
            ...(benefit.requiredNote && { requiredNote: benefit.requiredNote }),
        },
        compatibility: {
            requiredPayProviderIds: [],
            allowedFundingTypes: [],
            excludedPromotionIds: [],
            exclusiveGroup: `telecom:kt:${benefit.brandId}`,
            allowStackWithSameLayer: false,
            blocksCardBenefit: false,
            allowResidualPayment: false,
        },
        limitConfig: benefit.limitConfig,
        certainty: benefit.calculationMode === 'CONDITIONAL' ? 'CONDITIONAL' : 'CONFIRMED',
        sourceUrl: ktPartnerDetailUrl(benefit.pageCode),
    };
}
