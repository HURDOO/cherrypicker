export interface ExtractedOfficialNoticeDates {
    publicationDate?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    publicationEvidence?: string;
    effectiveEvidence?: string;
}

type DateMatch = {
    date: string;
    raw: string;
};

const DATE_PATTERN = /(?<!\d)((?:(?:19|20)\d{2})|\d{2})\s*(?:년\s*|[./-])\s*(\d{1,2})\s*(?:월\s*|[./-])\s*(\d{1,2})\s*일?/g;
const PUBLICATION_LABEL = /게시일|등록일|공지일|작성일|공시일/;
const EFFECTIVE_LABEL = /시행\s*일자|시행일|적용\s*(?:시작)?일|효력\s*발생일/;
const PERIOD_LABEL = /적용\s*기간|행사\s*기간|혜택\s*기간|유효\s*기간/;

const validDate = (year: number, month: number, day: number) => {
    const value = new Date(Date.UTC(year, month - 1, day));
    if (
        value.getUTCFullYear() !== year ||
        value.getUTCMonth() !== month - 1 ||
        value.getUTCDate() !== day
    ) return undefined;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const datesIn = (value: string): DateMatch[] => [...value.matchAll(DATE_PATTERN)]
    .flatMap(match => {
        const year = match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1]);
        const date = validDate(year, Number(match[2]), Number(match[3]));
        return date ? [{ date, raw: match[0].trim() }] : [];
    });

const normalizedLines = (text: string) => text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const windowFrom = (lines: string[], index: number, size = 4) => (
    lines.slice(index, index + size).join(' · ')
);

export function extractOfficialNoticeDates(text: string): ExtractedOfficialNoticeDates {
    const lines = normalizedLines(text);
    const effectiveIndex = lines.findIndex(line => EFFECTIVE_LABEL.test(line));
    const periodIndex = lines.findIndex(line => PERIOD_LABEL.test(line));
    const effectiveWindowIndex = effectiveIndex >= 0 ? effectiveIndex : periodIndex;
    const effectiveWindow = effectiveWindowIndex >= 0
        ? windowFrom(lines, effectiveWindowIndex, 5)
        : '';
    const effectiveDates = datesIn(effectiveWindow);

    const firstPublicationLabelIndex = lines.findIndex(line => PUBLICATION_LABEL.test(line));
    const publicationLabelIndex = firstPublicationLabelIndex >= 0 && (
        effectiveWindowIndex < 0 || firstPublicationLabelIndex < effectiveWindowIndex
    )
        ? firstPublicationLabelIndex
        : -1;
    const publicationWindow = publicationLabelIndex >= 0
        ? lines.slice(
            publicationLabelIndex,
            Math.min(
                publicationLabelIndex + 3,
                effectiveWindowIndex > publicationLabelIndex
                    ? effectiveWindowIndex
                    : lines.length,
            ),
        ).join(' · ')
        : lines.slice(0, effectiveWindowIndex >= 0 ? effectiveWindowIndex : 40).join(' · ');
    const publication = datesIn(publicationWindow)[0];

    return {
        ...(publication && {
            publicationDate: publication.date,
            publicationEvidence: publicationWindow.slice(0, 500),
        }),
        ...(effectiveDates[0] && {
            effectiveFrom: effectiveDates[0].date,
            effectiveEvidence: effectiveWindow.slice(0, 500),
        }),
        ...(periodIndex >= 0 && effectiveDates[1] && {
            effectiveTo: effectiveDates[1].date,
        }),
    };
}
