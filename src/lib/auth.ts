import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth/minimal';
import { db } from '@/db';
import * as schema from '@/db/schema';

export const auth = betterAuth({
    appName: 'Cherry Picker',
    database: drizzleAdapter(db, {
        provider: 'sqlite',
        schema,
    }),
    emailAndPassword: {
        enabled: true,
        disableSignUp: process.env.ALLOW_SIGN_UP !== 'true',
        minPasswordLength: 8,
        autoSignIn: false,
    },
    advanced: {
        database: {
            generateId: 'uuid',
        },
    },
});
