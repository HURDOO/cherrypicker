import { Sparkles } from 'lucide-react';

export function ContestDemoBanner() {
    return (
        <section
            aria-label="공모전용 데모 안내"
            className="overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-rose-50 p-4 shadow-sm"
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                    <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-gray-900">공모전용 데모</p>
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-700">
                            바로 체험 가능
                        </span>
                    </div>
                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-600">
                        카드 실적과 T멤버십·Npay·T우주 혜택이 미리 입력되어 있어요.
                    </p>
                    <p className="mt-2 rounded-2xl bg-white/80 px-3 py-2 text-[10px] font-black leading-relaxed text-violet-800 ring-1 ring-violet-100">
                        아래 ‘바로 찾기’ 브랜드를 누르고 결제금액 10,000원을 입력해보세요.
                    </p>
                </div>
            </div>
        </section>
    );
}
