'use client';

export const LOCAL_WORKSPACE_DATABASE_NAME = 'cherrypicker-workspace';
export const LOCAL_WORKSPACE_DATABASE_VERSION = 2;
export const LOCAL_WORKSPACE_STORE_NAME = 'workspace';
export const LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME = 'sync-state';
export const LOCAL_WORKSPACE_OUTBOX_STORE_NAME = 'sync-outbox';

export const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청에 실패했습니다.'));
});

export const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
        transaction.error ?? new Error('IndexedDB transaction이 취소되었습니다.')
    );
    transaction.onerror = () => reject(
        transaction.error ?? new Error('IndexedDB transaction에 실패했습니다.')
    );
});

export const openLocalWorkspaceDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
        return;
    }

    const request = indexedDB.open(
        LOCAL_WORKSPACE_DATABASE_NAME,
        LOCAL_WORKSPACE_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCAL_WORKSPACE_STORE_NAME)) {
            database.createObjectStore(LOCAL_WORKSPACE_STORE_NAME, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME)) {
            database.createObjectStore(
                LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
                { keyPath: 'key' },
            );
        }
        if (!database.objectStoreNames.contains(LOCAL_WORKSPACE_OUTBOX_STORE_NAME)) {
            const outbox = database.createObjectStore(
                LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
                { keyPath: 'operationId' },
            );
            outbox.createIndex('createdAt', 'createdAt');
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
        request.error ?? new Error('로컬 workspace 저장소를 열지 못했습니다.')
    );
    request.onblocked = () => reject(
        new Error('다른 탭이 로컬 workspace 저장소 갱신을 막고 있습니다.')
    );
});
