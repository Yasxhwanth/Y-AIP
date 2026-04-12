"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Database, Settings, ArrowLeft, Zap, Link2, AlertCircle,
    CheckCircle, Clock, RefreshCw, Eye, Table2, Share2, Key,
    ChevronRight, Shield, Layers, Briefcase, Box, Activity,
    BarChart2, History, Plus, Info, Search, LayoutTemplate
} from "lucide-react";

const API_BASE = "/api/ontology-admin";

interface OntologyProperty {
    api_name: string;
    display_name: string;
    data_type: string;
    is_primary_key: boolean;
    is_required: boolean;
}

interface OntologyActionType {
    api_name: string;
    display_name: string;
    description?: string;
    action_type?: string;
}

interface OntologyLinkType {
    api_name: string;
    display_name_a_side?: string;
    display_name_b_side?: string;
    source?: string;
    target?: string;
}

interface ObjectType {
    api_name: string;
    display_name: string;
    plural_display_name?: string;
    description?: string;
    primary_key?: string;
    title_property?: string;
    backing_source?: string;
    icon?: string;
    index_status?: string;
    index_count?: number;
    last_synced?: string;
    properties: OntologyProperty[];
    action_types?: OntologyActionType[];
    link_types?: OntologyLinkType[];
    implements?: { api_name: string; display_name: string }[];
    status?: string;
    visibility?: string;
    ontology_name?: string;
    point_of_contact?: string;
    contributors?: string;
}

interface PreviewData {
    columns: { name: string; type: string }[];
    rows: Record<string, string>[];
    total?: number;
}

const TYPE_ICON: Record<string, string> = {
    string: "T·",
    integer: "12",
    double: "1.2",
    date: "📅",
    boolean: "✓",
};

const TYPE_COLOR: Record<string, string> = {
    string: "#6b7280",
    integer: "#2563eb",
    double: "#7c3aed",
    date: "#d97706",
    boolean: "#059669",
};

function IndexStatusBadge({ status, count }: { status?: string; count?: number }) {
    const cfg = {
        active: { color: "#059669", bg: "#ecfdf5", label: "Active", Icon: CheckCircle },
        indexing: { color: "#d97706", bg: "#fffbeb", label: "Indexing…", Icon: RefreshCw },
        error: { color: "#dc2626", bg: "#fef2f2", label: "Error", Icon: AlertCircle },
        pending: { color: "#6b7280", bg: "#f3f4f6", label: "Pending", Icon: Clock },
    }[status ?? "pending"] ?? { color: "#6b7280", bg: "#f3f4f6", label: "Unknown", Icon: Clock };

    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
            borderRadius: 999, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600
        }}>
            <cfg.Icon size={12} style={{ animation: status === "indexing" ? "spin 1s linear infinite" : undefined }} />
            {cfg.label}{status === "indexing" && count !== undefined ? ` (${count.toLocaleString()})` : ""}
        </span>
    );
}

