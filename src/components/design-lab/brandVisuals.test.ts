import { describe, expect, it } from 'vitest';
import { getBrandLogoUrl } from './brandVisuals';

describe('brand logo URLs', () => {
    it.each([
        ['gs25', '/brand-logos/gs25.svg'],
        ['cu', '/brand-logos/cu.svg'],
        ['seveneleven', '/brand-logos/seveneleven.svg'],
    ])('prefers the reviewed official brand mark for %s', (id, expected) => {
        expect(getBrandLogoUrl({ id })).toBe(expected);
    });

    it.each([
        ['daiso', '다이소'],
        ['twosome', '투썸플레이스'],
        ['starbucks', '스타벅스'],
    ])('uses a collected high-resolution local logo for %s', (id, name) => {
        expect(getBrandLogoUrl({ id, name }))
            .toMatch(/^\/brand-logos\/collected\/.+\.(?:ico|jpe?g|png|svg|webp)$/);
    });

    it('uses the reviewed official wordmark for Emart24', () => {
        expect(getBrandLogoUrl({ id: 'emart24' }))
            .toBe('/brand-logos/collected/emart24-co-kr.png');
    });

    it('uses the reviewed 512px app icon for Olive Young', () => {
        expect(getBrandLogoUrl({ id: 'oliveyoung', name: '올리브영' }))
            .toBe('/brand-logos/collected/oliveyoung-co-kr.jpg');
    });

    it.each([
        ['app_store', 'App Store', '/brand-logos/collected/apple-com.png'],
        ['baemin', '배달의민족', '/brand-logos/collected/baemin-com.png'],
        ['homeplus', '홈플러스', '/brand-logos/collected/homeplus-co-kr.svg'],
        ['official_isaac', '이삭토스트', '/brand-logos/collected/isaac-toast-co-kr.svg'],
        ['paulbassett', '폴바셋', '/brand-logos/collected/paulbassett-co-kr.png'],
        ['official_samsung', '삼성스토어', '/brand-logos/collected/samsung-com.svg'],
        ['subway', '써브웨이', '/brand-logos/collected/subway-co-kr.jpg'],
        ['yes24', 'YES24', '/brand-logos/collected/yes24-com.svg'],
    ])('uses a visually reviewed brand asset for %s', (id, name, expected) => {
        expect(getBrandLogoUrl({ id, name })).toBe(expected);
    });

    it.each([
        ['paris_baguette', '파리바게뜨'],
        ['megabox', '메가박스'],
        ['official_933878a563e25745', '교보문고'],
        ['official_450d19cd64e4db82', '이케아'],
    ])('maps %s to a collected local asset', (id, name) => {
        expect(getBrandLogoUrl({ id, name }))
            .toMatch(/^\/brand-logos\/collected\//);
    });

    it('uses a crisp monogram instead of a low-resolution remote fallback', () => {
        expect(getBrandLogoUrl({ id: 'hsk', name: 'HSK' })).toBeNull();
    });

    it.each([
        ['vic_market', '롯데 VIC마켓'],
        ['lotteria', '롯데리아'],
        ['lotte_department', '롯데백화점'],
        ['interpark_ticket', '인터파크 티켓'],
        ['jpt', 'JPT'],
        ['toeic', 'TOEIC'],
        ['official_8c6413f24b7f90bb', '네이버 멤버십 x GS칼텍스'],
    ])('rejects a misleading or indistinguishable mark for %s', (id, name) => {
        expect(getBrandLogoUrl({ id, name })).toBeNull();
    });
});
