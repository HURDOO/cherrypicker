import { redirect } from 'next/navigation';

// First setup no longer asks for favorites. Old links continue at benefits.
export default function SetupFavoritesPage() {
    redirect('/setup/benefits');
}
