'use client';

import Image from 'next/image';
import { useState } from 'react';
import clsx from 'clsx';
import type { Brand } from '@/types';
import { getBrandLogoUrl, getBrandMonogram } from './brandVisuals';

interface BrandLogoProps {
    brand: Pick<Brand, 'id' | 'name'>;
    className?: string;
    imageClassName?: string;
}

export function BrandLogo({
    brand,
    className,
    imageClassName,
}: BrandLogoProps) {
    const [imageFailed, setImageFailed] = useState(false);
    const logoUrl = getBrandLogoUrl(brand);

    return (
        <span
            className={clsx(
                'relative flex items-center justify-center overflow-hidden bg-gray-100 text-xs font-black text-gray-500',
                className
            )}
            aria-hidden="true"
        >
            {getBrandMonogram(brand.name)}
            {logoUrl && !imageFailed && (
                <Image
                    src={logoUrl}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    onError={() => setImageFailed(true)}
                    className={clsx(
                        'absolute inset-0 h-full w-full bg-white object-contain',
                        imageClassName
                    )}
                />
            )}
        </span>
    );
}
