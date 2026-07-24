import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { benefitRules } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { assertOwnedRule } from '@/lib/data-access';
import { toRule } from '@/lib/db-mappers';
import { parseRuleInput } from '@/lib/rule-input';

export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;
        const input = await readJsonObject(request);

        assertOwnedRule(id, user.id);
        const row = db.update(benefitRules)
            .set(parseRuleInput(input, user.id))
            .where(and(eq(benefitRules.id, id), eq(benefitRules.userId, user.id)))
            .returning()
            .get();

        if (!row) throw new HttpError(404, '혜택 규칙을 찾을 수 없습니다.');
        return Response.json(toRule(row));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;

        assertOwnedRule(id, user.id);
        db.delete(benefitRules)
            .where(and(eq(benefitRules.id, id), eq(benefitRules.userId, user.id)))
            .run();

        return new Response(null, { status: 204 });
    } catch (error) {
        return handleRouteError(error);
    }
}

