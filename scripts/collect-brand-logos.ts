import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getBrandLogoDomain } from '../src/components/design-lab/brandVisuals';

interface BrandRow {
    id: string;
    name: string;
}

interface IconCandidate {
    url: string;
    hintScore: number;
    kind?: 'brand-mark' | 'icon';
}

interface ImageInfo {
    width: number;
    height: number;
    extension: 'gif' | 'ico' | 'jpg' | 'png' | 'svg' | 'webp';
}

interface CollectedLogo {
    domain: string;
    path: string;
    sourceUrl: string;
    width: number;
    height: number;
}

const ROOT = process.cwd();
const OUTPUT_DIRECTORY = path.join(ROOT, 'public', 'brand-logos', 'collected');
const GENERATED_MODULE = path.join(
    ROOT,
    'src',
    'components',
    'design-lab',
    'collectedBrandLogos.ts'
);
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(ROOT, 'data', 'cherrypicker.db');
const MAX_RESPONSE_BYTES = 1_500_000;
const MIN_ICON_EDGE = 96;
const MAX_ASPECT_RATIO = 1.35;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 7_000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const REVIEWED_BRAND_ASSETS: Record<string, string[]> = {
    'apple.com': [
        'https://developer.apple.com/news/images/og/app-store-og.png',
    ],
    'baemin.com': [
        'https://www.baemin.com/_next/static/media/baemin_logo.684531d5.png',
    ],
    'emart24.co.kr': [
        'https://emart24.co.kr/assets/assets/imgs/logo.png',
    ],
    'homeplus.co.kr': [
        'https://mfront.homeplus.co.kr/static/images/logos/default_logo.svg',
    ],
    'isaac-toast.co.kr': [
        'https://www.isaac-toast.co.kr/img/foot_logo.svg',
    ],
    'paulbassett.co.kr': [
        'https://www.baristapaulbassett.co.kr/images/common/favicon_196.png',
    ],
    'samsung.com': [
        'https://images.samsung.com/kdp/app/samsungApp.svg',
    ],
    'yes24.com': [
        'https://image.yes24.com/sysimage/renew/gnb/logoN4.svg',
    ],
};

// Verified against each brand's current Korean App Store listing. These IDs keep
// core brands collectable when their marketing site blocks automated requests.
const REVIEWED_APP_IDS: Record<string, string[]> = {
    'baskinrobbins.co.kr': ['6742874436'],
    'burgerking.co.kr': ['1017567032'],
    'coupang.com': ['454434967'],
    'davich.com': ['6760438047'],
    'dominos.co.kr': ['371008429'],
    'ehyundai.com': ['1031843830'],
    'emart.com': ['397728319'],
    'kakaomobility.com': ['981110422'],
    'kfckorea.com': ['1255799839'],
    'korail.com': ['1000558562'],
    'kream.co.kr': ['1490580239'],
    'lottecinema.co.kr': ['601280722'],
    'lotteworld.com': ['6744043800'],
    'mcdonalds.co.kr': ['1217507712'],
    'mega-mgccoffee.com': ['1473428031'],
    'nhhanaro.co.kr': ['6458731236'],
    'paulbassett.co.kr': ['1017265117'],
    'subway.co.kr': ['1516736468'],
    't-money.co.kr': ['1470361790'],
    'twayair.com': ['564901451'],
    'twosome.co.kr': ['1225957208'],
    'ypbooks.co.kr': ['6447231557'],
};

function decodeHtml(value: string): string {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
}

function readTagAttributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(tag))) {
        attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
    }

    return attributes;
}

function declaredSizeScore(value = ''): number {
    if (value.toLowerCase() === 'any') return 400;
    const sizes = [...value.matchAll(/(\d+)x(\d+)/gi)].map(match => (
        Math.min(Number(match[1]), Number(match[2]))
    ));
    return sizes.length > 0 ? Math.min(Math.max(...sizes), 512) : 0;
}

