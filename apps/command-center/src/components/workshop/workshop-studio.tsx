"use client";
import { useState, useEffect } from "react";
import {
    LayoutTemplate, Home, Search, Clock, Box, Zap,
    Link2, Settings, FileText, Share2, Plus,
    X, ChevronRight, HelpCircle, Save, Eye,
    MoreHorizontal, Filter, Grid, List,
    Target, Layers, Activity, Database,
    BarChart2, FileStack, Layout, History,
    Info, GripHorizontal, ChevronDown, Check,
    Trash2, Edit, User, Globe, Lock, Moon,
    Sun, Monitor, PanelLeft, PanelRight,
    Square, CheckSquare, Calendar, Type, Hash,
    ArrowLeft, ExternalLink, Download, Upload,
    Copy, Palette, MousePointer2, Code2, Variable,
    Star, Folder
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface WidgetConfig {
    objectType: string;
    title: string;
    columns?: TableColumnConfig[];
    sortBy?: string;
}

interface WidgetInstance {
    id: string;
    type: "ObjectTable" | "KPICard";
    config: WidgetConfig;
}

interface DashboardLayout {
    id: string;
    name: string;
    headerTitle?: string;
    headerIcon?: string;
    headerColor?: string;
    widgets: WidgetInstance[];
}

interface Variable {
    id: string;
    name: string;
    type: "object-set";
    objectType?: string;
}

interface OntologyObjectType {
    api_name: string;
    display_name: string;
    plural_display_name?: string;
    index_status?: string;
    index_count?: number;
}

interface OntologyPropertySummary {
    api_name: string;
    display_name: string;
}

interface TableColumnConfig {
    id: string;
    originalName: string;
    name: string;
}

type LayoutTemplateName = "Details" | "Grid" | "Inbox" | "Overview" | "Settings";

function toSafeNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === "object") {
        const v = value as { low?: unknown; high?: unknown; toNumber?: () => number; toInt?: () => number };
        if (typeof v.toNumber === "function") return v.toNumber();
        if (typeof v.toInt === "function") return v.toInt();
        if (typeof v.low === "number" && typeof v.high === "number") {
            return v.high * 4294967296 + (v.low >>> 0);
        }
    }
    return 0;
}

