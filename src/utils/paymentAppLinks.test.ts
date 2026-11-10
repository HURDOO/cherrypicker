import { describe, expect, it } from 'vitest';
import type { BenefitCombination, CombinationStep } from '@/types';
import {
    pickLink,
    appStoreUrl,
    buildPaymentAppHref,
    detectPaymentAppPlatform,
    getPayChoiceActions,
    getPaymentAppActions,
    isTMembershipPartner,
    parsePaymentAppPreferences,
} from './paymentAppLinks';

const step = (overrides: Partial<CombinationStep>): CombinationStep => ({
    id: 'step',
    layer: 'DISCOUNT',
    providerName: '제공자',
    title: '혜택',
    certainty: 'CONFIRMED',
    amountBefore: 10000,
    benefitAmount: 1000,
    amountAfter: 9000,
    isImmediate: true,
    ...overrides,
});

const combination = (overrides: Partial<BenefitCombination>): BenefitCombination => ({
    id: 'combo',
    fundingType: 'CARD',
    steps: [],
    confirmedValue: 0,
    conditionalValue: 0,
    estimatedValue: 0,
    immediateDiscount: 0,
    laterReward: 0,
    payableAmount: 10000,
    warnings: [],
    requiredChecks: [],
    ...overrides,
});

describe('payment app actions', () => {
    it('opens KakaoPay through KakaoTalk for both card and pay money, asking to switch cards', () => {
        const card = getPaymentAppActions(
            combination({ payProviderId: 'kakaopay', fundingType: 'CARD', cardName: '신한 SOL트래블' }),
            'PAY',
        );
        expect(card).toHaveLength(1);
        expect(card[0].appId).toBe('kakaotalk');
        expect(card[0].title).toBe('카카오페이');
        expect(card[0].links.map(link => `${link.scheme}://${link.path}`)).toEqual([
            'kakaotalk://kakaopay/offline',
            'kakaotalk://kakaopay/offline?screen=spay',
        ]);
        expect(card[0].hint).toContain('신한 SOL트래블로 바꿔서');

        const money = getPaymentAppActions(
            combination({ payProviderId: 'kakaopay', fundingType: 'MONEY' }),
            'PAY',
        );
        expect(money[0].appId).toBe('kakaotalk');
        expect(money[0].hint).toContain('페이머니');

        expect(getPaymentAppActions(
            combination({ payProviderId: 'kakaopay', fundingType: 'POINTS' }),
            'PAY',
        )).toEqual([]);
    });

    it('offers Naver Pay QR and Samsung Pay for cards, and QR only for Npay money', () => {
        const card = getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'CARD', cardName: 'KB 노리2' }),
            'PAY',
        );
        expect(card[0].appId).toBe('naverpay');
        expect(card[0].links.map(link => link.mode)).toEqual(['CODE', 'SAMSUNG_PAY']);
        expect(card[0].links[0].path).toBe('showservicemenu?menuName=payment&subMenuName=qr');
        expect(card[0].hint).toContain('KB 노리2');

        const money = getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'MONEY' }),
            'PAY',
        );
        expect(money[0].links.map(link => link.mode)).toEqual(['CODE']);
    });

    it('opens the GoodDeal home in the KakaoPay app for GoodDeal, not the payment screen', () => {
        const goodDeal = getPaymentAppActions(
            combination({ payProviderId: 'kakaopay-gooddeal', fundingType: 'MONEY' }),
            'PAY',
        );
        expect(goodDeal).toHaveLength(1);
        expect(goodDeal[0]).toMatchObject({ appId: 'kakaopay', title: '카카오페이' });
        // No saved open mode applies, so a KakaoPay "Samsung Pay" choice cannot reach GoodDeal.
        expect(goodDeal[0].payId).toBeUndefined();
        expect(goodDeal[0].links).toEqual([expect.objectContaining({
            label: '굿딜',
            scheme: 'kakaopay',
            path: 'payweb?url=https%3A%2F%2Fgood-deal-web.kakaopay.com%2Fhome%2Fall',
        })]);
        expect(goodDeal[0].hint).toContain('브랜드를 고르면 바코드');
        expect(buildPaymentAppHref('kakaopay', goodDeal[0].links[0], 'android', 'https://example.test'))
            .toContain('package=com.kakaopay.app');
        expect(appStoreUrl('kakaopay', 'ios')).toBe('https://apps.apple.com/kr/app/id1464496236');
    });

    it('leaves out card-only payments and the pay app on other cards', () => {
        expect(getPaymentAppActions(combination({ cardName: '카드' }), 'PAY')).toEqual([]);
        expect(getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'CARD' }),
            'DISCOUNT',
        )).toEqual([]);
    });

    it('puts the T membership barcode on the discount card for counted SKT benefits or SKT partners', () => {
        const reward = combination({ steps: [step({ providerId: 'skt', layer: 'POST_REWARD' })] });
        const counted = getPaymentAppActions(reward, 'DISCOUNT');
        expect(counted.map(action => action.appId)).toEqual(['tmembership']);
        expect(counted[0].links[0]).toMatchObject({ scheme: 'mponepass', path: 'native/barcode' });
        expect(counted[0].hint).toContain('먼저 보여');
        expect(getPaymentAppActions(reward, 'PAY')).toEqual([]);

        const partner = getPaymentAppActions(combination({}), 'DISCOUNT', { tMembershipPartner: true });
        expect(partner[0].hint).toContain('대상 상품이면');
        expect(getPaymentAppActions(combination({}), 'DISCOUNT')).toEqual([]);
        expect(getPaymentAppActions(
            combination({ steps: [step({ providerId: 'kt' })] }),
            'DISCOUNT',
        )).toEqual([]);
    });

    it('treats a brand as an SKT partner only for SKT members and offers valid today', () => {
        const now = new Date(2026, 9, 28);
        const offers = [
            { providerId: 'skt', brandIds: ['cu'], startsAt: '2026-10-01', endsAt: '2026-10-31' },
            { providerId: 'skt', brandIds: ['gs25'], endsAt: '2026-10-27' },
            { providerId: 'kt', brandIds: ['emart24'] },
        ];
        const skt = [{ providerId: 'skt' }];
        expect(isTMembershipPartner(offers, 'cu', skt, now)).toBe(true);
        expect(isTMembershipPartner(offers, 'gs25', skt, now)).toBe(false);
        expect(isTMembershipPartner(offers, 'emart24', skt, now)).toBe(false);
        expect(isTMembershipPartner(offers, 'cu', [{ providerId: 'kt' }], now)).toBe(false);
        expect(isTMembershipPartner(offers, undefined, skt, now)).toBe(false);
    });
});

