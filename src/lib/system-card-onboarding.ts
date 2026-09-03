import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
    cardBenefitDocuments,
    cardBenefitRevisions,
    cardBenefitSourceConfigs,
    cards,
} from '@/db/schema';
import type {
    CardBenefitSourceKind,
    CardBenefitSourceRole,
    CardNetwork,
    SystemCardIssueStatus,
} from '@/types';
import {
    getSystemCardBenefitSourceInventory,
    getSystemCardBenefitSources,
    type SystemCardBenefitSourceInventoryItem,
} from './card-benefit-source-registry';
import type { OfficialDocumentSourceDefinition } from './official-document-source';

const CARD_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const CARD_NETWORKS = new Set<CardNetwork>([
    'DOMESTIC',
    'MASTERCARD',
    'VISA',
    'AMEX',
    'UNIONPAY',
    'OTHER',
]);
const ISSUE_STATUSES = new Set<SystemCardIssueStatus>(['ACTIVE', 'DISCONTINUED']);
const SOURCE_KINDS = new Set<CardBenefitSourceKind>([
    'PRODUCT_PAGE',
    'PRODUCT_GUIDE_PDF',
    'NOTICE',
]);
const SOURCE_ROLES = new Set<CardBenefitSourceRole>(['PRIMARY', 'SUPPORTING']);
const CARD_COLORS = new Set([
    'bg-blue-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-rose-500',
    'bg-gray-700',
]);

export class SystemCardOnboardingError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'SystemCardOnboardingError';
    }
}

export type SystemCardSourceInput = {
    label: string;
    sourceUrl: string;
    sourceKind: CardBenefitSourceKind;
    candidateRole: CardBenefitSourceRole;
    required: boolean;
    discoverLinkedPdfs: boolean;
};

export type SystemCardDraftInput = {
    id: string;
    name: string;
    company: string;
    color: string;
    network?: CardNetwork;
    issuerProductCode?: string;
    issueStatus: SystemCardIssueStatus;
    catalogCaveat?: string;
    sources: SystemCardSourceInput[];
};

