import { LockKeyhole } from 'lucide-react';

export function LocalDataPrivacyNotice({
    isAccountStorage = false,
}: {
    isAccountStorage?: boolean;
}) {
    return (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-[11px] leading-relaxed text-emerald-800">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
                {isAccountStorage ? (
                    <>
                        <strong className="font-black">계정 저장을 사용 중이에요.</strong>{' '}
                        입력한 실적과 개인 설정은 계정 복원을 위해 서버 저장 공간으로
                        전송될 수 있으며, 추천 계산은 이 기기에서 이루어집니다.
                    </>
                ) : (
                    <>
                        <strong className="font-black">내 기기에서만 안전하게 처리해요.</strong>{' '}
                        입력한 실적과 개인 설정은 현재 기기의 이 브라우저에 저장되고,
                        추천 계산도 기기 안에서 이루어집니다. 계정 백업·동기화를 직접 켜기
                        전에는 서버로 전송되지 않습니다.
                    </>
                )}
            </p>
        </div>
    );
}
