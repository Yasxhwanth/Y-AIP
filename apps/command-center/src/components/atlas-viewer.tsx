"use client";

import { gql } from '@apollo/client/core';
import { useQuery } from '@apollo/client/react';
import { Activity, ShieldAlert, Cpu } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const GET_ENTITIES = gql`
  query GetDashboardEntities {
    solarPanels {
      panel_id
      location
      efficiency_pct
      anomaly_detected
    }
    droneUnits {
      drone_id
      status
      battery_pct
    }
  }
`;

type SolarPanel = {
    panel_id: string;
    location: string;
    efficiency_pct: number;
    anomaly_detected: boolean;
};

type DroneUnit = {
    drone_id: string;
    status: string;
    battery_pct: number;
};

type DashboardQueryData = {
    solarPanels: SolarPanel[];
    droneUnits: DroneUnit[];
};

export function AtlasViewer() {
    const { data, loading, error } = useQuery<DashboardQueryData>(GET_ENTITIES, {
        pollInterval: 5000,
    });

    if (loading) return <div className="p-8 text-neutral-400">Loading ontology...</div>;
    if (error) return <div className="p-8 text-red-400">Error connecting to Graph API</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                Atlas Ontology Viewer
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Solar Panels */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                    <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                        Solar Panels
                    </h3>
                    <div className="space-y-3">
                        {data?.solarPanels?.map((p) => (
                            <div
                                key={p.panel_id}
                                className={cn(
                                    "p-3 rounded border flex items-center justify-between",
                                    p.anomaly_detected
                                        ? "bg-red-950/20 border-red-900/50"
                                        : "bg-neutral-800/50 border-neutral-700/50"
                                )}
                            >
                                <div>
                                    <div className="font-medium text-neutral-200">{p.panel_id}</div>
                                    <div className="text-sm text-neutral-500">{p.location}</div>
                                </div>
                                <div className="text-right">
                                    <div className={cn(
                                        "text-lg font-semibold",
                                        p.anomaly_detected ? "text-red-400" : "text-emerald-400"
                                    )}>
                                        {p.efficiency_pct}%
                                    </div>
                                    {p.anomaly_detected && (
                                        <div className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                            <ShieldAlert className="w-3 h-3" /> Anomaly
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Drones */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                    <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                        Drone Fleet
                    </h3>
                    <div className="space-y-3">
                        {data?.droneUnits?.map((d) => (
                            <div key={d.drone_id} className="p-3 bg-neutral-800/50 border border-neutral-700/50 rounded flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Cpu className="w-5 h-5 text-neutral-400" />
                                    <div>
                                        <div className="font-medium text-neutral-200">{d.drone_id}</div>
                                        <div className="text-sm text-neutral-500">{d.status}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full rounded-full",
                                                d.battery_pct > 20 ? "bg-emerald-500" : "bg-red-500"
                                            )}
                                            style={{ width: `${d.battery_pct}%` }}
                                        />
                                    </div>
                                    <span className="text-sm text-neutral-400">{d.battery_pct}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
