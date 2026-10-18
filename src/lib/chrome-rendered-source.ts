import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

/**
 * Some card issuers draw their benefit text with scripts: Woori Card loads it through encrypted
 * requests, Toss Bank and K Bank render it client-side, and K Bank keeps the details in popups.
 * For these hosts the collector renders the page in the locally installed Chrome (no new npm
 * dependency) over the DevTools pipe. DNS is limited to the source's allowed hosts, downloads are
 * denied, and the final URL is checked again by the caller. Production servers have no Chrome, so
 * these sources are only collected where `CARD_SOURCE_CHROME_PATH` or the macOS default exists.
 */
export interface ChromeRenderProfile {
    host: string;
    /** Exact label of the buttons that open benefit-detail popups; each new popup text is kept. */
    revealButtonText?: string;
}

export const CHROME_RENDERED_SOURCE_PROFILES: readonly ChromeRenderProfile[] = [
    { host: 'wooricard.com' },
    { host: 'tossbank.com' },
    { host: 'kbanknow.com', revealButtonText: '자세히 보기' },
];

export interface RenderedOfficialPage {
    finalUrl: string;
    html: string;
    revealedTexts: string[];
}

export type OfficialPageRenderer = (
    sourceUrl: string,
    allowedHosts: string[],
    profile: ChromeRenderProfile,
) => Promise<RenderedOfficialPage>;

const MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RENDER_TIMEOUT_MS = 90_000;

export function chromeRenderProfileFor(sourceUrl: string) {
    let hostname: string;
    try {
        hostname = new URL(sourceUrl).hostname.toLowerCase();
    } catch {
        return undefined;
    }
    return CHROME_RENDERED_SOURCE_PROFILES.find(profile => (
        hostname === profile.host || hostname.endsWith(`.${profile.host}`)
    ));
}

/** Every host outside the allowed list fails to resolve, so scripts cannot reach other sites. */
export const chromeHostResolverRules = (allowedHosts: string[]) => [
    'MAP * ~NOTFOUND',
    ...allowedHosts.flatMap(host => [`EXCLUDE ${host}`, `EXCLUDE *.${host}`]),
].join(', ');

export function resolveChromePath(env: Record<string, string | undefined> = process.env) {
    const configured = env.CARD_SOURCE_CHROME_PATH?.trim();
    if (configured) return configured;
    return existsSync(MAC_CHROME_PATH) ? MAC_CHROME_PATH : undefined;
}

// Runs in the page. Waits until the text stops growing, then opens each detail popup once and
// keeps texts that were not on screen before (popups may live in a shadow root or a dialog).
const PAGE_SCRIPT = `async (revealText) => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    // Product text often arrives through a request after the page shell, so wait at least 3s and
    // until the text length holds for three readings in a row (1.5s).
    let previous = -1;
    let stableReadings = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const length = document.body ? document.body.innerText.length : 0;
        stableReadings = length > 0 && length === previous ? stableReadings + 1 : 0;
        if (attempt >= 6 && stableReadings >= 3) break;
        previous = length;
        await sleep(500);
    }
    const overlayTexts = () => {
        const texts = [];
        document.querySelectorAll('*').forEach(element => {
            if (!element.shadowRoot) return;
            const text = [...element.shadowRoot.children]
                .map(child => child.innerText || child.textContent || '')
                .join('\\n').trim();
            if (text) texts.push(text);
        });
        document.querySelectorAll('[role=dialog],[aria-modal=true]').forEach(element => {
            const text = (element.innerText || '').trim();
            if (text) texts.push(text);
        });
        return texts;
    };
    const revealed = [];
    if (revealText) {
        const seen = new Set(overlayTexts());
        const buttons = [...document.querySelectorAll('button,[role=button]')]
            .filter(button => (button.textContent || '').trim() === revealText)
            .slice(0, 30);
        for (const button of buttons) {
            button.click();
            await sleep(1500);
            for (const text of overlayTexts()) {
                if (seen.has(text)) continue;
                seen.add(text);
                revealed.push(text);
            }
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await sleep(300);
        }
    }
    return { href: location.href, html: document.documentElement.outerHTML, revealed };
}`;

type CdpMessage = {
    id?: number;
    method?: string;
    sessionId?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: { message?: string };
};

let renderQueue: Promise<unknown> = Promise.resolve();

/** Renders one page at a time so a card with several rendered sources does not start many Chromes. */
export const renderOfficialPageWithChrome: OfficialPageRenderer = (sourceUrl, allowedHosts, profile) => {
    const run = renderQueue.then(() => renderOnce(sourceUrl, allowedHosts, profile));
    renderQueue = run.catch(() => undefined);
    return run;
};

