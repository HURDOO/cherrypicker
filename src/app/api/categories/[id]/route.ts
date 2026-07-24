import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { brands, categories } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { requiredString } from '@/lib/api-validation';
import { assertOwnedCategory } from '@/lib/data-access';
import { toCategory } from '@/lib/db-mappers';

export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;
        const input = await readJsonObject(request);

        assertOwnedCategory(id, user.id);
        const row = db.update(categories)
            .set({ name: requiredString(input, 'name', '카테고리 이름') })
            .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
            .returning()
            .get();

        if (!row) throw new HttpError(404, '카테고리를 찾을 수 없습니다.');
        return Response.json(toCategory(row));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;

        assertOwnedCategory(id, user.id);
        const child = db.select({ id: brands.id })
            .from(brands)
            .where(eq(brands.categoryId, id))
            .get();
        if (child) {
            throw new HttpError(409, '하위 브랜드를 먼저 삭제해주세요.');
        }

        db.delete(categories)
            .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
            .run();
        return new Response(null, { status: 204 });
    } catch (error) {
        return handleRouteError(error);
    }
}

