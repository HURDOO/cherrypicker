import type { Brand } from '@/types';

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
    kfc: 'kfckorea.com',
    lotteria: 'lotteeatz.com',
    mcdonalds: 'mcdonalds.co.kr',
    burgerking: 'burgerking.co.kr',
    momstouch: 'momstouch.co.kr',
    subway: 'subway.co.kr',
    outback: 'outback.co.kr',
    vips: 'ivips.co.kr',
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
    youtube: 'youtube.com',
    netflix: 'netflix.com',
    tving: 'tving.com',
    disney: 'disneyplus.com',
    naver_plus: 'naver.com',
    coupang_wow: 'coupang.com',
    naver_webtoon: 'comic.naver.com',
};

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

export function getBrandLogoUrl(brand: Pick<Brand, 'id'>): string | null {
    const domain = BRAND_LOGO_DOMAINS[brand.id];

    if (!domain) return null;

    const params = new URLSearchParams({
        domain,
        sz: '128',
    });

    return `https://www.google.com/s2/favicons?${params.toString()}`;
}
