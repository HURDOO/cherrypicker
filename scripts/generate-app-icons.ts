/**
 * Rebuilds the PWA icon PNGs from public/app-icon/icon.svg with the installed Chrome.
 * Run `npm run icons:generate` after changing the SVG. The manifest and layout point at
 * these fixed file names, so swapping the icon needs no code change.
 *
 * The maskable icon uses the same artwork, so keep it inside the central safe circle.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const ICON_DIRECTORY = join(process.cwd(), 'public', 'app-icon');
const OUTPUTS = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'icon-maskable-512.png', size: 512 },
    { file: 'apple-touch-icon.png', size: 180 },
];
const CHROME_PATHS = [
    process.env.CARD_SOURCE_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter((value): value is string => Boolean(value));

async function main() {
    const chromePath = CHROME_PATHS.find(path => existsSync(path));
    if (!chromePath) throw new Error('Chrome을 찾지 못했습니다. CARD_SOURCE_CHROME_PATH를 설정하세요.');

    const svg = readFileSync(join(ICON_DIRECTORY, 'icon.svg'), 'utf8');
    const profileDirectory = mkdtempSync(join(tmpdir(), 'cherrypicker-icons-'));
    const child = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--hide-scrollbars',
        `--user-data-dir=${profileDirectory}`,
        '--remote-debugging-pipe',
        'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const input = child.stdio[3] as Writable;
    const output = child.stdio[4] as Readable;

    let nextId = 1;
    const pending = new Map<number, (message: { result?: Record<string, unknown>; error?: unknown }) => void>();
    let buffered = Buffer.alloc(0);
    output.on('data', (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        let end: number;
        while ((end = buffered.indexOf(0)) >= 0) {
            const message = JSON.parse(buffered.subarray(0, end).toString('utf8'));
            buffered = buffered.subarray(end + 1);
            if (message.id !== undefined) {
                pending.get(message.id)?.(message);
                pending.delete(message.id);
            }
        }
    });
    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => (
        new Promise<Record<string, unknown>>((resolve, reject) => {
            const id = nextId++;
            pending.set(id, message => (
                message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result ?? {})
            ));
            input.write(`${JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })}\0`);
        })
    );

    try {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }) as {
            sessionId: string;
        };
        for (const { file, size } of OUTPUTS) {
            await send('Emulation.setDeviceMetricsOverride', {
                width: size,
                height: size,
                deviceScaleFactor: 1,
                mobile: false,
            }, sessionId);
            const html = '<!doctype html><html><body style="margin:0;overflow:hidden">' +
                svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `) +
                '</body></html>';
            await send('Page.navigate', {
                url: `data:text/html;base64,${Buffer.from(html).toString('base64')}`,
            }, sessionId);
            await new Promise(resolve => setTimeout(resolve, 300));
            const { data } = await send('Page.captureScreenshot', {
                format: 'png',
                clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
            }, sessionId) as { data: string };
            writeFileSync(join(ICON_DIRECTORY, file), Buffer.from(data, 'base64'));
            console.log(`public/app-icon/${file} (${size}px)`);
        }
        await send('Browser.close').catch(() => undefined);
    } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        rmSync(profileDirectory, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
