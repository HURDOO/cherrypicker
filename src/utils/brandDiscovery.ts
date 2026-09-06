import type { Brand, TransactionHistory } from '@/types';

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const BASIC_CHOSEONG: Record<string, string> = {
    ㄲ: 'ㄱ',
    ㄸ: 'ㄷ',
    ㅃ: 'ㅂ',
    ㅆ: 'ㅅ',
    ㅉ: 'ㅈ',
};

export const KOREAN_BRAND_INDEX_KEYS = [
    'ㄱ',
    'ㄴ',
    'ㄷ',
    'ㄹ',
    'ㅁ',
    'ㅂ',
    'ㅅ',
    'ㅇ',
    'ㅈ',
    'ㅊ',
    'ㅋ',
    'ㅌ',
    'ㅍ',
    'ㅎ',
] as const;

export const LATIN_BRAND_INDEX_KEYS = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
    '0-9',
] as const;

export const POPULAR_BRAND_IDS = [
    'cu',
    'gs25',
    'seveneleven',
    'emart24',
    'daiso',
    'oliveyoung',
    'baskin_robbins',
    'starbucks',
    'mcdonalds',
    'paris_baguette',
    'tous_les_jours',
    'cgv',
] as const;

export const DEFAULT_FAVORITE_BRAND_IDS = [
    'cu',
    'gs25',
    'daiso',
    'oliveyoung',
    'starbucks',
    'mcdonalds',
] as const;

