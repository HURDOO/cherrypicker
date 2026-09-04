import { constants as cryptoConstants, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { join, sep } from 'node:path';
import type {
    CardBenefitDocumentMetadata,
    CardBenefitSourceKind,
    RuleId,
} from '@/types';
import { decodePromotionHtml } from './html-decoding';
import { extractOfficialNoticeDates } from './official-notice-dates';
import { htmlToText } from './promotion-parsers';

const HTML_MAX_BYTES = 2 * 1024 * 1024;
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const PDF_MAX_PAGES = 200;
const PDF_MAX_TEXT_CHARACTERS = 1_000_000;
const PDF_PAGE_MARKER = /^\[\[PDF_PAGE_(\d+)\]\]$/m;

const requestHeaders = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

const HYUNDAI_CARD_HOST = 'hyundaicard.com';
const LEGACY_TLS_ERROR_CODE = 'ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED';

export interface OfficialDocumentSourceDefinition {
    id: string;
    label: string;
    sourceUrl: string;
    sourceKind: CardBenefitSourceKind;
    format: 'html' | 'pdf';
    allowedHosts: string[];
    required: boolean;
    candidateRole: 'PRIMARY' | 'SUPPORTING';
    discoverLinkedPdfs?: boolean;
    noticeDatePolicy?: {
        affectedRuleIds: RuleId[];
        requirePublicationDate: boolean;
        requireEffectiveFrom: boolean;
        applyAsRulePeriod?: boolean;
    };
}

export interface CollectedOfficialDocument {
    definition: OfficialDocumentSourceDefinition;
    sourceUrl: string;
    mediaType: string;
    rawContent: string;
    extractedText: string;
    contentHash: string;
    responseMetadata: CardBenefitDocumentMetadata;
    pageTexts?: string[];
}

export interface PdfTextExtraction {
    pages: string[];
    title?: string;
}

const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const normalizeOfficialDocumentSemantics = (extractedText: string) => {
    let normalized = extractedText.normalize('NFKC');
    const shinhanBenefitStart = normalized.indexOf('혜택 안내');
    if (shinhanBenefitStart >= 0 && /회사명:\s*신한카드\s+상품명:/.test(normalized)) {
        normalized = normalized.slice(shinhanBenefitStart);
        const cardDesignStart = normalized.indexOf('카드 디자인');
        if (cardDesignStart >= 0) normalized = normalized.slice(0, cardDesignStart);
    }
    return normalized
        // View counters and shared navigation/application chrome change independently of benefits.
        .replace(/조회수\s*:\s*[0-9,]+/g, '조회수: #')
        .replace(/(?:온라인 신청하기\s*){2,}/g, '온라인 신청하기 ')
        .replace(/(?:간편 신청\s*){2,}/g, '간편 신청 ')
        .replace(/\b(?:BizPHAROS|NiceBizINFO)\b/g, 'KB_WORK_SERVICE')
        .replace(
            /라이프\s+생활·구독\s+(?:보험\s+)?구독\(유료\)서비스/g,
            '라이프 생활·구독 구독(유료)서비스',
        )
        .replace(/\s+/g, ' ')
        .trim();
};

export const createOfficialDocumentSemanticHash = (extractedText: string) => createHash('sha256')
    .update(normalizeOfficialDocumentSemantics(extractedText))
    .digest('hex');

const normalizePageText = (value: string) => value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const positionedPdfText = (items: unknown[]) => {
    let text = '';
    let previousY: number | undefined;
    let previousHeight = 0;

    items.forEach(item => {
        if (!item || typeof item !== 'object' || !('str' in item) ||
            typeof item.str !== 'string' || !item.str) return;
        const transform = 'transform' in item && Array.isArray(item.transform)
            ? item.transform
            : undefined;
        const y = typeof transform?.[5] === 'number' ? transform[5] : undefined;
        const height = 'height' in item && typeof item.height === 'number'
            ? Math.abs(item.height)
            : typeof transform?.[3] === 'number'
                ? Math.abs(transform[3])
                : 0;
        const lineThreshold = Math.max(
            1.5,
            Math.min(previousHeight || height, height || previousHeight) * 0.35,
        );
        const startsNewVisualLine = previousY !== undefined && y !== undefined &&
            Math.abs(y - previousY) > lineThreshold;
        if (startsNewVisualLine && text && !text.endsWith('\n')) {
            text += '\n';
        } else if (text && !/[\s]$/.test(text)) {
            text += ' ';
        }
        text += item.str;
        const hasEOL = 'hasEOL' in item && item.hasEOL === true;
        if (hasEOL) {
            text += '\n';
            previousY = undefined;
            previousHeight = 0;
        } else {
            previousY = y;
            previousHeight = height;
        }
    });

    return text;
};

const isAllowedHost = (hostname: string, allowedHosts: string[]) => allowedHosts.some(host => (
    hostname === host || hostname.endsWith(`.${host}`)
));

export function assertTrustedOfficialSourceUrl(sourceUrl: string, allowedHosts: string[]) {
    let parsed: URL;
    try {
        parsed = new URL(sourceUrl);
    } catch {
        throw new Error('공식 문서 URL이 올바르지 않습니다.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
        throw new Error('공식 문서는 자격 증명이나 별도 포트가 없는 HTTPS URL이어야 합니다.');
    }
    if (!isAllowedHost(parsed.hostname.toLowerCase(), allowedHosts.map(host => host.toLowerCase()))) {
        throw new Error(`허용되지 않은 공식 문서 호스트입니다: ${parsed.hostname}`);
    }
    return parsed;
}

const errorCode = (error: unknown) => {
    if (!error || typeof error !== 'object') return undefined;
    if ('code' in error && typeof error.code === 'string') return error.code;
    if ('cause' in error && error.cause && typeof error.cause === 'object' &&
        'code' in error.cause && typeof error.cause.code === 'string') {
        return error.cause.code;
    }
    return undefined;
};

export function shouldUseHyundaiCardLegacyTlsFallback(error: unknown, sourceUrl: string) {
    let hostname: string;
    try {
        hostname = new URL(sourceUrl).hostname.toLowerCase();
    } catch {
        return false;
    }
    return errorCode(error) === LEGACY_TLS_ERROR_CODE &&
        (hostname === HYUNDAI_CARD_HOST || hostname.endsWith(`.${HYUNDAI_CARD_HOST}`));
}

const fetchHyundaiCardWithLegacyTls = (
    sourceUrl: string,
    headers: Record<string, string>,
    maximumBytes: number,
    signal: AbortSignal,
) => new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(sourceUrl, {
        method: 'GET',
        headers,
        signal,
        rejectUnauthorized: true,
        // Hyundai Card's current official-document host still requires the legacy
        // server-connect handshake. Certificate and hostname verification stay enabled.
        secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
    }, response => {
        const declaredLength = Number(response.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
            response.resume();
            reject(new Error('공식 문서가 허용 크기를 초과했습니다.'));
            return;
        }
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maximumBytes) {
                response.destroy(new Error('공식 문서가 허용 크기를 초과했습니다.'));
                return;
            }
            chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
            const responseHeaders = new Headers();
            Object.entries(response.headers).forEach(([name, value]) => {
                if (Array.isArray(value)) {
                    value.forEach(item => responseHeaders.append(name, item));
                } else if (value !== undefined) {
                    responseHeaders.set(name, value);
                }
            });
            resolve(new Response(new Uint8Array(Buffer.concat(chunks)), {
                status: response.statusCode,
                statusText: response.statusMessage,
                headers: responseHeaders,
            }));
        });
    });
    request.on('error', reject);
    request.end();
});

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextExtraction> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfAssetDirectory = join(process.cwd(), 'node_modules', 'pdfjs-dist');
    const loadingTask = pdfjs.getDocument({
        data: bytes,
        cMapUrl: join(pdfAssetDirectory, 'cmaps') + sep,
        cMapPacked: true,
        standardFontDataUrl: join(pdfAssetDirectory, 'standard_fonts') + sep,
        isEvalSupported: false,
        useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    try {
        if (document.numPages > PDF_MAX_PAGES) {
            throw new Error('PDF 공식 문서의 페이지 또는 텍스트가 허용 크기를 초과했습니다.');
        }
        const pages: string[] = [];
        let extractedCharacters = 0;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            const text = positionedPdfText(content.items);
            const normalized = normalizePageText(text);
            page.cleanup();
            extractedCharacters += normalized.length;
            if (extractedCharacters > PDF_MAX_TEXT_CHARACTERS) {
                throw new Error('PDF 공식 문서의 페이지 또는 텍스트가 허용 크기를 초과했습니다.');
            }
            pages.push(normalized);
        }
        const metadata = await document.getMetadata().catch(() => undefined);
        const title = metadata?.info && 'Title' in metadata.info &&
            typeof metadata.info.Title === 'string'
            ? metadata.info.Title.trim()
            : undefined;
        return {
            pages,
            ...(title && { title }),
        };
    } finally {
        await loadingTask.destroy();
    }
}

