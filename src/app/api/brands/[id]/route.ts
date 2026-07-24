import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { benefitRules, brands } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { optionalString, requiredString } from '@/lib/api-validation';
import {
    assertOwnedBrand,
    assertVisibleCategory,
    visibleToUser,
} from '@/lib/data-access';
import { toBrand } from '@/lib/db-mappers';

export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;
        const input = await readJsonObject(request);
        const categoryId = optionalString(input, 'categoryId', '카테고리 ID');

        assertOwnedBrand(id, user.id);
        if (categoryId) assertVisibleCategory(categoryId, user.id);

        const row = db.update(brands)
            .set({
                name: requiredString(input, 'name', '브랜드 이름'),
                ...(categoryId && { categoryId }),
            })
            .where(and(eq(brands.id, id), eq(brands.userId, user.id)))
            .returning()
            .get();

        if (!row) throw new HttpError(404, '브랜드를 찾을 수 없습니다.');
        return Response.json(toBrand(row));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;

        assertOwnedBrand(id, user.id);
        const linkedRules = db.select({
            includedBrands: benefitRules.includedBrands,
            excludedBrands: benefitRules.excludedBrands,
        })
            .from(benefitRules)
            .where(visibleToUser(benefitRules.userId, user.id))
            .all();
        const isLinked = linkedRules.some((rule) =>
            rule.includedBrands.includes(id) || rule.excludedBrands.includes(id)
        );

        if (isLinked) {
            throw new HttpError(409, '이 브랜드를 사용하는 혜택 연결을 먼저 해제해주세요.');
        }

        db.delete(brands)
            .where(and(eq(brands.id, id), eq(brands.userId, user.id)))
            .run();
        return new Response(null, { status: 204 });
    } catch (error) {
        return handleRouteError(error);
    }
}
