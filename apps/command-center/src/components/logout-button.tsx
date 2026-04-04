"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
    return (
        <button
            onClick={() => signOut()}
            className="text-neutral-500 hover:text-white transition-colors text-xs font-bold ml-1"
            title="Sign Out"
        >
            [LOGOUT]
        </button>
    );
}