const BRAND_SEARCH_ALIASES: Record<string, string[]> = {
    cu: ['씨유', '시유'],
    cu_event: ['씨유행사', '씨유행사상품'],
    gs25: ['지에스', '지에스25', 'gs'],
    seveneleven: ['세븐', '세븐일레븐', '711', '7eleven'],
    emart24: ['이마트이십사', '이마트편의점'],
    emart: ['이마트'],
    homeplus: ['홈플', '홈플러스'],
    lotte_mart: ['롯마트', '롯데마트'],
    hanaro_mart: ['하나로', '하나로마트', '농협마트'],
    emart_traders: ['트레이더스', '이마트트레이더스'],
    vic_market: ['빅마켓', '브이아이씨마켓'],
    baskin_robbins: ['배라', '베라', '베스킨', '베스킨라빈스', '배스킨'],
    oliveyoung: ['올영', '올리브영'],
    starbucks: ['스벅', '스타벅스'],
    twosome: ['투썸', '투썸플레이스'],
    mega: ['메가커피', '메가엠지씨커피'],
    compose: ['컴포즈', '컴포즈커피'],
    paiks: ['백다방', '빽다방'],
    ediya: ['이디야', '이디야커피'],
    coffeebean: ['커피빈'],
    paulbassett: ['폴바셋'],
    angelinus: ['엔젤리너스', '엔제리너스'],
    mammoth: ['매머드', '메머드', '매머드커피'],
    krispy_kreme: ['크리스피', '크리스피크림', '크리스피크림도넛'],
    dunkin: ['던킨', '던킨도넛', '던킨도너츠'],
    gongcha: ['공차'],
    kfc: ['케이에프씨'],
    lotteria: ['롯리', '롯데리아'],
    mcdonalds: ['맥날', '맥도날드'],
    burgerking: ['버킹', '버거킹'],
    momstouch: ['맘터', '맘스터치'],
    subway: ['서브웨이', '써브웨이'],
    outback: ['아웃백'],
    vips: ['빕스'],
    domino: ['도미노', '도미노피자'],
    pizzahut: ['피자헛'],
    papa_johns: ['파파존스', '파파존스피자'],
    paris_baguette: ['파바', '빠바', '파리바게트', '파리바게뜨'],
    tous_les_jours: ['뚜쥬', '뚜레주르', '뚜레쥬르'],
    baemin: ['배민', '배달의민족'],
    yogiyo: ['요기요'],
    ddaenggyo: ['땡겨요'],
    coupangeats: ['쿠팡이츠', '쿠팡잇츠'],
    daiso: ['다이소'],
    medical: ['병원', '약국', '병원약국'],
    laundry: ['세탁소', '세탁'],
    beauty_hair: ['미용실', '헤어샵', '뷰티샵'],
    sports_leisure: ['스포츠', '레저', '헬스장', '골프장'],
    coupang: ['쿠팡'],
    naver_plus_store: ['네이버쇼핑', '네이버스토어', '네이버플러스스토어'],
    musinsa: ['무신사'],
    zigzag: ['지그재그'],
    ably: ['에이블리'],
    kream: ['크림', 'kream'],
    '29cm': ['이십구센티', '이십구씨엠', '29센티'],
    gmarket: ['지마켓', 'g마켓'],
    auction: ['옥션'],
    elevenst: ['십일번가', '11번가'],
    ak_mall: ['에이케이몰', 'ak몰'],
    tmon: ['티몬', '티켓몬스터'],
    lotte_home_shopping: ['롯데홈쇼핑'],
    intake: ['인테이크', '인테이크몰'],
    gs_shop: ['지에스샵', 'gs샵'],
    cj_onstyle: ['씨제이온스타일', 'cj온스타일'],
    google_play: ['구글플레이', '플레이스토어'],
    app_store: ['앱스토어', '애플앱스토어'],
    interpark_ticket: ['인터파크', '인터파크티켓'],
    kyobo: ['교보', '교보문고'],
    yes24: ['예스24', '예스이십사'],
    aladin: ['알라딘'],
    toeic: ['토익'],
    opic: ['오픽'],
    teps: ['텝스'],
    jpt: ['제이피티'],
    hsk: ['에이치에스케이'],
    transport_public: ['대중교통', '버스', '지하철'],
    rail: ['기차', '철도', '케이티엑스', '에스알티', 'KTX', 'SRT'],
    intercity_bus: ['고속버스', '시외버스'],
    kakaot: ['카택', '카카오택시', '카카오t'],
    taxi: ['택시'],
    gas_station: ['주유', '기름', '주유소'],
    telecom: ['통신비', '통신요금', '휴대폰요금'],
    electric_utility: ['전기요금', '전기세'],
    city_gas: ['도시가스', '가스요금'],
    overseas_transport: ['해외교통', '해외대중교통'],
    vietnam_grab: ['베트남그랩', '베트남grab'],
    cgv: ['씨지브이'],
    caribbean: ['캐베', '캐리비안베이'],
    lotte_cinema: ['롯시', '롯데시네마'],
    lotte_world: ['롯월', '롯데월드'],
    everland: ['에버랜드'],
    seoul_land: ['서울랜드'],
    youtube: ['유튭', '유튜브', '유튜브프리미엄'],
    netflix: ['넷플', '넷플릭스'],
    tving: ['티빙'],
    disney: ['디플', '디즈니플러스'],
    naver_plus: ['네플', '네이버플러스', '네이버멤버십'],
    coupang_wow: ['쿠팡와우', '와우멤버십'],
    naver_webtoon: ['네웹', '네이버웹툰'],
    military_px: ['피엑스', 'px', '군마트'],
    military_fitness: ['군체력단련장', '체력단련장'],
    military_resort: ['군콘도', '군휴양시설'],
    airport_lounge: ['공항라운지', '라운지'],
    overseas_payment: ['해외결제', '해외가맹점'],
    overseas_atm: ['해외atm', '해외현금인출'],
    master_travel_rewards: ['마스터트래블리워드', 'mastercardtravelrewards'],
    japan_convenience: ['일본편의점', '일본3대편의점'],
    vietnam_lottemart: ['베트남롯데마트'],
    usa_starbucks: ['미국스타벅스'],
};

export type BrandBrowseGroupId =
    | 'convenience'
    | 'cafe'
    | 'food'
    | 'shopping'
    | 'life'
    | 'transport'
    | 'leisure'
    | 'digital'
    | 'study'
    | 'etc';

export interface BrandBrowseGroup {
    id: BrandBrowseGroupId;
    label: string;
    shortLabel: string;
    hint: string;
    iconName: string;
}

