import Link from 'next/link';

type SignupPageProps = {
    searchParams: Promise<{
        error?: string | string[];
    }>;
};

const ERROR_MESSAGES: Record<string, string> = {
    email_exists: '이미 사용 중인 이메일입니다. 로그인해주세요.',
    invalid_email: '올바른 이메일 주소를 입력해주세요.',
    invalid_form: '이름, 이메일, 비밀번호를 다시 확인해주세요.',
    password_too_short: '비밀번호는 8자 이상이어야 합니다.',
    password_too_long: '비밀번호는 128자 이하여야 합니다.',
    rate_limited: '회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    signup_closed: '현재 신규 회원가입이 닫혀 있습니다.',
    origin_not_allowed: '현재 접속 주소가 인증 서버에 허용되지 않았습니다. 관리자에게 알려주세요.',
    account_creation_failed: '계정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
    signup_failed: '회원가입을 완료하지 못했습니다. 입력값을 확인해주세요.',
    server_error: '회원가입 서버를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.',
};

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
    const params = await searchParams;
    const errorCode = firstValue(params.error);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-gray-900">회원가입</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        계정은 선택 사항입니다. 가입 완료 후 로그인할 수 있습니다.
                    </p>
                </div>

                <form
                    className="mt-8 space-y-6"
                    method="post"
                    action="/auth/signup"
                    encType="application/x-www-form-urlencoded"
                >
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="name" className="sr-only">이름</label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                autoComplete="name"
                                required
                                maxLength={100}
                                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="이름"
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="sr-only">이메일</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={320}
                                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="이메일"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">비밀번호</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                maxLength={128}
                                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="비밀번호 (8자 이상)"
                            />
                        </div>
                    </div>

                    {errorCode && (
                        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-600">
                            {ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.signup_failed}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        회원가입
                    </button>

                    <Link
                        href="/"
                        className="flex w-full justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        로그인 없이 계속
                    </Link>

                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-center text-xs leading-relaxed text-blue-700">
                        가입·로그인 후에도 이 기기 데이터를 유지하며, 빈 계정에 안전하게 백업할 수 있습니다.
                    </p>

                    <div className="text-center text-sm">
                        <span className="text-gray-600">이미 계정이 있나요? </span>
                        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                            로그인
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
