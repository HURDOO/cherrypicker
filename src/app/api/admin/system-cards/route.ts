import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireAdmin,
} from '@/lib/api-server';
import {
    createSystemCardDraft,
    createSystemCardDraftBatch,
    getSystemCardOnboardingData,
    parseSystemCardDraftInput,
    parseSystemCardDraftBatchInput,
    SystemCardOnboardingError,
    updateSystemCardDraft,
} from '@/lib/system-card-onboarding';

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
        return Response.json(getSystemCardOnboardingData());
    } catch (error) {
        return routeError(error);
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin(request);
        const body = await readJsonObject(request);
        if (Array.isArray(body.cards)) {
            const inputs = parseSystemCardDraftBatchInput(body);
            return Response.json({ cards: createSystemCardDraftBatch(inputs) }, { status: 201 });
        }
        const input = parseSystemCardDraftInput(body);
        return Response.json(createSystemCardDraft(input), { status: 201 });
    } catch (error) {
        return routeError(error);
    }
}

export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const input = parseSystemCardDraftInput(await readJsonObject(request));
        return Response.json(updateSystemCardDraft(input));
    } catch (error) {
        return routeError(error);
    }
}
