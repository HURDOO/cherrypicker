import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    buildSktMembershipDetailUrl,
    buildSktMembershipListUrl,
    parseSktMembershipListPage,
    validateSktMembershipListPages,
} from './skt-membership-source';
import { SktPromotionAiParser } from './skt-promotion-ai-parser';

let originalDatabasePath: string | undefined;
let collectSktMembershipSource: (
    typeof import('./promotion-collector')
)['collectSktMembershipSource'];

beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = ':memory:';
    ({ collectSktMembershipSource } = await import('./promotion-collector'));
});

afterAll(() => {
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
});

const pageHtml = (options: {
    pageNum: number;
    totalCount: number;
    ids: number[];
    sortType?: string;
    lastPage?: boolean;
}) => `
    <ul>
        ${options.ids.map(id => `
            <li><a class='benefit-box' data-id="${id}">
                <span class='brand'>브랜드 ${id}</span>
                <dl><dt>할인형</dt><dd><div class="info">
                    <i class="badge-circle vip"></i>10% 할인
                </div></dd></dl>
            </a></li>
        `).join('')}
    </ul>
    <script>var totalCount = ${options.totalCount};</script>
    <input name="pageNum" value="${options.pageNum}" />
    <input name="pageSize" value="20" />
    <input name="sortType" value="${options.sortType ?? 'BRAND_NAME'}" />
    <input name="lastPageYn" value="${options.lastPage ? 'Y' : 'N'}" />
`;

const collectedHtml = (url: string, value: string) => ({
    value,
    document: {
        sourceUrl: url,
        mediaType: 'text/html',
        rawContent: value,
        extractedText: value,
        contentHash: `hash:${url}`,
        responseMetadata: { finalUrl: url },
    },
});

