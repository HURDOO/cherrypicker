'use client';

import { useState } from 'react';
import { AlertTriangle, Database, LogOut, Trash2, X } from 'lucide-react';

export type AccountLifecycleMode = 'sign-out' | 'delete-account';
export type LocalDataChoice = 'keep' | 'delete';

export interface AccountLifecycleSelection {
    localDataChoice: LocalDataChoice;
    password: string;
}

interface AccountLifecycleDialogProps {
    mode: AccountLifecycleMode;
    accountEmail: string;
    isWorking: boolean;
    onClose: () => void;
    onConfirm: (selection: AccountLifecycleSelection) => void;
}

export function AccountLifecycleDialog({
    mode,
    accountEmail,
    isWorking,
    onClose,
    onConfirm,
}: AccountLifecycleDialogProps) {
    const [localDataChoice, setLocalDataChoice] = useState<LocalDataChoice>('keep');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const isAccountDeletion = mode === 'delete-account';
    const requiredPhrase = isAccountDeletion
        ? '계정 삭제'
        : localDataChoice === 'delete' ? '기기 데이터 삭제' : '';
    const canConfirm = (
        (!isAccountDeletion || password.length >= 8) &&
        (!requiredPhrase || confirmation === requiredPhrase)
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
            role="presentation"
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-lifecycle-title"
                className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="account-lifecycle-title" className="text-base font-black text-gray-950">
                            {isAccountDeletion ? '계정 삭제' : '로그아웃'}
                        </h2>
                        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                            {accountEmail}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isWorking}
                        aria-label="닫기"
                        className="rounded-full p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {isAccountDeletion && (
                    <div className="mt-4 flex gap-2 rounded-2xl bg-rose-50 px-3 py-3 text-[11px] leading-relaxed text-rose-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        계정 백업과 로그인 정보가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                    </div>
                )}

                <fieldset className="mt-4 space-y-2">
                    <legend className="mb-2 text-xs font-black text-gray-800">
                        이 기기의 개인 데이터
                    </legend>
                    <button
                        type="button"
                        onClick={() => {
                            setLocalDataChoice('keep');
                            if (!isAccountDeletion) setConfirmation('');
                        }}
                        disabled={isWorking}
                        aria-pressed={localDataChoice === 'keep'}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left ${
                            localDataChoice === 'keep'
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 bg-white'
                        }`}
                    >
                        <Database className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span>
                            <strong className="block text-xs text-gray-900">이 기기에 유지</strong>
                            <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">
                                동기화 연결만 해제합니다. 나중에 다른 계정으로 백업하거나 JSON으로 내보낼 수 있습니다.
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setLocalDataChoice('delete')}
                        disabled={isWorking}
                        aria-pressed={localDataChoice === 'delete'}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left ${
                            localDataChoice === 'delete'
                                ? 'border-rose-500 bg-rose-50'
                                : 'border-gray-200 bg-white'
                        }`}
                    >
                        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <span>
                            <strong className="block text-xs text-gray-900">이 기기에서도 완전 삭제</strong>
                            <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">
                                프로필·카드·실적·결제 기록과 삭제 흔적을 지우고 새 workspace를 만듭니다.
                            </span>
                        </span>
                    </button>
                </fieldset>

                {isAccountDeletion && (
                    <label className="mt-4 block text-xs font-bold text-gray-700">
                        현재 비밀번호
                        <input
                            type="password"
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            autoComplete="current-password"
                            disabled={isWorking}
                            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-rose-400"
                        />
                    </label>
                )}

                {requiredPhrase && (
                    <label className="mt-4 block text-xs font-bold text-gray-700">
                        확인을 위해 <strong className="text-rose-600">{requiredPhrase}</strong> 입력
                        <input
                            type="text"
                            value={confirmation}
                            onChange={event => setConfirmation(event.target.value)}
                            disabled={isWorking}
                            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-rose-400"
                        />
                    </label>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isWorking}
                        className="rounded-xl bg-gray-100 px-4 py-3 text-xs font-black text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm({ localDataChoice, password })}
                        disabled={isWorking || !canConfirm}
                        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                            isAccountDeletion || localDataChoice === 'delete'
                                ? 'bg-rose-600 hover:bg-rose-700'
                                : 'bg-gray-900 hover:bg-gray-800'
                        }`}
                    >
                        {isAccountDeletion
                            ? <Trash2 className="h-4 w-4" />
                            : <LogOut className="h-4 w-4" />}
                        {isWorking
                            ? '처리 중...'
                            : isAccountDeletion ? '계정 영구 삭제' : '로그아웃'}
                    </button>
                </div>
            </section>
        </div>
    );
}
