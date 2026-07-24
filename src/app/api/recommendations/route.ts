import { handleRouteError, readJsonObject, requireUser } from '@/lib/api-server';
import { booleanValue, optionalInteger, requiredInteger, requiredString } from '@/lib/api-validation';
import { calculateRecommendationForUser } from '@/lib/recommendation-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const amount = requiredInteger(input, 'amount', '결제 금액', 1, 1_000_000_000_000);
        const eligibleItemAmount = optionalInteger(
            input,
            'eligibleItemAmount',
            '혜택 대상 상품 금액',
            0,
            amount,
        );
        const confirmedConditionIds = Array.isArray(input.confirmedConditionIds)
            ? input.confirmedConditionIds.filter(
                (value): value is string => typeof value === 'string'
            )
            : [];

        const result = calculateRecommendationForUser(user.id, {
            brandId: requiredString(input, 'brandId', '브랜드 ID'),
            amount,
            ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
            isOnline: booleanValue(input, 'isOnline', false),
            confirmedConditionIds,
        });

        return Response.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
