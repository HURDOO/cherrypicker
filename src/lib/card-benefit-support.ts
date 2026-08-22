import type {
    Card,
    CatalogCardBenefitSupport,
} from '@/types';
import { getShinhanSolTravelSources } from './card-benefit-source-registry';

export interface ActiveCardBenefitRevision {
    cardId: string;
    candidateId?: string | null;
    publishedAt: Date | string;
}

interface CardBenefitSupportDefinition {
    supportScope: 'FULL';
    sources: CatalogCardBenefitSupport['sources'];
    caveats: string[];
}

const DEFAULT_CAVEAT =
    '초기 입력된 주요 혜택만 반영되어 있으며 공식 문서 전체 검수는 아직 완료되지 않았습니다.';

const isPublicShinhanSource = (sourceUrl: string) => {
    try {
        const url = new URL(sourceUrl);
        return url.protocol === 'https:' && (
            url.hostname === 'shinhancard.com' || url.hostname.endsWith('.shinhancard.com')
        );
    } catch {
        return false;
    }
};

const getSupportDefinitions = () => {
    const shinhanSources = getShinhanSolTravelSources()
        .filter(source => isPublicShinhanSource(source.sourceUrl));

    return new Map<string, CardBenefitSupportDefinition>([
        ['shinhan_sol', {
            supportScope: 'FULL',
            sources: shinhanSources.map(source => ({
                label: source.label,
                url: source.sourceUrl,
            })),
            caveats: shinhanSources.some(source => source.format === 'pdf')
                ? []
                : ['공식 상품안내 PDF가 연결되지 않아 세부 약관은 공식 페이지에서 다시 확인해야 합니다.'],
        }],
    ]);
};

const toIsoString = (value: Date | string) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
        throw new Error('카드 혜택 검수 시각이 올바르지 않습니다.');
    }
    return date.toISOString();
};

export function buildCardBenefitSupports(
    cards: Card[],
    activeRevisions: ActiveCardBenefitRevision[],
): CatalogCardBenefitSupport[] {
    const definitions = getSupportDefinitions();
    const revisions = new Map(activeRevisions.map(revision => [revision.cardId, revision]));

    return cards
        .filter(card => !card.userId)
        .map(card => {
            const definition = definitions.get(card.id);
            const revision = revisions.get(card.id);
            const reviewed = Boolean(definition && revision?.candidateId);

            return {
                cardId: card.id,
                reviewStatus: reviewed ? 'REVIEWED' : 'NOT_REVIEWED',
                supportScope: reviewed ? definition!.supportScope : 'PARTIAL',
                ...(reviewed && revision && {
                    lastVerifiedAt: toIsoString(revision.publishedAt),
                }),
                sources: definition?.sources.map(source => ({ ...source })) ?? [],
                caveats: reviewed
                    ? [...(definition?.caveats ?? [])]
                    : [DEFAULT_CAVEAT],
            } satisfies CatalogCardBenefitSupport;
        })
        .sort((left, right) => left.cardId.localeCompare(right.cardId));
}