const requiredText = (
    input: Record<string, unknown>,
    key: string,
    label: string,
    maximumLength: number,
) => {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new SystemCardOnboardingError(400, `${label}을(를) 입력해주세요.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maximumLength) {
        throw new SystemCardOnboardingError(
            400,
            `${label}은(는) ${maximumLength}자 이하여야 합니다.`,
        );
    }
    return trimmed;
};

const optionalText = (
    input: Record<string, unknown>,
    key: string,
    label: string,
    maximumLength: number,
) => {
    const value = input[key];
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        throw new SystemCardOnboardingError(400, `${label} 형식이 올바르지 않습니다.`);
    }
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > maximumLength) {
        throw new SystemCardOnboardingError(
            400,
            `${label}은(는) ${maximumLength}자 이하여야 합니다.`,
        );
    }
    return trimmed;
};

const registrableHost = (hostname: string) => {
    const parts = hostname.split('.');
    return hostname.endsWith('.co.kr') && parts.length >= 3
        ? parts.slice(-3).join('.')
        : parts.slice(-2).join('.');
};

const normalizePublicOfficialUrl = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 2_000) {
        throw new SystemCardOnboardingError(400, '공식 출처 URL이 올바르지 않습니다.');
    }
    let parsed: URL;
    try {
        parsed = new URL(value.trim());
    } catch {
        throw new SystemCardOnboardingError(400, '공식 출처 URL이 올바르지 않습니다.');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
        throw new SystemCardOnboardingError(
            400,
            '공식 출처는 자격 증명이나 별도 포트가 없는 HTTPS URL이어야 합니다.',
        );
    }
    if (!hostname.includes('.') || isIP(hostname) !== 0 || hostname === 'localhost' ||
        hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        hostname.endsWith('.internal')) {
        throw new SystemCardOnboardingError(400, '공개된 공식 사이트 URL만 등록할 수 있습니다.');
    }
    parsed.hash = '';
    return {
        sourceUrl: parsed.toString(),
        allowedHosts: [registrableHost(hostname)],
    };
};

export function parseSystemCardDraftInput(input: Record<string, unknown>): SystemCardDraftInput {
    const id = requiredText(input, 'id', '카드 ID', 64).toLocaleLowerCase('en-US');
    if (!CARD_ID_PATTERN.test(id)) {
        throw new SystemCardOnboardingError(
            400,
            '카드 ID는 영문 소문자로 시작하고 영문 소문자·숫자·밑줄만 사용할 수 있습니다.',
        );
    }
    const network = optionalText(input, 'network', '국제 브랜드', 20) as CardNetwork | undefined;
    if (network && !CARD_NETWORKS.has(network)) {
        throw new SystemCardOnboardingError(400, '지원하지 않는 카드 국제 브랜드입니다.');
    }
    const issueStatus = optionalText(input, 'issueStatus', '발급 상태', 20) ?? 'ACTIVE';
    if (!ISSUE_STATUSES.has(issueStatus as SystemCardIssueStatus)) {
        throw new SystemCardOnboardingError(400, '카드 발급 상태가 올바르지 않습니다.');
    }
    const color = requiredText(input, 'color', '카드 색상', 40);
    if (!CARD_COLORS.has(color)) {
        throw new SystemCardOnboardingError(400, '지원하지 않는 카드 색상입니다.');
    }
    if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 8) {
        throw new SystemCardOnboardingError(400, '공식 출처를 1개 이상 8개 이하로 등록해주세요.');
    }
    const sources = input.sources.map((rawSource, index) => {
        if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) {
            throw new SystemCardOnboardingError(400, `공식 출처 ${index + 1} 형식이 올바르지 않습니다.`);
        }
        const source = rawSource as Record<string, unknown>;
        const sourceKind = requiredText(
            source,
            'sourceKind',
            `공식 출처 ${index + 1} 종류`,
            30,
        ) as CardBenefitSourceKind;
        const candidateRole = requiredText(
            source,
            'candidateRole',
            `공식 출처 ${index + 1} 역할`,
            20,
        ) as CardBenefitSourceRole;
        if (!SOURCE_KINDS.has(sourceKind) || !SOURCE_ROLES.has(candidateRole)) {
            throw new SystemCardOnboardingError(400, `공식 출처 ${index + 1} 설정이 올바르지 않습니다.`);
        }
        const { sourceUrl } = normalizePublicOfficialUrl(source.sourceUrl);
        return {
            label: requiredText(source, 'label', `공식 출처 ${index + 1} 이름`, 120),
            sourceUrl,
            sourceKind,
            candidateRole,
            required: source.required === true,
            discoverLinkedPdfs: source.discoverLinkedPdfs === true,
        };
    });
    if (new Set(sources.map(source => source.sourceUrl)).size !== sources.length) {
        throw new SystemCardOnboardingError(400, '같은 공식 출처 URL을 중복 등록할 수 없습니다.');
    }
    const primarySources = sources.filter(source => source.candidateRole === 'PRIMARY');
    if (primarySources.length !== 1 || !primarySources[0].required) {
        throw new SystemCardOnboardingError(400, '대표 출처는 정확히 1개이며 필수 출처여야 합니다.');
    }

    const issuerProductCode = optionalText(
        input,
        'issuerProductCode',
        '카드사 상품 코드',
        120,
    );
    const catalogCaveat = optionalText(input, 'catalogCaveat', '검수 안내', 1_000);

    return {
        id,
        name: requiredText(input, 'name', '카드 이름', 160),
        company: requiredText(input, 'company', '카드사', 100),
        color,
        ...(network && { network }),
        ...(issuerProductCode && { issuerProductCode }),
        issueStatus: issueStatus as SystemCardIssueStatus,
        ...(catalogCaveat && { catalogCaveat }),
        sources,
    };
}

const sourceDefinitionFromRow = (
    source: typeof cardBenefitSourceConfigs.$inferSelect,
): OfficialDocumentSourceDefinition => ({
    id: source.id,
    label: source.label,
    sourceUrl: source.sourceUrl,
    sourceKind: source.sourceKind,
    format: source.format,
    allowedHosts: [...source.allowedHosts],
    required: source.required,
    candidateRole: source.candidateRole,
    discoverLinkedPdfs: source.discoverLinkedPdfs,
});

export function getManagedSystemCardBenefitSources(cardId: string) {
    const configured = db.select().from(cardBenefitSourceConfigs)
        .where(and(
            eq(cardBenefitSourceConfigs.cardId, cardId),
            eq(cardBenefitSourceConfigs.isActive, true),
        ))
        .orderBy(asc(cardBenefitSourceConfigs.sortOrder))
        .all();
    return configured.length > 0
        ? configured.map(sourceDefinitionFromRow)
        : getSystemCardBenefitSources(cardId);
}

export function getManagedSystemCardBenefitSourceInventory() {
    const inventory = new Map<string, SystemCardBenefitSourceInventoryItem>(
        getSystemCardBenefitSourceInventory().map(item => [item.cardId, item]),
    );
    const configuredSources = db.select().from(cardBenefitSourceConfigs)
        .where(eq(cardBenefitSourceConfigs.isActive, true))
        .orderBy(
            asc(cardBenefitSourceConfigs.cardId),
            asc(cardBenefitSourceConfigs.sortOrder),
        )
        .all();
    const sourcesByCardId = new Map<string, typeof configuredSources>();
    configuredSources.forEach(source => {
        const current = sourcesByCardId.get(source.cardId) ?? [];
        current.push(source);
        sourcesByCardId.set(source.cardId, current);
    });
    const configuredCards = db.select().from(cards)
        .where(isNull(cards.userId))
        .orderBy(asc(cards.name))
        .all()
        .filter(card => sourcesByCardId.has(card.id));

    configuredCards.forEach(card => {
        const sources = (sourcesByCardId.get(card.id) ?? []).map(sourceDefinitionFromRow);
        inventory.set(card.id, {
            cardId: card.id,
            sources: sources.map(source => ({
                label: source.label,
                url: source.sourceUrl,
                sourceKind: source.sourceKind,
                discoverLinkedPdfs: source.discoverLinkedPdfs,
            })),
            caveats: card.catalogCaveat ? [card.catalogCaveat] : [],
            revisionReviewEnabled: true,
        });
    });
    return [...inventory.values()];
}

export function createSystemCardDraft(input: SystemCardDraftInput) {
    const existing = db.select({ id: cards.id }).from(cards)
        .where(eq(cards.id, input.id))
        .get();
    if (existing) throw new SystemCardOnboardingError(409, '이미 같은 카드 ID가 존재합니다.');
    if (input.issuerProductCode) {
        const duplicateProduct = db.select({
            id: cards.id,
            company: cards.company,
            issuerProductCode: cards.issuerProductCode,
        }).from(cards)
            .where(isNull(cards.userId))
            .all()
            .find(card => (
                card.company === input.company &&
                card.issuerProductCode === input.issuerProductCode
            ));
        if (duplicateProduct) {
            throw new SystemCardOnboardingError(
                409,
                '같은 카드사 상품 코드로 등록된 시스템 카드가 있습니다.',
            );
        }
    }

    const now = new Date();
    db.transaction(tx => {
        tx.insert(cards).values({
            id: input.id,
            userId: null,
            name: input.name,
            company: input.company,
            color: input.color,
            limitTable: [],
            network: input.network ?? null,
            catalogStatus: 'DRAFT',
            issueStatus: input.issueStatus,
            issuerProductCode: input.issuerProductCode ?? null,
            catalogCaveat: input.catalogCaveat ?? null,
        }).run();
        tx.insert(cardBenefitSourceConfigs).values(input.sources.map((source, index) => {
            const { allowedHosts } = normalizePublicOfficialUrl(source.sourceUrl);
            return {
                id: randomUUID(),
                cardId: input.id,
                ...source,
                format: source.sourceKind === 'PRODUCT_GUIDE_PDF' ? 'pdf' as const : 'html' as const,
                allowedHosts,
                isActive: true,
                sortOrder: index,
                createdAt: now,
                updatedAt: now,
            };
        })).run();
    });
    return getSystemCardOnboardingCard(input.id);
}

const getSystemCardOnboardingCard = (cardId: string) => {
    const card = db.select().from(cards)
        .where(and(eq(cards.id, cardId), isNull(cards.userId)))
        .get();
    if (!card) return undefined;
    const activeRevision = db.select({ revision: cardBenefitRevisions.revision })
        .from(cardBenefitRevisions)
        .where(and(
            eq(cardBenefitRevisions.cardId, card.id),
            eq(cardBenefitRevisions.isActive, true),
        ))
        .get()?.revision;
    const lastCheckedAt = db.select({ collectedAt: cardBenefitDocuments.collectedAt })
        .from(cardBenefitDocuments)
        .where(eq(cardBenefitDocuments.cardId, card.id))
        .orderBy(desc(cardBenefitDocuments.collectedAt))
        .get()?.collectedAt;
    const sources = getManagedSystemCardBenefitSources(card.id);
    return {
        id: card.id,
        name: card.name,
        company: card.company,
        color: card.color,
        network: card.network ?? undefined,
        catalogStatus: card.catalogStatus,
        issueStatus: card.issueStatus,
        issuerProductCode: card.issuerProductCode ?? undefined,
        catalogCaveat: card.catalogCaveat ?? undefined,
        activeRevision,
        lastCheckedAt: lastCheckedAt?.toISOString(),
        sources: sources.map(source => ({
            id: source.id,
            label: source.label,
            sourceUrl: source.sourceUrl,
            sourceKind: source.sourceKind,
            candidateRole: source.candidateRole,
            required: source.required,
            discoverLinkedPdfs: source.discoverLinkedPdfs === true,
        })),
    };
};

export function getSystemCardOnboardingData() {
    return {
        cards: db.select({ id: cards.id }).from(cards)
            .where(isNull(cards.userId))
            .all()
            .flatMap(card => {
                const item = getSystemCardOnboardingCard(card.id);
                return item ? [item] : [];
            })
            .sort((left, right) => left.name.localeCompare(right.name, 'ko-KR')),
    };
}