export const BRAND_BROWSE_GROUPS: BrandBrowseGroup[] = [
    { id: 'convenience', label: '편의점·마트', shortLabel: '편의·마트', hint: '편의점과 대형마트', iconName: 'ShoppingBasket' },
    { id: 'cafe', label: '카페·디저트', shortLabel: '카페', hint: '커피, 빵, 아이스크림', iconName: 'Coffee' },
    { id: 'food', label: '외식·배달', shortLabel: '외식·배달', hint: '식당, 패스트푸드, 배달앱', iconName: 'Utensils' },
    { id: 'shopping', label: '쇼핑·패션', shortLabel: '쇼핑', hint: '온라인몰과 패션 플랫폼', iconName: 'ShoppingBag' },
    { id: 'life', label: '뷰티·생활', shortLabel: '생활·뷰티', hint: '생활용품, 미용, 스포츠', iconName: 'Sparkles' },
    { id: 'transport', label: '교통·주유', shortLabel: '교통·주유', hint: '대중교통, 택시, 주유', iconName: 'Bus' },
    { id: 'leisure', label: '영화·여가', shortLabel: '영화·여가', hint: '영화관, 테마파크, 티켓', iconName: 'Clapperboard' },
    { id: 'digital', label: '구독·디지털', shortLabel: '구독·디지털', hint: 'OTT, 멤버십, 앱마켓', iconName: 'Tv' },
    { id: 'study', label: '도서·교육', shortLabel: '도서·교육', hint: '서점과 어학시험', iconName: 'BookOpen' },
    { id: 'etc', label: '기타·특수', shortLabel: '기타', hint: '군 복지, 공항, 해외결제', iconName: 'MoreHorizontal' },
];

const DIGITAL_SHOPPING_BRAND_IDS = new Set(['google_play', 'app_store']);
const DIGITAL_TRANSPORT_BRAND_IDS = new Set(['telecom']);
const LEISURE_SHOPPING_BRAND_IDS = new Set(['interpark_ticket']);
const STUDY_SHOPPING_BRAND_IDS = new Set([
    'kyobo',
    'yes24',
    'aladin',
    'toeic',
    'opic',
    'teps',
    'jpt',
    'hsk',
]);

export interface BrandDiscoveryMeta {
    score: number;
    usageCount: number;
    lastUsedAt?: string;
    usedWithin7Days: boolean;
    usedWithin30Days: boolean;
    isFavorite: boolean;
    isPopular: boolean;
    popularityRank: number;
}

export interface RankedBrand {
    brand: Brand;
    meta: BrandDiscoveryMeta;
}

export interface CoarseLocation {
    latitude: number;
    longitude: number;
}

export interface BrandLocationVisit extends CoarseLocation {
    brandId: string;
    usedAt: string;
}

export type BrandDiscoveryViewMode = 'default' | 'name' | 'category';

export interface BrandDiscoveryPreferences {
    favoriteBrandIds: string[];
    locationVisits: BrandLocationVisit[];
    defaultViewMode: BrandDiscoveryViewMode;
}

export const EMPTY_BRAND_DISCOVERY_PREFERENCES: BrandDiscoveryPreferences = {
    favoriteBrandIds: [...DEFAULT_FAVORITE_BRAND_IDS],
    locationVisits: [],
    defaultViewMode: 'default',
};

export function normalizeBrandSearch(value: string): string {
    return value.toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
}

export function getKoreanInitials(value: string): string {
    return Array.from(value).map(character => {
        const code = character.charCodeAt(0);
        if (code < 0xac00 || code > 0xd7a3) return character;
        return CHOSEONG[Math.floor((code - 0xac00) / 588)];
    }).join('');
}

export function getBrandSearchAliases(brand: Pick<Brand, 'id' | 'name'>): string[] {
    const brandId = normalizeBrandSearch(brand.id);
    const brandName = normalizeBrandSearch(brand.name);

    return [...new Set(Object.entries(BRAND_SEARCH_ALIASES)
        .filter(([key]) => {
            const normalizedKey = normalizeBrandSearch(key);
            return brandId === normalizedKey || brandId.endsWith(normalizedKey) ||
                brandName.includes(normalizedKey);
        })
        .flatMap(([, aliases]) => aliases))];
}

