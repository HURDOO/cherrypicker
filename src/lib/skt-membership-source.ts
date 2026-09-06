import { htmlToText } from './promotion-parsers';

export const SKT_MEMBERSHIP_LIST_SORT = 'BRAND_NAME' as const;
export const SKT_MEMBERSHIP_PAGE_SIZE = 20;
export const SKT_MEMBERSHIP_MAX_PAGES = 100;

export interface SktMembershipListBrand {
    officialId: string;
    name: string;
}

export interface SktMembershipListPage {
    pageNum: number;
    pageSize: number;
    totalCount: number;
    sortType: string;
    lastPage: boolean;
    brands: SktMembershipListBrand[];
}

const requiredInteger = (html: string, pattern: RegExp, label: string) => {
    const match = html.match(pattern);
    const value = match ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`SKT 목록에서 ${label} 값을 확인하지 못했습니다.`);
    }
    return value;
};

const requiredText = (html: string, pattern: RegExp, label: string) => {
    const value = html.match(pattern)?.[1]?.trim();
    if (!value) throw new Error(`SKT 목록에서 ${label} 값을 확인하지 못했습니다.`);
    return value;
};

const attribute = (attributes: string, name: string) => attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*['\"]([^'\"]+)['\"]`, 'i')
)?.[1];

export function parseSktMembershipListPage(html: string): SktMembershipListPage {
    const totalCount = requiredInteger(
        html,
        /\bvar\s+totalCount\s*=\s*(\d+)\s*;/i,
        '전체 브랜드 수',
    );
    const pageNum = requiredInteger(
        html,
        /<input[^>]*\bname=['"]pageNum['"][^>]*\bvalue=['"](\d+)['"][^>]*>/i,
        '페이지 번호',
    );
    const pageSize = requiredInteger(
        html,
        /<input[^>]*\bname=['"]pageSize['"][^>]*\bvalue=['"](\d+)['"][^>]*>/i,
        '페이지 크기',
    );
    const sortType = requiredText(
        html,
        /<input[^>]*\bname=['"]sortType['"][^>]*\bvalue=['"]([^'"]+)['"][^>]*>/i,
        '정렬 방식',
    );
    const lastPageValue = requiredText(
        html,
        /<input[^>]*\bname=['"]lastPageYn['"][^>]*\bvalue=['"]([^'"]+)['"][^>]*>/i,
        '마지막 페이지 여부',
    );
    const brands: SktMembershipListBrand[] = [];
    const anchorPattern = /<a([^>]*\bclass=['"][^'"]*\bbenefit-box\b[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;

    for (const match of html.matchAll(anchorPattern)) {
        const officialId = attribute(match[1], 'data-id');
        const name = htmlToText(
            match[2].match(/<span[^>]*\bclass=['"]brand['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ''
        );
        if (!officialId || !/^\d+$/.test(officialId) || !name) {
            throw new Error('SKT 목록 브랜드 ID 또는 이름이 올바르지 않습니다.');
        }
        brands.push({ officialId, name });
    }

    if (pageSize < 1 || pageSize > 100 || totalCount < 1 || brands.length < 1) {
        throw new Error('SKT 목록 페이지의 건수 정보가 올바르지 않습니다.');
    }

    return {
        pageNum,
        pageSize,
        totalCount,
        sortType,
        lastPage: lastPageValue.toUpperCase() === 'Y',
        brands,
    };
}

export function buildSktMembershipListUrl(sourceUrl: string, pageNum: number) {
    const url = new URL(sourceUrl);
    url.searchParams.set('pageNum', String(pageNum));
    url.searchParams.set('pageSize', String(SKT_MEMBERSHIP_PAGE_SIZE));
    url.searchParams.set('sortType', SKT_MEMBERSHIP_LIST_SORT);
    url.searchParams.set('mediumCategoryId', '-1');
    url.searchParams.set('benefitTypeId', 'ALL');
    url.searchParams.set('searchText', '');
    return url.toString();
}

export function buildSktMembershipDetailUrl(sourceUrl: string, officialId: string) {
    const url = new URL('/mps/pc-bff/benefitbrand/detail.do', sourceUrl);
    url.searchParams.set('brandId', officialId);
    return url.toString();
}

const normalizedBrandName = (name: string) => name
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');

export function validateSktMembershipListPages(pages: SktMembershipListPage[]) {
    if (pages.length < 1) throw new Error('SKT 목록 페이지가 없습니다.');
    const first = pages[0];
    if (first.sortType !== SKT_MEMBERSHIP_LIST_SORT) {
        throw new Error(`SKT 목록 정렬이 ${SKT_MEMBERSHIP_LIST_SORT}이 아닙니다.`);
    }
    if (first.pageSize !== SKT_MEMBERSHIP_PAGE_SIZE) {
        throw new Error(`SKT 목록 페이지 크기가 ${SKT_MEMBERSHIP_PAGE_SIZE}이 아닙니다.`);
    }
    const expectedPageCount = Math.ceil(first.totalCount / first.pageSize);
    if (expectedPageCount < 1 || expectedPageCount > SKT_MEMBERSHIP_MAX_PAGES) {
        throw new Error('SKT 목록 기대 페이지 수가 안전 범위를 벗어났습니다.');
    }
    if (pages.length !== expectedPageCount) {
        throw new Error(`SKT 목록 페이지가 ${expectedPageCount}개 중 ${pages.length}개만 수집됐습니다.`);
    }

    pages.forEach((page, index) => {
        if (
            page.pageNum !== index ||
            page.pageSize !== first.pageSize ||
            page.totalCount !== first.totalCount ||
            page.sortType !== first.sortType
        ) {
            throw new Error(`SKT 목록 ${index + 1}페이지의 기준값이 수집 중 변경됐습니다.`);
        }
        const expectedLastPage = index === expectedPageCount - 1;
        if (page.lastPage !== expectedLastPage) {
            throw new Error(`SKT 목록 ${index + 1}페이지의 마지막 페이지 표시가 올바르지 않습니다.`);
        }
    });

    const brands = pages.flatMap(page => page.brands);
    const uniqueIds = new Set(brands.map(brand => brand.officialId));
    const uniqueNames = new Set(brands.map(brand => normalizedBrandName(brand.name)));
    if (brands.length !== first.totalCount || uniqueIds.size !== first.totalCount) {
        throw new Error(
            `SKT 목록 브랜드가 기대 ${first.totalCount}개와 일치하지 않습니다. ` +
            `(목록 ${brands.length}개, 고유 ID ${uniqueIds.size}개)`,
        );
    }
    if (uniqueNames.size !== first.totalCount) {
        throw new Error('SKT 목록에 이름이 중복된 브랜드가 있습니다.');
    }

    return {
        totalCount: first.totalCount,
        pageSize: first.pageSize,
        pageCount: expectedPageCount,
        brands,
    };
}
