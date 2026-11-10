import { isKakaoTalkInAppBrowser } from './inAppBrowser';

/** Home-screen name. Temporary for the demo; the product name and icon will change. */
export const APP_INSTALL_NAME = '체리피커';

export type InstallGuidePlatform =
    | 'android-chrome'
    | 'samsung-internet'
    | 'ios-safari'
    | 'ios-chrome'
    | 'desktop'
    | 'kakaotalk'
    | 'other';

/** Which install guide to open first. Every guide stays reachable on the page. */
export function detectInstallGuidePlatform(userAgent: string): InstallGuidePlatform {
    if (isKakaoTalkInAppBrowser(userAgent)) return 'kakaotalk';
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
        return /CriOS/i.test(userAgent) ? 'ios-chrome' : 'ios-safari';
    }
    if (/SamsungBrowser/i.test(userAgent)) return 'samsung-internet';
    if (/Android/i.test(userAgent)) {
        const otherAndroidBrowser = /; wv\)|EdgA|OPR|Whale|NAVER|Firefox|DaumApps/i.test(userAgent);
        return /Chrome\//.test(userAgent) && !otherAndroidBrowser ? 'android-chrome' : 'other';
    }
    if (!/Mobile/i.test(userAgent) && /(Chrome|Edg)\//.test(userAgent)) return 'desktop';
    return 'other';
}

export const INSTALL_CARD_STORAGE_KEY = 'cherrypicker.install-card';

export interface InstallCardState {
    /** First day (Asia/Seoul) this browser opened the home screen, as YYYY-MM-DD. */
    firstVisitDay?: string;
    /** The first-recommendation tutorial produced a recommendation in this browser. */
    firstRecommendationDone?: boolean;
    dismissed?: boolean;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseInstallCardState(value: string | null): InstallCardState {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value) as Partial<InstallCardState>;
        return {
            ...(typeof parsed.firstVisitDay === 'string' && DAY_PATTERN.test(parsed.firstVisitDay) && {
                firstVisitDay: parsed.firstVisitDay,
            }),
            ...(parsed.firstRecommendationDone === true && { firstRecommendationDone: true }),
            ...(parsed.dismissed === true && { dismissed: true }),
        };
    } catch {
        return {};
    }
}

export function recordInstallCardVisit(state: InstallCardState, today: string): InstallCardState {
    return state.firstVisitDay ? state : { ...state, firstVisitDay: today };
}

export function recordFirstRecommendation(state: InstallCardState): InstallCardState {
    return state.firstRecommendationDone ? state : { ...state, firstRecommendationDone: true };
}

/**
 * The card shows once the first-recommendation tutorial has produced a recommendation, or, for a
 * browser that skipped it, from the second visit day on. Never inside the installed app or after
 * closing it.
 */
export function shouldShowInstallCard(
    state: InstallCardState,
    today: string,
    { standalone }: { standalone: boolean },
): boolean {
    if (standalone || state.dismissed) return false;
    return state.firstRecommendationDone === true ||
        (Boolean(state.firstVisitDay) && today > state.firstVisitDay!);
}

export function kstDay(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