describe('SKT membership source completeness', () => {
    it('builds a stable name-sorted page URL and official detail URL', () => {
        const source = 'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/list-tab1.do';
        const listUrl = new URL(buildSktMembershipListUrl(source, 3));

        expect(Object.fromEntries(listUrl.searchParams)).toMatchObject({
            pageNum: '3',
            pageSize: '20',
            sortType: 'BRAND_NAME',
            mediumCategoryId: '-1',
            benefitTypeId: 'ALL',
        });
        expect(buildSktMembershipDetailUrl(source, '146')).toBe(
            'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/detail.do?brandId=146'
        );
    });

    it('validates all 182 unique brands across ten pages', () => {
        const ids = Array.from({ length: 182 }, (_, index) => index + 1);
        const pages = Array.from({ length: 10 }, (_, pageNum) => parseSktMembershipListPage(
            pageHtml({
                pageNum,
                totalCount: ids.length,
                ids: ids.slice(pageNum * 20, pageNum * 20 + 20),
                lastPage: pageNum === 9,
            })
        ));

        expect(validateSktMembershipListPages(pages)).toMatchObject({
            totalCount: 182,
            pageCount: 10,
            brands: expect.arrayContaining([
                { officialId: '1', name: '브랜드 1' },
                { officialId: '182', name: '브랜드 182' },
            ]),
        });
    });

    it.each([
        {
            label: 'missing page',
            mutate: (pages: ReturnType<typeof parseSktMembershipListPage>[]) => pages.slice(0, 9),
        },
        {
            label: 'duplicate id',
            mutate: (pages: ReturnType<typeof parseSktMembershipListPage>[]) => {
                pages[9].brands[1] = { ...pages[9].brands[0] };
                return pages;
            },
        },
        {
            label: 'count drift',
            mutate: (pages: ReturnType<typeof parseSktMembershipListPage>[]) => {
                pages[5].totalCount += 1;
                return pages;
            },
        },
        {
            label: 'sort drift',
            mutate: (pages: ReturnType<typeof parseSktMembershipListPage>[]) => {
                pages[2].sortType = 'BRAND_FAVORITE';
                return pages;
            },
        },
    ])('rejects $label instead of claiming a complete source', ({ mutate }) => {
        const ids = Array.from({ length: 182 }, (_, index) => index + 1);
        const pages = Array.from({ length: 10 }, (_, pageNum) => parseSktMembershipListPage(
            pageHtml({
                pageNum,
                totalCount: ids.length,
                ids: ids.slice(pageNum * 20, pageNum * 20 + 20),
                lastPage: pageNum === 9,
            })
        ));

        expect(() => validateSktMembershipListPages(mutate(pages))).toThrow(/SKT 목록/);
    });

    it('fetches every list and detail with bounded concurrency before declaring complete', async () => {
        const source = 'https://skt.example/mps/pc-bff/benefitbrand/list-tab1.do';
        const ids = Array.from({ length: 182 }, (_, index) => index + 1);
        let activeDetails = 0;
        let maximumActiveDetails = 0;
        const fetcher = async (url: string) => {
            const parsed = new URL(url);
            if (parsed.pathname.endsWith('/detail.do')) {
                activeDetails += 1;
                maximumActiveDetails = Math.max(maximumActiveDetails, activeDetails);
                await new Promise(resolve => setTimeout(resolve, 0));
                activeDetails -= 1;
                return collectedHtml(url, `<h1>브랜드 ${parsed.searchParams.get('brandId')}</h1>`);
            }
            const pageNum = Number(parsed.searchParams.get('pageNum'));
            return collectedHtml(url, pageHtml({
                pageNum,
                totalCount: ids.length,
                ids: ids.slice(pageNum * 20, pageNum * 20 + 20),
                lastPage: pageNum === 9,
            }));
        };

        const result = await collectSktMembershipSource(source, fetcher);

        expect(result.completeness).toEqual({
            complete: true,
            message: 'SKT 목록 182건과 상세 182건을 완전 수집하고 182개 브랜드를 구조화했습니다.',
        });
        expect(result.documents).toHaveLength(192);
        expect(result.documents[0].responseMetadata.collectionCompleteness).toEqual({
            status: 'COMPLETE',
            expectedBrandCount: 182,
            listedBrandCount: 182,
            expectedPageCount: 10,
            fetchedPageCount: 10,
            fetchedDetailCount: 182,
            deterministicBrandCount: 182,
            aiFallbackBrandCount: 0,
            aiCacheHitBrandCount: 0,
            structuredBrandCount: 182,
        });
        expect(maximumActiveDetails).toBeGreaterThan(1);
        expect(maximumActiveDetails).toBeLessThanOrEqual(4);
    });

    it('returns a partial bundle and no promotions when one detail fails', async () => {
        const source = 'https://skt.example/mps/pc-bff/benefitbrand/list-tab1.do';
        const failedDetailUrl = buildSktMembershipDetailUrl(source, '2');
        const fetcher = async (url: string) => {
            const parsed = new URL(url);
            if (url === failedDetailUrl) throw new Error('detail unavailable');
            if (parsed.pathname.endsWith('/detail.do')) {
                return collectedHtml(url, '<h1>브랜드 1</h1>');
            }
            return collectedHtml(url, pageHtml({
                pageNum: 0,
                totalCount: 2,
                ids: [1, 2],
                lastPage: true,
            }));
        };

        const result = await collectSktMembershipSource(source, fetcher);

        expect(result.promotions).toEqual([]);
        expect(result.completeness).toMatchObject({ complete: false });
        expect(result.documents[0].responseMetadata.collectionCompleteness).toEqual({
            status: 'PARTIAL',
            expectedBrandCount: 2,
            listedBrandCount: 2,
            expectedPageCount: 1,
            fetchedPageCount: 1,
            fetchedDetailCount: 1,
            failedUrls: [failedDetailUrl],
        });
    });

    it('uses the bounded AI fallback when a complete brand has no rule-parser result', async () => {
        const source = 'https://skt.example/mps/pc-bff/benefitbrand/list-tab1.do';
        const listHtml = `
            <a class="benefit-box" data-id="5357">
                <span class="brand">멍타냥택시</span>
                <dl><dt>할인형</dt><dd><div class="info">
                    <i class="badge-circle vip"></i>VIP 마일리지 3,000점(원) 제공
                </div></dd></dl>
            </a>
            <script>var totalCount = 1;</script>
            <input name="pageNum" value="0" />
            <input name="pageSize" value="20" />
            <input name="sortType" value="BRAND_NAME" />
            <input name="lastPageYn" value="Y" />
        `;
        const detailText = [
            '혜택',
            'VIP 마일리지 3,000점(원) 제공',
            '멍타냥택시 예약 결제 시 마일리지로 반영됩니다.',
        ].join('\n');
        const fetcher = async (url: string) => collectedHtml(
            url,
            new URL(url).pathname.endsWith('/detail.do') ? detailText : listHtml,
        );
        const aiParser = new SktPromotionAiParser({
            id: 'fake-ai',
            model: 'fake-model',
            async extract() {
                return {
                    benefits: [{
                        variantIndex: 0,
                        layer: 'POST_REWARD',
                        actionType: 'FLAT',
                        actionValue: 0,
                        valueSemantics: 'UP_TO',
                        maxBenefit: null,
                        faceValue: null,
                        unitAmount: null,
                        applicabilityScope: 'UNKNOWN',
                        calculationMode: 'INFORMATION_ONLY',
                        channels: [],
                        minSpend: null,
                        eligibleItemSummary: '',
                        requiredInputs: [],
                        dailyCount: null,
                        dailyAmount: null,
                        monthlyCount: null,
                        monthlyAmount: null,
                        yearlyCount: null,
                        confidence: 0.7,
                        reasoningSummary: '정액 마일리지의 계산 의미를 확정할 수 없습니다.',
                        fieldEvidence: [{
                            path: 'action.type',
                            quotes: ['VIP 마일리지 3,000점(원) 제공'],
                        }, {
                            path: 'action.value',
                            quotes: ['VIP 마일리지 3,000점(원) 제공'],
                        }, {
                            path: 'action.valueSemantics',
                            quotes: ['VIP 마일리지 3,000점(원) 제공'],
                        }],
                    }],
                };
            },
        }, 1);

        const result = await collectSktMembershipSource(source, fetcher, aiParser);

        expect(result.completeness).toMatchObject({ complete: true });
        expect(result.promotions).toHaveLength(1);
        expect(result.promotions[0]).toMatchObject({
            autoPublish: false,
            aiFallback: { officialBrandId: '5357', provider: 'fake-ai' },
            offer: {
                condition: { calculationMode: 'INFORMATION_ONLY' },
            },
        });
        expect(result.documents[0].responseMetadata.collectionCompleteness).toMatchObject({
            status: 'COMPLETE',
            deterministicBrandCount: 0,
            aiFallbackBrandCount: 1,
            structuredBrandCount: 1,
            deterministicUnparsedBrandIds: ['5357'],
        });
        expect(result.documents[0].responseMetadata.collectionCompleteness)
            .not.toHaveProperty('unparsedBrandIds');
    });

    it('marks parser coverage partial when AI cannot resolve an unparsed brand', async () => {
        const source = 'https://skt.example/mps/pc-bff/benefitbrand/list-tab1.do';
        const listHtml = `
            <a class="benefit-box" data-id="5357">
                <span class="brand">멍타냥택시</span>
                <dl><dt>할인형</dt><dd><div class="info">
                    <i class="badge-circle vip"></i>마일리지 3,000점(원) 제공
                </div></dd></dl>
            </a>
            <script>var totalCount = 1;</script>
            <input name="pageNum" value="0" />
            <input name="pageSize" value="20" />
            <input name="sortType" value="BRAND_NAME" />
            <input name="lastPageYn" value="Y" />
        `;
        const fetcher = async (url: string) => collectedHtml(
            url,
            new URL(url).pathname.endsWith('/detail.do')
                ? '<h2>혜택</h2><p>마일리지 3,000점(원) 제공</p>'
                : listHtml,
        );

        const result = await collectSktMembershipSource(
            source,
            fetcher,
            new SktPromotionAiParser(undefined, 1),
        );

        expect(result.promotions).toEqual([]);
        expect(result.completeness).toMatchObject({ complete: false });
        expect(result.documents[0].responseMetadata.collectionCompleteness).toMatchObject({
            status: 'PARTIAL',
            fetchedDetailCount: 1,
            deterministicBrandCount: 0,
            aiFallbackBrandCount: 0,
            structuredBrandCount: 0,
            deterministicUnparsedBrandIds: ['5357'],
            unparsedBrandIds: ['5357'],
            aiFailedBrandIds: ['5357'],
            aiFailures: [{
                brandId: '5357',
                message: expect.stringContaining('OPENAI_API_KEY'),
            }],
        });
    });

    it('rejects a snapshot whose total count changes during detail collection', async () => {
        const source = 'https://skt.example/mps/pc-bff/benefitbrand/list-tab1.do';
        let listFetchCount = 0;
        const fetcher = async (url: string) => {
            const parsed = new URL(url);
            if (parsed.pathname.endsWith('/detail.do')) {
                return collectedHtml(url, '<h1>브랜드 1</h1>');
            }
            listFetchCount += 1;
            return collectedHtml(url, pageHtml({
                pageNum: 0,
                totalCount: listFetchCount === 1 ? 1 : 2,
                ids: [1],
                lastPage: true,
            }));
        };

        const result = await collectSktMembershipSource(source, fetcher);

        expect(result.promotions).toEqual([]);
        expect(result.completeness).toEqual({
            complete: false,
            message: 'SKT 목록이 상세 수집 중 변경됐습니다.',
        });
        expect(result.documents[0].responseMetadata.collectionCompleteness)
            .toMatchObject({ status: 'PARTIAL', failedUrls: [expect.stringContaining('pageNum=0')] });
    });
});
