import { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

export const authOptions: NextAuthOptions = {
    providers: [
        KeycloakProvider({
            clientId: process.env.KEYCLOAK_CLIENT_ID || "yaip-backend",
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "change_me_in_prod",
            issuer: process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/yaip",
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // Persist the OAuth access_token right after signin
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }) {
            // Send properties to the client
            const typedSession = session as typeof session & { accessToken?: unknown };
            typedSession.accessToken = token.accessToken;
            return typedSession;
        },
    },
    session: { strategy: "jwt" },
    secret: process.env.NEXTAUTH_SECRET || "fallback-secret-for-dev",
};
