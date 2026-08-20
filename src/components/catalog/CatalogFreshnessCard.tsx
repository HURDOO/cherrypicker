'use client';

import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    LoaderCircle,
    RefreshCw,
    Wifi,
    WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import type {
    BenefitCatalogHealth,
    BenefitCatalogHealthStatus,
} from '@/lib/benefit-catalog-freshness';

const statusMeta: Record<BenefitCatalogHealthStatus, {
    title: string;
    icon: typeof Wifi;
    color: string;
    iconColor: string;
}> = {
    loading: {
        title: '혜택 정보 불러오는 중',
        icon: LoaderCircle,
        color: 'border-blue-100 bg-blue-50/80',
        iconColor: 'text-blue-600',
    },
    fresh: {
        title: '혜택 정보 최신',
        icon: CheckCircle2,
        color: 'border-emerald-100 bg-emerald-50/80',
        iconColor: 'text-emerald-600',
    },
    refreshing: {
        title: '최신 혜택 확인 중',
        icon: RefreshCw,
        color: 'border-blue-100 bg-blue-50/80',
        iconColor: 'text-blue-600',
    },
    offline: {
        title: '오프라인 · 저장본 사용 중',
        icon: WifiOff,
        color: 'border-gray-200 bg-gray-100/80',
        iconColor: 'text-gray-600',
    },
    stale: {
        title: '혜택 정보 갱신 필요',
        icon: Clock3,
        color: 'border-amber-200 bg-amber-50/90',
        iconColor: 'text-amber-700',
    },
    degraded: {
        title: '혜택 정보 일부 갱신 실패',
        icon: AlertTriangle,
        color: 'border-amber-200 bg-amber-50/90',
        iconColor: 'text-amber-700',
    },
    unknown: {
        title: '수집 상태 확인 필요',
        icon: AlertTriangle,
        color: 'border-amber-200 bg-amber-50/90',
        iconColor: 'text-amber-700',
    },
    unavailable: {
        title: '혜택 정보를 사용할 수 없음',
        icon: AlertTriangle,
        color: 'border-rose-200 bg-rose-50/90',
        iconColor: 'text-rose-700',
    },
};

const formatTimestamp = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

function getDescription(health: BenefitCatalogHealth) {
    if (health.status === 'offline') {
        return health.isStale
            ? '저장된 혜택이 오래됐어요. 연결되면 자동으로 다시 확인합니다.'
            : '계산과 기록은 계속할 수 있고, 연결되면 자동으로 갱신합니다.';
    }
    if (health.status === 'degraded') {
        const failed = health.failedSourceCount ?? 0;
        const total = health.sourceCount ?? 0;
        return total > 0
            ? `${total}개 출처 중 ${failed}개를 갱신하지 못했습니다.`
            : '최신 정보 확인에 실패해 마지막 정상 데이터를 사용합니다.';
    }
    if (health.status === 'stale') {
        return '마지막 전체 수집 성공 후 36시간이 지났습니다.';
    }
    if (health.status === 'unknown') {
        return '아직 서버의 수집 성공 이력이 없습니다.';
    }
    if (health.status === 'unavailable') {
        return '저장된 데이터도 없어 혜택 계산을 시작할 수 없습니다.';
    }
    if (health.status === 'loading' || health.status === 'refreshing') {
        return '서버에서 최신 버전을 확인하고 있습니다.';
    }
    return `${health.sourceCount ?? 0}개 출처의 마지막 전체 수집이 정상 완료됐습니다.`;
}

export function CatalogFreshnessCard({
    health,
    isOnline,
    isRefreshing,
    lastCheckedAt,
    catalogVersion,
    error,
    cacheWarning,
    onRefresh,
}: {
    health: BenefitCatalogHealth;
    isOnline: boolean;
    isRefreshing: boolean;
    lastCheckedAt?: string;
    catalogVersion?: string;
    error?: Error | null;
    cacheWarning?: Error | null;
    onRefresh: () => Promise<void>;
}) {
    const meta = statusMeta[health.status];
    const Icon = meta.icon;
    const successfulAt = formatTimestamp(health.lastSuccessfulAt);
    const checkedAt = formatTimestamp(lastCheckedAt);

    return (
        <section className={clsx('rounded-3xl border p-4', meta.color)} aria-live="polite">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/80">
                    <Icon className={clsx(
                        'h-4 w-4',
                        meta.iconColor,
                        (health.status === 'loading' || health.status === 'refreshing') &&
                            'animate-spin'
                    )} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-black text-gray-900">{meta.title}</p>
                            <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-600">
                                {getDescription(health)}
                            </p>
                        </div>
                        {isOnline && (
                            <button
                                type="button"
                                onClick={() => void onRefresh()}
                                disabled={isRefreshing}
                                className="flex shrink-0 items-center gap-1 rounded-full border border-white/90 bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-gray-700 disabled:opacity-50"
                            >
                                <RefreshCw className={clsx(
                                    'h-3 w-3',
                                    isRefreshing && 'animate-spin'
                                )} />
                                다시 확인
                            </button>
                        )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold text-gray-500">
                        <span className="inline-flex items-center gap-1">
                            {isOnline
                                ? <Wifi className="h-3 w-3" />
                                : <WifiOff className="h-3 w-3" />}
                            {isOnline ? '네트워크 연결됨' : '네트워크 끊김'}
                        </span>
                        {successfulAt && <span>수집 성공 {successfulAt}</span>}
                        {checkedAt && <span>기기 확인 {checkedAt}</span>}
                        {catalogVersion && <span>버전 {catalogVersion.slice(0, 8)}</span>}
                    </div>
                    {error && health.status !== 'offline' && (
                        <p className="mt-2 text-[9px] font-bold text-rose-700">{error.message}</p>
                    )}
                    {cacheWarning && (
                        <p className="mt-2 text-[9px] font-bold text-amber-800">
                            기기 저장에 실패해 현재 탭에서만 최신 정보를 사용합니다.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
