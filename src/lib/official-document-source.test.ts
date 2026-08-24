import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
    assertTrustedOfficialSourceUrl,
    collectOfficialDocument,
    createOfficialDocumentSemanticHash,
    createOfficialSourceBundleHash,
    discoverOfficialPdfSources,
    joinPdfPages,
    positionedPdfText,
    splitPdfPages,
    type OfficialDocumentSourceDefinition,
} from './official-document-source';

const htmlSource: OfficialDocumentSourceDefinition = {
    id: 'card-page',
    label: '카드 상품 페이지',
    sourceUrl: 'https://www.card.example/cards/one',
    sourceKind: 'PRODUCT_PAGE',
    format: 'html',
    allowedHosts: ['card.example'],
    required: true,
    candidateRole: 'PRIMARY',
};

const pdfSource: OfficialDocumentSourceDefinition = {
    ...htmlSource,
    id: 'card-guide',
    label: '카드 상품안내 PDF',
    sourceUrl: 'https://docs.card.example/guides/one.pdf',
    sourceKind: 'PRODUCT_GUIDE_PDF',
    format: 'pdf',
    candidateRole: 'SUPPORTING',
};

const noticeSource: OfficialDocumentSourceDefinition = {
    ...htmlSource,
    id: 'card-notice',
    label: '카드 약관 변경 공지',
    sourceUrl: 'https://www.card.example/notices/one',
    sourceKind: 'NOTICE',
    candidateRole: 'SUPPORTING',
    noticeDatePolicy: {
        affectedRuleIds: ['sol_cu_event'],
        requirePublicationDate: true,
        requireEffectiveFrom: true,
    },
};

