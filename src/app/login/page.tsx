import Link from 'next/link';

type LoginPageProps = {
    searchParams: Promise<{
        signup?: string | string[];
        error?: string | string[];
    }>;
};

const ERROR_MESSAGES: Record<string, string> = {
    invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
    invalid_email: '올바른 이메일 주소를 입력해주세요.',
    invalid_form: '이메일과 비밀번호를 다시 확인해주세요.',
    email_not_verified: '이메일 인증을 완료한 뒤 로그인해주세요.',
    login_disabled: '현재 이메일·비밀번호 로그인을 사용할 수 없습니다.',
    session_failed: '로그인 세션을 만들지 못했습니다. 잠시 후 다시 시도해주세요.',
    origin_not_allowed: '현재 접속 주소가 인증 서버에 허용되지 않았습니다. 관리자에게 알려주세요.',
    rate_limited: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    server_error: '로그인 서버를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.',
};

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const params = await searchParams;
    const errorCode = firstValue(params.error);
    const signupProcessed = firstValue(params.signup) === 'processed';
    const signupEnabled = process.env.ALLOW_SIGN_UP === 'true';

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-gray-900">로그인</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        여러 기기에서 사용할 때만 계정으로 로그인하세요.
                    </p>
                </div>

                <form
                    className="mt-8 space-y-6"
                    method="post"
                    action="/auth/login"
                    encType="application/x-www-form-urlencoded"
                >
                    <div className="space-y-4">
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
                                autoComplete="current-password"
                                required
                                minLength={8}
                                maxLength={128}
                                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="비밀번호"
                            />
                        </div>
                    </div>

                    {signupProcessed && (
                        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700">
                            회원가입이 완료되었습니다. 등록한 이메일과 비밀번호로 로그인해주세요.
                        </p>
                    )}

                    {errorCode && (
                        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-600">
                            {ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.invalid_credentials}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        로그인
                    </button>

                    <Link
                        href="/"
                        className="flex w-full justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        로그인 없이 계속
                    </Link>

                    <p className="rounded-lg bg-blue-50 px-3 py-2 text-center text-xs leading-relaxed text-blue-700">
                        로그인해도 이 기기 데이터를 그대로 사용합니다. 로그인 후 설정에서 계정 백업 또는 빈 기기 복원을 선택할 수 있습니다.
                    </p>

                    <div className="text-center text-sm">
                        {signupEnabled ? (
                            <>
                                <span className="text-gray-600">계정이 없나요? </span>
                                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
                                    회원가입
                                </Link>
                            </>
                        ) : (
                            <span className="text-gray-500">현재 신규 회원가입이 닫혀 있습니다.</span>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