function resolveCandidateUrl(href: string, baseUrl: string): string | undefined {
    if (!href || href.startsWith('data:')) return undefined;
    try {
        const url = new URL(href, baseUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

function extractHtmlCandidates(html: string, baseUrl: string): {
    icons: IconCandidate[];
    manifests: string[];
    appleAppIds: string[];
    googlePlayIds: string[];
} {
    const icons: IconCandidate[] = [];
    const manifests: string[] = [];
    const appleAppIds: string[] = [];
    const googlePlayIds: string[] = [];

    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const attributes = readTagAttributes(tag);
        const rel = (attributes.rel || '').toLowerCase();
        const url = resolveCandidateUrl(attributes.href || '', baseUrl);
        if (!url) continue;

        if (rel.split(/\s+/).includes('manifest')) {
            manifests.push(url);
            continue;
        }

        if (!rel.includes('icon')) continue;
        const relationScore = rel.includes('apple-touch-icon') ? 650 :
            rel.includes('mask-icon') ? 150 : 350;
        icons.push({
            url,
            hintScore: relationScore + declaredSizeScore(attributes.sizes),
        });
    }

    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const attributes = readTagAttributes(tag);
        const key = (attributes.name || attributes.property || attributes.itemprop || '')
            .toLowerCase();
        const content = attributes.content || '';

        if (['msapplication-tileimage', 'og:logo', 'logo'].includes(key)) {
            const url = resolveCandidateUrl(content, baseUrl);
            if (url) icons.push({ url, hintScore: 850 });
        }
        if (key === 'apple-itunes-app') {
            const appId = content.match(/app-id\s*=\s*(\d+)/i)?.[1];
            if (appId) appleAppIds.push(appId);
        }
        if (key === 'google-play-app') {
            const appId = content.match(/app-id\s*=\s*([^,\s]+)/i)?.[1];
            if (appId) googlePlayIds.push(appId);
        }
    }

    const normalizedHtml = decodeHtml(html.replaceAll('\\/', '/'));
    for (const match of normalizedHtml.matchAll(
        /https?:\/\/(?:apps|itunes)\.apple\.com\/[^"'<>\s]*?\/id(\d+)/gi
    )) {
        appleAppIds.push(match[1]);
    }
    for (const match of normalizedHtml.matchAll(
        /https?:\/\/play\.google\.com\/store\/apps\/details\?[^"'<>\s]*?\bid=([\w.]+)/gi
    )) {
        googlePlayIds.push(match[1]);
    }

    return {
        icons,
        manifests,
        appleAppIds: [...new Set(appleAppIds)],
        googlePlayIds: [...new Set(googlePlayIds)],
    };
}

async function fetchWithLimit(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'accept': 'text/html,application/manifest+json,application/json,image/*;q=0.9,*/*;q=0.5',
                'user-agent': USER_AGENT,
            },
        });
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (!response.ok || contentLength > MAX_RESPONSE_BYTES) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchText(url: string): Promise<{ text: string; finalUrl: string }> {
    const response = await fetchWithLimit(url);
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('response too large');
    return { text, finalUrl: response.url };
}

async function extractManifestCandidates(manifestUrl: string): Promise<IconCandidate[]> {
    try {
        const { text, finalUrl } = await fetchText(manifestUrl);
        const manifest = JSON.parse(text) as {
            icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
        };
        return (manifest.icons || []).flatMap(icon => {
            const url = resolveCandidateUrl(icon.src || '', finalUrl);
            if (!url) return [];
            const purposeScore = icon.purpose?.includes('maskable') ? 120 : 0;
            return [{
                url,
                hintScore: 700 + purposeScore + declaredSizeScore(icon.sizes),
            }];
        });
    } catch {
        return [];
    }
}

async function extractAppleAppCandidates(appId: string): Promise<IconCandidate[]> {
    try {
        const lookupUrl = new URL('https://itunes.apple.com/lookup');
        lookupUrl.searchParams.set('id', appId);
        lookupUrl.searchParams.set('country', 'kr');
        const { text } = await fetchText(lookupUrl.toString());
        const response = JSON.parse(text) as {
            results?: Array<Record<string, unknown>>;
        };
        return (response.results || []).flatMap(result => [
            result.artworkUrl512,
            result.artworkUrl100,
        ].flatMap(value => (
            typeof value === 'string' ? [{ url: value, hintScore: 1_300 }] : []
        )));
    } catch {
        return [];
    }
}

async function extractGooglePlayCandidates(appId: string): Promise<IconCandidate[]> {
    try {
        const playUrl = new URL('https://play.google.com/store/apps/details');
        playUrl.searchParams.set('id', appId);
        playUrl.searchParams.set('hl', 'ko');
        playUrl.searchParams.set('gl', 'KR');
        const { text, finalUrl } = await fetchText(playUrl.toString());
        for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
            const attributes = readTagAttributes(tag);
            if ((attributes.property || '').toLowerCase() !== 'og:image') continue;
            const url = resolveCandidateUrl(attributes.content || '', finalUrl);
            if (url) return [{ url, hintScore: 1_200 }];
        }
    } catch {
        // The linked store icon is optional.
    }
    return [];
}

