import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { promotionProviders, userBenefitProfiles } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { booleanValue, optionalInteger, stringArray } from '@/lib/api-validation';
import { toBenefitProfile, toPromotionProvider } from '@/lib/db-mappers';
import type { TelecomMembership } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const user = await requireUser(request);
        const profile = db.select().from(userBenefitProfiles)
            .where(eq(userBenefitProfiles.userId, user.id))
            .get();
        const providers = db.select().from(promotionProviders)
            .where(eq(promotionProviders.isActive, true))
            .orderBy(asc(promotionProviders.sortOrder))
            .all();

        return Response.json({
            profile: toBenefitProfile(profile),
            providers: providers.map(toPromotionProvider),
        });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function PUT(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const enabledPayProviderIds = stringArray(
            input,
            'enabledPayProviderIds',
            '사용 페이'
        );
        const rawTelecom = input.telecomMemberships;
        if (!Array.isArray(rawTelecom) || rawTelecom.length > 3) {
            throw new HttpError(400, '통신사 멤버십 형식이 올바르지 않습니다.');
        }
        const telecomMemberships: TelecomMembership[] = rawTelecom.map(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new HttpError(400, '통신사 멤버십 형식이 올바르지 않습니다.');
            }
            const row = item as Record<string, unknown>;
            if (typeof row.providerId !== 'string' || !row.providerId.trim()) {
                throw new HttpError(400, '통신사 멤버십 제공자를 선택해주세요.');
            }
            if (row.tier !== undefined && typeof row.tier !== 'string') {
                throw new HttpError(400, '멤버십 등급 형식이 올바르지 않습니다.');
            }
            return {
                providerId: row.providerId.trim(),
                ...(row.tier && { tier: String(row.tier).trim().slice(0, 100) }),
            };
        });
        const providerIds = [...new Set([
            ...enabledPayProviderIds,
            ...telecomMemberships.map(item => item.providerId),
        ])];
        if (providerIds.length > 0) {
            const existing = db.select({ id: promotionProviders.id })
                .from(promotionProviders)
                .where(inArray(promotionProviders.id, providerIds))
                .all();
            if (existing.length !== providerIds.length) {
                throw new HttpError(400, '존재하지 않는 혜택 제공자가 포함되어 있습니다.');
            }
        }
        const pointValue = optionalInteger(input, 'pointValue', '포인트 가치', 0, 100) ?? 1;
        const values = {
            userId: user.id,
            telecomMemberships,
            enabledPayProviderIds,
            moneyEnabled: booleanValue(input, 'moneyEnabled', true),
            pointsEnabled: booleanValue(input, 'pointsEnabled', true),
            pointValue,
            updatedAt: new Date(),
        };
        const row = db.insert(userBenefitProfiles)
            .values(values)
            .onConflictDoUpdate({
                target: userBenefitProfiles.userId,
                set: values,
            })
            .returning()
            .get();

        return Response.json(toBenefitProfile(row));
    } catch (error) {
        return handleRouteError(error);
    }
}
