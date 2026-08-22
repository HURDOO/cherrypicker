import { describe, expect, it } from 'vitest';
import { getBrandLogoUrl } from './brandVisuals';

describe('brand logo URLs', () => {
    it.each([
        ['gs25', '/brand-logos/gs25.svg'],
        ['cu', '/brand-logos/cu.svg'],
        ['seveneleven', '/brand-logos/seveneleven.svg'],
        ['daiso', '/brand-logos/daiso.png'],
        ['oliveyoung', '/brand-logos/oliveyoung.svg'],
        ['twosome', '/brand-logos/twosome.png'],
        ['starbucks', '/brand-logos/starbucks.png'],
    ])('uses a local contest-demo logo for %s', (id, expected) => {
        expect(getBrandLogoUrl({ id })).toBe(expected);
    });

    it('retains the remote fallback for a non-core known brand', () => {
        expect(getBrandLogoUrl({ id: 'emart24' }))
            .toBe('https://www.google.com/s2/favicons?domain=emart24.co.kr&sz=128');
    });
});
