import type { OfficialDocumentSourceDefinition } from './official-document-source';

export const SHINHAN_SOL_TRAVEL_SOURCE_URL =
    'https://www.shinhancard.com/pconts/html/card/apply/check/1225714_2206.html';
export const SHINHAN_SOL_TRAVEL_GUIDE_URL =
    'https://www.shinhancard.com/pconts/html/card/travel/travel_supersol.html';
export const SHINHAN_SOL_TRAVEL_NOTICE_URL =
    'https://www.shinhancard.com/pconts/html/helpdesk/dataRoom/MOBFM164N/1227673_1119.html';

const SHINHAN_CARD_HOSTS = ['shinhancard.com'];

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
