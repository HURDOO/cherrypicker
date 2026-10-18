import { describe, expect, it } from 'vitest';
import { matchCardSearch, validateCardSearchAliases } from './cardSearch';

const deepDream = {
    name: '신한카드 Deep Dream 체크',
    company: '신한카드',
    searchAliases: ['미니언즈'],
};

describe('card search', () => {
    it('matches names and companies regardless of case, width and spacing', () => {
        expect(matchCardSearch(deepDream, 'deep dream')).toEqual({});
        expect(matchCardSearch(deepDream, 'DeepDream')).toEqual({});
        expect(matchCardSearch(deepDream, '신 한')).toEqual({});
        expect(matchCardSearch(deepDream, '   ')).toEqual({});
    });

    it('finds a design variant by its alias and names the alias', () => {
        expect(matchCardSearch(deepDream, '미니언')).toEqual({ matchedAlias: '미니언즈' });
        expect(matchCardSearch(deepDream, '짱구')).toBeUndefined();
        expect(matchCardSearch({ name: '노리체크카드', company: 'KB국민카드' }, '미니언즈')).toBeUndefined();
    });

    it('rejects malformed, duplicated or excessive aliases', () => {
        expect(validateCardSearchAliases(undefined)).toEqual([]);
        expect(validateCardSearchAliases(['미니언즈', '짱구'])).toEqual([]);
        expect(validateCardSearchAliases('미니언즈')).toHaveLength(1);
        expect(validateCardSearchAliases([' 미니언즈'])).toHaveLength(1);
        expect(validateCardSearchAliases(['', 3])).toHaveLength(2);
        expect(validateCardSearchAliases(['미니 언즈', '미니언즈'])).toEqual([
            "카드 검색 별칭 '미니언즈'이(가) 중복되었습니다.",
        ]);
        expect(validateCardSearchAliases(Array.from({ length: 11 }, (_, index) => `디자인${index}`)))
            .toHaveLength(1);
    });
});