export const joinPdfPages = (pages: string[]) => pages
    .map((page, index) => `[[PDF_PAGE_${index + 1}]]\n${page}`)
    .join('\n\n');

export function splitPdfPages(extractedText: string) {
    const matches = [...extractedText.matchAll(/\[\[PDF_PAGE_(\d+)\]\]\n/g)];
    if (matches.length === 0 || !PDF_PAGE_MARKER.test(extractedText)) return [];
    return matches.map((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = matches[index + 1]?.index ?? extractedText.length;
        return extractedText.slice(start, end).trim();
    });
}

export async function collectOfficialDocument(
    definition: OfficialDocumentSourceDefinition,
    options: {
        fetcher?: typeof fetch;
        pdfExtractor?: (bytes: Uint8Array) => Promise<PdfTextExtraction>;
    } = {},
): Promise<CollectedOfficialDocument> {
    assertTrustedOfficialSourceUrl(definition.sourceUrl, definition.allowedHosts);
    const headers = {
        ...requestHeaders,
        accept: definition.format === 'pdf'
            ? 'application/pdf,application/octet-stream;q=0.8'
            : 'text/html,application/xhtml+xml',
    };
    const signal = AbortSignal.timeout(30_000);
    const maximumBytes = definition.format === 'pdf' ? PDF_MAX_BYTES : HTML_MAX_BYTES;
    let response: Response;
    try {
        response = await (options.fetcher ?? fetch)(definition.sourceUrl, {
            headers,
            cache: 'no-store',
            redirect: 'follow',
            signal,
        });
    } catch (error) {
        if (options.fetcher ||
            !shouldUseHyundaiCardLegacyTlsFallback(error, definition.sourceUrl)) {
            throw error;
        }
        response = await fetchHyundaiCardWithLegacyTls(
            definition.sourceUrl,
            headers,
            maximumBytes,
            signal,
        );
    }
    if (!response.ok) throw new Error(`공식 문서 HTTP ${response.status}`);
    const finalUrl = response.url || definition.sourceUrl;
    assertTrustedOfficialSourceUrl(finalUrl, definition.allowedHosts);

    const declaredLengthHeader = response.headers.get('content-length');
    const declaredLength = declaredLengthHeader ? Number(declaredLengthHeader) : undefined;
    if (declaredLength !== undefined && Number.isFinite(declaredLength) &&
        declaredLength > maximumBytes) {
        throw new Error('공식 문서가 허용 크기를 초과했습니다.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
        throw new Error('공식 문서 크기가 올바르지 않습니다.');
    }

    const declaredMediaType = response.headers.get('content-type') ?? '';
    const mediaType = declaredMediaType.split(';')[0]?.trim().toLowerCase();
    const responseMetadata: CardBenefitDocumentMetadata = {
        ...(response.headers.get('etag') && { etag: response.headers.get('etag')! }),
        ...(response.headers.get('last-modified') && {
            lastModified: response.headers.get('last-modified')!,
        }),
        ...(response.headers.get('content-disposition') && {
            contentDisposition: response.headers.get('content-disposition')!,
        }),
        ...(finalUrl !== definition.sourceUrl && { finalUrl }),
    };

    if (definition.format === 'pdf') {
        const hasPdfSignature = bytes.byteLength >= 5 &&
            String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
        if (!hasPdfSignature || (mediaType &&
            mediaType !== 'application/pdf' && mediaType !== 'application/octet-stream')) {
            throw new Error(`PDF 공식 문서 형식이 올바르지 않습니다: ${mediaType || 'unknown'}`);
        }
        // PDF.js transfers the input ArrayBuffer to its worker and may detach it.
        // Preserve the immutable source bytes before extraction for audit/rollback.
        const rawContent = Buffer.from(bytes).toString('base64');
        const contentHash = hashBytes(bytes);
        const parsed = await (options.pdfExtractor ?? extractPdfText)(bytes);
        if (parsed.pages.length > PDF_MAX_PAGES ||
            parsed.pages.reduce((total, page) => total + page.length, 0) >
                PDF_MAX_TEXT_CHARACTERS) {
            throw new Error('PDF 공식 문서의 페이지 또는 텍스트가 허용 크기를 초과했습니다.');
        }
        if (parsed.pages.length === 0 || parsed.pages.every(page => page.length < 20)) {
            throw new Error('PDF 공식 문서에서 충분한 텍스트를 추출하지 못했습니다.');
        }
        return {
            definition,
            sourceUrl: definition.sourceUrl,
            mediaType: 'application/pdf',
            rawContent,
            extractedText: joinPdfPages(parsed.pages),
            contentHash,
            responseMetadata: {
                ...responseMetadata,
                rawEncoding: 'base64',
                extractionMethod: 'pdfjs',
                pageCount: parsed.pages.length,
                ...(parsed.title && { title: parsed.title }),
            },
            pageTexts: parsed.pages,
        };
    }

    if (mediaType && !mediaType.includes('html')) {
        throw new Error(`HTML 공식 문서 형식이 올바르지 않습니다: ${mediaType}`);
    }
    const decodedMediaType = declaredMediaType || 'text/html';
    const rawContent = decodePromotionHtml(bytes, decodedMediaType);
    const extractedText = htmlToText(rawContent);
    if (extractedText.length < 100 || /Request Rejected|requested URL was rejected/i.test(extractedText)) {
        throw new Error('HTML 공식 문서에서 충분한 텍스트를 추출하지 못했습니다.');
    }
    return {
        definition,
        sourceUrl: definition.sourceUrl,
        mediaType: mediaType || 'text/html',
        rawContent,
        extractedText,
        contentHash: createOfficialDocumentSemanticHash(extractedText),
        responseMetadata: {
            ...responseMetadata,
            rawEncoding: 'utf8',
            extractionMethod: 'html-to-text',
            ...(definition.sourceKind === 'NOTICE' && definition.noticeDatePolicy && {
                noticeDates: {
                    ...definition.noticeDatePolicy,
                    ...extractOfficialNoticeDates(extractedText),
                },
            }),
        },
    };
}

export function discoverOfficialPdfSources(
    html: string,
    parent: OfficialDocumentSourceDefinition,
): OfficialDocumentSourceDefinition[] {
    if (parent.discoverLinkedPdfs === false) return [];
    const discovered = new Map<string, OfficialDocumentSourceDefinition>();
    const pdfLinkPatterns = [
        /href\s*=\s*(["'])(.*?)\1/gi,
        /window\.open\(\s*(["'])(.*?)\1/gi,
    ];
    for (const pattern of pdfLinkPatterns) {
        for (const match of html.matchAll(pattern)) {
            const href = match[2]
                .replaceAll('&amp;', '&')
                .trim();
            let url: URL;
            try {
                url = new URL(href, parent.sourceUrl);
                assertTrustedOfficialSourceUrl(url.toString(), parent.allowedHosts);
            } catch {
                continue;
            }
            if (!/\.pdf(?:$|[?#])/i.test(url.toString())) continue;
            const sourceUrl = url.toString();
            discovered.set(sourceUrl, {
                id: `${parent.id}-pdf-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 10)}`,
                label: `${parent.label} 첨부 PDF`,
                sourceUrl,
                sourceKind: 'PRODUCT_GUIDE_PDF',
                format: 'pdf',
                allowedHosts: parent.allowedHosts,
                required: false,
                candidateRole: 'SUPPORTING',
            });
        }
    }
    return [...discovered.values()];
}

export const createOfficialSourceBundleHash = (
    documents: Array<Pick<CollectedOfficialDocument, 'sourceUrl' | 'contentHash'>>,
) => createHash('sha256')
    .update(documents
        .map(document => `${document.sourceUrl}\0${document.contentHash}`)
        .sort()
        .join('\n'))
    .digest('hex');
