import { describe, expect, it } from 'vitest';
import { getSystemCardBenefitSourceInventory } from './card-benefit-source-registry';

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

    it('enables revision-backed review only for the implemented SOL adapter', () => {
        const inventory = getSystemCardBenefitSourceInventory();

        expect(inventory.filter(item => item.revisionReviewEnabled).map(item => item.cardId))
            .toEqual(['shinhan_sol']);
    });
});
