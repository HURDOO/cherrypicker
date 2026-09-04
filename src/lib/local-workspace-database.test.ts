import { describe, expect, it, vi } from 'vitest';
import { openLocalWorkspaceDatabase } from './local-workspace-database';

describe('local workspace database availability', () => {
    it('reports an actionable error when IndexedDB is unavailable', async () => {
        vi.stubGlobal('indexedDB', undefined);
        try {
            await expect(openLocalWorkspaceDatabase()).rejects.toThrow(
                '이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
