"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
    return (
        <button
            onClick={() => signIn("keycloak")}
            className="w-full py-2.5 px-4 bg-white text-black font-semibold rounded hover:bg-neutral-200 transition-colors"
        >
            Sign in with SSO
        </button>
    );
}
