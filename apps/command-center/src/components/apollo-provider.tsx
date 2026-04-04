"use client";

import { HttpLink } from "@apollo/client";
import {
    ApolloNextAppProvider,
    NextSSRInMemoryCache,
    NextSSRApolloClient,
} from "@apollo/experimental-nextjs-app-support/ssr";
import React from "react";

function makeClient() {
    const httpLink = new HttpLink({
        uri: "/api/graphql",
    });

    return new NextSSRApolloClient({
        cache: new NextSSRInMemoryCache({
            typePolicies: {
                Query: {
                    fields: {
                        solarPanels: { merge: false },
                        droneUnits: { merge: false },
                        missions: { merge: false },
                        proposals: { merge: false },
                    },
                },
            },
        }),
        link: httpLink,
    });
}

export function ApolloProvider({ children }: { children: React.ReactNode }) {
    return (
        <ApolloNextAppProvider makeClient={makeClient}>
            {children}
        </ApolloNextAppProvider>
    );
}
