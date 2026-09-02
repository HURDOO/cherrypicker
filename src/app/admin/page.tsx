import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    ArrowLeft,
    ChevronRight,
    CreditCard,
    DatabaseZap,
    ShieldCheck,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { getAdminAccessMode } from '@/lib/admin-authorization-server';

export const dynamic = 'force-dynamic';

const adminTools = [
    {
        href: '/admin/promotions',
        title: '프로모션 운영센터',
        description: '브랜드 프로모션을 수집하고, 변경 후보를 검수해 공개 카탈로그에 반영합니다.',
        detail: '수집 · 검수 · 게시 · 출처 관리',
        icon: DatabaseZap,
        iconClass: 'bg-rose-100 text-rose-700',
    },
    {
        href: '/admin/card-benefits',
        title: '카드 혜택 카탈로그',
        description: '카드사 공식 원문과 구조화 결과를 비교하고 revision을 승인하거나 되돌립니다.',
        detail: '공식 원문 · AI 구조화 · 재검증 · 롤백',
        icon: CreditCard,
        iconClass: 'bg-blue-100 text-blue-700',
    },
] as const;

export default async function AdminPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/login');
    if (await getAdminAccessMode(session.user) === 'DENY') {
        redirect('/');
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-16">
            <header className="border-b border-gray-200 bg-white px-5 py-4">
                <div className="mx-auto flex max-w-5xl items-center gap-3">
                    <Link
                        href="/"
                        aria-label="서비스 홈으로 돌아가기"
                        className="rounded-xl bg-gray-100 p-2 text-gray-600 transition-colors hover:bg-gray-200"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-black text-gray-950">관리자 콘솔</h1>
                        <p className="text-[10px] font-bold text-gray-400">
                            Cherry Picker 운영 도구
                        </p>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl px-5 pt-8">
                <section className="overflow-hidden rounded-3xl bg-gray-950 px-6 py-7 text-white sm:px-8">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-white/10 p-3">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-rose-300">ADMIN</p>
                            <h2 className="mt-1 text-2xl font-black tracking-tight">운영할 기능을 선택하세요</h2>
                            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-gray-400">
                                수집 결과와 변경 후보를 확인한 뒤 공개 데이터에 반영할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mt-6 grid gap-4 md:grid-cols-2">
                    {adminTools.map(tool => {
                        const Icon = tool.icon;
                        return (
                            <Link
                                key={tool.href}
                                href={tool.href}
                                className="group rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className={`rounded-2xl p-3 ${tool.iconClass}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <ChevronRight className="mt-3 h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-600" />
                                </div>
                                <h2 className="mt-5 text-lg font-black text-gray-950">{tool.title}</h2>
                                <p className="mt-2 text-sm font-medium leading-relaxed text-gray-500">
                                    {tool.description}
                                </p>
                                <p className="mt-5 border-t border-gray-100 pt-4 text-[10px] font-black text-gray-400">
                                    {tool.detail}
                                </p>
                            </Link>
                        );
                    })}
                </section>
            </div>
        </main>
    );
}
