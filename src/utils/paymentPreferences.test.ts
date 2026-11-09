import { describe, expect, it } from 'vitest';
import {
    createDefaultPaymentPreferences,
    getEffectiveDefaultMethod,
    getOpenMode,
    getOpenablePayIds,
    getPayRouteStatus,
    orderPayMethods,
    parsePaymentPreferences,
    setPayRouteCheck,
} from './paymentPreferences';

const shinhanKakaoSpay = { payId: 'kakaopay', mode: 'SAMSUNG_PAY', cardCompany: '신한카드' } as const;

describe('payment preferences', () => {
    it('starts on the card with no saved modes or findings', () => {
        expect(parsePaymentPreferences(undefined, '로컬')).toEqual(createDefaultPaymentPreferences());
    });

    it('drops entries this version does not know instead of failing', () => {
        expect(parsePaymentPreferences({
            defaultMethod: 'tosspay',
            openModes: { kakaopay: 'CODE', tosspay: 'CODE', naverpay: 'NFC' },
            routeChecks: [
                { ...shinhanKakaoSpay, cardBenefitApplied: true, checkedAt: '2026-11-10T01:00:00.000Z' },
                { payId: 'tosspay', mode: 'CODE', cardCompany: '신한카드', cardBenefitApplied: true, checkedAt: '2026-11-10T01:00:00.000Z' },
                { ...shinhanKakaoSpay, cardBenefitApplied: 'yes', checkedAt: '2026-11-10T01:00:00.000Z' },
            ],
        }, '로컬')).toEqual({
            defaultMethod: 'CARD',
            openModes: { kakaopay: 'CODE' },
            routeChecks: [
                { ...shinhanKakaoSpay, cardBenefitApplied: true, checkedAt: '2026-11-10T01:00:00.000Z' },
            ],
        });
        expect(() => parsePaymentPreferences('CARD', '계정')).toThrow('결제수단 설정');
    });

    it('opens in the saved mode, then the mode this browser used last, then Samsung Pay', () => {
        const saved = { ...createDefaultPaymentPreferences(), openModes: { naverpay: 'CODE' as const } };
        expect(getOpenMode(saved, 'naverpay', 'SAMSUNG_PAY')).toBe('CODE');
        expect(getOpenMode(saved, 'kakaopay', 'CODE')).toBe('CODE');
        expect(getOpenMode(saved, 'kakaopay')).toBe('SAMSUNG_PAY');
    });

    it('keeps one finding per pay, mode and card company', () => {
        const base = createDefaultPaymentPreferences();
        expect(getPayRouteStatus(base, shinhanKakaoSpay)).toBe('UNCHECKED');

        const applied = setPayRouteCheck(base, shinhanKakaoSpay, true);
        expect(getPayRouteStatus(applied, shinhanKakaoSpay)).toBe('APPLIED');
        expect(getPayRouteStatus(applied, { ...shinhanKakaoSpay, mode: 'CODE' })).toBe('UNCHECKED');
        expect(getPayRouteStatus(applied, { ...shinhanKakaoSpay, cardCompany: '국민카드' })).toBe('UNCHECKED');

        const notApplied = setPayRouteCheck(applied, shinhanKakaoSpay, false);
        expect(notApplied.routeChecks).toHaveLength(1);
        expect(getPayRouteStatus(notApplied, shinhanKakaoSpay)).toBe('NOT_APPLIED');
        expect(setPayRouteCheck(notApplied, shinhanKakaoSpay, undefined).routeChecks).toEqual([]);
    });

    it('shows only pays the user has, counting GoodDeal as KakaoPay', () => {
        expect(getOpenablePayIds(['naverpay', 'tosspay', 'kakaopay'])).toEqual(['kakaopay', 'naverpay']);
        expect(getOpenablePayIds(['kakaopay-gooddeal'])).toEqual(['kakaopay']);
        expect(getOpenablePayIds([])).toEqual([]);
    });

    it('falls back to the card when the default pay is no longer registered', () => {
        const kakao = { ...createDefaultPaymentPreferences(), defaultMethod: 'kakaopay' as const };
        expect(getEffectiveDefaultMethod(kakao, ['kakaopay'])).toBe('kakaopay');
        expect(getEffectiveDefaultMethod(kakao, ['naverpay'])).toBe('CARD');
    });

    it('shows the default method first, then the card, then the other pays', () => {
        expect(orderPayMethods(['kakaopay', 'naverpay'], 'naverpay')).toEqual(['naverpay', 'CARD', 'kakaopay']);
        expect(orderPayMethods(['kakaopay', 'naverpay'], 'CARD')).toEqual(['CARD', 'kakaopay', 'naverpay']);
        // A pay whose button is hidden on this phone cannot lead the row.
        expect(orderPayMethods(['naverpay'], 'kakaopay')).toEqual(['CARD', 'naverpay']);
    });
});
