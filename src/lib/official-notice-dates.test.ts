import { describe, expect, it } from 'vitest';
import { extractOfficialNoticeDates } from './official-notice-dates';

describe('official notice date extraction', () => {
    it('uses the leading notice date and labeled effective date', () => {
        expect(extractOfficialNoticeDates(`
            신한카드 SOL트래블 체크 약관 개정에 따른 안내
            2024.06.13
            주요 변경 내용
            시행일자
            2024년 6월 20일부터
            신규 회원의 카드 사용등록일 다음달까지 적용
        `)).toMatchObject({
            publicationDate: '2024-06-13',
            effectiveFrom: '2024-06-20',
        });
    });

    it('extracts both ends of a labeled benefit period', () => {
        expect(extractOfficialNoticeDates(`
            등록일 2026-01-02
            행사 기간
            2026.02.01 ~ 2026.03.31
        `)).toMatchObject({
            publicationDate: '2026-01-02',
            effectiveFrom: '2026-02-01',
            effectiveTo: '2026-03-31',
        });
    });

    it('does not normalize impossible calendar dates', () => {
        expect(extractOfficialNoticeDates(`
            공지일 2026.02.30
            시행일 2026.03.01
        `)).toEqual(expect.objectContaining({
            effectiveFrom: '2026-03-01',
        }));
        expect(extractOfficialNoticeDates(`공지일 2026.02.30\n시행일 2026.03.01`)
            .publicationDate).toBeUndefined();
    });

    it('normalizes a two-digit year in a labeled official effective date', () => {
        expect(extractOfficialNoticeDates(`
            KB국민 나라사랑카드 약관 개정 안내
            2024-06-24
            시행일
            24.8.1(목)
        `)).toMatchObject({
            publicationDate: '2024-06-24',
            effectiveFrom: '2024-08-01',
        });
    });
});
