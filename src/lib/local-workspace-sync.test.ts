import { describe, expect, it } from 'vitest';
import { getWorkspaceSyncRetryDelay } from '@/lib/local-workspace-sync';

describe('local workspace sync retry', () => {
    it('backs off retries and caps them at one hour', () => {
        expect(getWorkspaceSyncRetryDelay(1)).toBe(5_000);
        expect(getWorkspaceSyncRetryDelay(2)).toBe(30_000);
        expect(getWorkspaceSyncRetryDelay(3)).toBe(120_000);
        expect(getWorkspaceSyncRetryDelay(4)).toBe(600_000);
        expect(getWorkspaceSyncRetryDelay(5)).toBe(3_600_000);
        expect(getWorkspaceSyncRetryDelay(100)).toBe(3_600_000);
    });
});
