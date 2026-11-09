const WEBHOOK_ENV = 'DISCORD_WEBHOOK_URL';
const DEFAULT_TIMEOUT_MS = 10_000;
// Discord rejects messages over 2,000 characters.
const MAX_CONTENT_LENGTH = 1_900;
const ALLOWED_WEBHOOK_HOSTS = new Set([
    'discord.com',
    'discordapp.com',
    'canary.discord.com',
    'ptb.discord.com',
]);

export interface OpsAlertOptions {
    webhookUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

const isDiscordWebhook = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            ALLOWED_WEBHOOK_HOSTS.has(url.hostname) &&
            url.pathname.startsWith('/api/webhooks/');
    } catch {
        return false;
    }
};

/**
 * Posts an operations message to the Discord webhook in DISCORD_WEBHOOK_URL.
 * Does nothing when it is unset, never throws, and never logs the URL (it is a secret).
 * Returns whether Discord accepted the message.
 */
export async function sendOpsAlert(text: string, options: OpsAlertOptions = {}): Promise<boolean> {
    const webhookUrl = (options.webhookUrl ?? process.env[WEBHOOK_ENV] ?? '').trim();
    if (!webhookUrl) return false;
    if (!isDiscordWebhook(webhookUrl)) {
        console.error('[ops-alert] 웹훅 주소가 Discord 웹훅 형식이 아니라 알림을 보내지 않았습니다.');
        return false;
    }

    const content = text.length > MAX_CONTENT_LENGTH
        ? `${text.slice(0, MAX_CONTENT_LENGTH - 1)}…`
        : text;
    const fetchImpl = options.fetchImpl ?? fetch;

    try {
        const response = await fetchImpl(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
            signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        if (!response.ok) {
            console.error(`[ops-alert] Discord 알림 전송 실패 (HTTP ${response.status}).`);
            return false;
        }
        return true;
    } catch (error) {
        const reason = error instanceof Error ? error.name : 'unknown';
        console.error(`[ops-alert] Discord 알림 전송 실패 (${reason}).`);
        return false;
    }
}