describe('official document source adapter', () => {
    it('preserves visual PDF lines even when PDF.js does not set hasEOL', () => {
        expect(positionedPdfText([
            { str: '카타르항공', hasEOL: false, transform: [1, 0, 0, 10, 10, 700], height: 10 },
            { str: '15% 할인', hasEOL: false, transform: [1, 0, 0, 10, 80, 700], height: 10 },
            { str: 'AVIS', hasEOL: false, transform: [1, 0, 0, 10, 10, 680], height: 10 },
            { str: '10~20% 할인', hasEOL: true, transform: [1, 0, 0, 10, 80, 680], height: 10 },
        ])).toBe('카타르항공 15% 할인\nAVIS 10~20% 할인\n');
    });

    it('collects trusted HTML and discovers only same-owner PDF links', async () => {
        const html = `
            <html><body>
                <h1>공식 카드 혜택 안내</h1>
                <p>${'국내 편의점 5% 할인과 월 한도를 안내합니다. '.repeat(10)}</p>
                <a href="/documents/guide.pdf?version=2">상품안내</a>
                <a href="#" onclick="window.open('https://docs.card.example/guides/terms.pdf')">약관</a>
                <a href="https://evil.example/guide.pdf">외부 문서</a>
            </body></html>
        `;
        const fetcher = vi.fn().mockResolvedValue(new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        }));
        const collected = await collectOfficialDocument(htmlSource, { fetcher });
        const discovered = discoverOfficialPdfSources(collected.rawContent, htmlSource);

        expect(collected.responseMetadata).toMatchObject({
            rawEncoding: 'utf8',
            extractionMethod: 'html-to-text',
        });
        expect(collected.extractedText).toContain('국내 편의점 5% 할인');
        expect(discovered).toHaveLength(2);
        expect(discovered[0]).toMatchObject({
            sourceUrl: 'https://www.card.example/documents/guide.pdf?version=2',
            format: 'pdf',
            candidateRole: 'SUPPORTING',
        });
        expect(discovered[1]).toMatchObject({
            sourceUrl: 'https://docs.card.example/guides/terms.pdf',
            format: 'pdf',
            candidateRole: 'SUPPORTING',
        });
    });

    it('can disable PDF discovery for broad supporting notices', () => {
        expect(discoverOfficialPdfSources(
            '<a href="/documents/all-products.pdf">전체 상품 약관</a>',
            { ...noticeSource, discoverLinkedPdfs: false },
        )).toEqual([]);
    });

    it('stores PDF bytes as base64 and preserves page boundaries', async () => {
        const bytes = new TextEncoder().encode(`%PDF-${'binary'.repeat(30)}`);
        const expectedBytes = Buffer.from(bytes);
        const expectedHash = createHash('sha256').update(bytes).digest('hex');
        const pages = [
            '첫 페이지에는 국내 편의점 5% 할인 조건과 월 한도가 있습니다.',
            '둘째 페이지에는 제외 거래와 전월 이용금액 조건이 있습니다.',
        ];
        const collected = await collectOfficialDocument(pdfSource, {
            fetcher: vi.fn().mockResolvedValue(new Response(bytes, {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            })),
            pdfExtractor: vi.fn().mockImplementation(async input => {
                structuredClone(input, { transfer: [input.buffer as ArrayBuffer] });
                return { pages, title: '공식 상품안내' };
            }),
        });

        expect(Buffer.from(collected.rawContent, 'base64')).toEqual(expectedBytes);
        expect(collected.contentHash).toBe(expectedHash);
        expect(collected.responseMetadata).toMatchObject({
            rawEncoding: 'base64',
            extractionMethod: 'pdfjs',
            pageCount: 2,
            title: '공식 상품안내',
        });
        expect(splitPdfPages(collected.extractedText)).toEqual(pages);
        expect(collected.extractedText).toBe(joinPdfPages(pages));
    });

    it('extracts publication and effective dates from an official notice', async () => {
        const html = `
            <html><body>
                <h1>카드 약관 개정 안내</h1>
                <p>2024.06.13</p>
                <p>${'공식 혜택 변경 내용을 안내합니다. '.repeat(8)}</p>
                <h2>시행일자</h2>
                <p>2024년 6월 20일부터</p>
            </body></html>
        `;
        const collected = await collectOfficialDocument(noticeSource, {
            fetcher: vi.fn().mockResolvedValue(new Response(html, {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
            })),
        });

        expect(collected.responseMetadata.noticeDates).toMatchObject({
            affectedRuleIds: ['sol_cu_event'],
            publicationDate: '2024-06-13',
            effectiveFrom: '2024-06-20',
            requirePublicationDate: true,
            requireEffectiveFrom: true,
        });
    });

    it('rejects non-HTTPS, lookalike hosts, and redirects outside the allowlist', async () => {
        expect(() => assertTrustedOfficialSourceUrl(
            'http://www.card.example/guide.pdf',
            ['card.example'],
        )).toThrow('HTTPS');
        expect(() => assertTrustedOfficialSourceUrl(
            'https://card.example.evil.test/guide.pdf',
            ['card.example'],
        )).toThrow('허용되지 않은');

        const redirected = new Response('<html><body>blocked</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        });
        Object.defineProperty(redirected, 'url', { value: 'https://evil.test/guide' });
        await expect(collectOfficialDocument(htmlSource, {
            fetcher: vi.fn().mockResolvedValue(redirected),
        })).rejects.toThrow('허용되지 않은');
    });

    it('rejects PDFs with excessive extracted pages', async () => {
        const bytes = new TextEncoder().encode(`%PDF-${'binary'.repeat(30)}`);
        await expect(collectOfficialDocument(pdfSource, {
            fetcher: vi.fn().mockResolvedValue(new Response(bytes, {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            })),
            pdfExtractor: vi.fn().mockResolvedValue({
                pages: Array.from({ length: 201 }, () => '공식 혜택 조건을 설명하는 충분히 긴 페이지입니다.'),
            }),
        })).rejects.toThrow('허용 크기를 초과');
    });

    it('creates the same bundle hash regardless of source order', () => {
        const sources = [
            { sourceUrl: 'https://card.example/a', contentHash: 'aaa' },
            { sourceUrl: 'https://card.example/b', contentHash: 'bbb' },
        ];
        expect(createOfficialSourceBundleHash(sources))
            .toBe(createOfficialSourceBundleHash([...sources].reverse()));
        expect(createOfficialSourceBundleHash(sources))
            .not.toBe(createOfficialSourceBundleHash([
                sources[0],
                { ...sources[1], contentHash: 'changed' },
            ]));
    });

    it('ignores view-count and whitespace churn in HTML semantic hashes', () => {
        expect(createOfficialDocumentSemanticHash(`
            카드 혜택 변경 안내\n조회수 : 1,097\n시행일 2024.8.1
        `)).toBe(createOfficialDocumentSemanticHash(
            '카드 혜택 변경 안내 조회수: 1099 시행일 2024.8.1'
        ));
        expect(createOfficialDocumentSemanticHash(
            '카드 혜택 변경 안내 조회수: 1099 시행일 2024.8.1'
        )).not.toBe(createOfficialDocumentSemanticHash(
            '카드 혜택 변경 안내 조회수: 1099 시행일 2024.9.1'
        ));
    });
});
