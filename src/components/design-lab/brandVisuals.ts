import type { Brand } from '@/types';
import { COLLECTED_BRAND_LOGO_URLS } from './collectedBrandLogos';

export interface BrandTone {
    soft: string;
    strong: string;
    border: string;
}

const BRAND_TONES: BrandTone[] = [
    { soft: 'bg-rose-50 text-rose-700', strong: 'bg-rose-500 text-white', border: 'border-rose-100' },
    { soft: 'bg-amber-50 text-amber-700', strong: 'bg-amber-500 text-white', border: 'border-amber-100' },
    { soft: 'bg-emerald-50 text-emerald-700', strong: 'bg-emerald-500 text-white', border: 'border-emerald-100' },
    { soft: 'bg-cyan-50 text-cyan-700', strong: 'bg-cyan-500 text-white', border: 'border-cyan-100' },
    { soft: 'bg-blue-50 text-blue-700', strong: 'bg-blue-500 text-white', border: 'border-blue-100' },
    { soft: 'bg-indigo-50 text-indigo-700', strong: 'bg-indigo-500 text-white', border: 'border-indigo-100' },
    { soft: 'bg-violet-50 text-violet-700', strong: 'bg-violet-500 text-white', border: 'border-violet-100' },
    { soft: 'bg-fuchsia-50 text-fuchsia-700', strong: 'bg-fuchsia-500 text-white', border: 'border-fuchsia-100' },
];

const BRAND_LOGO_DOMAINS: Record<string, string> = {
    starbucks: 'starbucks.co.kr',
    twosome: 'twosome.co.kr',
    mega: 'mega-mgccoffee.com',
    compose: 'composecoffee.com',
    paiks: 'paikdabang.com',
    ediya: 'ediya.com',
    coffeebean: 'coffeebeankorea.com',
    paulbassett: 'paulbassett.co.kr',
    angelinus: 'lotteeatz.com',
    mammoth: 'mmthcoffee.com',
    baskin_robbins: 'baskinrobbins.co.kr',
    krispy_kreme: 'krispykreme.co.kr',
    paris_baguette: 'paris.co.kr',
    tous_les_jours: 'tlj.co.kr',
    dunkin: 'dunkindonuts.co.kr',
    gongcha: 'gong-cha.co.kr',
    usa_starbucks: 'starbucks.com',
    kfc: 'kfckorea.com',
    lotteria: 'lotteeatz.com',
    mcdonalds: 'mcdonalds.co.kr',
    burgerking: 'burgerking.co.kr',
    momstouch: 'momstouch.co.kr',
    subway: 'subway.co.kr',
    outback: 'outback.co.kr',
    vips: 'ivips.co.kr',
    domino: 'dominos.co.kr',
    pizzahut: 'pizzahut.co.kr',
    papa_johns: 'pji.co.kr',
    baemin: 'baemin.com',
    yogiyo: 'yogiyo.co.kr',
    ddaenggyo: 'ddangyo.com',
    coupangeats: 'coupangeats.com',
    gs25: 'gs25.gsretail.com',
    cu: 'cu.bgfretail.com',
    cu_event: 'cu.bgfretail.com',
    emart24: 'emart24.co.kr',
    seveneleven: '7-eleven.co.kr',
    emart: 'emart.com',
    homeplus: 'homeplus.co.kr',
    lotte_mart: 'lottemart.com',
    hanaro_mart: 'nhhanaro.co.kr',
    emart_traders: 'traders.co.kr',
    vic_market: 'lottemart.com',
    oliveyoung: 'oliveyoung.co.kr',
    daiso: 'daiso.co.kr',
    coupang: 'coupang.com',
    naver_plus_store: 'shopping.naver.com',
    musinsa: 'musinsa.com',
    zigzag: 'zigzag.kr',
    ably: 'a-bly.com',
    kream: 'kream.co.kr',
    '29cm': '29cm.co.kr',
    gmarket: 'gmarket.co.kr',
    auction: 'auction.co.kr',
    elevenst: '11st.co.kr',
    gs_shop: 'gsshop.com',
    cj_onstyle: 'cjonstyle.com',
    google_play: 'play.google.com',
    app_store: 'apple.com',
    interpark_ticket: 'tickets.interpark.com',
    kyobo: 'kyobobook.co.kr',
    yes24: 'yes24.com',
    aladin: 'aladin.co.kr',
    toeic: 'toeic.co.kr',
    opic: 'opic.or.kr',
    teps: 'teps.or.kr',
    jpt: 'jpt.co.kr',
    hsk: 'hsk.or.kr',
    kakaot: 'kakaomobility.com',
    cgv: 'cgv.co.kr',
    lotte_cinema: 'lottecinema.co.kr',
    lotte_world: 'lotteworld.com',
    everland: 'everland.com',
    seoul_land: 'seoulland.co.kr',
    caribbean: 'everland.com',
    megabox: 'megabox.co.kr',
    youtube: 'youtube.com',
    netflix: 'netflix.com',
    tving: 'tving.com',
    disney: 'disneyplus.com',
    naver_plus: 'naver.com',
    coupang_wow: 'coupang.com',
    naver_webtoon: 'comic.naver.com',
    lotte_department: 'lotteon.com',
    hyundai_department: 'ehyundai.com',
    shinsegae_department: 'shinsegae.com',
    galleria_department: 'galleria.co.kr',
    toysrus: 'lotteon.com',
    ak_mall: 'akmall.com',
    tmon: 'tmon.co.kr',
    lotte_home_shopping: 'lotteimall.com',
    intake: 'intakefoods.kr',
    s_oil: 's-oil.com',
    hd_hyundai_oilbank: 'oilbank.co.kr',
    vietnam_grab: 'grab.com',
};

