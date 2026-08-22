import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth/minimal';
import { db } from '@/db';
import * as schema from '@/db/schema';

const authBaseURL = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL;

export const auth = betterAuth({
    appName: 'Cherry Picker',
    ...(authBaseURL && { baseURL: authBaseURL }),
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
    user: {
        deleteUser: {
            enabled: true,
        },
    },
    advanced: {
        database: {
            generateId: 'uuid',
        },
    },
});
