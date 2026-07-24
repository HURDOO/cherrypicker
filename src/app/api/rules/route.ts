import { db } from '@/db';
import { benefitRules } from '@/db/schema';
import { handleRouteError, readJsonObject, requireUser } from '@/lib/api-server';
import { toRule } from '@/lib/db-mappers';
import { parseRuleInput } from '@/lib/rule-input';
import { assertCanCreateRule } from '@/lib/data-access';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        assertCanCreateRule(user.id);
        const row = db.insert(benefitRules)
            .values({
                id: crypto.randomUUID(),
                userId: user.id,
                ...parseRuleInput(input, user.id),
            })
            .returning()
            .get();

        return Response.json(toRule(row), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}
