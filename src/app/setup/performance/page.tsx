import { redirect } from 'next/navigation';

// The performance question moved into the card step. Old links continue at benefits.
export default function SetupPerformancePage() {
    redirect('/setup/benefits');
}
