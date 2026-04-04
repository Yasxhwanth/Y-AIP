"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, Box } from "lucide-react";

type NodeShape = {
    object_type: string;
    properties: { path: string; datatype?: string; minCount?: number }[];
};

export function ObjectList() {
    const [shapes, setShapes] = useState<NodeShape[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSchema = async () => {
        setLoading(true);
        try {
            // The Next.js API route that proxies to GraphAPI
            const res = await fetch("/api/ontology-admin/schema");
            if (res.ok) {
                const data = await res.json();
                setShapes(data.shapes || []);
            }
        } catch (error) {
            console.error("Failed to fetch schema", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, []);

    return (
        <div className="h-full flex flex-col text-sm border-r border-neutral-800 bg-neutral-950">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-black">
                <h2 className="font-bold text-neutral-300 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" /> Object Types
                </h2>
                <button onClick={fetchSchema} className="text-neutral-500 hover:text-white transition-colors" title="Refresh Schema">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {shapes.length === 0 && !loading && (
                    <div className="text-neutral-600 italic px-2">No object types defined.</div>
                )}

                {shapes.map((s) => (
                    <div key={s.object_type} className="p-3 bg-neutral-900 border border-neutral-800 rounded-md cursor-pointer hover:border-emerald-700 transition-colors group">
                        <div className="flex items-center gap-2 font-medium text-emerald-400 group-hover:text-emerald-300">
                            <Box className="w-4 h-4" /> {s.object_type}
                        </div>
                        <div className="mt-2 pl-6 space-y-1">
                            {s.properties.map((p) => (
                                <div key={p.path} className="text-xs flex justify-between text-neutral-400">
                                    <span className="truncate">{p.path}</span>
                                    <span className="font-mono text-[10px] text-neutral-500">{p.datatype?.split("#")[1] || "string"}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