describe('pay choices for a plain card payment', () => {
    it('offers every registered pay app when no pay adds a benefit', () => {
        const choices = getPayChoiceActions(
            combination({ cardId: 'shinhan', cardName: '신한 Deep Dream' }),
            ['kakaopay', 'naverpay'],
        );
        expect(Object.keys(choices ?? {})).toEqual(['kakaopay', 'naverpay']);
        expect(choices?.kakaopay?.payId).toBe('kakaopay');
        expect(choices?.kakaopay?.hint).toContain('신한 Deep Dream로 바꿔서');
        expect(choices?.naverpay?.links.map(link => link.mode)).toEqual(['CODE', 'SAMSUNG_PAY']);
        expect(getPayChoiceActions(combination({ cardId: 'shinhan' }), [])).toEqual({});
    });

    it('keeps the recommended pay when a pay is part of the route', () => {
        expect(getPayChoiceActions(
            combination({ cardId: 'shinhan', payProviderId: 'naverpay' }),
            ['kakaopay', 'naverpay'],
        )).toBeUndefined();
        expect(getPayChoiceActions(
            combination({ fundingType: 'MONEY', payProviderId: 'kakaopay' }),
            ['kakaopay'],
        )).toBeUndefined();
        expect(getPayChoiceActions(combination({}), ['kakaopay'])).toBeUndefined();
    });
});

describe('payment app links', () => {
    const qr = {
        mode: 'CODE' as const,
        label: 'QR',
        scheme: 'naverpayapp',
        path: 'showservicemenu?menuName=payment&subMenuName=qr',
    };

    it('builds an Android intent that falls back to the app-missing page', () => {
        expect(buildPaymentAppHref('naverpay', qr, 'android', 'https://cherrypicker.app.hurdoo.kr')).toBe(
            'intent://showservicemenu?menuName=payment&subMenuName=qr#Intent;scheme=naverpayapp;' +
            'package=com.naverfin.payapp;' +
            'S.browser_fallback_url=https%3A%2F%2Fcherrypicker.app.hurdoo.kr%2Fapp-missing%3Fapp%3Dnaverpay;end'
        );
    });

    it('uses the bare scheme on iOS and store pages per platform', () => {
        expect(buildPaymentAppHref('naverpay', qr, 'ios', 'https://x.kr'))
            .toBe('naverpayapp://showservicemenu?menuName=payment&subMenuName=qr');
        expect(appStoreUrl('tmembership', 'android')).toBe('https://play.google.com/store/apps/details?id=com.tms');
        expect(appStoreUrl('kakaotalk', 'ios')).toBe('https://apps.apple.com/kr/app/id362057947');
    });

    it('opens the one link in the saved mode, or the first link the app has', () => {
        const spay = { ...qr, mode: 'SAMSUNG_PAY' as const, label: '삼성페이' };
        expect(pickLink([qr, spay], 'SAMSUNG_PAY').mode).toBe('SAMSUNG_PAY');
        expect(pickLink([qr, spay]).mode).toBe('CODE');
        expect(pickLink([qr], 'SAMSUNG_PAY').mode).toBe('CODE');
    });

    it('detects phones and hides buttons on desktop', () => {
        expect(detectPaymentAppPlatform('Mozilla/5.0 (Linux; Android 17; K) Chrome/140')).toBe('android');
        expect(detectPaymentAppPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)')).toBe('ios');
        expect(detectPaymentAppPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
        expect(detectPaymentAppPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
        expect(detectPaymentAppPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
    });

    it('reads stored preferences defensively', () => {
        expect(parsePaymentAppPreferences(null)).toEqual({ hiddenAppIds: [], preferredModes: {} });
        expect(parsePaymentAppPreferences('not json')).toEqual({ hiddenAppIds: [], preferredModes: {} });
        expect(parsePaymentAppPreferences(JSON.stringify({
            hiddenAppIds: ['tmembership', 'tmembership', 'unknown'],
            preferredModes: { naverpay: 'SAMSUNG_PAY', kakaotalk: 'NFC', other: 'CODE' },
        }))).toEqual({ hiddenAppIds: ['tmembership'], preferredModes: { naverpay: 'SAMSUNG_PAY' } });
    });
});
