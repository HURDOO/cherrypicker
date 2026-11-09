import type { Metadata } from 'next';
import InstallGuide from '@/components/install/InstallGuide';

export const metadata: Metadata = {
    title: '앱으로 설치하기 · Cherry Picker',
};

export default function InstallPage() {
    return <InstallGuide />;
}
