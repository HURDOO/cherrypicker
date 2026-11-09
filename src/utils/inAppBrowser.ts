// KakaoTalk's in-app browser keeps its own storage, so a workspace set up there is missing
// when the same link is opened later in Chrome or Safari. These helpers send it out once.

const KAKAOTALK_USER_AGENT = /KAKAOTALK/i;

/** One automatic hand-off per tab, so a failed or refused hand-off never loops. */
export const KAKAOTALK_HANDOFF_STORAGE_KEY = 'cherrypicker.kakaotalk-handoff-attempted';

export function isKakaoTalkInAppBrowser(userAgent: string | null | undefined): boolean {
    return Boolean(userAgent && KAKAOTALK_USER_AGENT.test(userAgent));
}

/** KakaoTalk opens this URL in the phone's default browser (Android and iOS). */
export function kakaoTalkOpenExternalUrl(url: string): string {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}