async function renderOnce(
    sourceUrl: string,
    allowedHosts: string[],
    profile: ChromeRenderProfile,
): Promise<RenderedOfficialPage> {
    const chromePath = resolveChromePath();
    if (!chromePath) {
        throw new Error('이 공식 출처는 Chrome 렌더링이 필요합니다. CARD_SOURCE_CHROME_PATH를 설정하세요.');
    }
    const profileDirectory = mkdtempSync(join(tmpdir(), 'cherrypicker-chrome-'));
    const child = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--mute-audio',
        `--user-data-dir=${profileDirectory}`,
        `--host-resolver-rules=${chromeHostResolverRules(allowedHosts)}`,
        '--remote-debugging-pipe',
        'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const input = child.stdio[3] as Writable;
    const output = child.stdio[4] as Readable;

    let nextId = 1;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
    const eventWaiters: Array<{ method: string; sessionId?: string; resolve: () => void }> = [];
    let buffered = Buffer.alloc(0);
    let failure: Error | undefined;
    const fail = (error: Error) => {
        failure ??= error;
        pending.forEach(waiter => waiter.reject(error));
        pending.clear();
    };
    output.on('data', (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        let end: number;
        while ((end = buffered.indexOf(0)) >= 0) {
            const message = JSON.parse(buffered.subarray(0, end).toString('utf8')) as CdpMessage;
            buffered = buffered.subarray(end + 1);
            if (message.id !== undefined) {
                const waiter = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) waiter?.reject(new Error(`Chrome: ${message.error.message ?? 'CDP 오류'}`));
                else waiter?.resolve(message.result ?? {});
            } else if (message.method) {
                eventWaiters
                    .filter(waiter => waiter.method === message.method && waiter.sessionId === message.sessionId)
                    .forEach(waiter => {
                        eventWaiters.splice(eventWaiters.indexOf(waiter), 1);
                        waiter.resolve();
                    });
            }
        }
    });
    child.on('error', error => fail(error));
    child.on('exit', () => fail(new Error('Chrome이 렌더링 중 종료되었습니다.')));

    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => (
        new Promise<Record<string, unknown>>((resolve, reject) => {
            if (failure) {
                reject(failure);
                return;
            }
            const id = nextId++;
            pending.set(id, { resolve, reject });
            input.write(`${JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })}\0`);
        })
    );
    const nextEvent = (method: string, sessionId: string) => new Promise<void>(resolve => {
        eventWaiters.push({ method, sessionId, resolve });
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Chrome 렌더링 시간이 초과되었습니다.')), RENDER_TIMEOUT_MS);
    });
    const render = async () => {
        await send('Browser.setDownloadBehavior', { behavior: 'deny' });
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string };
        await send('Page.enable', {}, sessionId);
        const loaded = nextEvent('Page.loadEventFired', sessionId);
        const navigation = await send('Page.navigate', { url: sourceUrl }, sessionId);
        if (typeof navigation.errorText === 'string' && navigation.errorText) {
            throw new Error(`공식 문서를 열지 못했습니다: ${navigation.errorText}`);
        }
        await loaded;
        const evaluated = await send('Runtime.evaluate', {
            expression: `(${PAGE_SCRIPT})(${JSON.stringify(profile.revealButtonText ?? null)})`,
            awaitPromise: true,
            returnByValue: true,
        }, sessionId) as {
            result?: { value?: { href?: unknown; html?: unknown; revealed?: unknown } };
            exceptionDetails?: { text?: string };
        };
        if (evaluated.exceptionDetails) {
            throw new Error(`렌더링한 페이지를 읽지 못했습니다: ${evaluated.exceptionDetails.text ?? ''}`);
        }
        const value = evaluated.result?.value;
        if (typeof value?.href !== 'string' || typeof value.html !== 'string' || !Array.isArray(value.revealed)) {
            throw new Error('렌더링한 페이지를 읽지 못했습니다.');
        }
        return {
            finalUrl: value.href,
            html: value.html,
            revealedTexts: value.revealed.filter((text): text is string => typeof text === 'string'),
        };
    };

    try {
        return await Promise.race([render(), timeout]);
    } finally {
        clearTimeout(timer);
        await Promise.race([
            send('Browser.close').catch(() => undefined),
            new Promise(resolve => setTimeout(resolve, 3_000)),
        ]);
        if (child.exitCode === null) child.kill('SIGKILL');
        try {
            rmSync(profileDirectory, { recursive: true, force: true });
        } catch {
            // A Chrome helper may still hold the profile; the temporary directory is cleaned by the OS.
        }
    }
}
