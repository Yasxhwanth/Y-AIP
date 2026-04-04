"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { Plus, Save, Settings, X, GripHorizontal, FileStack } from "lucide-react";
import { ObjectTableWidget } from "./widgets/object-table";
import { KpiCardWidget } from "./widgets/kpi-card";

type WidgetConfig = {
    objectType: string;
    title: string;
} & Record<string, unknown>;

export type WidgetInstance = {
    id: string;
    type: "ObjectTable" | "KPICard";
    config: WidgetConfig;
};

type DashboardLayout = {
    id: string;
    name: string;
    widgets: WidgetInstance[];
};

type DashboardResponse = {
    dashboards?: DashboardLayout[];
};

type OntologyShape = {
    object_type: string;
};

type OntologySchemaResponse = {
    shapes?: OntologyShape[];
};

export function GridEditor() {
    const [dashboard, setDashboard] = useState<DashboardLayout>({
        id: "default",
        name: "Fleet Overview",
        widgets: []
    });

    const [saving, setSaving] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [ontologyShapes, setOntologyShapes] = useState<string[]>([]);

    // Config Modal State
    const [newWidgetType, setNewWidgetType] = useState<"ObjectTable" | "KPICard">("ObjectTable");
    const [newWidgetTitle, setNewWidgetTitle] = useState("");
    const [newWidgetObj, setNewWidgetObj] = useState("");

    useEffect(() => {
        // Load existing dashboard
        fetch("/api/workshop-admin/dashboards")
            .then(res => res.json())
            .then((data: DashboardResponse) => {
                if (data.dashboards && data.dashboards.length > 0) {
                    setDashboard(data.dashboards[0]);
                }
            });

        // Load available ontology map
        fetch("/api/ontology-admin/schema")
            .then(res => res.json())
            .then((data: OntologySchemaResponse) => {
                if (data.shapes) {
                    setOntologyShapes(data.shapes.map((shape) => shape.object_type));
                    if (data.shapes.length > 0) setNewWidgetObj(data.shapes[0].object_type);
                }
            });
    }, []);

    const saveDashboard = async () => {
        setSaving(true);
        await fetch("/api/workshop-admin/dashboards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dashboard)
        });
        setSaving(false);
    };

    const addWidget = () => {
        if (!newWidgetObj || !newWidgetTitle) return;

        const newWidget: WidgetInstance = {
            id: `w_${Math.random().toString(36).substr(2, 9)}`,
            type: newWidgetType,
            config: {
                title: newWidgetTitle,
                objectType: newWidgetObj
            }
        };

        setDashboard({
            ...dashboard,
            widgets: [...dashboard.widgets, newWidget]
        });
        setShowConfigModal(false);
        setNewWidgetTitle("");
    };

    const removeWidget = (id: string) => {
        setDashboard({
            ...dashboard,
            widgets: dashboard.widgets.filter(w => w.id !== id)
        });
    };

    return (
        <div className="flex-1 flex flex-col bg-neutral-950">

            {/* Editor Controls */}
            <div className="h-14 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        value={dashboard.name}
                        onChange={(e) => setDashboard({ ...dashboard, name: e.target.value })}
                        className="bg-transparent text-lg font-bold text-white focus:outline-none focus:border-b border-indigo-500 w-48"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded text-sm transition-colors border border-neutral-700"
                    >
                        <Plus className="w-4 h-4" /> Add Widget
                    </button>
                    <button
                        onClick={saveDashboard}
                        disabled={saving}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Layout"}
                    </button>
                </div>
            </div>

            {/* Grid Canvas */}
            <div className="flex-1 overflow-y-auto p-6 bg-black relative">
                {dashboard.widgets.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600">
                        <FileStack className="w-16 h-16 mb-4 opacity-50 text-indigo-900" />
                        <p>Dashboard is empty.</p>
                        <p className="text-sm">Click &quot;Add Widget&quot; to bind an Ontology component.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 auto-rows-max">
                        {dashboard.widgets.map((widget) => (
                            <div key={widget.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
                                {/* Widget Header bar */}
                                <div className="h-10 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-4 group cursor-move">
                                    <div className="flex items-center gap-2 text-neutral-400">
                                        <GripHorizontal className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                        <span className="text-sm font-bold text-white">{widget.config.title}</span>
                                        <span className="text-xs font-mono px-2 py-0.5 bg-neutral-800 rounded text-indigo-400 border border-neutral-700 ml-2">
                                            {widget.config.objectType}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="text-neutral-500 hover:text-white p-1 select-none"><Settings className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => removeWidget(widget.id)} className="text-neutral-500 hover:text-red-400 p-1 select-none"><X className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                {/* Widget Body */}
                                <div className="flex-1 p-4 bg-neutral-900 min-h-[300px] overflow-auto">
                                    {widget.type === "ObjectTable" && <ObjectTableWidget config={widget.config} />}
                                    {widget.type === "KPICard" && <KpiCardWidget config={widget.config} />}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Widget Config Modal */}
            {showConfigModal && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-neutral-950 border border-neutral-800 w-[500px] rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
                            <h3 className="font-bold text-white">Configure New Widget</h3>
                            <button onClick={() => setShowConfigModal(false)} className="text-neutral-500 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-2">Widget Type</label>
                                <select
                                    value={newWidgetType}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewWidgetType(e.target.value as WidgetInstance["type"])}
                                    className="w-full bg-black border border-neutral-800 rounded py-2 px-3 focus:border-indigo-500 text-white"
                                >
                                    <option value="ObjectTable">Object Table (Paginated List)</option>
                                    <option value="KPICard">KPI Card (Metrics)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-2">Display Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Active Drone Units"
                                    value={newWidgetTitle}
                                    onChange={(e) => setNewWidgetTitle(e.target.value)}
                                    className="w-full bg-black border border-neutral-800 rounded py-2 px-3 focus:border-indigo-500 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-2">Bind to Ontology Object</label>
                                <select
                                    value={newWidgetObj}
                                    onChange={(e) => setNewWidgetObj(e.target.value)}
                                    className="w-full bg-black border border-neutral-800 rounded py-2 px-3 focus:border-indigo-500 text-emerald-400 font-mono"
                                >
                                    {ontologyShapes.map(shape => (
                                        <option key={shape} value={shape}>{shape}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-neutral-500 mt-2">
                                    The widget will automatically query the GraphQL layer for all instances of this target class.
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 bg-neutral-900 flex justify-end gap-3">
                            <button onClick={() => setShowConfigModal(false)} className="text-sm px-4 py-2 hover:bg-neutral-800 text-neutral-300 rounded">Cancel</button>
                            <button onClick={addWidget} disabled={!newWidgetTitle || !newWidgetObj} className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold disabled:opacity-50">Add to Canvas</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
