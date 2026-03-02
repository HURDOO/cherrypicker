import React from 'react';
import { Delete } from 'lucide-react';
import clsx from 'clsx';

interface NumericKeypadProps {
    onValueChange: (value: string) => void;
    onDelete: () => void;
    className?: string; // Additional styling
}

export function NumericKeypad({ onValueChange, onDelete, className }: NumericKeypadProps) {
    const keys = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        '00', '0', 'del'
    ];

    return (
        <div className={clsx("grid grid-cols-3 gap-3 p-4", className)}>
            {keys.map((key) => {
                if (key === 'del') {
                    return (
                        <button
                            key={key}
                            onClick={onDelete}
                            className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-2xl h-16 flex items-center justify-center transition-colors duration-150"
                            aria-label="Delete"
                        >
                            <Delete className="w-6 h-6 text-gray-600" />
                        </button>
                    );
                }
                return (
                    <button
                        key={key}
                        onClick={() => onValueChange(key)}
                        className="bg-white hover:bg-gray-50 active:bg-gray-100 rounded-2xl h-16 text-2xl font-bold text-gray-900 shadow-sm border border-gray-100 transition-all duration-150 active:scale-95"
                    >
                        {key}
                    </button>
                );
            })}
        </div>
    );
}
