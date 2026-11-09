import { describe, expect, it } from 'vitest';
import {
    detectInstallGuidePlatform,
    kstDay,
    parseInstallCardState,
    recordInstallCardVisit,
    shouldShowInstallCard,
} from './appInstall';

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; SM-F966N) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const SAMSUNG_INTERNET = 'Mozilla/5.0 (Linux; Android 15; SM-F966N) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const DESKTOP_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0';
const KAKAOTALK = `${IOS_SAFARI} KAKAOTALK 25.7.1`;
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 15; SM-F966N; wv) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36';

describe('detectInstallGuidePlatform', () => {
    it('picks the guide for each supported browser', () => {
        expect(detectInstallGuidePlatform(ANDROID_CHROME)).toBe('android-chrome');
        expect(detectInstallGuidePlatform(SAMSUNG_INTERNET)).toBe('samsung-internet');
        expect(detectInstallGuidePlatform(IOS_SAFARI)).toBe('ios-safari');
        expect(detectInstallGuidePlatform(IOS_CHROME)).toBe('ios-chrome');
        expect(detectInstallGuidePlatform(DESKTOP_CHROME)).toBe('desktop');
        expect(detectInstallGuidePlatform(DESKTOP_EDGE)).toBe('desktop');
    });

    it('treats KakaoTalk and other in-app views separately', () => {
        expect(detectInstallGuidePlatform(KAKAOTALK)).toBe('kakaotalk');
        expect(detectInstallGuidePlatform(ANDROID_WEBVIEW)).toBe('other');
    });
});

describe('install card', () => {
    it('waits for a second visit day before showing', () => {
        const first = recordInstallCardVisit({}, '2026-11-10');
        expect(first).toEqual({ firstVisitDay: '2026-11-10' });
        expect(shouldShowInstallCard(first, '2026-11-10', { standalone: false })).toBe(false);
        expect(recordInstallCardVisit(first, '2026-11-11')).toBe(first);
        expect(shouldShowInstallCard(first, '2026-11-11', { standalone: false })).toBe(true);
    });

    it('stays hidden after closing it or inside the installed app', () => {
        const state = { firstVisitDay: '2026-11-01' };
        expect(shouldShowInstallCard(state, '2026-11-10', { standalone: true })).toBe(false);
        expect(shouldShowInstallCard({ ...state, dismissed: true }, '2026-11-10', { standalone: false }))
            .toBe(false);
        expect(shouldShowInstallCard({}, '2026-11-10', { standalone: false })).toBe(false);
    });

    it('reads stored state defensively', () => {
        expect(parseInstallCardState(null)).toEqual({});
        expect(parseInstallCardState('not json')).toEqual({});
        expect(parseInstallCardState('{"firstVisitDay":"yesterday","dismissed":"yes"}')).toEqual({});
        expect(parseInstallCardState('{"firstVisitDay":"2026-11-09","dismissed":true}'))
            .toEqual({ firstVisitDay: '2026-11-09', dismissed: true });
    });

    it('counts days in Korea time', () => {
        expect(kstDay(new Date('2026-11-09T15:30:00Z'))).toBe('2026-11-10');
        expect(kstDay(new Date('2026-11-09T14:30:00Z'))).toBe('2026-11-09');
    });
});
