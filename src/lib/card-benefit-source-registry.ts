import type { OfficialDocumentSourceDefinition } from './official-document-source';

export interface SystemCardBenefitSourceInventoryItem {
    cardId: string;
    sources: Array<{
        label: string;
        url: string;
    }>;
    caveats: string[];
    revisionReviewEnabled: boolean;
}

export const SHINHAN_SOL_TRAVEL_SOURCE_URL =
    'https://www.shinhancard.com/pconts/html/card/apply/check/1225714_2206.html';
export const SHINHAN_SOL_TRAVEL_GUIDE_URL =
    'https://www.shinhancard.com/pconts/html/card/travel/travel_supersol.html';
export const SHINHAN_SOL_TRAVEL_NOTICE_URL =
    'https://www.shinhancard.com/pconts/html/helpdesk/dataRoom/MOBFM164N/1227673_1119.html';

const SHINHAN_CARD_HOSTS = ['shinhancard.com'];

const SYSTEM_CARD_BENEFIT_SOURCE_INVENTORY: SystemCardBenefitSourceInventoryItem[] = [
    {
        cardId: 'shinhan_deep_dream',
        sources: [{
            label: 'Deep Dream 체크 상품 페이지',
            url: 'https://www.shinhancard.com/pconts/html/card/apply/check/1188313_2206.html',
        }],
        caveats: [
            '최다 이용 DREAM 영역 1.0% 적립과 택시 3·6·9번째 이용 조건은 현재 자동 계산에 정확히 반영되지 않습니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'kb_nara',
        sources: [
            {
                label: 'KB국민 나라사랑카드 출시 안내',
                url: 'https://otalk.kbstar.com/quics?QSL=F&articleId=8720&bbsMode=view&page=C019391',
            },
            {
                label: 'KB국민카드 상품설명서 개정 안내',
                url: 'https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=11440&ROUTE_TYPE=VIEW',
            },
        ],
        caveats: [
            '군마트 구간별 할인율과 일부 건별 조건은 현재 상품설명서 원문을 추가 대조해야 합니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'shinhan_heyoung',
        sources: [{
            label: 'Hey Young 체크 상품 페이지',
            url: 'https://www.shinhancard.com/pconts/html/card/apply/check/1233237_2206.html',
        }],
        caveats: [
            '해외 가맹점 1.2%와 해외 ATM 건당 US $3 캐시백은 현재 규칙에 반영되지 않았습니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'shinhan_sol',
        sources: [],
        caveats: [],
        revisionReviewEnabled: true,
    },
    {
        cardId: 'shinhan_nara',
        sources: [{
            label: '신한 나라사랑카드 체크 상품 페이지',
            url: 'https://www.shinhancard.com/pconts/html/card/apply/check/2013660_2206.html',
        }],
        caveats: [
            '군마트 결제금액 구간과 광역교통 대상 범위는 현재 규칙을 공식 조건에 맞게 다시 나눠야 합니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'kb_nori2_student',
        sources: [
            {
                label: '노리2 체크카드 공통 혜택',
                url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=07964&mainCC=a',
            },
            {
                label: '노리2 학생증 체크카드 약관 개정 안내',
                url: 'https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=12208&ROUTE_TYPE=VIEW',
            },
        ],
        caveats: [
            '노리2 공통 일상 혜택은 대조했지만 학생증 상품 전용 설명서와의 최종 대조가 필요합니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'hana_nara',
        sources: [{
            label: '하나 나라사랑카드 상품 페이지',
            url: 'https://www.hanacard.co.kr/OPI41000000D.web?CARD_CDOE=15475&CD_PD_SEQ=18813&title=STEP0',
        }],
        caveats: [
            '군마트 결제금액 구간·한도가 현재 규칙과 다르며 CGV 팝콘 혜택이 아직 반영되지 않았습니다.',
        ],
        revisionReviewEnabled: false,
    },
    {
        cardId: 'hana_travelog_student',
        sources: [
            {
                label: '트래블로그 체크카드 상품 페이지',
                url: 'https://www.hanacard.co.kr/OPI41000000D.web?CD_PD_SEQ=15414&mID=PI41015414P&schID=pcd',
            },
            {
                label: '학생증 트래블로그 대상 공식 안내',
                url: 'https://m.hanacard.co.kr/MKEVT1010M.web?EVN_SEQ=60371',
            },
        ],
        caveats: [
            '학생증 상품 전용 설명서와 해외 결제 건당 US $0.5 수수료 면제 계산을 추가 확인해야 합니다.',
        ],
        revisionReviewEnabled: false,
    },
];

const baseSources: OfficialDocumentSourceDefinition[] = [
    {
        id: 'shinhan-sol-product-page',
        label: 'SOL트래블 체크 상품 페이지',
        sourceUrl: SHINHAN_SOL_TRAVEL_SOURCE_URL,
        sourceKind: 'PRODUCT_PAGE',
        format: 'html',
        allowedHosts: SHINHAN_CARD_HOSTS,
        required: true,
        candidateRole: 'PRIMARY',
    },
    {
        id: 'shinhan-sol-usage-guide',
        label: 'SOL트래블 체크 이용가이드',
        sourceUrl: SHINHAN_SOL_TRAVEL_GUIDE_URL,
        sourceKind: 'PRODUCT_PAGE',
        format: 'html',
        allowedHosts: SHINHAN_CARD_HOSTS,
        required: false,
        candidateRole: 'SUPPORTING',
    },
    {
        id: 'shinhan-sol-lounge-notice',
        label: 'SOL트래블 체크 약관 변경 공지',
        sourceUrl: SHINHAN_SOL_TRAVEL_NOTICE_URL,
        sourceKind: 'NOTICE',
        format: 'html',
        allowedHosts: SHINHAN_CARD_HOSTS,
        required: false,
        candidateRole: 'SUPPORTING',
        noticeDatePolicy: {
            affectedRuleIds: ['sol_cu_event'],
            requirePublicationDate: true,
            requireEffectiveFrom: true,
        },
    },
];

export function getShinhanSolTravelSources() {
    const configuredPdfUrl = process.env.SHINHAN_SOL_TRAVEL_GUIDE_PDF_URL?.trim();
    return [
        ...baseSources,
        ...(configuredPdfUrl ? [{
            id: 'shinhan-sol-product-guide-pdf',
            label: 'SOL트래블 체크 공식 상품안내 PDF',
            sourceUrl: configuredPdfUrl,
            sourceKind: 'PRODUCT_GUIDE_PDF' as const,
            format: 'pdf' as const,
            allowedHosts: SHINHAN_CARD_HOSTS,
            required: false,
            candidateRole: 'SUPPORTING' as const,
        }] : []),
    ];
}

export function getSystemCardBenefitSourceInventory() {
    const configuredSolSources = getShinhanSolTravelSources();
    const solSources = configuredSolSources.map(source => ({
        label: source.label,
        url: source.sourceUrl,
    }));

    return SYSTEM_CARD_BENEFIT_SOURCE_INVENTORY.map(item => ({
        ...item,
        sources: item.cardId === 'shinhan_sol'
            ? solSources
            : item.sources.map(source => ({ ...source })),
        caveats: item.cardId === 'shinhan_sol' && !configuredSolSources.some(source => source.format === 'pdf')
            ? ['공식 상품안내 PDF가 연결되지 않아 세부 약관은 공식 페이지에서 다시 확인해야 합니다.']
            : [...item.caveats],
    }));
}