function getPngInfo(buffer: Buffer): ImageInfo | undefined {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return undefined;
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        extension: 'png',
    };
}

function getGifInfo(buffer: Buffer): ImageInfo | undefined {
    if (buffer.length < 10 || !['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
        return undefined;
    }
    return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
        extension: 'gif',
    };
}

function getIcoInfo(buffer: Buffer): ImageInfo | undefined {
    if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
        return undefined;
    }
    const count = Math.min(buffer.readUInt16LE(4), 128);
    let width = 0;
    let height = 0;
    for (let index = 0; index < count; index += 1) {
        const offset = 6 + index * 16;
        if (offset + 16 > buffer.length) break;
        width = Math.max(width, buffer[offset] || 256);
        height = Math.max(height, buffer[offset + 1] || 256);
    }
    return width && height ? { width, height, extension: 'ico' } : undefined;
}

function getJpegInfo(buffer: Buffer): ImageInfo | undefined {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
    let offset = 2;
    while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
            .includes(marker)) {
            return {
                width: buffer.readUInt16BE(offset + 7),
                height: buffer.readUInt16BE(offset + 5),
                extension: 'jpg',
            };
        }
        if (length < 2) break;
        offset += 2 + length;
    }
    return undefined;
}

function getWebpInfo(buffer: Buffer): ImageInfo | undefined {
    if (
        buffer.length < 30 ||
        buffer.toString('ascii', 0, 4) !== 'RIFF' ||
        buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) return undefined;

    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
        return {
            width: 1 + buffer.readUIntLE(24, 3),
            height: 1 + buffer.readUIntLE(27, 3),
            extension: 'webp',
        };
    }
    if (kind === 'VP8L' && buffer.length >= 25) {
        const bits = buffer.readUInt32LE(21);
        return {
            width: 1 + (bits & 0x3fff),
            height: 1 + ((bits >> 14) & 0x3fff),
            extension: 'webp',
        };
    }
    return undefined;
}

