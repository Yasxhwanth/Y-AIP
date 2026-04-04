/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Box, Loader2, AlertCircle } from "lucide-react";

export function ObjectTableWidget({ config }: { config: { objectType: string; title: string; } }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<string[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch properties for this object type from our Ontology Admin API
        const schemaRes = await fetch("/api/ontology-admin/schema");
        const schemaData = await schemaRes.json();
        const shape = schemaData.shapes?.find((s: any) => s.object_type === config.objectType);

        if (!shape) {
          throw new Error(`Object type ${config.objectType} not found in active ontology.`);
        }

        const props = shape.properties.map((p: any) => p.path);
        setProperties(props);

        if (props.length === 0) {
          return setData([]);
        }

        // 2. Build GraphQL query dynamically
        // Pluralize the object type for standard @neo4j/graphql resolution
        // e.g., SolarPanel -> solarPanels
        const queryName = config.objectType.charAt(0).toLowerCase() + config.objectType.slice(1) + "s";

        const dynamicQuery = `
          query DynamicWorkshopFetch {
            ${queryName} {
              ${props.join("\n")}
            }
          }
        `;

        // 3. Execute query directly using Fetch against our GraphQL Gateway
        const result = await fetch("http://localhost:4001/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: dynamicQuery })
        });

        const resJson = await result.json();
        if (resJson.errors) throw new Error(resJson.errors[0].message);

        setData(resJson.data[queryName] || []);

      } catch (err: any) {
        console.error("Widget Error:", err);
        setError(err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }

    if (config.objectType) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [config.objectType]);

  if (loading && data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-400 gap-2 p-4 text-center">
        <AlertCircle className="w-8 h-8 opacity-50" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-600 font-mono text-sm">
        0 Instances found in Object Layer.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto rounded-md border border-neutral-800">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-neutral-950 sticky top-0 z-10 shadow-md">
            <tr>
              {properties.map(p => (
                <th key={p} className="px-4 py-3 font-semibold text-neutral-400 font-mono text-xs uppercase tracking-wider border-b border-neutral-800">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-neutral-800/50 transition-colors group cursor-pointer">
                {properties.map(p => (
                  <td key={p} className="px-4 py-3 text-neutral-300 group-hover:text-white max-w-[200px] truncate">
                    {typeof row[p] === 'boolean'
                      ? (row[p] ? 'True' : 'False')
                      : (row[p] ?? '--')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-neutral-500 font-mono flex items-center gap-1">
        <Box className="w-3 h-3 text-indigo-500" /> {data.length} records bounded to {config.objectType}
      </div>
    </div>
  );
}
