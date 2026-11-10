import type {
    BenefitCombination,
    BenefitLayer,
    PaymentOpenMode,
    PaymentPayId,
    PromotionOffer,
    TelecomMembership,
} from '@/types';

// Deep links checked on the owner's Android phone on 2026-10-28.
// None of them is officially documented, so an app update can change them.
// See docs/payment-app-deeplinks-2026-10.md.

export type PaymentAppId = 'kakaotalk' | 'kakaopay' | 'naverpay' | 'tmembership';
export type PaymentAppMode = PaymentOpenMode;
export type PaymentAppPlatform = 'android' | 'ios' | 'other';

interface PaymentApp {
    name: string;
    androidPackage: string;
    appStoreId: string;
}

export const PAYMENT_APPS: Record<PaymentAppId, PaymentApp> = {
    kakaotalk: { name: '카카오톡', androidPackage: 'com.kakao.talk', appStoreId: '362057947' },
    kakaopay: { name: '카카오페이', androidPackage: 'com.kakaopay.app', appStoreId: '1464496236' },
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
    /** The pay this app pays with, whose saved open mode picks the link. */
    payId?: PaymentPayId;
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

function tMembershipAction(counted: boolean): PaymentAppAction {
    return {
        appId: 'tmembership',
        links: [{ mode: 'CODE', label: '바코드', scheme: 'mponepass', path: 'native/barcode' }],
        hint: counted
            ? '결제 전에 멤버십 바코드를 먼저 보여 주세요.'
            : 'T멤버십 제휴 매장이에요. 대상 상품이면 할인·적립되니 결제 전에 바코드를 보여 주세요.',
    };
}

const localDate = (now: Date) => [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
].join('-');

/**
 * Whether an SKT member should show the barcode at this brand. Most SKT offers only cover some
 * items, so they rarely become a counted step, but the barcode is still worth showing.
 */
export function isTMembershipPartner(
    offers: Pick<PromotionOffer, 'providerId' | 'brandIds' | 'startsAt' | 'endsAt'>[],
    brandId: string | undefined,
    memberships: Pick<TelecomMembership, 'providerId'>[],
    now = new Date(),
): boolean {
    if (!brandId || !memberships.some(item => item.providerId === SKT_PROVIDER_ID)) return false;
    const today = localDate(now);
    return offers.some(offer => (
        offer.providerId === SKT_PROVIDER_ID &&
        offer.brandIds.includes(brandId) &&
        (!offer.startsAt || offer.startsAt.slice(0, 10) <= today) &&
        (!offer.endsAt || offer.endsAt.slice(0, 10) >= today)
    ));
}

// The GoodDeal home inside the KakaoPay app, the link the GoodDeal observer app opens.
const GOODDEAL_HOME_PATH = 'payweb?url=https%3A%2F%2Fgood-deal-web.kakaopay.com%2Fhome%2Fall';

function payAction(combination: BenefitCombination): PaymentAppAction | undefined {
    const card = combination.cardName;
    // GoodDeal pays on its own page, not the KakaoPay payment screen: picking the brand on the
    // GoodDeal home shows a brand barcode that the kiosk or POS scans like a voucher.
    // A direct brand link would be better, but its address and brand ids are not known yet.
    if (combination.payProviderId === 'kakaopay-gooddeal') {
        return {
            appId: 'kakaopay',
            title: '카카오페이',
            links: [{ mode: 'CODE', label: '굿딜', scheme: 'kakaopay', path: GOODDEAL_HOME_PATH }],
            hint: '굿딜에서 이 매장 브랜드를 고르면 바코드가 떠요. 키오스크나 포스기에서 그 바코드를 스캔하세요.',
        };
    }
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
            payId: 'kakaopay',
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
                payId: 'naverpay',
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
                payId: 'naverpay',
                links: [qr],
                hint: '마지막에 쓴 결제수단이 선택돼요. Npay 머니인지 확인하세요.',
            };
        }
    }
    // Other providers are not verified yet.
    return undefined;
}

/**
 * App buttons for one card of the "pay in this order" list.
 * The membership barcode goes first, on the discount card; the pay app goes on the pay card.
 */
export function getPaymentAppActions(
    combination: BenefitCombination,
    layer: BenefitLayer,
    options: { tMembershipPartner?: boolean } = {},
): PaymentAppAction[] {
    if (layer === 'DISCOUNT') {
        const counted = combination.steps.some(step => step.providerId === SKT_PROVIDER_ID);
        return counted || options.tMembershipPartner ? [tMembershipAction(counted)] : [];
    }
    if (layer === 'PAY') {
        const pay = payAction(combination);
        return pay ? [pay] : [];
    }
    return [];
}

/**
 * When the recommendation is a plain card payment, no pay adds a benefit, so the user can pay
 * with the card itself or through any pay they registered. Returns the pay app for each such pay,
 * or nothing when a pay is part of the recommendation and must be used.
 */
export function getPayChoiceActions(
    combination: BenefitCombination,
    payIds: readonly PaymentPayId[],
): Partial<Record<PaymentPayId, PaymentAppAction>> | undefined {
    if (combination.payProviderId || combination.fundingType !== 'CARD' || !combination.cardId) {
        return undefined;
    }
    const actions: Partial<Record<PaymentPayId, PaymentAppAction>> = {};
    payIds.forEach(payId => {
        const action = payAction({ ...combination, payProviderId: payId });
        if (action) actions[payId] = action;
    });
    return actions;
}

/** The one link a button opens: the saved mode when the app has it, otherwise its first link. */
export function pickLink(links: PaymentAppLink[], mode?: PaymentAppMode): PaymentAppLink {
    return links.find(link => link.mode === mode) ?? links[0];
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