function getSvgInfo(buffer: Buffer): ImageInfo | undefined {
    const source = buffer.toString('utf8').trim();
    if (!/^<\?xml\b|^<svg\b/i.test(source) || !/<svg\b/i.test(source)) return undefined;
    if (/<(?:script|foreignObject|iframe|object|embed)\b/i.test(source)) return undefined;
    if (/\son[a-z]+\s*=/i.test(source)) return undefined;
    if (/<(?:image|use)\b[^>]+(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(source)) {
        return undefined;
    }

    const svgTag = source.match(/<svg\b[^>]*>/i)?.[0];
    if (!svgTag) return undefined;
    const attributes = readTagAttributes(svgTag);
    const viewBox = (attributes.viewbox || '').trim().split(/[\s,]+/).map(Number);
    const rawWidth = Number.parseFloat(attributes.width || '');
    const rawHeight = Number.parseFloat(attributes.height || '');
    const sourceWidth = rawWidth || (viewBox.length === 4 ? viewBox[2] : 0);
    const sourceHeight = rawHeight || (viewBox.length === 4 ? viewBox[3] : 0);
    if (!sourceWidth || !sourceHeight) return undefined;
    const ratio = sourceWidth / sourceHeight;
    return {
        width: Math.round(ratio >= 1 ? 512 : 512 * ratio),
        height: Math.round(ratio >= 1 ? 512 / ratio : 512),
        extension: 'svg',
    };
}

function getImageInfo(buffer: Buffer): ImageInfo | undefined {
    return getPngInfo(buffer) ||
        getGifInfo(buffer) ||
        getIcoInfo(buffer) ||
        getJpegInfo(buffer) ||
        getWebpInfo(buffer) ||
        getSvgInfo(buffer);
}

async function downloadCandidate(candidate: IconCandidate): Promise<{
    buffer: Buffer;
    info: ImageInfo;
    finalUrl: string;
    score: number;
} | undefined> {
    try {
        const response = await fetchWithLimit(candidate.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_RESPONSE_BYTES) return undefined;
        const info = getImageInfo(buffer);
        if (!info) return undefined;
        const shortestEdge = Math.min(info.width, info.height);
        const aspectRatio = Math.max(info.width, info.height) / shortestEdge;
        const isReviewedBrandMark = candidate.kind === 'brand-mark';
        if (isReviewedBrandMark) {
            if (shortestEdge < 40 || Math.max(info.width, info.height) < 192 || aspectRatio > 6) {
                return undefined;
            }
        } else if (shortestEdge < MIN_ICON_EDGE || aspectRatio > MAX_ASPECT_RATIO) {
            return undefined;
        }
        return {
            buffer,
            info,
            finalUrl: response.url,
            score: candidate.hintScore + Math.min(shortestEdge, 512) +
                Math.round((MAX_ASPECT_RATIO - aspectRatio) * 100),
        };
    } catch {
        return undefined;
    }
}

function conventionalCandidates(baseUrl: string): IconCandidate[] {
    const paths = [
        ['/android-chrome-512x512.png', 1_050],
        ['/favicon-512x512.png', 1_000],
        ['/android-chrome-192x192.png', 850],
        ['/favicon-192x192.png', 800],
        ['/apple-touch-icon.png', 750],
        ['/apple-touch-icon-precomposed.png', 700],
        ['/favicon.svg', 650],
        ['/safari-pinned-tab.svg', 500],
        ['/favicon.png', 300],
        ['/favicon.ico', 100],
    ] as const;
    return paths.map(([pathname, hintScore]) => ({
        url: new URL(pathname, baseUrl).toString(),
        hintScore,
    }));
}

async function saveBestCandidate(
    domain: string,
    candidates: IconCandidate[]
): Promise<CollectedLogo | undefined> {
    const uniqueCandidates = [...new Map(
        candidates.map(candidate => [candidate.url, candidate])
    ).values()].sort((left, right) => right.hintScore - left.hintScore).slice(0, 24);
    const downloaded = (await Promise.all(uniqueCandidates.map(downloadCandidate)))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((left, right) => right.score - left.score)[0];
    if (!downloaded) return undefined;

    const filename = `${domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.${downloaded.info.extension}`;
    await writeFile(path.join(OUTPUT_DIRECTORY, filename), downloaded.buffer);
    return {
        domain,
        path: `/brand-logos/collected/${filename}`,
        sourceUrl: downloaded.finalUrl,
        width: downloaded.info.width,
        height: downloaded.info.height,
    };
}

async function collectDomain(domain: string): Promise<CollectedLogo | undefined> {
    const reviewedBrandLogo = await saveBestCandidate(
        domain,
        (REVIEWED_BRAND_ASSETS[domain] || []).map(url => ({
            url,
            hintScore: 2_000,
            kind: 'brand-mark',
        }))
    );
    if (reviewedBrandLogo) return reviewedBrandLogo;

    const reviewedAppCandidates: IconCandidate[] = [];
    for (const appId of REVIEWED_APP_IDS[domain] || []) {
        reviewedAppCandidates.push(...await extractAppleAppCandidates(appId));
    }
    const reviewedAppLogo = await saveBestCandidate(domain, reviewedAppCandidates);
    if (reviewedAppLogo) return reviewedAppLogo;

    const homeUrls = [`https://${domain}/`];
    const parts = domain.split('.');
    const isBareKoreanDomain = parts.length === 3 && ['co', 'or', 'go', 'ac', 'ne']
        .includes(parts[parts.length - 2]);
    if (
        !domain.startsWith('www.') &&
        !domain.includes('.google.') &&
        (parts.length === 2 || isBareKoreanDomain)
    ) {
        homeUrls.push(`https://www.${domain}/`);
    }

    const candidates: IconCandidate[] = [];
    for (const homeUrl of homeUrls) {
        try {
            const { text, finalUrl } = await fetchText(homeUrl);
            const extracted = extractHtmlCandidates(text, finalUrl);
            candidates.push(...extracted.icons, ...conventionalCandidates(finalUrl));
            for (const manifestUrl of extracted.manifests.slice(0, 2)) {
                candidates.push(...await extractManifestCandidates(manifestUrl));
            }
            for (const appId of extracted.appleAppIds.slice(0, 3)) {
                candidates.push(...await extractAppleAppCandidates(appId));
            }
            for (const appId of extracted.googlePlayIds.slice(0, 3)) {
                candidates.push(...await extractGooglePlayCandidates(appId));
            }
            break;
        } catch {
            candidates.push(...conventionalCandidates(homeUrl));
        }
    }

    for (const homeUrl of homeUrls) {
        for (const manifestPath of ['/site.webmanifest', '/manifest.webmanifest', '/manifest.json']) {
            candidates.push(...await extractManifestCandidates(
                new URL(manifestPath, homeUrl).toString()
            ));
        }
    }
    return saveBestCandidate(domain, candidates);
}

async function readExistingCollection(): Promise<Map<string, CollectedLogo>> {
    try {
        const manifestPath = path.join(OUTPUT_DIRECTORY, 'manifest.json');
        const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as CollectedLogo[];
        const verified = await Promise.all(parsed.map(async item => {
            if (!item.path.startsWith('/brand-logos/collected/')) return undefined;
            try {
                await access(path.join(ROOT, 'public', item.path.replace(/^\/+/, '')));
                return item;
            } catch {
                return undefined;
            }
        }));
        return new Map(verified
            .filter((item): item is CollectedLogo => Boolean(item))
            .map(item => [item.domain, item]));
    } catch {
        return new Map();
    }
}

async function mapConcurrent<T, R>(
    values: T[],
    concurrency: number,
    operation: (value: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await operation(values[index]);
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(concurrency, values.length) },
        () => worker()
    ));
    return results;
}

