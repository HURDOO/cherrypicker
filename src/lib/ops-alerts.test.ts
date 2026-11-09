import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendOpsAlert } from './ops-alerts';

const WEBHOOK = 'https://discord.com/api/webhooks/123/token-value';

const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('sendOpsAlert', () => {
    it('does nothing when no webhook is configured', async () => {
        vi.stubEnv('DISCORD_WEBHOOK_URL', '');
        const fetchImpl = okFetch();

        await expect(sendOpsAlert('hello', { fetchImpl })).resolves.toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('posts the message without mentions', async () => {
        const fetchImpl = okFetch();

        await expect(sendOpsAlert('수집 실패', { webhookUrl: WEBHOOK, fetchImpl })).resolves.toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(WEBHOOK);
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({
            content: '수집 실패',
            allowed_mentions: { parse: [] },
        });
    });

    it('reads the webhook from DISCORD_WEBHOOK_URL', async () => {
        vi.stubEnv('DISCORD_WEBHOOK_URL', WEBHOOK);
        const fetchImpl = okFetch();

        await expect(sendOpsAlert('hello', { fetchImpl })).resolves.toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('refuses addresses that are not Discord webhooks and never logs them', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const fetchImpl = okFetch();

        await expect(sendOpsAlert('hello', {
            webhookUrl: 'http://discord.com/api/webhooks/1/secret-part',
            fetchImpl,
        })).resolves.toBe(false);
        await expect(sendOpsAlert('hello', {
            webhookUrl: 'https://example.com/api/webhooks/1/secret-part',
            fetchImpl,
        })).resolves.toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(JSON.stringify(error.mock.calls)).not.toContain('secret-part');
    });

    it('never throws when Discord fails or times out', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rejected = vi.fn(async () => {
            throw new DOMException('timed out', 'TimeoutError');
        });
        const failed = vi.fn(async () => new Response('nope', { status: 500 }));

        await expect(sendOpsAlert('a', { webhookUrl: WEBHOOK, fetchImpl: rejected })).resolves.toBe(false);
        await expect(sendOpsAlert('a', { webhookUrl: WEBHOOK, fetchImpl: failed })).resolves.toBe(false);
        expect(JSON.stringify(error.mock.calls)).not.toContain('token-value');
    });

    it('shortens messages to Discord limits', async () => {
        const fetchImpl = okFetch();

        await sendOpsAlert('가'.repeat(3_000), { webhookUrl: WEBHOOK, fetchImpl });
        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect((JSON.parse(String(init.body)) as { content: string }).content.length).toBeLessThanOrEqual(1_900);
    });
});