export function WorkshopStudio() {
    const params = useParams();
    const router = useRouter();
    const moduleId = params.moduleId as string;

    const [dashboard, setDashboard] = useState<DashboardLayout>({
        id: moduleId,
        name: "[Gena] Orders Inbox",
        headerTitle: "[Gena] Orders Inbox",
        headerIcon: "Cube",
        headerColor: "#2563eb", // Blue 4
        widgets: []
    });

    const [variables, setVariables] = useState<Variable[]>([]);
    const [activeLeftPanel, setActiveLeftPanel] = useState<"overview" | "layout" | "variables">("overview");
    const [selectedElement, setSelectedElement] = useState<"page" | "header" | string>("page");
    const [showWidgetModal, setShowWidgetModal] = useState(false);
    const [showVariableModal, setShowVariableModal] = useState(false);
    const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [saving, setSaving] = useState(false);
    const [leftPanelWidth, setLeftPanelWidth] = useState(280);
    const [isResizing, setIsResizing] = useState(false);
    const [ontologyObjects, setOntologyObjects] = useState<OntologyObjectType[]>([]);
    const [loadingOntologyObjects, setLoadingOntologyObjects] = useState(true);
    const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateName>("Overview");
    const [layoutDirection, setLayoutDirection] = useState<"columns" | "rows">("columns");
    const [sectionFlex, setSectionFlex] = useState({ left: 1, right: 1 });
    const [widgetRows, setWidgetRows] = useState<Record<string, { rows: Record<string, unknown>[]; loading: boolean }>>({});
    const [showLayoutPalette, setShowLayoutPalette] = useState(true);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        const startX = e.clientX;
        const startWidth = leftPanelWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(200, Math.min(800, startWidth + moveEvent.clientX - startX));
            setLeftPanelWidth(newWidth);
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    useEffect(() => {
        // Fetch dashboard data
        fetch(`/api/workshop-admin/dashboards`)
            .then(res => res.json())
            .then(data => {
                if (data.dashboards) {
                    const found = data.dashboards.find((d: any) => d.id === moduleId);
                    if (found) {
                        setDashboard({
                            ...found,
                            headerTitle: found.headerTitle || found.name,
                            headerIcon: found.headerIcon || "Cube",
                            headerColor: found.headerColor || "#2563eb"
                        });
                    }
                }
            });
    }, [moduleId]);

    useEffect(() => {
        fetch("/api/ontology-admin/object-types")
            .then(res => res.json())
            .then((data) => {
                const list = Array.isArray(data) ? data : [];
                setOntologyObjects(
                    list.map((ot: any) => ({
                        ...ot,
                        index_count: toSafeNumber(ot?.index_count),
                    }))
                );
            })
            .catch((err) => {
                console.error("Failed to fetch ontology object types:", err);
                setOntologyObjects([]);
            })
            .finally(() => setLoadingOntologyObjects(false));
    }, []);

    const workshopReadyObjects = ontologyObjects.filter((ot) => ot.index_status === "active");

    useEffect(() => {
        const targets = dashboard.widgets.filter((w) => w.type === "ObjectTable" && w.config.objectType);
        if (!targets.length) return;

        targets.forEach((w) => {
            setWidgetRows((prev) => ({ ...prev, [w.id]: { rows: prev[w.id]?.rows ?? [], loading: true } }));
            fetch(`/api/ontology-admin/object-types/${encodeURIComponent(w.config.objectType)}/objects?limit=200`)
                .then((res) => res.json())
                .then(async (payload) => {
                    const objects = Array.isArray(payload?.objects)
                        ? payload.objects
                        : (Array.isArray(payload?.rows) ? payload.rows : []);
                    if (objects.length > 0) {
                        setWidgetRows((prev) => ({ ...prev, [w.id]: { rows: objects, loading: false } }));
                        return;
                    }

                    // Fallback: if indexed objects endpoint is empty, use backing dataset preview
                    const detailRes = await fetch(`/api/ontology-admin/object-types/${encodeURIComponent(w.config.objectType)}`);
                    const detail = detailRes.ok ? await detailRes.json() : null;
                    const backing = detail?.backing_source;
                    if (!backing) {
                        setWidgetRows((prev) => ({ ...prev, [w.id]: { rows: [], loading: false } }));
                        return;
                    }

                    const previewRes = await fetch(`/api/ontology-admin/datasets/${encodeURIComponent(backing)}/preview`);
                    const preview = previewRes.ok ? await previewRes.json() : null;
                    const previewRows = Array.isArray(preview?.rows) ? preview.rows : [];
                    setWidgetRows((prev) => ({ ...prev, [w.id]: { rows: previewRows, loading: false } }));
                })
                .catch(() => {
                    setWidgetRows((prev) => ({ ...prev, [w.id]: { rows: [], loading: false } }));
                });
        });
    }, [dashboard.widgets]);

    const applyLayoutTemplate = (name: LayoutTemplateName) => {
        setLayoutTemplate(name);
        setLayoutDirection("columns");
        if (name === "Details") setSectionFlex({ left: 2, right: 1 });
        else if (name === "Grid") setSectionFlex({ left: 1, right: 1 });
        else if (name === "Inbox") setSectionFlex({ left: 1.4, right: 1 });
        else if (name === "Overview") setSectionFlex({ left: 1, right: 1.2 });
        else setSectionFlex({ left: 1, right: 1.6 });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch("/api/workshop-admin/dashboards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dashboard)
            });
        } catch (err) {
            console.error(err);
        }
        setSaving(false);
    };

    const selectedSectionSide: "left" | "right" = (() => {
        if (selectedElement === "section_left") return "left";
        if (selectedElement === "section_right") return "right";
        if (typeof selectedElement === "string" && selectedElement.startsWith("section_widget_")) {
            const widgetId = selectedElement.replace("section_", "");
            const idx = dashboard.widgets.findIndex((w) => w.id === widgetId);
            return idx <= 0 ? "left" : "right";
        }
        return "right";
    })();

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f3f4f6", color: "#111827", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>
            {/* Top Toolbar */}
            <header style={{ height: 40, background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 20, height: 20, background: "#4f46e5", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <LayoutTemplate size={12} color="white" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4b5563" }}>
                        <span>[Gena] Palantir ...</span>
                        <ChevronRight size={12} color="#9ca3af" />
                        <span>...</span>
                        <ChevronRight size={12} color="#9ca3af" />
                        <span style={{ fontWeight: 600, color: "#111827" }}>{dashboard.name}</span>
                        <Star size={12} color="#9ca3af" fill="none" style={{ marginLeft: 4 }} />
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 4, padding: 2 }}>
                        <button style={{ padding: "4px 8px", background: "none", border: "none", fontSize: 11, cursor: "pointer" }}><History size={14} /></button>
                        <button style={{ padding: "4px 8px", background: "none", border: "none", fontSize: 11, cursor: "pointer" }}><ExternalLink size={14} /></button>
                    </div>
                    <button style={{ height: 28, padding: "0 12px", background: "#f3f4f6", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <MousePointer2 size={12} /> Main
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ height: 28, padding: "0 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
                    >
                        {saving ? "Saving..." : "Save and publish"}
                    </button>
                    <div style={{ display: "flex", gap: 1, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                        <button style={{ height: 28, padding: "0 12px", background: "#f3f4f6", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>View</button>
                        <button style={{ height: 28, padding: "0 8px", background: "#f3f4f6", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}><ChevronDown size={14} /></button>
                    </div>
                    <button style={{ height: 28, padding: "0 12px", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <Plus size={14} style={{ color: "#2563eb" }} /> Share
                    </button>
                </div>
            </header>

            {/* Sub-header (Breadcrumbs/Nav) */}
            <div style={{ height: 32, background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 16px", gap: 16, fontSize: 11, fontWeight: 500, color: "#4b5563" }}>
                <div style={{ color: "#111827", borderBottom: "2px solid #2563eb", height: "100%", display: "flex", alignItems: "center", padding: "0 4px" }}>PAGE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><Plus size={12} style={{ color: "#2563eb" }} /> Add section inside</div>
                <div style={{ borderLeft: "1px solid #e5e7eb", height: 16 }}></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>SPLIT CURRENT SECTION <div style={{ display: "flex", gap: 4, marginLeft: 8 }}><Grid size={14} /><List size={14} /><PanelLeft size={14} /><PanelRight size={14} /></div></div>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Left Tool Sidebar */}
                <div style={{ width: 44, background: "#ffffff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 20 }}>
                    <Home size={18} color="#6b7280" />
                    <Search size={18} color="#6b7280" />
                    <Variable size={18} color={activeLeftPanel === "variables" ? "#2563eb" : "#6b7280"} cursor="pointer" onClick={() => setActiveLeftPanel("variables")} />
                    <Clock size={18} color="#6b7280" />
                    <Folder size={18} color="#6b7280" />
                    <Box size={18} color="#6b7280" />
                    <Zap size={18} color="#6b7280" />
                    <Eye size={18} color="#6b7280" />
                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
                        <HelpCircle size={18} color="#6b7280" />
                        <div style={{ width: 24, height: 24, background: "#4b5563", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9, fontWeight: 700 }}>GC</div>
                    </div>
                </div>

                {/* Left Content Panel */}
                <div style={{ width: leftPanelWidth, flexShrink: 0, position: "relative", background: "#ffffff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Resizer */}
                    <div
                        onMouseDown={handleMouseDown}
                        style={{
                            position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 10,
                            background: isResizing ? "rgba(37, 99, 235, 0.2)" : "transparent"
                        }}
                    />
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#111827", textTransform: "uppercase" }}>Overview</h3>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "12px", marginBottom: 24 }}>
                            <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>Enter the purpose of the app</div>
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Object types <span style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>{workshopReadyObjects.length}</span></div>
                                <Plus size={14} color="#2563eb" />
                            </div>
                            {loadingOntologyObjects ? (
                                <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "#ffffff", border: "1px dashed #d1d5db", borderRadius: 6 }}>
                                    <div style={{ width: 32, height: 32, background: "#f3f4f6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Box size={18} color="#d1d5db" />
                                    </div>
                                    <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 4 }}></div>
                                    <ChevronRight size={14} color="#d1d5db" />
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {workshopReadyObjects.slice(0, 3).map((ot) => (
                                        <div key={ot.api_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#ffffff" }}>
                                            <div style={{ width: 24, height: 24, background: "#eef2ff", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Box size={13} color="#4f46e5" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {ot.plural_display_name || ot.display_name}
                                                </div>
                                                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{ot.index_count ?? 0} objects</div>
                                            </div>
                                        </div>
                                    ))}
                                    {!workshopReadyObjects.length && (
                                        <div style={{ fontSize: 11, color: "#6b7280", padding: "8px 0" }}>
                                            No active indexed object types yet. Save and index an object type in Ontology Manager first.
                                        </div>
                                    )}
                                </div>
                            )}
                            <p style={{ fontSize: 11, color: "#6b7280", marginTop: 12 }}>Workshop applications are backed by objects data from the Foundry Ontology. Add an object type to get started.</p>
                            <button style={{ width: "100%", height: 32, background: "white", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#374151", cursor: "pointer" }}>
                                <Plus size={14} /> Add object set variable
                            </button>
                        </div>

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 16 }}>Capabilities</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <CapabilityItem icon={Zap} label="Actions" count={0} color="#7c3aed" />
                                <CapabilityItem icon={Code2} label="Functions" count={0} color="#059669" />
                                <CapabilityItem icon={Layers} label="Derived properties" count={0} color="#2563eb" />
                                <CapabilityItem icon={Box} label="Embedded resources" count={0} color="#d97706" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Central Canvas */}
                <div style={{ flex: 1, padding: 18, overflowY: "auto", position: "relative", background: "#f8fafc" }}>
                    <div
                        onClick={() => setSelectedElement("page")}
                        style={{
                            background: "#ffffff",
                            border: selectedElement === "page" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                            borderRadius: 4,
                            minHeight: "100%",
                            position: "relative",
                            boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                            display: "flex",
                            flexDirection: "column"
                        }}
                    >
                        {/* Page Header (Selectable) */}
                        <div
                            onClick={(e) => { e.stopPropagation(); setSelectedElement("header"); }}
                            style={{
                                height: 48, background: "#ffffff", borderBottom: "1px solid #e5e7eb", border: selectedElement === "header" ? "2px solid #2563eb" : "1px solid transparent",
                                padding: "0 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderRadius: "8px 8px 0 0"
                            }}
                        >
                            <div style={{ width: 24, height: 24, background: dashboard.headerColor || "#4f46e5", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Box size={14} color="white" />
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{dashboard.headerTitle}</span>
                        </div>

                        {/* Page Content area */}
                        <div style={{ flex: 1, display: "flex", padding: 8 }}>
                            <div style={{ flex: 1, display: "flex", gap: 0, flexDirection: layoutDirection === "columns" ? "row" : "column" }}>
                                {/* Columns based on widgets */}
                                {dashboard.widgets.length === 0 ? (
                                    <>
                                        <div onClick={(e) => { e.stopPropagation(); setSelectedElement("section_left"); }} style={{ flex: sectionFlex.left, background: "#ffffff", border: "1px solid #d1d5db", borderRight: "0.5px solid #d1d5db", borderRadius: "2px 0 0 2px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, position: "relative", minHeight: 520 }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", position: "absolute", top: 0, left: 0, right: 0, height: 24, borderBottom: "1px solid #e5e7eb", background: "#f8fafc", display: "flex", alignItems: "center", paddingLeft: 8 }}>Section</div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowWidgetModal(true); }}
                                                style={{ height: 30, minWidth: 130, padding: "0 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 2, fontSize: 12, fontWeight: 600, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                                            >
                                                <Plus size={14} /> Add widget
                                            </button>
                                            <button style={{ height: 28, minWidth: 130, padding: "0 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 2, fontSize: 12, fontWeight: 600, color: "#4b5563", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                                <PanelLeft size={14} /> Set layout
                                            </button>
                                        </div>
                                        <div onClick={(e) => { e.stopPropagation(); setSelectedElement("section_right"); }} style={{ flex: sectionFlex.right, background: "#ffffff", border: "1px solid #d1d5db", borderLeft: "0.5px solid #d1d5db", borderRadius: "0 2px 2px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, position: "relative", minHeight: 520 }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", position: "absolute", top: 0, left: 0, right: 0, height: 24, borderBottom: "1px solid #e5e7eb", background: "#f8fafc", display: "flex", alignItems: "center", paddingLeft: 8 }}>Section</div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowWidgetModal(true); }}
                                                style={{ height: 30, minWidth: 130, padding: "0 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 2, fontSize: 12, fontWeight: 600, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                                            >
                                                <Plus size={14} /> Add widget
                                            </button>
                                            <button style={{ height: 28, minWidth: 130, padding: "0 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 2, fontSize: 12, fontWeight: 600, color: "#4b5563", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                                <PanelLeft size={14} /> Set layout
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {dashboard.widgets.map((w, idx) => (
                                            <div
                                                key={w.id}
                                                onClick={(e) => { e.stopPropagation(); setSelectedElement(`section_${w.id}`); }}
                                                style={{
                                                    flex: idx === 0 ? sectionFlex.left : sectionFlex.right, background: "#ffffff", border: selectedElement === `section_${w.id}` ? "2px solid #2563eb" : "1px solid #d1d5db", borderRadius: 4,
                                                    display: "flex", flexDirection: "column", position: "relative", cursor: "pointer", overflow: "hidden", minHeight: 200
                                                }}
                                            >
                                                <div style={{ padding: "4px 8px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                                                    Section
                                                </div>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); setSelectedElement(w.id); }}
                                                    style={{
                                                        flex: 1, border: selectedElement === w.id ? "2px solid #2563eb" : "1px solid transparent",
                                                        display: "flex", flexDirection: "column", position: "relative"
                                                    }}
                                                >
                                                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: selectedElement === w.id ? "#eff6ff" : "white" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <Grid size={14} color="#9ca3af" />
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase" }}>{w.config.title}</span>
                                                        </div>
                                                        <Settings size={14} color="#9ca3af" />
                                                    </div>
                                                    <div style={{ flex: 1, padding: 0 }}>
                                                        {w.type === "ObjectTable" && (
                                                            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                                                                {widgetRows[w.id]?.loading && <div style={{ padding: 12, fontSize: 12, color: "#6b7280" }}>Loading objects...</div>}
                                                                {!widgetRows[w.id]?.loading && (
                                                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                                                        <thead>
                                                                            <tr style={{ background: "#f8fafc" }}>
                                                                                {(w.config.columns && w.config.columns.length > 0 ? w.config.columns : [{ id: "title", name: "Title", originalName: "Title" }]).map((c) => (
                                                                                    <th key={c.id} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb", color: "#475569", fontWeight: 600 }}>{c.name}</th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {(widgetRows[w.id]?.rows ?? [])
                                                                                .slice()
                                                                                .sort((a, b) => {
                                                                                    const key = w.config.sortBy;
                                                                                    if (!key) return 0;
                                                                                    const av = String((a as Record<string, unknown>)[key] ?? "");
                                                                                    const bv = String((b as Record<string, unknown>)[key] ?? "");
                                                                                    return av.localeCompare(bv);
                                                                                })
                                                                                .slice(0, 25)
                                                                                .map((row, rIdx) => (
                                                                                    <tr key={rIdx}>
                                                                                        {(w.config.columns && w.config.columns.length > 0 ? w.config.columns : [{ id: "title", name: "Title", originalName: "Title" }]).map((c, cIdx) => (
                                                                                            <td key={c.id} style={{ padding: "4px 8px", borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                                                                                                {cIdx === 0 ? (
                                                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                                                        <div style={{ width: 10, height: 10, background: "#3b82f6", borderRadius: 2, flexShrink: 0 }} />
                                                                                                        <span>{String((row as Record<string, unknown>)[c.id] ?? "")}</span>
                                                                                                    </div>
                                                                                                ) : String((row as Record<string, unknown>)[c.id] ?? "")}
                                                                                            </td>
                                                                                        ))}
                                                                                    </tr>
                                                                                ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {dashboard.widgets.length === 1 && (
                                            <div onClick={(e) => { e.stopPropagation(); setSelectedElement("section_right"); }} style={{ flex: sectionFlex.right, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, position: "relative" }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", position: "absolute", top: 8, left: 8 }}>Empty space</div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowWidgetModal(true); }}
                                                    style={{ height: 32, padding: "0 24px", background: "white", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, fontWeight: 600, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                                                >
                                                    <Plus size={14} /> Add widget
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Configuration Panel */}
                <div style={{ width: 320, background: "#ffffff", borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {selectedElement === "page" && (
                        <>
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Page</h3>
                                <span style={{ fontSize: 11, color: "#9ca3af" }}>PAGE</span>
                            </div>
                            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                                <ConfigGroup label="PAGE NAME">
                                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827" }} defaultValue="Page" />
                                </ConfigGroup>
                                <ConfigGroup label="PAGE ID (OPTIONAL)">
                                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827" }} defaultValue="page" />
                                </ConfigGroup>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, marginBottom: 24 }}>
                                    <Check size={14} color="#1d4ed8" />
                                    <span style={{ fontSize: 12, color: "#1e40af", fontWeight: 600 }}>Current page is default for this module</span>
                                </div>
                                <ConfigGroup label="FORMATTING">
                                    <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 8 }}>BACKGROUND COLOR</div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>/</div>
                                        <div style={{ width: 32, height: 32, borderRadius: 4, background: "#ffffff", border: "1px solid #2563eb" }}></div>
                                        <div style={{ width: 32, height: 32, borderRadius: 4, background: "#f3f4f6", border: "1px solid #d1d5db" }}></div>
                                        <div style={{ width: 32, height: 32, borderRadius: 4, background: "#e5e7eb", border: "1px solid #d1d5db" }}></div>
                                    </div>
                                </ConfigGroup>
                                <ConfigGroup label="LAYOUT">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <div style={{ fontSize: 11, color: "#4b5563" }}>PADDING CONTROLS</div>
                                        <div style={{ fontSize: 11, color: "#2563eb", cursor: "pointer" }}>Customize</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827" }}>
                                        No Padding <ChevronDown size={14} color="#9ca3af" />
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                                        <div style={{ fontSize: 11, color: "#4b5563" }}>HIDE SECTION DIVIDERS</div>
                                        <div style={{ width: 32, height: 16, background: "#e5e7eb", borderRadius: 8, position: "relative" }}>
                                            <div style={{ width: 14, height: 14, background: "#fff", borderRadius: 7, position: "absolute", left: 1, top: 1 }}></div>
                                        </div>
                                    </div>
                                </ConfigGroup>
                                <ConfigGroup label="LAYOUT DIRECTION">
                                    <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 6, padding: 2 }}>
                                        <button style={{ flex: 1, height: 28, background: "#ffffff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, color: "#111827", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>Columns</button>
                                        <button style={{ flex: 1, height: 28, background: "none", border: "none", fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Rows</button>
                                    </div>
                                </ConfigGroup>
                            </div>
                        </>
                    )}

                    {selectedElement === "header" && (
                        <>
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Header</h3>
                                <span style={{ fontSize: 11, color: "#9ca3af" }}>SECTION</span>
                            </div>
                            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                                <ConfigGroup label="TITLE">
                                    <input
                                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #2563eb", borderRadius: 6, fontSize: 13, outline: "none", color: "#111827" }}
                                        value={dashboard.headerTitle}
                                        onChange={(e) => setDashboard({ ...dashboard, headerTitle: e.target.value })}
                                    />
                                </ConfigGroup>
                                <ConfigGroup label="ICON">
                                    <div style={{ position: "relative" }}>
                                        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#9ca3af" }} />
                                        <input
                                            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827" }}
                                            placeholder="Search for icons..."
                                            value={dashboard.headerIcon}
                                            onChange={(e) => setDashboard({ ...dashboard, headerIcon: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 12 }}>
                                        <IconSquare icon={Box} label="Cube" isSelected={dashboard.headerIcon === "Cube"} />
                                        <IconSquare icon={Layout} label="Layout" isSelected={dashboard.headerIcon === "Layout"} />
                                        <IconSquare icon={Database} label="DB" isSelected={dashboard.headerIcon === "DB"} />
                                        <IconSquare icon={Layers} label="Layers" isSelected={dashboard.headerIcon === "Layers"} />
                                        <IconSquare icon={Grid} label="Grid" isSelected={dashboard.headerIcon === "Grid"} />
                                    </div>
                                </ConfigGroup>
                                <ConfigGroup label="ICON COLOR">
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                                        <ColorSquare color="#1d4ed8" label="Blue 4" isSelected={dashboard.headerColor === "#1d4ed8"} onClick={() => setDashboard({ ...dashboard, headerColor: "#1d4ed8" })} />
                                        <ColorSquare color="#2563eb" label="Blue 5" isSelected={dashboard.headerColor === "#2563eb"} onClick={() => setDashboard({ ...dashboard, headerColor: "#2563eb" })} />
                                        <ColorSquare color="#3b82f6" label="Blue 6" isSelected={dashboard.headerColor === "#3b82f6"} onClick={() => setDashboard({ ...dashboard, headerColor: "#3b82f6" })} />
                                        <ColorSquare color="#60a5fa" label="Blue 7" isSelected={dashboard.headerColor === "#60a5fa"} onClick={() => setDashboard({ ...dashboard, headerColor: "#60a5fa" })} />
                                        <ColorSquare color="#93c5fd" label="Blue 8" isSelected={dashboard.headerColor === "#93c5fd"} onClick={() => setDashboard({ ...dashboard, headerColor: "#93c5fd" })} />
                                    </div>
                                </ConfigGroup>
                            </div>
                        </>
                    )}

                    {selectedElement?.startsWith("widget_") && (
                        <WidgetConfigPanel
                            widget={dashboard.widgets.find(w => w.id === selectedElement)!}
                            variables={variables}
                            ontologyObjects={workshopReadyObjects}
                            onUpdate={(config) => {
                                const newWidgets = dashboard.widgets.map(w => w.id === selectedElement ? { ...w, config } : w);
                                setDashboard({ ...dashboard, widgets: newWidgets });
                            }}
                            onOpenVariableModal={(variableId?: string) => {
                                setEditingVariableId(variableId ?? null);
                                setShowVariableModal(true);
                            }}
                        />
                    )}

                    {selectedElement?.startsWith("section_") && (
                        <SectionConfigPanel
                            sectionName={selectedSectionSide === "left" ? "Section (left)" : "Section (right)"}
                            layoutDirection={layoutDirection}
                            flexValue={selectedSectionSide === "left" ? sectionFlex.left : sectionFlex.right}
                            onLayoutDirectionChange={setLayoutDirection}
                            onFlexValueChange={(value) => {
                                setSectionFlex((prev) => selectedSectionSide === "left" ? { ...prev, left: value } : { ...prev, right: value });
                            }}
                        />
                    )}

                    <div style={{ padding: "12px", borderTop: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", justifyContent: "center" }}>
                        <button style={{ width: "100%", height: 32, background: "transparent", border: "none", color: "#6b7280", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "not-allowed", opacity: 0.5 }}>
                            <Trash2 size={14} /> Delete {selectedElement === "header" ? "header" : "page"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Layout Palette (Contextual footer) */}
            {showLayoutPalette ? (
                <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", padding: "12px 24px", display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Try a layout template!</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {(["Details", "Grid", "Inbox", "Overview", "Settings"] as LayoutTemplateName[]).map((name) => (
                            <LayoutTemplateToggle key={name} label={name} active={layoutTemplate === name} onClick={() => applyLayoutTemplate(name)} />
                        ))}
                    </div>
                    <X size={16} color="#9ca3af" cursor="pointer" onClick={() => setShowLayoutPalette(false)} />
                </div>
            ) : (
                <button
                    onClick={() => setShowLayoutPalette(true)}
                    style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", height: 28, padding: "0 12px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", color: "#4b5563", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                    Show layout templates
                </button>
            )}

            {/* Modals */}
            {showWidgetModal && (
                <WidgetSearchModal
                    onClose={() => setShowWidgetModal(false)}
                    onSelect={(type) => {
                        const newWidget: WidgetInstance = {
                            id: `widget_${Date.now()}`,
                            type: type as any,
                            config: { objectType: "", title: type === "ObjectTable" ? "Object table" : type }
                        };
                        setDashboard({ ...dashboard, widgets: [...dashboard.widgets, newWidget] });
                        setSelectedElement(newWidget.id);
                        setShowWidgetModal(false);
                    }}
                />
            )}

            {showVariableModal && (
                <VariableModal
                    objectTypes={workshopReadyObjects}
                    initialVariable={editingVariableId ? variables.find((v) => v.id === editingVariableId) ?? null : null}
                    onClose={() => setShowVariableModal(false)}
                    onSave={(v) => {
                        setVariables((prev) => {
                            const exists = prev.some((x) => x.id === v.id);
                            if (exists) return prev.map((x) => x.id === v.id ? v : x);
                            return [...prev, v];
                        });
                        setShowVariableModal(false);
                        setEditingVariableId(null);
                    }}
                />
            )}
        </div>
    );
}

function WidgetSearchModal({ onClose, onSelect }: { onClose: () => void, onSelect: (type: string) => void }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ width: 800, background: "white", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column", height: 600, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
                <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <Search size={18} color="#9ca3af" />
                    <input autoFocus placeholder="Search widgets..." style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#111827" }} />
                    <X size={20} color="#9ca3af" cursor="pointer" onClick={onClose} />
                </div>
                <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", padding: "0 20px" }}>
                    <TabItem label="All" active />
                    <TabItem label="Properties & links" />
                    <TabItem label="Visualize" />
                    <TabItem label="Filter" />
                    <TabItem label="Writeback" />
                    <TabItem label="Foundry & custom apps" />
                </div>
                <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 16 }}>Suggested</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                        <WidgetCard
                            type="ObjectTable"
                            title="Object table"
                            description="Display objects data in a tabular format and allows for cell-level inline editing."
                            onClick={() => onSelect("ObjectTable")}
                        />
                        <WidgetCard
                            type="KPICard"
                            title="Metric card"
                            description="Render a card to highlight key metrics or statistics."
                            onClick={() => onSelect("KPICard")}
                        />
                        <WidgetCard
                            type="ButtonGroup"
                            title="Button group"
                            description="Add buttons that can trigger Actions, Workshop Events, exports, Commands, or open URLs."
                            onClick={() => { }}
                        />
                        <WidgetCard
                            type="FilterList"
                            title="Filter list"
                            description="Visualize a high-level summary of objects data (e.g., histograms, distribution charts) to allow us..."
                            onClick={() => { }}
                        />
                        <WidgetCard
                            type="XYChart"
                            title="Chart: XY"
                            description="Visualize objects data as a bar, line, or scatter plot."
                            onClick={() => { }}
                        />
                        <WidgetCard
                            type="VegaChart"
                            title="Vega Chart"
                            description="Visualize data as a Vega chart."
                            onClick={() => { }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabItem({ label, active }: { label: string, active?: boolean }) {
    return (
        <div style={{
            padding: "12px 16px", fontSize: 13, fontWeight: 500, color: active ? "#2563eb" : "#6b7280",
            borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", cursor: "pointer"
        }}>
            {label}
        </div>
    );
}

function WidgetCard({ type, title, description, onClick }: { type: string, title: string, description: string, onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            style={{
                border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", cursor: "pointer",
                transition: "all 0.2s", ":hover": { borderColor: "#2563eb", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }
            } as any}
        >
            <div style={{ height: 100, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
                {type === "ObjectTable" && (
                    <div style={{ width: "100%", height: "100%", border: "1px solid #e5e7eb", borderRadius: 4, display: "flex", flexDirection: "column", background: "white", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                        <div style={{ padding: "4px 8px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 16, fontSize: 8, fontWeight: 700, color: "#6b7280" }}>
                            <div style={{ flex: 2 }}>Transaction</div>
                            <div style={{ flex: 1 }}>Fruit</div>
                            <div style={{ flex: 1 }}>Amount</div>
                            <div style={{ flex: 1 }}>Price</div>
                        </div>
                        <div style={{ flex: 1, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                    <div style={{ flex: 2, display: "flex", gap: 6, alignItems: "center" }}>
                                        <div style={{ width: 10, height: 10, background: "#3b82f6", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={6} color="white" /></div>
                                        <div style={{ width: "60%", height: 4, background: "#e5e7eb", borderRadius: 2 }}></div>
                                    </div>
                                    <div style={{ flex: 1 }}><div style={{ width: "80%", height: 4, background: "#f3f4f6", borderRadius: 2 }}></div></div>
                                    <div style={{ flex: 1 }}><div style={{ width: "60%", height: 4, background: "#f3f4f6", borderRadius: 2 }}></div></div>
                                    <div style={{ flex: 1 }}><div style={{ width: "70%", height: 4, background: "#f3f4f6", borderRadius: 2 }}></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {type === "KPICard" && <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>$ 6,351 <span style={{ fontSize: 12, color: "#2563eb" }}>+40%</span></div>}
                {type === "ButtonGroup" && <div style={{ display: "flex", gap: 8 }}><div style={{ width: 40, height: 16, background: "#2563eb", borderRadius: 4 }}></div><div style={{ width: 16, height: 16, border: "1px solid #d1d5db", borderRadius: 4 }}></div></div>}
            </div>
            <div style={{ padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>{description}</div>
            </div>
        </div>
    );
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
    return (
        <div onClick={onToggle} style={{ width: 28, height: 16, background: on ? "#2563eb" : "#e5e7eb", borderRadius: 8, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
            <div style={{ width: 12, height: 12, background: "#fff", borderRadius: 6, position: "absolute", left: on ? 14 : 2, top: 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}></div>
        </div>
    );
}

function PropertyRow({
    prop,
    onRename,
    onMove,
    onRemove,
}: {
    prop: TableColumnConfig;
    onRename: (n: string) => void;
    onMove: (from: string, to: string) => void;
    onRemove: () => void;
}) {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", prop.id);
                e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData("text/plain");
                if (from && from !== prop.id) onMove(from, prop.id);
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, marginBottom: 4 }}
        >
            <GripHorizontal size={14} color="#9ca3af" style={{ cursor: "grab" }} />
            <input
                value={prop.name}
                onChange={(e) => onRename(e.target.value)}
                style={{ flex: 1, border: "1px solid transparent", background: "transparent", fontSize: 12, color: "#111827", outline: "none", borderRadius: 2, padding: "2px 4px", borderBottom: isHovered ? "1px solid #d1d5db" : "1px solid transparent" }}
            />
            {prop.name !== prop.originalName && <span style={{ fontSize: 10, color: "#9ca3af" }}>({prop.originalName})</span>}
            <button onClick={onRemove} style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
            <ChevronRight size={14} color="#9ca3af" />
        </div>
    );
}

function SortingConfig({
    properties,
    sortBy,
    onChange,
}: {
    properties: TableColumnConfig[];
    sortBy?: string;
    onChange: (next?: string) => void;
}) {
    const selected = properties.find((p) => p.id === sortBy);
    return (
        <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8, letterSpacing: 0.5 }}>DEFAULT SORT</div>
            <select
                value={sortBy ?? ""}
                onChange={(e) => onChange(e.target.value || undefined)}
                style={{ width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 10px", fontSize: 13, color: sortBy ? "#111827" : "#9ca3af", background: "#fff" }}
            >
                <option value="">Select a property to sort by...</option>
                {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
            {selected && (
                <div style={{ marginTop: 8, padding: "8px", border: "1px solid #e5e7eb", borderRadius: 4, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 12, color: "#111827" }}>{selected.name}</div>
                    <div style={{ display: "flex" }}>
                        <div style={{ padding: "2px 6px", background: "#2563eb", color: "white", fontSize: 10, borderBottomLeftRadius: 4, borderTopLeftRadius: 4 }}>A-Z</div>
                        <div style={{ padding: "2px 6px", background: "white", border: "1px solid #d1d5db", borderLeft: "none", color: "#6b7280", fontSize: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4 }}>Z-A</div>
                    </div>
                </div>
            )}
        </>
    );
}

function CollapsibleConfigGroup({ label, children, open = true }: { label: string, children: React.ReactNode, open?: boolean }) {
    const [isOpen, setIsOpen] = useState(open);
    return (
        <div style={{ borderTop: "1px solid #e5e7eb" }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: 0.5 }}>{label}</span>
                <ChevronDown size={14} color="#6b7280" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
            </div>
            {isOpen && <div style={{ paddingBottom: 16 }}>{children}</div>}
        </div>
    );
}

function WidgetConfigPanel({
    widget,
    variables,
    ontologyObjects,
    onUpdate,
    onOpenVariableModal
}: {
    widget: WidgetInstance;
    variables: Variable[];
    ontologyObjects: OntologyObjectType[];
    onUpdate: (config: WidgetConfig) => void;
    onOpenVariableModal: (variableId?: string) => void;
}) {
    const [showVarDropdown, setShowVarDropdown] = useState(false);
    const [availableProperties, setAvailableProperties] = useState<OntologyPropertySummary[]>([]);
    const properties = widget.config.columns ?? [];
    const hasOntologyObjects = ontologyObjects.length > 0;
    const selectedVariable = variables.find((v) => v.objectType === widget.config.objectType);

    useEffect(() => {
        const objectType = widget.config.objectType;
        if (!objectType) {
            setAvailableProperties([]);
            return;
        }
        fetch(`/api/ontology-admin/object-types/${encodeURIComponent(objectType)}`)
            .then((res) => res.json())
            .then((detail) => {
                const list = Array.isArray(detail?.properties) ? detail.properties : [];
                setAvailableProperties(list);
            })
            .catch(() => setAvailableProperties([]));
    }, [widget.config.objectType]);

    useEffect(() => {
        if (!widget.config.objectType) return;
        if ((widget.config.columns?.length ?? 0) > 0) return;
        if (availableProperties.length === 0) return;
        const cols: TableColumnConfig[] = availableProperties.slice(0, 8).map((p) => ({
            id: p.api_name,
            originalName: p.display_name || p.api_name,
            name: p.display_name || p.api_name,
        }));
        onUpdate({ ...widget.config, columns: cols });
    }, [availableProperties, widget.config, onUpdate]);

    const moveProperty = (fromId: string, toId: string) => {
        const fromIndex = properties.findIndex((p) => p.id === fromId);
        const toIndex = properties.findIndex((p) => p.id === toId);
        if (fromIndex < 0 || toIndex < 0) return;
        const next = [...properties];
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item);
        onUpdate({ ...widget.config, columns: next });
    };

    const addAllProperties = () => {
        const cols: TableColumnConfig[] = availableProperties.map((p) => ({
            id: p.api_name,
            originalName: p.display_name || p.api_name,
            name: p.display_name || p.api_name,
        }));
        onUpdate({ ...widget.config, columns: cols });
    };
    const addSingleProperty = (apiName: string) => {
        if (!apiName) return;
        if (properties.some((p) => p.id === apiName)) return;
        const match = availableProperties.find((p) => p.api_name === apiName);
        if (!match) return;
        const next = [...properties, { id: match.api_name, originalName: match.display_name || match.api_name, name: match.display_name || match.api_name }];
        onUpdate({ ...widget.config, columns: next });
    };

    return (
        <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{widget.type === "ObjectTable" ? "Object table 1" : widget.type}</h3>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>OBJECT TABLE</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16, display: "flex", gap: 16 }}>
                    <div style={{ paddingBottom: 8, borderBottom: "2px solid #2563eb", fontSize: 12, fontWeight: 600, color: "#111827" }}>Widget setup</div>
                    <div style={{ paddingBottom: 8, fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Metadata</div>
                    <div style={{ paddingBottom: 8, fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Display</div>
                </div>

                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 16, lineHeight: 1.4 }}>
                    Display objects in a tabular format. The table supports multiple object types, conditional formatting, and derived properties.
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontSize: 12, color: "#2563eb", fontWeight: 500, cursor: "pointer" }}>
                    <HelpCircle size={14} /> Need help? Ask AIP Assist <ChevronRight size={12} style={{ marginLeft: "auto" }} />
                </div>

                <CollapsibleConfigGroup label="INPUT DATA">
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>OBJECT SET <HelpCircle size={10} color="#9ca3af" /></div>
                    {!hasOntologyObjects && <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>No active indexed object types found yet.</div>}
                    <div style={{ position: "relative" }}>
                        <div
                            onClick={() => setShowVarDropdown(!showVarDropdown)}
                            style={{ width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", padding: "0 10px", justifyContent: "space-between", cursor: "pointer", fontSize: 13, color: widget.config.objectType ? "#111827" : "#9ca3af" }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Box size={14} color="#9ca3af" />
                                {widget.config.objectType ? variables.find(v => v.objectType === widget.config.objectType)?.name || widget.config.objectType : "Select object set variable..."}
                            </div>
                            <ChevronDown size={14} color="#6b7280" />
                        </div>
                        {selectedVariable && (
                            <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontSize: 10, color: "#6b7280" }}>
                                    Current value: {(selectedVariable.name || selectedVariable.objectType)} ({(selectedVariable.objectType && selectedVariable.objectType === widget.config.objectType) ? "defined" : "undefined"})
                                </span>
                                <button
                                    onClick={() => onOpenVariableModal(selectedVariable.id)}
                                    style={{ fontSize: 10, color: "#1d4ed8", border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                                >
                                    Object set definition
                                </button>
                            </div>
                        )}
                        {selectedVariable && (
                            <div style={{ marginTop: 4, fontSize: 10, color: "#6b7280", display: "flex", alignItems: "center", gap: 8 }}>
                                <span>Current value:</span>
                                <span style={{ fontWeight: 600, color: "#111827" }}>{widget.config.objectType ? (ontologyObjects.find(o => o.api_name === widget.config.objectType)?.index_count ?? 0) : 0}</span>
                                <span style={{ color: "#2563eb", fontWeight: 600 }}>
                                    {ontologyObjects.find(o => o.api_name === widget.config.objectType)?.plural_display_name || ontologyObjects.find(o => o.api_name === widget.config.objectType)?.display_name || widget.config.objectType}
                                </span>
                            </div>
                        )}

                        {showVarDropdown && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 4, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 4 }}>
                                <div style={{ padding: 8 }}>
                                    <div style={{ position: "relative", marginBottom: 8 }}>
                                        <Search size={14} style={{ position: "absolute", left: 8, top: 10, color: "#9ca3af" }} />
                                        <input placeholder="Search for variable..." style={{ width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 8px 0 28px", fontSize: 12, color: "#111827" }} />
                                    </div>
                                    <div
                                        onClick={() => { onOpenVariableModal(); setShowVarDropdown(false); }}
                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", fontSize: 12, color: "#2563eb", fontWeight: 600 }}
                                    >
                                        <Plus size={14} /> New object set variable
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", padding: "8px 8px 4px" }}>Use an existing variable</div>
                                    {variables.length === 0 && <div style={{ padding: "8px", fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>No variables found</div>}
                                    {variables.map(v => (
                                        <div
                                            key={v.id}
                                            onClick={() => { onUpdate({ ...widget.config, objectType: v.objectType || "", columns: [], sortBy: undefined }); setShowVarDropdown(false); }}
                                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", fontSize: 12, color: "#111827" }}
                                        >
                                            <div style={{ width: 12, height: 12, borderRadius: 2, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={8} /></div> {v.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                        <span style={{ fontSize: 11, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                            ENABLE OBJECT TABLE FILTERING <HelpCircle size={10} color="#9ca3af" />
                        </span>
                        <ToggleSwitch on={false} />
                    </div>
                </CollapsibleConfigGroup>

                <CollapsibleConfigGroup label="COLUMN CONFIGURATION">
                    <div style={{ marginBottom: 8, fontSize: 11, color: "#111827", fontWeight: 600 }}>
                        {ontologyObjects.find(o => o.api_name === widget.config.objectType)?.display_name || widget.config.objectType || "Object"}
                    </div>
                    <div style={{ marginBottom: 8, fontSize: 10, color: "#6b7280" }}>
                        Columns {properties.length}
                    </div>
                    <select
                        defaultValue=""
                        onChange={(e) => {
                            addSingleProperty(e.target.value);
                            e.currentTarget.value = "";
                        }}
                        style={{ width: "100%", height: 30, marginBottom: 8, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 8px", fontSize: 11, background: "#fff" }}
                    >
                        <option value="">+ Add column</option>
                        {availableProperties
                            .filter((p) => !properties.some((c) => c.id === p.api_name))
                            .map((p) => (
                                <option key={p.api_name} value={p.api_name}>{p.display_name || p.api_name}</option>
                            ))}
                    </select>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={addAllProperties}
                            disabled={!widget.config.objectType || availableProperties.length === 0}
                            style={{ flex: 1, height: 30, background: "white", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#374151", opacity: !widget.config.objectType || availableProperties.length === 0 ? 0.5 : 1, cursor: !widget.config.objectType || availableProperties.length === 0 ? "not-allowed" : "pointer" }}
                        >
                            Add all properties
                        </button>
                        <button
                            onClick={() => onUpdate({ ...widget.config, columns: [] })}
                            style={{ flex: 1, height: 30, background: "white", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#6b7280", cursor: "pointer" }}
                        >
                            Remove all properties
                        </button>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {properties.length === 0 && (
                            <div style={{ fontSize: 11, color: "#6b7280" }}>
                                Select an object set and click "Add all properties".
                            </div>
                        )}
                        {properties.map((p, i) => (
                            <PropertyRow
                                key={p.id}
                                prop={p}
                                onMove={moveProperty}
                                onRename={(newName) => {
                                    const next = properties.map((pp, idx) => idx === i ? { ...pp, name: newName } : pp);
                                    onUpdate({ ...widget.config, columns: next });
                                }}
                                onRemove={() => {
                                    const next = properties.filter((pp) => pp.id !== p.id);
                                    onUpdate({ ...widget.config, columns: next, sortBy: widget.config.sortBy === p.id ? undefined : widget.config.sortBy });
                                }}
                            />
                        ))}
                    </div>
                </CollapsibleConfigGroup>

                <CollapsibleConfigGroup label="RIGHT-CLICK MENU" open={false}>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Configure right-click actions for table rows.</div>
                </CollapsibleConfigGroup>

                <CollapsibleConfigGroup label="SELECTION" open={false}>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Configure row selection behavior.</div>
                </CollapsibleConfigGroup>

                <CollapsibleConfigGroup label="DISPLAY & FORMATTING">
                    <SortingConfig
                        properties={properties}
                        sortBy={widget.config.sortBy}
                        onChange={(sortBy) => onUpdate({ ...widget.config, sortBy })}
                    />
                </CollapsibleConfigGroup>
            </div>
        </>
    );
}

function VariableModal({
    objectTypes,
    initialVariable,
    onClose,
    onSave
}: {
    objectTypes: OntologyObjectType[];
    initialVariable?: Variable | null;
    onClose: () => void;
    onSave: (v: Variable) => void;
}) {
    const [step, setStep] = useState(1);
    const [name, setName] = useState(initialVariable?.name || "Object Set");
    const [selectedObject, setSelectedObject] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [hoveredObject, setHoveredObject] = useState<any>(null);

    useEffect(() => {
        if (!initialVariable) return;
        setName(initialVariable.name || "Object Set");
        if (initialVariable.objectType) {
            const ot = objectTypes.find((o) => o.api_name === initialVariable.objectType);
            if (ot) {
                setSelectedObject({
                    id: ot.api_name,
                    name: ot.plural_display_name || ot.display_name || ot.api_name,
                });
            }
        }
    }, [initialVariable, objectTypes]);

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 700, pointerEvents: "auto", background: "white", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column", height: 500, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.3)" }}>
                <div style={{ padding: "12px 16px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 20, height: 20, background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={12} color="#9ca3af" /></div>
                        <input value={name} onChange={(e) => setName(e.target.value)} style={{ background: "transparent", border: "none", fontSize: 13, fontWeight: 600, color: "#111827", outline: "none", width: 200 }} />
                        <Edit size={12} color="#9ca3af" cursor="pointer" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ padding: "4px 8px", background: "#f3f4f6", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Object set definition</div>
                        <Trash2 size={16} color="#9ca3af" cursor="pointer" />
                        <X size={18} color="#9ca3af" cursor="pointer" onClick={onClose} />
                    </div>
                </div>

                <div style={{ display: "flex", height: 32, borderBottom: "1px solid #e5e7eb", padding: "0 16px" }}>
                    <div style={{ height: "100%", borderBottom: "2px solid #2563eb", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12, fontWeight: 600, color: "#111827" }}>Definition</div>
                    <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Settings</div>
                </div>

                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                    <div style={{ flex: 1, padding: 24, borderRight: "1px solid #e5e7eb", background: "#f9fafb" }}>
                        <div style={{ position: "relative", zIndex: 100 }}>
                            <div
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                style={{ width: "100%", height: 36, background: "white", border: "1px solid #2563eb", borderRadius: 4, display: "flex", alignItems: "center", padding: "0 12px", justifyContent: "space-between", cursor: "pointer", fontSize: 13, color: selectedObject ? "#111827" : "#2563eb", fontWeight: selectedObject ? 500 : 400 }}
                            >
                                {selectedObject ? selectedObject.name : "Select starting object set..."}
                                <ChevronDown size={14} />
                            </div>

                            {isDropdownOpen && (
                                <div style={{ position: "absolute", top: "100%", left: 0, width: 600, background: "white", border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)", marginTop: 4, display: "flex" }}>
                                    <div style={{ width: 300, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
                                        <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
                                            <div style={{ position: "relative" }}>
                                                <Search size={14} style={{ position: "absolute", left: 8, top: 8, color: "#9ca3af" }} />
                                                <input
                                                    autoFocus
                                                    placeholder="Search object types..."
                                                    style={{ width: "100%", height: 28, border: "none", outline: "none", paddingLeft: 28, fontSize: 13 }}
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#4b5563", cursor: "pointer" }}>
                                                <Filter size={12} /> All ontologies <ChevronDown size={12} />
                                            </div>
                                        </div>
                                        <div style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Search Results</div>
                                            {objectTypes.length === 0 && <div style={{ fontSize: 12, color: "#6b7280", paddingLeft: 4 }}>No indexed object types available.</div>}
                                            {objectTypes.filter(ot => ((ot.plural_display_name || ot.display_name || ot.api_name).toLowerCase()).includes(searchTerm.toLowerCase())).map(ot => (
                                                <div
                                                    key={ot.api_name}
                                                    onMouseEnter={() => setHoveredObject({ name: ot.plural_display_name || ot.display_name || ot.api_name, id: ot.api_name, type: `${ot.index_count ?? 0} objects`, deps: "Ready for Workshop" })}
                                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderRadius: 4, background: hoveredObject?.id === ot.api_name ? "#f3f4f6" : "transparent" }}
                                                >
                                                    <div style={{ width: 16, height: 16, background: "#4f46e5", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={10} color="white" /></div>
                                                    <div style={{ fontSize: 13, color: "#111827", fontWeight: 500, flex: 1 }}>{ot.plural_display_name || ot.display_name || ot.api_name}</div>
                                                    <div style={{ width: 10, height: 14, background: "#d1d5db", borderRadius: 2 }} />
                                                </div>
                                            ))}
                                            <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                                                Refine your search term to find more results.
                                            </div>
                                        </div>
                                    </div>

                                    {/* PREVIEW PANE */}
                                    <div style={{ width: 300, background: "#ffffff", display: "flex", flexDirection: "column" }}>
                                        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
                                            <ArrowLeft size={16} color="#6b7280" />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", textTransform: "uppercase" }}>PREVIEW</span>
                                        </div>
                                        {hoveredObject ? (
                                            <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column" }}>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                                                    <div style={{ width: 24, height: 24, background: "#4f46e5", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={14} color="white" /></div>
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{hoveredObject.name}</div>
                                                        <div style={{ fontSize: 12, color: "#6b7280" }}>{hoveredObject.type}</div>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 12, color: "#2563eb", marginBottom: 16, fontWeight: 500, cursor: "pointer" }}>
                                                    {hoveredObject.deps} • Ontologize Public Ontology
                                                </div>
                                                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>No description</div>

                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Properties (11)</div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, overflowY: "auto", borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827" }}><span style={{ color: "#9ca3af" }}>""</span> Item Name <span style={{ padding: "2px 4px", background: "#f3f4f6", fontSize: 10, borderRadius: 2, marginLeft: "auto" }}>Title</span></div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827" }}><span style={{ color: "#9ca3af" }}>""</span> Order Id <span style={{ padding: "2px 4px", background: "#f3f4f6", fontSize: 10, borderRadius: 2, marginLeft: "auto" }}>PK</span></div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827" }}><span style={{ color: "#9ca3af" }}>""</span> Assignee</div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setSelectedObject({ name: hoveredObject.name, id: hoveredObject.id });
                                                        setName(`${hoveredObject.name} Object Set`);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    style={{ width: "100%", height: 32, background: "#1d4ed8", color: "white", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 16 }}
                                                >
                                                    Select
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af" }}>
                                                Hover over a result to preview
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedObject && (
                                <div style={{ marginTop: 24 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
                                        <Plus size={14} /> On a property
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
                                        <span style={{ width: 14, height: 14, border: "1px solid #9ca3af", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>x</span> Using a variable
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", fontSize: 12, cursor: "pointer" }}>
                                        <Link2 size={14} /> Get linked objects
                                    </div>

                                    <button
                                        onClick={() => onSave({ id: initialVariable?.id || Date.now().toString(), name, type: "object-set", objectType: selectedObject.id })}
                                        style={{ marginTop: 32, width: "100%", height: 32, background: "#2563eb", color: "white", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                                    >
                                        Save changes
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ width: 240, background: "#ffffff", padding: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 16 }}>Current Value</div>
                        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>undefined</div>

                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 16 }}>Variable Usage</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Grid size={16} color="#6b7280" />
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Widgets 1</div>
                                <div style={{ fontSize: 11, color: "#2563eb" }}>USED IN Object table 1</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CapabilityItem({ icon: Icon, label, count, color }: { icon: any, label: string, count: number, color: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#111827", fontWeight: 500 }}>
            <Icon size={16} color={color} />
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{count}</span>
        </div>
    );
}

function ConfigGroup({ label, children }: { label: string, children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
            {children}
        </div>
    );
}

function IconSquare({ icon: Icon, label, isSelected }: { icon: any, label: string, isSelected?: boolean }) {
    return (
        <div style={{
            width: 48, height: 48, borderRadius: 6, border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb", background: isSelected ? "#eff6ff" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
        }}>
            <Icon size={20} color={isSelected ? "#2563eb" : "#4b5563"} />
        </div>
    );
}

function ColorSquare({ color, isSelected, onClick }: { color: string, label: string, isSelected?: boolean, onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            style={{
                width: 48, height: 32, borderRadius: 4, background: color, border: isSelected ? "2px solid #000" : "1px solid transparent",
                cursor: "pointer", position: "relative"
            }}
        >
            {isSelected && <div style={{ position: "absolute", top: -2, right: -2, width: 12, height: 12, background: "#fff", borderRadius: 6, border: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={8} /></div>}
        </div>
    );
}

function LayoutTemplateToggle({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
    return (
        <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <div style={{ width: 40, height: 32, background: active ? "#eff6ff" : "#f3f4f6", border: active ? "1px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 4 }}></div>
            <div style={{ fontSize: 10, color: active ? "#1d4ed8" : "#6b7280", fontWeight: active ? 700 : 500 }}>{label}</div>
        </div>
    );
}

function SectionConfigPanel({
    sectionName,
    layoutDirection,
    flexValue,
    onLayoutDirectionChange,
    onFlexValueChange,
}: {
    sectionName: string;
    layoutDirection: "columns" | "rows";
    flexValue: number;
    onLayoutDirectionChange: (next: "columns" | "rows") => void;
    onFlexValueChange: (next: number) => void;
}) {
    return (
        <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Section</h3>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>EMPTY SECTION</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                <ConfigGroup label="SECTION NAME">
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827" }} value={sectionName} readOnly />
                </ConfigGroup>

                <ConfigGroup label="DIMENSIONS">
                    <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 8 }}>COLUMN WIDTH</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 6, padding: 2, flex: 1 }}>
                            <button onClick={() => onLayoutDirectionChange("rows")} style={{ flex: 1, height: 28, background: layoutDirection === "rows" ? "#ffffff" : "transparent", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Absolute</button>
                            <button onClick={() => onLayoutDirectionChange("columns")} style={{ flex: 1, height: 28, background: layoutDirection === "columns" ? "#ffffff" : "transparent", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, color: "#111827", boxShadow: layoutDirection === "columns" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Flex</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                                style={{ width: 60, height: 32, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, textAlign: "center", color: "#111827" }}
                                value={String(flexValue)}
                                onChange={(e) => onFlexValueChange(Math.max(0.3, Number(e.target.value) || 1))}
                            />
                            <div style={{ fontSize: 13, color: "#6b7280" }}>flex</div>
                        </div>
                    </div>
                </ConfigGroup>

                <ConfigGroup label="SECTION HEADER">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "#4b5563" }}>STYLE</div>
                        <ToggleSwitch on={true} />
                    </div>
                    <div style={{ width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", padding: "0 10px", justifyContent: "space-between", cursor: "pointer", fontSize: 13, color: "#111827", marginBottom: 12 }}>
                        Subheader <ChevronDown size={14} color="#6b7280" />
                    </div>
                    <div style={{ position: "relative" }}>
                        <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 8 }}>TITLE</div>
                        <input style={{ width: "100%", padding: "8px 12px", paddingRight: 70, border: "1px solid #2563eb", borderRadius: 6, fontSize: 13, color: "#111827" }} defaultValue="Section" />
                        <div style={{ position: "absolute", right: 8, top: 24, fontSize: 11, color: "#2563eb", fontWeight: 600 }}>Use variable</div>
                    </div>
                </ConfigGroup>

                <ConfigGroup label="FORMATTING">
                    <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 8 }}>HEADER FORMAT</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1, height: 32, border: "1px solid #d1d5db", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#374151", background: "#f9fafb" }}>Title</div>
                        <div style={{ flex: 1, height: 32, border: "1px solid #2563eb", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#1e40af", background: "#eff6ff" }}>Title</div>
                        <div style={{ flex: 1, height: 32, background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>Title</div>
                    </div>
                </ConfigGroup>
            </div>
        </>
    );
}
