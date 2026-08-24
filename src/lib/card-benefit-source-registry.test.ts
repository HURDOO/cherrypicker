import { describe, expect, it } from 'vitest';
import {
    getSystemCardBenefitSourceInventory,
    getSystemCardBenefitSources,
} from './card-benefit-source-registry';

const SYSTEM_CARD_IDS = [
    'hana_nara',
    'hana_travelog_student',
    'kb_nara',
    'kb_nori2_student',
    'shinhan_deep_dream',
    'shinhan_heyoung',
    'shinhan_nara',
    'shinhan_sol',
];

const OFFICIAL_DOMAINS = [
    'hanacard.co.kr',
    'kbcard.com',
    'kbstar.com',
    'shinhancard.com',
];

describe('system card benefit source inventory', () => {
    it('tracks an official source and caveat for every system card', () => {
        const inventory = getSystemCardBenefitSourceInventory();

        expect(inventory.map(item => item.cardId).sort()).toEqual(SYSTEM_CARD_IDS);
        expect(inventory.every(item => item.sources.length > 0)).toBe(true);
        expect(inventory.every(item => item.sources.every(source => {
            const url = new URL(source.url);
            return url.protocol === 'https:' && OFFICIAL_DOMAINS.some(domain => (
                url.hostname === domain || url.hostname.endsWith(`.${domain}`)
            ));
        }))).toBe(true);
        expect(inventory.filter(item => item.cardId !== 'shinhan_sol')
            .every(item => item.caveats.length > 0)).toBe(true);
    });

    it('enables revision-backed review for the completed and next AI-first adapters', () => {
        const inventory = getSystemCardBenefitSourceInventory();

        expect(inventory.filter(item => item.revisionReviewEnabled).map(item => item.cardId))
            .toEqual([
                'shinhan_deep_dream',
                'kb_nara',
                'shinhan_heyoung',
                'shinhan_sol',
                'shinhan_nara',
                'kb_nori2_student',
                'hana_nara',
                'hana_travelog_student',
            ]);
        expect(getSystemCardBenefitSources('shinhan_heyoung')[0]).toMatchObject({
            sourceKind: 'PRODUCT_PAGE',
            required: true,
            candidateRole: 'PRIMARY',
            allowedHosts: ['shinhancard.com'],
        });
        expect(getSystemCardBenefitSources('hana_nara')[0]).toMatchObject({
            sourceKind: 'PRODUCT_PAGE',
            required: true,
            candidateRole: 'PRIMARY',
            allowedHosts: ['hanacard.co.kr'],
        });
        expect(getSystemCardBenefitSources('kb_nara')[2]).toMatchObject({
            sourceKind: 'NOTICE',
            discoverLinkedPdfs: false,
            noticeDatePolicy: {
                affectedRuleIds: ['kb_nara_transport'],
                requirePublicationDate: true,
                requireEffectiveFrom: true,
            },
        });
        expect(getSystemCardBenefitSources('kb_nara')[0]).toMatchObject({
            sourceUrl: expect.stringContaining('cooperationcode=04120'),
            required: true,
            candidateRole: 'PRIMARY',
            discoverLinkedPdfs: false,
        });
        expect(getSystemCardBenefitSources('kb_nori2_student')[0]).toMatchObject({
            sourceUrl: expect.stringContaining('cooperationcode=07998'),
            sourceKind: 'PRODUCT_PAGE',
            discoverLinkedPdfs: false,
        });
    });
});
