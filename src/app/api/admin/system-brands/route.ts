import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireAdmin,
} from '@/lib/api-server';
import {
    createSystemBrandDraftBatch,
    getSystemBrandRegistryData,
    parseSystemBrandDraftBatchInput,
} from '@/lib/system-brand-registry';
import { SystemCardOnboardingError } from '@/lib/system-card-onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routeError = (error: unknown) => handleRouteError(
    error instanceof SystemCardOnboardingError
        ? new HttpError(error.status, error.message)
        : error,
);

export async function GET(request: Request) {
    try {
        await requireAdmin(request);
        return Response.json(getSystemBrandRegistryData());
    } catch (error) {
        return routeError(error);
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin(request);
        const input = parseSystemBrandDraftBatchInput(await readJsonObject(request));
        return Response.json({ brands: createSystemBrandDraftBatch(input) }, { status: 201 });
    } catch (error) {
        return routeError(error);
    }
}
