import { describe, expect, it } from 'vitest';
import { decodePromotionHtml } from './html-decoding';

describe('decodePromotionHtml', () => {
    it('decodes UTF-8 HTML', () => {
        const bytes = new TextEncoder().encode('<title>공식 혜택</title>');
        expect(decodePromotionHtml(bytes, 'text/html; charset=utf-8'))
            .toContain('공식 혜택');
    });

    it('decodes EUC-KR from the response charset', () => {
        const bytes = Uint8Array.from([
            0x3c, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e,
            0xc7, 0xd1, 0xb1, 0xdb,
            0x3c, 0x2f, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e,
        ]);
        expect(decodePromotionHtml(bytes, 'text/html; charset=euc-kr'))
            .toContain('한글');
    });

    it('sniffs EUC-KR from a meta charset', () => {
        const prefix = new TextEncoder().encode('<meta charset="euc-kr"><title>');
        const korean = Uint8Array.from([0xc7, 0xd1, 0xb1, 0xdb]);
        const suffix = new TextEncoder().encode('</title>');
        const bytes = new Uint8Array(prefix.length + korean.length + suffix.length);
        bytes.set(prefix);
        bytes.set(korean, prefix.length);
        bytes.set(suffix, prefix.length + korean.length);

        expect(decodePromotionHtml(bytes, 'text/html')).toContain('한글');
    });
});