const BRAND_LOGO_DOMAINS_BY_NAME: Record<string, string> = {
    '매머드커피': 'mmthcoffee.com',
    '프린트베이커리': 'printbakery.com',
    '롯데하이마트': 'himart.co.kr',
    '크리스피프레시': 'krispyfresh.co.kr',
    '오아시스마켓': 'oasis.co.kr',
    '컬리': 'kurly.com',
    'AK골프': 'akgolf.co.kr',
    'CJ더마켓': 'cjdthemarket.com',
    'DBR동아비즈니스리뷰': 'dbr.donga.com',
    'HBR하버드비즈니스리뷰': 'hbrkorea.com',
    'KT': 'kt.com',
    'KT로밍': 'kt.com',
    'LG전자': 'lge.co.kr',
    'SK에너지': 'skenergy.com',
    'SK텔레콤': 'sktelecom.com',
    'W컨셉': 'wconcept.co.kr',
    '골프존마켓': 'golfzonmarket.com',
    '교보문고': 'kyobobook.co.kr',
    '네파': 'nepa.co.kr',
    '노티드': 'knotted.co.kr',
    '다이슨': 'dyson.co.kr',
    '매드포갈릭': 'madforgarlic.com',
    '모바일티머니': 't-money.co.kr',
    '베베쿡': 'bebecook.com',
    '뽀로로파크': 'pororopark.com',
    '삼성전자': 'samsung.com',
    '아고다': 'agoda.com',
    '알라딘': 'aladin.co.kr',
    '에이스침대': 'acebed.com',
    '영풍문고': 'ypbooks.co.kr',
    '오늘의집': 'ohou.se',
    '이케아': 'ikea.com',
    '이삭토스트': 'isaac-toast.co.kr',
    '코레일': 'korail.com',
    '코스트코X현대카드': 'costco.co.kr',
    '템퍼': 'tempur.com',
    '파고다어학원': 'pagoda21.com',
    '파리크라상': 'paris.co.kr',
    '굽네치킨': 'goobne.co.kr',
    '미스터피자': 'mrpizza.co.kr',
    '반올림피자': 'banolimpizza.com',
    '유가네닭갈비': 'yugane.com',
    '제일제면소': 'cjfoodville.co.kr',
    '다비치안경': 'davich.com',
    '모던하우스': 'modernhousemall.com',
    '스피드메이트': 'speedmate.com',
    '어바웃펫': 'aboutpet.co.kr',
    '오토오아시스': 'auto-oasis.com',
    '이니스프리': 'innisfree.com',
    '대구이월드': 'eworld.kr',
    '롯데월드 아이스링크': 'lotteworld.com',
    '롯데월드 아쿠아리움': 'lotteworld.com',
    '롯데월드 어드벤처 부산': 'lotteworld.com',
    '씨라이프 부산 아쿠아리움': 'visitsealife.com',
    '씨라이프 코엑스 아쿠아리움': 'visitsealife.com',
    '아쿠아플라넷': 'aquaplanet.co.kr',
    '이랜드몰': 'elandmall.co.kr',
    '전자랜드': 'etlandmall.co.kr',
    'HDC아이파크몰': 'iparkmall.co.kr',
    'LF몰': 'lfmall.co.kr',
    '롯데백화점몰': 'lotteon.com',
    '삼성스토어': 'samsung.com',
    '아모레몰': 'amoremall.com',
    '오뚜기몰': 'ottogimall.co.kr',
    '원스토어': 'onestore.co.kr',
    '위버스샵': 'shop.weverse.io',
    '풀무원': 'pulmuone.co.kr',
    '현대홈쇼핑': 'hmall.com',
    '네이버 멤버십 x GS칼텍스': 'gscaltex.com',
    '오피스디포': 'officedepot.co.kr',
    '폴라리스오피스': 'polarisoffice.com',
    'SK렌터카': 'skrentacar.com',
    '롯데렌터카': 'lotterentacar.net',
    '롯데면세점': 'lottedfs.com',
    '신라면세점': 'shilladfs.com',
    '신세계면세점': 'ssgdfs.com',
    '카모아': 'carmore.kr',
    '클룩': 'klook.com',
    '트립닷컴': 'trip.com',
    '트립비토즈': 'tripbtoz.com',
    '티웨이항공': 'twayair.com',
};