export default function ObjectTypeDetailPage() {
    const params = useParams<{ apiName: string }>();
    const router = useRouter();
    const apiName = params?.apiName ?? "";

    const [objectType, setObjectType] = useState<ObjectType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "properties" | "datasources" | "actions">("overview");
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewHeight, setPreviewHeight] = useState(280);
    const [isResizing, setIsResizing] = useState(false);
    const [indexStatus, setIndexStatus] = useState<{ index_status: string; index_count: number } | null>(null);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [saving, setSaving] = useState(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 100 && newHeight < window.innerHeight - 150) {
                setPreviewHeight(newHeight);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    const fetchObjectType = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/object-types/${apiName}`);
            if (!res.ok) {
                setError(`Object type '${apiName}' not found`);
                return;
            }
            const data = await res.json() as ObjectType;
            setObjectType(data);
        } catch {
            setError("Failed to load object type");
        } finally {
            setLoading(false);
        }
    }, [apiName]);

    const fetchIndexStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/object-types/${apiName}/index-status`);
            if (res.ok) {
                const data = await res.json() as { index_status: string; index_count: number };
                setIndexStatus(data);
                // Poll while indexing
                if (data.index_status === "indexing") {
                    setTimeout(fetchIndexStatus, 1000);
                }
            }
        } catch { /* ignore */ }
    }, [apiName]);

    const fetchPreview = useCallback(async () => {
        if (!objectType?.backing_source) return;
        setLoadingPreview(true);
        try {
            const res = await fetch(`${API_BASE}/datasets/${objectType.backing_source}/preview`);
            if (res.ok) {
                const data = await res.json() as PreviewData;
                setPreview(data);
            }
        } catch { /* ignore */ }
        setLoadingPreview(false);
    }, [objectType?.backing_source]);

    useEffect(() => { fetchObjectType(); }, [fetchObjectType]);
    useEffect(() => { fetchIndexStatus(); }, [fetchIndexStatus]);
    useEffect(() => {
        if (objectType && activeTab === "datasources") fetchPreview();
    }, [objectType, activeTab, fetchPreview]);

    const handleUpdateMetadata = async (field: keyof ObjectType, value: string) => {
        if (!objectType) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/object-types/${apiName}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [field]: value }),
            });
            if (res.ok) {
                const data = await res.json();
                if (field === "api_name" && value !== apiName) {
                    router.push(`/ontology/${value}`);
                } else {
                    await fetchObjectType();
                }
                setIsEditing(null);
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            alert("Failed to update metadata");
        } finally {
            setSaving(false);
        }
    };

    const NAV_TABS = [
        { id: "overview", label: "Overview", icon: Eye },
        { id: "properties", label: `Properties ${objectType?.properties?.length ?? ""}`, icon: Settings },
        { id: "security", label: "Security", icon: Shield },
        { id: "datasources", label: "Datasources", icon: Database },
        { id: "capabilities", label: "Capabilities", icon: Zap },
        { id: "object-views", label: "Object views", icon: Layers },
        { id: "interfaces", label: "Interfaces", icon: Briefcase },
        { id: "materializations", label: "Materializations", icon: Box },
        { id: "automations", label: "Automations", icon: Activity },
        { id: "usage", label: "Usage", icon: BarChart2 },
        { id: "history", label: "History", icon: History },
    ] as const;

    if (loading) {
        return (
            <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: "#6b7280" }}>
                <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
                Loading object type…
            </div>
        );
    }

    if (error || !objectType) {
        return (
            <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", gap: 16 }}>
                <AlertCircle size={40} color="#dc2626" />
                <p style={{ color: "#374151", fontSize: 16 }}>{error ?? "Object type not found"}</p>
                <button onClick={() => router.push("/ontology")} style={{ padding: "8px 16px", background: "#2563eb", border: "none", borderRadius: 6, color: "white", cursor: "pointer" }}>
                    ← Back to Ontology
                </button>
            </div>
        );
    }

    const currentIndex = indexStatus ?? { index_status: objectType.index_status ?? "pending", index_count: objectType.index_count ?? 0 };

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif", color: "#111827", background: "#ffffff", overflow: "hidden" }}>
            {/* ── TOP HEADER ── */}
            <div style={{ height: 48, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", background: "#ffffff", flexShrink: 0 }}>
                <Box size={16} color="#4f46e5" />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Ontology Manager</span>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* ── LEFT NAV ── */}
                <div style={{ width: 220, borderRight: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
                    <div style={{ padding: "0 16px 16px" }}>
                        <button onClick={() => router.push("/ontology")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "4px 0", fontWeight: 500 }}>
                            <ArrowLeft size={14} /> Discover
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, background: "#ffffff", padding: "8px", borderRadius: 6, border: "1px solid #e5e7eb", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                            <div style={{ width: 24, height: 24, borderRadius: 4, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Box size={14} color="#4f46e5" />
                            </div>
                            <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{objectType.display_name}</div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{indexStatus?.index_count?.toLocaleString() ?? "0"} objects</div>
                            </div>
                            {(indexStatus?.index_status === "indexing") ? (
                                <span title="Running initial sync" style={{ display: "flex" }}><RefreshCw size={14} color="#d97706" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} /></span>
                            ) : indexStatus?.index_status === "active" ? (
                                <span title="Indexed" style={{ display: "flex" }}><CheckCircle size={14} color="#059669" style={{ flexShrink: 0 }} /></span>
                            ) : objectType.index_status === "error" ? (
                                <AlertCircle size={14} color="#dc2626" style={{ flexShrink: 0 }} />
                            ) : null}
                        </div>

                        {/* Index status chip — shown when syncing */}
                        {(indexStatus?.index_status === "indexing" || objectType.index_status === "indexing") && (
                            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#92400e" }}>
                                <RefreshCw size={11} style={{ animation: "spin 1.5s linear infinite", flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: 700 }}>Running initial sync</div>
                                    <div style={{ color: "#b45309", marginTop: 1 }}>Started by objects-data-funnel</div>
                                    <div style={{ marginTop: 4, color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>View index status →</div>
                                </div>
                            </div>
                        )}

                    </div>

                    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                        {NAV_TABS.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 24px", background: activeTab === tab.id ? "#ffffff" : "none",
                                    border: "none",
                                    boxShadow: activeTab === tab.id ? "inset 3px 0 0 #2563eb, 0 1px 2px rgba(0,0,0,0.05)" : "none",
                                    color: activeTab === tab.id ? "#111827" : "#4b5563", cursor: "pointer",
                                    fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, textAlign: "left"
                                }}>
                                <tab.icon size={14} color={activeTab === tab.id ? "#2563eb" : "#6b7280"} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── MAIN CONTENT & PREVIEW SPLIT ── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f3f4f6", overflow: "hidden" }}>

                    {/* SCROLLABLE MAIN BODY */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Box size={24} color="#4f46e5" />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
                                    {objectType.display_name}
                                </h1>
                                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                                    Object type · {currentIndex.index_count?.toLocaleString() ?? "0"} objects
                                </div>
                            </div>
                        </div>

                        <button style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 24, fontWeight: 500 }}>
                            <Plus size={14} /> Add to group
                        </button>

                        {/* GRID LAYOUT */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
                            {/* Card 1: Details & Config */}
                            <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 4, display: "flex" }}>
                                {/* Left Info Col */}
                                <div style={{ flex: 1, padding: 24, borderRight: "1px solid #e5e7eb" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "16px 0", fontSize: 13 }}>
                                        <div style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>Plural name <span style={{ color: "#059669", fontSize: 14 }}>●</span></div>
                                        <div onClick={() => { setIsEditing("plural_display_name"); setEditValue(objectType.plural_display_name || ""); }} style={{ color: "#111827", fontWeight: 500, cursor: "pointer", borderBottom: isEditing === "plural_display_name" ? "none" : "1px dashed #d1d5db" }}>
                                            {isEditing === "plural_display_name" ? (
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleUpdateMetadata("plural_display_name", editValue)} onKeyDown={e => e.key === "Enter" && handleUpdateMetadata("plural_display_name", editValue)} style={{ width: "100%", border: "1px solid #2563eb", borderRadius: 4, padding: "2px 4px" }} />
                                            ) : (
                                                objectType.plural_display_name || `${objectType.display_name}s`
                                            )}
                                        </div>

                                        <div style={{ color: "#6b7280" }}>Description</div>
                                        <div onClick={() => { setIsEditing("description"); setEditValue(objectType.description || ""); }} style={{ color: "#111827", cursor: "pointer", borderBottom: isEditing === "description" ? "none" : "1px dashed #d1d5db" }}>
                                            {isEditing === "description" ? (
                                                <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleUpdateMetadata("description", editValue)} style={{ width: "100%", border: "1px solid #2563eb", borderRadius: 4, padding: "2px 4px", minHeight: 60 }} />
                                            ) : (
                                                objectType.description || "Type here..."
                                            )}
                                        </div>

                                        <div style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>Aliases <Info size={12} color="#9ca3af" /></div>
                                        <div style={{ color: "#6b7280" }}>Add aliases...</div>

                                        <div style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>Point of contact <Info size={12} color="#9ca3af" /></div>
                                        <div style={{ color: "#111827" }}>None</div>

                                        <div style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>Contributors <Info size={12} color="#9ca3af" /></div>
                                        <div style={{ color: "#111827" }}>None</div>

                                        <div style={{ color: "#6b7280" }}>Ontology</div>
                                        <div style={{ color: "#111827", fontWeight: 500 }}>{objectType.ontology_name || "Ontologize Public Ontology"}</div>

                                        <div style={{ color: "#6b7280" }}>API name</div>
                                        <div onClick={() => { setIsEditing("api_name"); setEditValue(objectType.api_name); }} style={{ color: "#111827", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: isEditing === "api_name" ? "none" : "1px dashed #d1d5db" }}>
                                            {isEditing === "api_name" ? (
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleUpdateMetadata("api_name", editValue)} onKeyDown={e => e.key === "Enter" && handleUpdateMetadata("api_name", editValue)} style={{ width: "100%", border: "1px solid #2563eb", borderRadius: 4, padding: "2px 4px" }} />
                                            ) : (
                                                <>
                                                    {objectType.api_name}
                                                    {objectType.api_name.includes(" ") && <span style={{ fontSize: 10, padding: "2px 6px", background: "#fee2e2", color: "#dc2626", borderRadius: 4, fontWeight: 600 }}>invalid</span>}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {/* Right Config Col */}
                                <div style={{ width: 300, display: "flex", flexDirection: "column" }}>
                                    <div style={{ padding: 24, flex: 1, borderBottom: "1px solid #e5e7eb" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                            <span style={{ fontSize: 13, color: "#6b7280" }}>Status</span>
                                            <span style={{ fontSize: 12, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, cursor: "pointer" }}>
                                                {objectType.status || "Experimental"} <ChevronRight size={12} style={{ transform: "rotate(90deg)" }} />
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                            <span style={{ fontSize: 13, color: "#6b7280" }}>Visibility</span>
                                            <span style={{ fontSize: 13, color: "#111827", display: "flex", alignItems: "center", gap: 6, fontWeight: 500, cursor: "pointer" }}>
                                                <Eye size={14} color="#2563eb" /> {objectType.visibility || "Normal"} <ChevronRight size={12} style={{ transform: "rotate(90deg)" }} />
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: 13, color: "#6b7280" }}>Edits</span>
                                            <span style={{ fontSize: 12, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>Disabled</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                                            <span style={{ fontSize: 13, color: "#6b7280" }}>Index status</span>
                                            {(indexStatus?.index_status === "indexing" || currentIndex.index_status === "indexing") ? (
                                                <span style={{ fontSize: 12, color: "#d97706", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                                                    <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Running initial sync
                                                </span>
                                            ) : (currentIndex.index_status === "active") ? (
                                                <span style={{ fontSize: 12, color: "#059669", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                                                    <CheckCircle size={12} /> Active
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                                                    <Clock size={12} /> Pending
                                                </span>
                                            )}
                                        </div>

                                    </div>
                                    <div style={{ padding: "16px 24px", background: "#f9fafb", borderRadius: "0 0 4px 0" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                            <span style={{ fontSize: 12, color: "#6b7280" }}>ID</span>
                                            <span style={{ fontSize: 13, color: "#111827", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                                                {objectType.api_name.toLowerCase().replace(/_/g, '-')} <Info size={12} color="#9ca3af" />
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: 12, color: "#6b7280" }}>RID</span>
                                            <span style={{ fontSize: 13, color: "#111827" }}>Set on save</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2/3 Row: Properties & Actions */}
                            <div style={{ display: "flex", gap: 24 }}>
                                {/* Properties Card */}
                                <div style={{ flex: 1, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 4 }}>
                                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
                                            Properties <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{objectType.properties.length}</span>
                                        </div>
                                        <button style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                                            <Plus size={14} /> New
                                        </button>
                                    </div>
                                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                                        {objectType.properties.slice(0, 10).map((p, i) => (
                                            <div key={p.api_name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", fontWeight: 500, paddingBottom: 12, borderBottom: i < 9 ? "1px solid #f3f4f6" : "none" }}>
                                                <div style={{ width: 24, fontSize: 12, color: "#9ca3af", fontFamily: "monospace", textAlign: "center", background: "#f9fafb", padding: "2px 0", borderRadius: 4 }}>
                                                    {TYPE_ICON[p.data_type] || "T"}
                                                </div>
                                                {p.display_name}
                                                {p.is_primary_key && <Key size={12} color="#4f46e5" />}
                                                {p.is_required && <span style={{ color: "#059669", fontSize: 16, lineHeight: 1 }}>●</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions Card */}
                                <div style={{ flex: 1, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 4, display: "flex", flexDirection: "column" }}>
                                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
                                            Action types <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{objectType.action_types?.length || 0}</span>
                                        </div>
                                        <button style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                                            <Plus size={14} /> New
                                        </button>
                                    </div>
                                    {objectType.action_types && objectType.action_types.length > 0 ? (
                                        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                                            {objectType.action_types.map((a: any) => (
                                                <div key={a.api_name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", fontWeight: 500 }}>
                                                    <Zap size={14} color="#7c3aed" /> {a.display_name}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 12, color: "#9ca3af" }}>
                                            <div style={{ width: 48, height: 48, borderRadius: 24, background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Zap size={20} color="#d1d5db" />
                                            </div>
                                            <span style={{ fontSize: 13, color: "#6b7280" }}>No action types using this object type</span>
                                        </div>
                                    )}
                                </div>

                                {/* Card 4: Dependents */}
                                <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 4, display: "flex", flexDirection: "column" }}>
                                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                                            Dependents
                                        </div>
                                    </div>
                                    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 6, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <LayoutTemplate size={18} color="#4f46e5" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Workshop</div>
                                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Build interactive applications using this object type</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => router.push("/workshop")}
                                                style={{ background: "#f3f4f6", border: "none", color: "#2563eb", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                                            >
                                                Create your first
                                            </button>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.5 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <Zap size={18} color="#9ca3af" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Actions</div>
                                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Manage data modification workflows</div>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 11, color: "#9ca3af" }}>0 dependents</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BOTTOM PREVIEW PANEL (Persistent) */}
                    <div style={{ position: "relative", height: previewHeight, background: "#ffffff", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0, boxShadow: "0 -4px 6px -1px rgba(0,0,0,0.05)" }}>
                        {/* Resizer Handle */}
                        <div
                            onMouseDown={startResizing}
                            style={{
                                position: "absolute", top: -3, left: 0, right: 0, height: 6,
                                cursor: "row-resize", zIndex: 50,
                                background: isResizing ? "#2563eb" : "transparent",
                                transition: "background 0.2s"
                            }}
                        />

                        {/* Panel Header */}
                        <div style={{ padding: "6px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#111827", fontWeight: 600 }}>
                                <Box size={14} color="#4f46e5" />
                                {objectType.display_name} <ChevronRight size={14} color="#9ca3af" style={{ transform: "rotate(90deg)" }} />
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <button style={{ border: "none", background: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2563eb", fontWeight: 600, cursor: "pointer" }}>
                                    <Search size={14} /> Preview objects
                                </button>
                                <button style={{ border: "none", background: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                                    Preview table <ChevronRight size={14} color="#9ca3af" style={{ transform: "rotate(90deg)" }} />
                                </button>
                            </div>
                        </div>

                        {/* Banner */}
                        <div style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe", padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1e3a8a", fontWeight: 600 }}>
                            <Info size={14} color="#3b82f6" fill="#eff6ff" style={{ borderRadius: 100 }} />
                            Edits are not included in this preview
                        </div>

                        {/* Data Table */}
                        <div style={{ flex: 1, overflow: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800, textAlign: "left" }}>
                                <thead style={{ position: "sticky", top: 0, background: "#ffffff", zIndex: 10 }}>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                        <th style={{ width: 40, borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "4px 8px", background: "#fff" }}></th>
                                        {preview?.columns.map(c => (
                                            <th key={c.name} style={{ padding: "6px 12px", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", background: "#fff", minWidth: 120 }}>
                                                <div style={{ fontSize: 12, color: "#111827", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                                                    {c.name} <ChevronRight size={12} color="#d1d5db" style={{ transform: "rotate(90deg)" }} />
                                                </div>
                                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 400, marginTop: 4 }}>
                                                    {c.type === "string" ? "String" : c.type === "integer" ? "Integer" : c.type === "date" ? "Timestamp" : c.type === "boolean" ? "Boolean" : c.type}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {!preview ? (
                                        <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#6b7280", fontSize: 13 }}>{loadingPreview ? "Loading preview..." : "No data"}</td></tr>
                                    ) : preview.rows.slice(0, 10).map((r, rowIdx) => (
                                        <tr key={rowIdx}>
                                            <td style={{ padding: "4px 8px", fontSize: 11, color: "#9ca3af", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", textAlign: "center", background: "#f9fafb" }}>{rowIdx + 1}</td>
                                            {preview.columns.map((c, colIdx) => (
                                                <td key={c.name} style={{ padding: "0", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
                                                    {/* Emulate the selected cell from the screenshot showing a blue box */}
                                                    <div style={{ padding: "6px 12px", fontSize: 12, color: "#111827", fontFamily: c.type === "integer" || c.type === "double" ? "monospace" : undefined, border: rowIdx === 0 && colIdx === 0 ? "2px solid #2563eb" : "2px solid transparent" }}>
                                                        {r[c.name] ?? "null"}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {preview?.rows && preview.rows.length < 5 && (
                                        // Fill empty space if few rows
                                        [...Array(5 - preview.rows.length)].map((_, i) => (
                                            <tr key={`empty-${i}`}>
                                                <td style={{ padding: "12px 8px", borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}></td>
                                                {preview.columns.map(c => (
                                                    <td key={c.name} style={{ borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}></td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