async function main() {
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const database = new Database(DATABASE_PATH, { readonly: true });
    const brands = database.prepare('select id, name from brands').all() as BrandRow[];
    database.close();

    const domains = [...new Set(brands
        .map(brand => getBrandLogoDomain(brand))
        .filter((domain): domain is string => Boolean(domain)))]
        .sort();
    const requestedDomains = new Set(process.argv
        .slice(2)
        .filter(argument => argument.startsWith('--domain='))
        .map(argument => argument.slice('--domain='.length)));
    const domainsToCollect = requestedDomains.size > 0 ? domains.filter(domain => (
        requestedDomains.has(domain)
    )) : domains;
    const collectedByDomain = await readExistingCollection();
    let completed = 0;
    await mapConcurrent(domainsToCollect, CONCURRENCY, async domain => {
        const result = await collectDomain(domain);
        if (result) collectedByDomain.set(domain, result);
        completed += 1;
        process.stdout.write(
            `[${completed}/${domainsToCollect.length}] ${result ? 'saved' : 'kept/skipped'} ${domain}\n`
        );
        return result;
    });
    const collected = domains
        .flatMap(domain => {
            const item = collectedByDomain.get(domain);
            return item ? [item] : [];
        });

    const mappingLines = collected
        .sort((left, right) => left.domain.localeCompare(right.domain))
        .map(item => `    '${item.domain}': '${item.path}',`);
    await writeFile(
        GENERATED_MODULE,
        [
            '// Generated by `npm run logos:collect`. Do not edit by hand.',
            'export const COLLECTED_BRAND_LOGO_URLS: Record<string, string> = {',
            ...mappingLines,
            '};',
            '',
        ].join('\n')
    );
    await writeFile(
        path.join(OUTPUT_DIRECTORY, 'manifest.json'),
        `${JSON.stringify(collected, null, 2)}\n`
    );

    const activeFilenames = new Set(collected.map(item => path.basename(item.path)));
    const generatedSlugs = domains.map(domain => (
        domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    ));
    for (const filename of await readdir(OUTPUT_DIRECTORY)) {
        if (filename === 'manifest.json' || activeFilenames.has(filename)) continue;
        if (!generatedSlugs.some(slug => filename.startsWith(`${slug}.`))) continue;
        await unlink(path.join(OUTPUT_DIRECTORY, filename));
    }

    process.stdout.write(
        `Collected ${collected.length}/${domains.length} high-resolution domain icons.\n`
    );
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
