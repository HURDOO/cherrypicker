import React from 'react';
import * as Icons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface Props extends LucideProps {
    name: string;
}

export const IconByName: React.FC<Props> = ({ name, ...props }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconComponent = (Icons as any)[name];

    if (!IconComponent) {
        return <Icons.HelpCircle {...props} />;
    }

    return <IconComponent {...props} />;
};