function getBrandIndexKey(character: string): string | undefined {
    if (/^[a-z]$/.test(character)) return character.toUpperCase();
    if (/^[0-9]$/.test(character)) return '0-9';

    const initial = getKoreanInitials(character);
    const basicInitial = BASIC_CHOSEONG[initial] ?? initial;
    return KOREAN_BRAND_INDEX_KEYS.includes(
        basicInitial as (typeof KOREAN_BRAND_INDEX_KEYS)[number]
    ) ? basicInitial : undefined;
}

export function getBrandIndexKeys(brand: Pick<Brand, 'id' | 'name'>): string[] {
    const terms = [brand.name, brand.id, ...getBrandSearchAliases(brand)];
    const keys = terms
        .map(term => getBrandIndexKey(Array.from(normalizeBrandSearch(term))[0] ?? ''))
        .filter((key): key is string => Boolean(key));

    return [...new Set(keys)];
}

export function getBrandBrowseGroupId(
    brand: Pick<Brand, 'id' | 'categoryId'>
): BrandBrowseGroupId {
    if (DIGITAL_SHOPPING_BRAND_IDS.has(brand.id)) return 'digital';
    if (DIGITAL_TRANSPORT_BRAND_IDS.has(brand.id)) return 'digital';
    if (LEISURE_SHOPPING_BRAND_IDS.has(brand.id)) return 'leisure';
    if (STUDY_SHOPPING_BRAND_IDS.has(brand.id)) return 'study';

    if (brand.categoryId === 'delivery' || brand.categoryId === 'food') return 'food';
    if (brand.categoryId === 'movie') return 'leisure';
    if (brand.categoryId === 'subscription') return 'digital';
    if (brand.categoryId === 'convenience') return 'convenience';
    if (brand.categoryId === 'cafe') return 'cafe';
    if (brand.categoryId === 'shopping') return 'shopping';
    if (brand.categoryId === 'life') return 'life';
    if (brand.categoryId === 'transport') return 'transport';
    return 'etc';
}

function getSearchMatchScore(brand: Brand, query: string): number {
    const normalizedQuery = normalizeBrandSearch(query);
    if (!normalizedQuery) return 0;

    const normalizedName = normalizeBrandSearch(brand.name);
    const normalizedId = normalizeBrandSearch(brand.id);
    const aliases = getBrandSearchAliases(brand).map(normalizeBrandSearch);
    const initials = normalizeBrandSearch(getKoreanInitials(brand.name));

    if (normalizedName === normalizedQuery || normalizedId === normalizedQuery) return 1_000;
    if (aliases.includes(normalizedQuery)) return 900;
    if (normalizedName.startsWith(normalizedQuery) || normalizedId.startsWith(normalizedQuery)) {
        return 800;
    }
    if (aliases.some(alias => alias.startsWith(normalizedQuery))) return 700;
    if (initials.startsWith(normalizedQuery)) return 650;
    if (normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery)) return 500;
    if (aliases.some(alias => alias.includes(normalizedQuery))) return 450;
    return 0;
}

export function rankBrands(
    brands: Brand[],
    history: TransactionHistory[],
    favoriteBrandIds: string[],
    now = new Date()
): RankedBrand[] {
    const favoriteIds = new Set(favoriteBrandIds);
    const popularityRanks = new Map<string, number>(
        POPULAR_BRAND_IDS.map((id, index) => [id, index])
    );
    const usage = new Map<string, { count: number; lastUsedAt?: string }>();

    history.forEach(transaction => {
        if (!transaction.brandId) return;
        const current = usage.get(transaction.brandId) || { count: 0 };
        const lastUsedAt = !current.lastUsedAt || transaction.date > current.lastUsedAt
            ? transaction.date
            : current.lastUsedAt;
        usage.set(transaction.brandId, { count: current.count + 1, lastUsedAt });
    });

    return brands.map(brand => {
        const brandUsage = usage.get(brand.id) || { count: 0 };
        const elapsedDays = brandUsage.lastUsedAt
            ? Math.max(0, now.getTime() - new Date(brandUsage.lastUsedAt).getTime()) / 86_400_000
            : Number.POSITIVE_INFINITY;
        const usedWithin7Days = elapsedDays <= 7;
        const usedWithin30Days = elapsedDays <= 30;
        const isFavorite = favoriteIds.has(brand.id);
        const popularityRank = popularityRanks.get(brand.id) ?? Number.POSITIVE_INFINITY;
        const isPopular = Number.isFinite(popularityRank);
        const score = (isFavorite ? 100 : 0) +
            (usedWithin7Days ? 50 : usedWithin30Days ? 20 : 0) +
            (brandUsage.count * 5) +
            (isPopular ? 10 : 0);

        return {
            brand,
            meta: {
                score,
                usageCount: brandUsage.count,
                lastUsedAt: brandUsage.lastUsedAt,
                usedWithin7Days,
                usedWithin30Days,
                isFavorite,
                isPopular,
                popularityRank,
            },
        };
    }).sort((left, right) =>
        right.meta.score - left.meta.score ||
        left.meta.popularityRank - right.meta.popularityRank ||
        (left.brand.order ?? Number.MAX_SAFE_INTEGER) -
            (right.brand.order ?? Number.MAX_SAFE_INTEGER) ||
        left.brand.name.localeCompare(right.brand.name, 'ko-KR')
    );
}

