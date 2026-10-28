import type { BenefitCombination, CombinationStep } from '@/types';

// Deep links checked on the owner's Android phone on 2026-10-28.
// None of them is officially documented, so an app update can change them.
// See docs/payment-app-deeplinks-2026-10.md.

export type PaymentAppId = 'kakaotalk' | 'naverpay' | 'tmembership';
export type PaymentAppMode = 'CODE' | 'SAMSUNG_PAY';
export type PaymentAppPlatform = 'android' | 'ios' | 'other';

interface PaymentApp {
    name: string;
    androidPackage: string;
    appStoreId: string;
}

export const PAYMENT_APPS: Record<PaymentAppId, PaymentApp> = {
    kakaotalk: { name: '카카오톡', androidPackage: 'com.kakao.talk', appStoreId: '362057947' },
    naverpay: { name: '네이버페이', androidPackage: 'com.naverfin.payapp', appStoreId: '1554807824' },
    tmembership: { name: 'T멤버십', androidPackage: 'com.tms', appStoreId: '464205249' },
};

export interface PaymentAppLink {
    mode: PaymentAppMode;
    label: string;
    scheme: string;
    /** Everything after `scheme://`. */
    path: string;
}

export interface PaymentAppAction {
    appId: PaymentAppId;
    /** What the button calls it, when that differs from the app, e.g. KakaoPay inside KakaoTalk. */
    title?: string;
    links: PaymentAppLink[];
    /** The card or funding to pick in the app, which a link cannot choose. */
    hint?: string;
}

export function isPaymentAppId(value: unknown): value is PaymentAppId {
    return typeof value === 'string' && Object.hasOwn(PAYMENT_APPS, value);
}

const SKT_PROVIDER_ID = 'skt';

function tMembershipAction(): PaymentAppAction {
    return {
        appId: 'tmembership',
        links: [{ mode: 'CODE', label: '바코드', scheme: 'mponepass', path: 'native/barcode' }],
        hint: '결제 전에 멤버십 바코드를 먼저 보여 주세요.',
    };
}

function payAction(combination: BenefitCombination): PaymentAppAction | undefined {
    const card = combination.cardName;
    if (combination.payProviderId === 'kakaopay') {
        // Through KakaoTalk, which almost everyone has, rather than the separate KakaoPay app.
        // Its payment screen opens on pay money, so card payments need a switch in the app.
        const hint = combination.fundingType === 'CARD'
            ? card
                ? `카카오페이 결제 화면은 페이머니로 열려요. ${card}로 바꿔서 결제하세요.`
                : '카카오페이 결제 화면은 페이머니로 열려요. 추천 카드로 바꿔서 결제하세요.'
            : combination.fundingType === 'MONEY'
                ? '카카오톡에서 페이머니 결제 화면이 열려요.'
                : undefined;
        if (!hint) return undefined;
        return {
            appId: 'kakaotalk',
            title: '카카오페이',
            links: [
                { mode: 'CODE', label: '바코드', scheme: 'kakaotalk', path: 'kakaopay/offline' },
                {
                    mode: 'SAMSUNG_PAY',
                    label: '삼성페이',
                    scheme: 'kakaotalk',
                    path: 'kakaopay/offline?screen=spay',
                },
            ],
            hint,
        };
    }
    if (combination.payProviderId === 'naverpay') {
        const qr: PaymentAppLink = {
            mode: 'CODE',
            label: 'QR',
            scheme: 'naverpayapp',
            path: 'showservicemenu?menuName=payment&subMenuName=qr',
        };
        if (combination.fundingType === 'CARD') {
            return {
                appId: 'naverpay',
                links: [
                    qr,
                    {
                        mode: 'SAMSUNG_PAY',
                        label: '삼성페이',
                        scheme: 'naverpayapp',
                        path: 'showservicemenu?menuName=payment&subMenuName=mst',
                    },
                ],
                hint: card
                    ? `마지막에 쓴 카드가 선택돼요. ${card}인지 확인하세요.`
                    : undefined,
            };
        }
        if (combination.fundingType === 'MONEY') {
            return {
                appId: 'naverpay',
                links: [qr],
                hint: '마지막에 쓴 결제수단이 선택돼요. Npay 머니인지 확인하세요.',
            };
        }
    }
    // GoodDeal brand pages and other providers are not verified yet.
    return undefined;
}

