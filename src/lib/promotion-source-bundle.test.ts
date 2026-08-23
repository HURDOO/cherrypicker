import { describe, expect, it } from 'vitest';
import { createPromotionSourceBundleHash } from './promotion-source-bundle';

describe('promotion source bundle', () => {
    it('creates a stable bundle hash independent of response order', () => {
        const documents = [
            { sourceUrl: 'https://example.com/a', contentHash: 'aaa' },
            { sourceUrl: 'https://example.com/b', contentHash: 'bbb' },
        ];

        expect(createPromotionSourceBundleHash(documents))
            .toBe(createPromotionSourceBundleHash([...documents].reverse()));
    });

    it('changes when any official response changes', () => {
        const first = createPromotionSourceBundleHash([
            { sourceUrl: 'https://example.com/a', contentHash: 'aaa' },
        ]);
        const second = createPromotionSourceBundleHash([
            { sourceUrl: 'https://example.com/a', contentHash: 'changed' },
        ]);

        expect(second).not.toBe(first);
    });
});
