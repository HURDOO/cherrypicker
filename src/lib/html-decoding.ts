const normalizeCharset = (value: string | undefined) => {
    const charset = value?.trim().toLowerCase().replaceAll('_', '-');
    if (!charset) return 'utf-8';
    if (['euc-kr', 'ks-c-5601-1987', 'ks-c-5601', 'cp949', 'ms949'].includes(charset)) {
        return 'euc-kr';
    }
    return charset;
};

const countReplacementCharacters = (value: string) =>
    [...value].filter(character => character === '\uFFFD').length;

export const decodePromotionHtml = (
    bytes: Uint8Array,
    contentType?: string | null,
) => {
    const headerCharset = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
    const asciiHead = new TextDecoder('windows-1252')
        .decode(bytes.slice(0, 8_192));
    const metaCharset = asciiHead.match(
        /<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i
    )?.[1] || asciiHead.match(
        /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^;"'\s]+)/i
    )?.[1];
    const declaredCharset = normalizeCharset(headerCharset || metaCharset);

    try {
        const declaredText = new TextDecoder(declaredCharset).decode(bytes);
        if (declaredCharset !== 'utf-8') return declaredText;

        const eucKrText = new TextDecoder('euc-kr').decode(bytes);
        return countReplacementCharacters(eucKrText) < countReplacementCharacters(declaredText)
            ? eucKrText
            : declaredText;
    } catch {
        return new TextDecoder('utf-8').decode(bytes);
    }
};
