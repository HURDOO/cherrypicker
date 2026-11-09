import { describe, expect, it } from 'vitest';
import { isKakaoTalkInAppBrowser, kakaoTalkOpenExternalUrl } from './inAppBrowser';

describe('isKakaoTalkInAppBrowser', () => {
    it('detects the Android and iOS KakaoTalk in-app browsers', () => {
        expect(isKakaoTalkInAppBrowser(
            'Mozilla/5.0 (Linux; Android 15; SM-F966N Build/AP3A; wv) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36;KAKAOTALK 2611750',
        )).toBe(true);
        expect(isKakaoTalkInAppBrowser(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
            '(KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.7.1',
        )).toBe(true);
    });

    it('leaves regular browsers and other in-app browsers alone', () => {
        expect(isKakaoTalkInAppBrowser(
            'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/139.0.0.0 Mobile Safari/537.36',
        )).toBe(false);
        expect(isKakaoTalkInAppBrowser(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
            '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        )).toBe(false);
        expect(isKakaoTalkInAppBrowser(
            'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Chrome/139.0 Mobile ' +
            'Safari/537.36 NAVER(inapp; search; 2000; 12.10.0)',
        )).toBe(false);
        expect(isKakaoTalkInAppBrowser('')).toBe(false);
        expect(isKakaoTalkInAppBrowser(undefined)).toBe(false);
    });
});

describe('kakaoTalkOpenExternalUrl', () => {
    it('encodes the whole current address, including path, query and hash', () => {
        expect(kakaoTalkOpenExternalUrl('https://cherrypicker.app.hurdoo.kr/setup?step=card&x=1#top'))
            .toBe(
                'kakaotalk://web/openExternal?url=' +
                'https%3A%2F%2Fcherrypicker.app.hurdoo.kr%2Fsetup%3Fstep%3Dcard%26x%3D1%23top',
            );
    });
});
