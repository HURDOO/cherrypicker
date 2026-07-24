import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { promotionCandidates, promotionOffers } from '@/db/schema';

type PromotionSource = {
    providerId: string;
    url: string;
    label: string;
    layer: 'DISCOUNT' | 'PAY';
};

export const promotionSources: PromotionSource[] = [
    {
        providerId: 'skt',
        url: 'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/list-tab1.do',
        label: 'T멤버십 제휴 브랜드',
        layer: 'DISCOUNT',
    },
    {
        providerId: 'kt',
        url: 'https://membership.kt.com/discount/partner/PartnerList.do',
        label: 'KT멤버십 제휴 브랜드',
        layer: 'DISCOUNT',
    },
    {
        providerId: 'kt',
        url: 'https://www.paris.co.kr/affiliate-card/kt-%EB%A9%A4%EB%B2%84%EC%8B%AD/',
        label: 'KT멤버십 파리바게뜨 교차검증',
        layer: 'DISCOUNT',
    },
    {
        providerId: 'lguplus',
        url: 'https://www.lguplus.com/benefit-membership',
        label: 'U+멤버십 제휴사',
        layer: 'DISCOUNT',
    },
    {
        providerId: 'naverpay',
        url: 'https://pay.naver.com/benefit/payment/list',
        label: 'Npay 결제 혜택',
        layer: 'PAY',
    },
    {
        providerId: 'kakaopay',
        url: 'https://story.kakaopay.com/130-kakaopay-benefit/',
        label: '카카오페이 혜택홈',
        layer: 'PAY',
    },
    {
        providerId: 'kakaopay-gooddeal',
        url: 'https://story.kakaopay.com/318-kakaopay-benefit/',
        label: '카카오페이 굿딜',
        layer: 'PAY',
    },
    {
        providerId: 'franchise',
        url: 'https://www.paris.co.kr/affiliate-card/t-%EB%A9%A4%EB%B2%84%EC%8B%AD/',
        label: '파리바게뜨 T멤버십 혜택',
        layer: 'DISCOUNT',
    },
    {
        providerId: 'franchise',
        url: 'https://www.tlj.co.kr/membership/partner.asp',
        label: '뚜레쥬르 제휴 혜택',
        layer: 'DISCOUNT',
    },
];

const decodeEntities = (text: string) => text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const cleanHtml = (html: string) => decodeEntities(
    html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
).slice(0, 120_000);

const getTitle = (html: string, fallback: string) => {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return cleanHtml(match?.[1] ?? fallback).slice(0, 300) || fallback;
};

const buildParsedOffer = (
    source: PromotionSource,
    sourceTitle: string,
    sourceHash: string,
) => ({
    providerId: source.providerId,
    layer: source.layer,
    title: sourceTitle,
    description: `${source.label} 공개 페이지에서 변경을 감지했습니다. 원문을 확인해 계산 조건을 입력해주세요.`,
    brandIds: [],
    categoryIds: [],
    channels: ['ALL'],
    startsAt: '',
    endsAt: '',
    action: { type: 'FLAT', value: 0 },
    condition: {
        amountBasis: 'REMAINING_AMOUNT',
        manualCheckRequired: true,
        requiredNote: '공식 원문 조건을 관리자 검수 후 게시',
    },
    compatibility: {},
    limitConfig: {},
    certainty: 'CONDITIONAL',
    sourceUrl: source.url,
    sourceHash,
    collectedAt: new Date().toISOString(),
});

export async function collectPromotionCandidates() {
    const results: Array<{
        sourceUrl: string;
        status: 'created' | 'unchanged' | 'failed';
        message?: string;
    }> = [];

    for (const source of promotionSources) {
        try {
            const response = await fetch(source.url, {
                headers: {
                    'user-agent': 'CherrypickerBenefits/1.0 (manual-review collector)',
                    accept: 'text/html,application/xhtml+xml',
                },
                cache: 'no-store',
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const html = await response.text();
            const rawContent = cleanHtml(html);
            const sourceHash = createHash('sha256').update(rawContent).digest('hex');
            const existing = db.select({ id: promotionCandidates.id })
                .from(promotionCandidates)
                .where(and(
                    eq(promotionCandidates.providerId, source.providerId),
                    eq(promotionCandidates.sourceUrl, source.url),
                    eq(promotionCandidates.sourceHash, sourceHash)
                ))
                .get();
            if (existing) {
                results.push({ sourceUrl: source.url, status: 'unchanged' });
                continue;
            }

            const latestCandidate = db.select().from(promotionCandidates)
                .where(and(
                    eq(promotionCandidates.providerId, source.providerId),
                    eq(promotionCandidates.sourceUrl, source.url)
                ))
                .orderBy(desc(promotionCandidates.discoveredAt))
                .get();
            const linkedOffer = latestCandidate?.linkedPromotionId
                ? db.select().from(promotionOffers)
                    .where(eq(promotionOffers.id, latestCandidate.linkedPromotionId))
                    .get()
                : undefined;
            const sourceTitle = getTitle(html, source.label);

            db.insert(promotionCandidates).values({
                id: randomUUID(),
                providerId: source.providerId,
                sourceUrl: source.url,
                sourceHash,
                sourceTitle,
                rawContent,
                parsedOffer: buildParsedOffer(source, sourceTitle, sourceHash),
                diff: {
                    previousHash: latestCandidate?.sourceHash ?? null,
                    changed: Boolean(latestCandidate),
                    linkedPromotionId: linkedOffer?.id ?? null,
                    linkedPromotionTitle: linkedOffer?.title ?? null,
                },
                status: 'PENDING',
                discoveredAt: new Date(),
            }).run();
            results.push({ sourceUrl: source.url, status: 'created' });
        } catch (error) {
            results.push({
                sourceUrl: source.url,
                status: 'failed',
                message: error instanceof Error ? error.message : '수집 실패',
            });
        }
    }

    return results;
}
