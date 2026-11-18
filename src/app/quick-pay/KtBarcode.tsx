'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function KtBarcode({ demo }: { demo: boolean }) {
    const userId = useAppStore(state => state.userId);
    const storageKey = 'quick-pay.kt-barcode.' + (demo ? 'demo' : userId);
    return <BarcodeImage key={storageKey} storageKey={storageKey} demo={demo} />;
}

function BarcodeImage({ storageKey, demo }: { storageKey: string; demo: boolean }) {
    const [image, setImage] = useState(() => {
        try { return sessionStorage.getItem(storageKey) || ''; }
        catch { return ''; }
    });
    const [message, setMessage] = useState('');
    const reader = useRef<FileReader | null>(null);

    useEffect(() => () => reader.current?.abort(), []);

    const save = (value: string) => {
        setImage(value);
        try {
            if (value) sessionStorage.setItem(storageKey, value);
            else sessionStorage.removeItem(storageKey);
        } catch {
            setMessage('이 화면에서만 표시할 수 있어요.');
        }
    };

    return (
        <div className="mt-3">
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- locally selected original barcode image
                <img src={image} alt="내 KT멤버십 바코드" className="mx-auto max-h-72 w-full object-contain bg-white" />
            ) : demo && (
                <div className="bg-white px-5 py-3 text-center" aria-label="KT멤버십 바코드 예시">
                    <div aria-hidden="true" className="mx-auto h-14 max-w-64" style={{
                        background: 'repeating-linear-gradient(90deg,#171717 0 2px,white 2px 5px,#171717 5px 6px,white 6px 8px,#171717 8px 12px,white 12px 15px)',
                    }} />
                    <span className="text-xs font-bold text-slate-600">예시 바코드 · 스캔 불가</span>
                </div>
            )}
            <label className="relative inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-rose-800 underline">
                {image ? '바코드 이미지 변경' : '내 KT 바코드 이미지 선택'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="absolute inset-0 w-full cursor-pointer opacity-0"
                    onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        reader.current?.abort();
                        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3_000_000) {
                            setMessage('3MB 이하의 PNG, JPG, WebP 이미지를 선택하세요.');
                            return;
                        }
                        setMessage('');
                        const next = new FileReader();
                        reader.current = next;
                        next.onload = () => save(String(next.result));
                        next.onerror = () => setMessage('이미지를 읽을 수 없어요.');
                        next.readAsDataURL(file);
                    }} />
            </label>
            {image && <button type="button" onClick={() => { setMessage(''); save(''); }} className="ml-4 text-sm text-slate-600">지우기</button>}
            <p className="text-xs text-slate-600" role="status">{message || '선택한 이미지는 이 브라우저 탭에만 보관해요.'}</p>
        </div>
    );
}
