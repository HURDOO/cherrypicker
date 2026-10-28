import { describe, expect, it } from 'vitest';
import type { BenefitCombination, CombinationStep } from '@/types';
import {
    appStoreUrl,
    buildPaymentAppHref,
    detectPaymentAppPlatform,
    getPaymentAppActions,
    orderLinks,
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
            [],
            true,
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
            [],
            true,
        );
        expect(money[0].appId).toBe('kakaotalk');
        expect(money[0].hint).toContain('페이머니');

        expect(getPaymentAppActions(
            combination({ payProviderId: 'kakaopay', fundingType: 'POINTS' }),
            [],
            true,
        )).toEqual([]);
    });

    it('offers Naver Pay QR and Samsung Pay for cards, and QR only for Npay money', () => {
        const card = getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'CARD', cardName: 'KB 노리2' }),
            [],
            true,
        );
        expect(card[0].appId).toBe('naverpay');
        expect(card[0].links.map(link => link.mode)).toEqual(['CODE', 'SAMSUNG_PAY']);
        expect(card[0].links[0].path).toBe('showservicemenu?menuName=payment&subMenuName=qr');
        expect(card[0].hint).toContain('KB 노리2');

        const money = getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'MONEY' }),
            [],
            true,
        );
        expect(money[0].links.map(link => link.mode)).toEqual(['CODE']);
    });

    it('leaves out GoodDeal, card-only payments and the pay app on other cards', () => {
        expect(getPaymentAppActions(
            combination({ payProviderId: 'kakaopay-gooddeal', fundingType: 'MONEY' }),
            [],
            true,
        )).toEqual([]);
        expect(getPaymentAppActions(combination({ cardName: '카드' }), [], true)).toEqual([]);
        expect(getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'CARD' }),
            [],
            false,
        )).toEqual([]);
    });

    it('puts the T membership barcode on the card that shows an SKT benefit, discount or reward', () => {
        const skt = step({ providerId: 'skt' });
        const actions = getPaymentAppActions(combination({}), [skt], false);
        expect(actions.map(action => action.appId)).toEqual(['tmembership']);
        expect(actions[0].links[0]).toMatchObject({ scheme: 'mponepass', path: 'native/barcode' });

        const reward = step({ providerId: 'skt', layer: 'POST_REWARD' });
        expect(getPaymentAppActions(
            combination({ payProviderId: 'naverpay', fundingType: 'CARD' }),
            [reward],
            true,
        ).map(action => action.appId)).toEqual(['tmembership', 'naverpay']);

        expect(getPaymentAppActions(combination({}), [step({ providerId: 'kt' })], false)).toEqual([]);
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

    it('puts the last chosen mode first', () => {
        const spay = { ...qr, mode: 'SAMSUNG_PAY' as const, label: '삼성페이' };
        expect(orderLinks([qr, spay], 'SAMSUNG_PAY').map(link => link.mode)).toEqual(['SAMSUNG_PAY', 'CODE']);
        expect(orderLinks([qr, spay]).map(link => link.mode)).toEqual(['CODE', 'SAMSUNG_PAY']);
        expect(orderLinks([qr], 'SAMSUNG_PAY').map(link => link.mode)).toEqual(['CODE']);
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