/**
 * App buttons for one card of the "pay in this order" list.
 * `steps` are the steps that card shows, so the T membership button sits next to its benefit.
 */
export function getPaymentAppActions(
    combination: BenefitCombination,
    steps: CombinationStep[],
    includePayProvider: boolean,
): PaymentAppAction[] {
    const actions: PaymentAppAction[] = [];
    if (steps.some(step => step.providerId === SKT_PROVIDER_ID)) actions.push(tMembershipAction());
    if (includePayProvider) {
        const pay = payAction(combination);
        if (pay) actions.push(pay);
    }
    return actions;
}

export function orderLinks(links: PaymentAppLink[], preferred?: PaymentAppMode): PaymentAppLink[] {
    if (!preferred) return links;
    return [...links].sort((a, b) => Number(b.mode === preferred) - Number(a.mode === preferred));
}

export function appStoreUrl(appId: PaymentAppId, platform: PaymentAppPlatform): string {
    const app = PAYMENT_APPS[appId];
    return platform === 'ios'
        ? `https://apps.apple.com/kr/app/id${app.appStoreId}`
        : `https://play.google.com/store/apps/details?id=${app.androidPackage}`;
}

export function appMissingPath(appId: PaymentAppId): string {
    return `/app-missing?app=${appId}`;
}

/**
 * Android Chrome opens the app, or goes to `fallbackUrl` when it is not installed.
 * iOS has no fallback, so it gets the bare scheme.
 */
export function buildPaymentAppHref(
    appId: PaymentAppId,
    link: PaymentAppLink,
    platform: PaymentAppPlatform,
    origin: string,
): string {
    if (platform !== 'android') return `${link.scheme}://${link.path}`;
    const fallback = encodeURIComponent(`${origin}${appMissingPath(appId)}`);
    return `intent://${link.path}#Intent;scheme=${link.scheme};` +
        `package=${PAYMENT_APPS[appId].androidPackage};S.browser_fallback_url=${fallback};end`;
}

export function detectPaymentAppPlatform(userAgent: string, maxTouchPoints = 0): PaymentAppPlatform {
    if (/Android/i.test(userAgent)) return 'android';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
    // iPadOS reports itself as a Mac.
    if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
    return 'other';
}

export interface PaymentAppPreferences {
    hiddenAppIds: PaymentAppId[];
    preferredModes: Partial<Record<PaymentAppId, PaymentAppMode>>;
}

export const EMPTY_PAYMENT_APP_PREFERENCES: PaymentAppPreferences = {
    hiddenAppIds: [],
    preferredModes: {},
};

export function parsePaymentAppPreferences(raw: string | null): PaymentAppPreferences {
    if (!raw) return EMPTY_PAYMENT_APP_PREFERENCES;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') return EMPTY_PAYMENT_APP_PREFERENCES;
        const record = value as Record<string, unknown>;
        const hiddenAppIds = Array.isArray(record.hiddenAppIds)
            ? [...new Set(record.hiddenAppIds.filter(isPaymentAppId))]
            : [];
        const preferredModes: PaymentAppPreferences['preferredModes'] = {};
        if (record.preferredModes && typeof record.preferredModes === 'object') {
            Object.entries(record.preferredModes as Record<string, unknown>).forEach(([appId, mode]) => {
                if (isPaymentAppId(appId) && (mode === 'CODE' || mode === 'SAMSUNG_PAY')) {
                    preferredModes[appId] = mode;
                }
            });
        }
        return { hiddenAppIds, preferredModes };
    } catch {
        return EMPTY_PAYMENT_APP_PREFERENCES;
    }
}
