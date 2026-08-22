import { AlertCircle, ExternalLink, FileCheck2 } from 'lucide-react';
import clsx from 'clsx';
import type { CatalogCardBenefitSupport } from '@/types';

const formatVerifiedAt = (value?: string) => {
    if (!value) return '공식 검수 기록 없음';
    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeZone: 'Asia/Seoul',
    }).format(new Date(value));
};

export function CardBenefitSupportCard({
    cardName,
    support,
}: {
    cardName: string;
    support: CatalogCardBenefitSupport;
}) {
    const reviewed = support.reviewStatus === 'REVIEWED';
    const fullSupport = support.supportScope === 'FULL';

    return (
        <section
            data-testid="card-benefit-support"
            className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
        >
            <div className="flex items-start gap-3">
                <div className={clsx(
                    'rounded-xl p-2',
                    reviewed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700',
                )}>
                    {reviewed
                        ? <FileCheck2 className="h-4 w-4" />
                        : <AlertCircle className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xs font-black text-slate-900">카드 혜택 정보</h2>
                        <span className={clsx(
                            'rounded-full px-2 py-0.5 text-[9px] font-black',
                            reviewed
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700',
                        )}>
                            {reviewed ? '공식 원문 검수' : '전체 검수 전'}
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] font-black text-slate-800">{cardName}</p>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[10px] leading-relaxed">
                        <dt className="font-black text-slate-500">지원 범위</dt>
                        <dd className="font-bold text-slate-800">
                            {fullSupport ? '공식 원문 기준 전체 구조화' : '주요 혜택 일부 반영'}
                        </dd>
                        <dt className="font-black text-slate-500">마지막 확인</dt>
                        <dd className="font-bold text-slate-800">
                            {formatVerifiedAt(support.lastVerifiedAt)}
                        </dd>
                    </dl>

                    {support.sources.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {support.sources.map(source => (
                                <a
                                    key={source.url}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-blue-700"
                                >
                                    {source.label}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-[10px] font-bold text-slate-500">
                            공식 출처 연결을 준비하고 있습니다.
                        </p>
                    )}

                    {support.caveats.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                            {support.caveats.map(caveat => (
                                <li
                                    key={caveat}
                                    className="flex gap-1.5 text-[10px] font-bold leading-relaxed text-slate-600"
                                >
                                    <span aria-hidden="true">•</span>
                                    <span>{caveat}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}