const LOCAL_BRAND_LOGO_URLS: Record<string, string> = {
    gs25: '/brand-logos/gs25.svg',
    cu: '/brand-logos/cu.svg',
    cu_event: '/brand-logos/cu.svg',
    seveneleven: '/brand-logos/seveneleven.svg',
    daiso: '/brand-logos/daiso.png',
    twosome: '/brand-logos/twosome.png',
    starbucks: '/brand-logos/starbucks.png',
};

const REVIEWED_BRAND_LOGO_OVERRIDES: Record<string, string> = {
    cu: '/brand-logos/cu.svg',
    cu_event: '/brand-logos/cu.svg',
    gs25: '/brand-logos/gs25.svg',
    seveneleven: '/brand-logos/seveneleven.svg',
};

// These domains had a technically valid high-resolution asset, but the 56px
// four-column audit showed an umbrella brand, a generic illustration, or a mark
// that could not distinguish the named benefit target. A readable monogram is
// less misleading than those images.
const NON_RECOGNIZABLE_LOGO_DOMAINS = new Set([
    'aquaplanet.co.kr',
    'carmore.kr',
    'etlandmall.co.kr',
    'gscaltex.com',
    'jpt.co.kr',
    'lotteeatz.com',
    'lottemart.com',
    'lotteon.com',
    'tickets.interpark.com',
    'toeic.co.kr',
]);

const WIDE_BRAND_LOGO_IDS = new Set([
    'baemin',
    'emart24',
    'gs25',
    'homeplus',
    'yes24',
]);

const COVER_BRAND_LOGO_IDS = new Set([
    'app_store',
]);

function stableHash(value: string) {
    return Array.from(value).reduce((hash, character) => (
        ((hash << 5) - hash + character.codePointAt(0)!) | 0
    ), 0);
}

export function getBrandTone(brand: Pick<Brand, 'id'>): BrandTone {
    return BRAND_TONES[Math.abs(stableHash(brand.id)) % BRAND_TONES.length];
}

export function getToneForKey(key: string): BrandTone {
    return BRAND_TONES[Math.abs(stableHash(key)) % BRAND_TONES.length];
}

export function getBrandMonogram(name: string, compact = false): string {
    const cleaned = name
        .replace(/\([^)]*\)/g, '')
        .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
        .trim();

    if (!cleaned) return '?';

    const words = cleaned.split(/\s+/).filter(Boolean);
    const isEnglish = /^[0-9A-Za-z\s]+$/.test(cleaned);

    if (isEnglish) {
        if (words.length > 1) {
            return words.slice(0, compact ? 1 : 2).map(word => word[0]).join('').toUpperCase();
        }
        return cleaned.slice(0, compact ? 1 : 3).toUpperCase();
    }

    return cleaned.slice(0, compact ? 1 : 2);
}

export function getBrandLogoDomain(
    brand: Pick<Brand, 'id'> & Partial<Pick<Brand, 'name'>>
): string | undefined {
    return BRAND_LOGO_DOMAINS[brand.id] ||
        (brand.name ? BRAND_LOGO_DOMAINS_BY_NAME[brand.name] : undefined);
}

export function usesWideBrandLogo(brand: Pick<Brand, 'id'>): boolean {
    return WIDE_BRAND_LOGO_IDS.has(brand.id);
}

export function usesCoverBrandLogo(brand: Pick<Brand, 'id'>): boolean {
    return COVER_BRAND_LOGO_IDS.has(brand.id);
}

export function getBrandLogoUrl(
    brand: Pick<Brand, 'id'> & Partial<Pick<Brand, 'name'>>
): string | null {
    const reviewedLogoUrl = REVIEWED_BRAND_LOGO_OVERRIDES[brand.id];
    if (reviewedLogoUrl) return reviewedLogoUrl;

    const domain = getBrandLogoDomain(brand);
    if (domain && NON_RECOGNIZABLE_LOGO_DOMAINS.has(domain)) return null;

    const collectedLogoUrl = domain ? COLLECTED_BRAND_LOGO_URLS[domain] : undefined;
    if (collectedLogoUrl) return collectedLogoUrl;

    const localLogoUrl = LOCAL_BRAND_LOGO_URLS[brand.id];
    if (localLogoUrl) return localLogoUrl;

    return null;
}
