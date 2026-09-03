import { isIP } from 'node:net';
import type {
    Card,
    CatalogCardBenefitSupport,
} from '@/types';
import {
    getSystemCardBenefitSourceInventory,
    type SystemCardBenefitSourceInventoryItem,
} from './card-benefit-source-registry';

export interface ActiveCardBenefitRevision {
    cardId: string;
    candidateId?: string | null;
    publishedAt: Date | string;
}

interface CardBenefitSupportDefinition {
    supportScope: 'FULL';
    sources: CatalogCardBenefitSupport['sources'];
    caveats: string[];
    revisionReviewEnabled: boolean;
}

const DEFAULT_CAVEAT =
    '초기 입력된 주요 혜택만 반영되어 있으며 공식 문서 전체 검수는 아직 완료되지 않았습니다.';

const isPublicOfficialSource = (sourceUrl: string) => {
    try {
        const url = new URL(sourceUrl);
        const hostname = url.hostname.toLowerCase();
        return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
            hostname.includes('.') && isIP(hostname) === 0 &&
            hostname !== 'localhost' && !hostname.endsWith('.localhost') &&
            !hostname.endsWith('.local') && !hostname.endsWith('.internal');
    } catch {
        return false;
    }
};

const getSupportDefinitions = (inventory: SystemCardBenefitSourceInventoryItem[]) => {
    return new Map<string, CardBenefitSupportDefinition>(
        inventory.map(item => [item.cardId, {
            supportScope: 'FULL',
            sources: item.sources.filter(source => isPublicOfficialSource(source.url)).map(source => ({
                label: source.label,
                url: source.url,
            })),
            caveats: [...item.caveats],
            revisionReviewEnabled: item.revisionReviewEnabled,
        }]),
    );
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
    inventory = getSystemCardBenefitSourceInventory(),
): CatalogCardBenefitSupport[] {
    const definitions = getSupportDefinitions(inventory);
    const revisions = new Map(activeRevisions.map(revision => [revision.cardId, revision]));

    return cards
        .filter(card => !card.userId)
        .map(card => {
            const definition = definitions.get(card.id);
            const revision = revisions.get(card.id);
            const reviewed = Boolean(
                definition?.revisionReviewEnabled && revision?.candidateId
            );

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
                    : [DEFAULT_CAVEAT, ...(definition?.caveats ?? [])],
            } satisfies CatalogCardBenefitSupport;
        })
        .sort((left, right) => left.cardId.localeCompare(right.cardId));
}
