/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Activity } from "lucide-react";

export function KpiCardWidget({ config }: { config: { objectType: string; title: string; } }) {
  const [metric, setMetric] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const queryName = config.objectType.charAt(0).toLowerCase() + config.objectType.slice(1) + "sAggregate";

        // Use Neo4j GraphQL Aggregate query
        const dynamicQuery = `
          query DynamicWorkshopKPI {
            ${queryName} {
              count
            }
          }
        `;

        const result = await fetch("http://localhost:4001/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: dynamicQuery })
        });

        const resJson = await result.json();
        if (resJson.errors) throw new Error(resJson.errors[0].message);
        setMetric(resJson.data[queryName]?.count || 0);

      } catch (err: any) {
        console.error("KPI Widget Error:", err);
        setError(err.message || "Failed to fetch KPI");
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

  return (
    <div className="h-full flex flex-col items-center justify-center relative">
      <Activity className="absolute top-2 right-2 w-4 h-4 text-neutral-800" />

      {loading && metric === null ? (
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      ) : error ? (
        <div className="text-red-400 font-mono text-sm text-center px-4">{error}</div>
      ) : (
        <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
          <span className="text-6xl font-black tracking-tighter text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.3)]">
            {metric !== null ? new Intl.NumberFormat().format(metric) : "--"}
          </span>
          <span className="text-neutral-400 font-bold uppercase tracking-widest mt-4 text-xs">
            Total {config.objectType}s
          </span>
        </div>
      )}
    </div>
  );
}