export function searchAndRankBrands(
    rankedBrands: RankedBrand[],
    query: string
): RankedBrand[] {
    const normalizedQuery = normalizeBrandSearch(query);
    if (!normalizedQuery) return [];

    return rankedBrands
        .map(item => ({ item, matchScore: getSearchMatchScore(item.brand, normalizedQuery) }))
        .filter(result => result.matchScore > 0)
        .sort((left, right) =>
            right.matchScore - left.matchScore ||
            right.item.meta.score - left.item.meta.score ||
            left.item.brand.name.localeCompare(right.item.brand.name, 'ko-KR')
        )
        .map(result => result.item);
}

export function toCoarseLocation(latitude: number, longitude: number): CoarseLocation {
    return {
        latitude: Math.round(latitude * 100) / 100,
        longitude: Math.round(longitude * 100) / 100,
    };
}

function getDistanceInKm(left: CoarseLocation, right: CoarseLocation): number {
    const earthRadiusKm = 6_371;
    const toRadians = (value: number) => value * Math.PI / 180;
    const latitudeDelta = toRadians(right.latitude - left.latitude);
    const longitudeDelta = toRadians(right.longitude - left.longitude);
    const leftLatitude = toRadians(left.latitude);
    const rightLatitude = toRadians(right.latitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(leftLatitude) * Math.cos(rightLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getNearbyBrandIds(
    visits: BrandLocationVisit[],
    currentLocation?: CoarseLocation,
    radiusKm = 2
): string[] {
    if (!currentLocation) return [];

    return [...visits]
        .filter(visit => getDistanceInKm(visit, currentLocation) <= radiusKm)
        .sort((left, right) => right.usedAt.localeCompare(left.usedAt))
        .reduce<string[]>((brandIds, visit) => {
            if (!brandIds.includes(visit.brandId)) brandIds.push(visit.brandId);
            return brandIds;
        }, []);
}

export function parseBrandDiscoveryPreferences(value: string | null): BrandDiscoveryPreferences {
    if (!value) return EMPTY_BRAND_DISCOVERY_PREFERENCES;

    try {
        const parsed = JSON.parse(value) as Partial<BrandDiscoveryPreferences>;
        const favoriteBrandIds = Array.isArray(parsed.favoriteBrandIds)
            ? parsed.favoriteBrandIds.filter(item => typeof item === 'string')
            : [...DEFAULT_FAVORITE_BRAND_IDS];
        const locationVisits = Array.isArray(parsed.locationVisits)
            ? parsed.locationVisits.filter((item): item is BrandLocationVisit => (
                typeof item === 'object' && item !== null &&
                typeof item.brandId === 'string' &&
                typeof item.latitude === 'number' && Number.isFinite(item.latitude) &&
                typeof item.longitude === 'number' && Number.isFinite(item.longitude) &&
                typeof item.usedAt === 'string'
            ))
            : [];
        const defaultViewMode = parsed.defaultViewMode === 'name' ||
            parsed.defaultViewMode === 'category'
            ? parsed.defaultViewMode
            : 'default';
        return { favoriteBrandIds, locationVisits, defaultViewMode };
    } catch {
        return EMPTY_BRAND_DISCOVERY_PREFERENCES;
    }
}
