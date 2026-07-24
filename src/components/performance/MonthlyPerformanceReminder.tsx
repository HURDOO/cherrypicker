import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';

interface MonthlyPerformanceReminderProps {
    missingCount: number;
    performanceMonthLabel: string;
    benefitMonthLabel: string;
}

export function MonthlyPerformanceReminder({
    missingCount,
    performanceMonthLabel,
    benefitMonthLabel,
}: MonthlyPerformanceReminderProps) {
    if (missingCount === 0) return null;

    return (
        <aside className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm" aria-live="polite">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                    <CalendarClock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-black text-gray-900">
                            {performanceMonthLabel} 실적을 입력해 주세요
                        </h2>
                        <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            {missingCount}개 카드 미입력
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-900/70">
                        입력한 실적은 {benefitMonthLabel} 카드 혜택과 한도 계산에 반영됩니다.
                    </p>
                    <Link
                        href="/settings#performance"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-black text-amber-800 transition-colors hover:text-amber-950"
                    >
                        실적 입력하기
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
        </aside>
    );
}
