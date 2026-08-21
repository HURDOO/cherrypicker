export type StructuredChangeKind = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface StructuredFieldChange {
    path: string;
    kind: StructuredChangeKind;
    before?: unknown;
    after?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        const normalized = value.map(canonicalize);
        if (normalized.every(item => (
            item === null || ['boolean', 'number', 'string'].includes(typeof item)
        ))) {
            return normalized.sort((left, right) => (
                JSON.stringify(left).localeCompare(JSON.stringify(right))
            ));
        }
        return normalized;
    }
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .filter(key => value[key] !== undefined)
        .map(key => [key, canonicalize(value[key])]));
};

const isEqual = (left: unknown, right: unknown) => (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
);

const withValue = (key: 'before' | 'after', value: unknown) => (
    value === undefined ? {} : { [key]: canonicalize(value) }
);

export function diffStructuredValues(
    before: unknown,
    after: unknown,
    basePath = '',
): StructuredFieldChange[] {
    if (isEqual(before, after)) return [];
    if (before === undefined) {
        return [{ path: basePath, kind: 'ADDED', ...withValue('after', after) }];
    }
    if (after === undefined) {
        return [{ path: basePath, kind: 'REMOVED', ...withValue('before', before) }];
    }
    if (isRecord(before) && isRecord(after)) {
        return [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .sort()
            .flatMap(key => diffStructuredValues(
                before[key],
                after[key],
                basePath ? `${basePath}.${key}` : key,
            ));
    }
    return [{
        path: basePath,
        kind: 'CHANGED',
        ...withValue('before', before),
        ...withValue('after', after),
    }];
}
