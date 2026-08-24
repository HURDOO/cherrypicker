import type { OfficialDocumentSourceDefinition } from './official-document-source';

export interface SystemCardBenefitSourceInventoryItem {
    cardId: string;
    sources: Array<{
        label: string;
        url: string;
        sourceKind?: OfficialDocumentSourceDefinition['sourceKind'];
        discoverLinkedPdfs?: boolean;
        noticeDatePolicy?: OfficialDocumentSourceDefinition['noticeDatePolicy'];
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
export const HANA_NARA_SOURCE_URL =
    'https://www.hanacard.co.kr/OPI41000000D.web?CARD_CDOE=15475&CD_PD_SEQ=18813&title=STEP0';

const SHINHAN_CARD_HOSTS = ['shinhancard.com'];

const SYSTEM_CARD_BENEFIT_SOURCE_INVENTORY: SystemCardBenefitSourceInventoryItem[] = [
    {
        cardId: 'shinhan_deep_dream',
        sources: [{
            label: 'Deep Dream 체크 상품 페이지',
            url: 'https://www.shinhancard.com/pconts/html/card/apply/check/1188313_2206.html',
        }],
        caveats: [
            '최다 이용 DREAM 영역과 택시 3·6·9번째 이용 여부는 누적 이용내역 확인이 필요해 조건부 혜택으로 표시합니다.',
        ],
        revisionReviewEnabled: true,
    },
    {
        cardId: 'kb_nara',
        sources: [
            {
                label: 'KB국민 나라사랑체크카드 상품 페이지',
                url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=04120',
                discoverLinkedPdfs: false,
            },
            {
                label: 'KB국민 나라사랑카드 출시 안내',
                url: 'https://otalk.kbstar.com/quics?QSL=F&articleId=8720&bbsMode=view&page=C019391',
                discoverLinkedPdfs: false,
            },
            {
                label: 'KB국민 나라사랑카드 대중교통 약관 개정 안내',
                url: 'https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=11274&ROUTE_TYPE=VIEW',
                sourceKind: 'NOTICE',
                discoverLinkedPdfs: false,
                noticeDatePolicy: {
                    affectedRuleIds: ['kb_nara_transport'],
                    requirePublicationDate: true,
                    requireEffectiveFrom: true,
                    applyAsRulePeriod: false,
                },
            },
        ],
        caveats: [
            '군마트 금액 구간과 2024년 대중교통 제외 개정은 공식 상품 페이지와 개정 공지를 함께 적용합니다.',
        ],
        revisionReviewEnabled: true,
    },
    {
        cardId: 'shinhan_heyoung',
        sources: [{
            label: 'Hey Young 체크 상품 페이지',
            url: 'https://www.shinhancard.com/pconts/html/card/apply/check/1233237_2206.html',
        }],
        caveats: [
            '해외 ATM US $3와 VISA Platinum 제휴 혜택은 환율·예약 조건을 자동 판단하지 않고 수동 확인으로 표시합니다.',
        ],
        revisionReviewEnabled: true,
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
            '군마트 3만원 경계의 공식 표 문구가 겹쳐 3만원 결제는 상위 구간으로 계산하고 검수 메모를 표시합니다.',
        ],
        revisionReviewEnabled: true,
    },
    {
        cardId: 'kb_nori2_student',
        sources: [
            {
                label: '노리2 학생증체크카드 상품 페이지',
                url: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=07998&mainCC=a',
                discoverLinkedPdfs: false,
            },
        ],
        caveats: [
            '최신 상품설명서 PDF가 이미지형이라 자동 텍스트 수집에서는 공식 학생증 상품 페이지 조건을 기준으로 구조화합니다.',
        ],
        revisionReviewEnabled: true,
    },
    {
        cardId: 'hana_nara',
        sources: [{
            label: '하나 나라사랑카드 상품 페이지',
            url: HANA_NARA_SOURCE_URL,
        }],
        caveats: [
            '급여이체 연동 혜택과 국군의날·현충일 혜택은 사용자 확인이 필요한 조건부 혜택으로 표시합니다.',
        ],
        revisionReviewEnabled: true,
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
            '달러 기준 해외 수수료와 엔화 누적 결제 프로모션은 원화 혜택으로 자동 환산하지 않고 수동 확인으로 표시합니다.',
        ],
        revisionReviewEnabled: true,
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

export function getSystemCardBenefitSources(cardId: string): OfficialDocumentSourceDefinition[] {
    if (cardId === 'shinhan_sol') return getShinhanSolTravelSources();
    const item = SYSTEM_CARD_BENEFIT_SOURCE_INVENTORY.find(candidate => (
        candidate.cardId === cardId && candidate.revisionReviewEnabled
    ));
    if (!item) return [];
    return item.sources.map((source, index) => {
        const parsed = new URL(source.url);
        const hostParts = parsed.hostname.split('.');
        const registrableHost = parsed.hostname.endsWith('.co.kr')
            ? hostParts.slice(-3).join('.')
            : hostParts.slice(-2).join('.');
        const format = parsed.pathname.toLocaleLowerCase().endsWith('.pdf') ? 'pdf' : 'html';
        return {
            id: `${cardId}-official-source-${index + 1}`,
            label: source.label,
            sourceUrl: source.url,
            sourceKind: source.sourceKind ?? (
                format === 'pdf' ? 'PRODUCT_GUIDE_PDF' : 'PRODUCT_PAGE'
            ),
            format,
            allowedHosts: [registrableHost],
            required: index === 0,
            candidateRole: index === 0 ? 'PRIMARY' : 'SUPPORTING',
            ...(source.discoverLinkedPdfs !== undefined && {
                discoverLinkedPdfs: source.discoverLinkedPdfs,
            }),
            ...(source.noticeDatePolicy && { noticeDatePolicy: source.noticeDatePolicy }),
        };
    });
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
