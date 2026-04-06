"use client";
/**
 * app/ontology/page.tsx — Visual Ontology Manager (VOM)
 * 1:1 Palantir Ontology Manager with 4 tabs:
 *   1. Objects   — Object Type registry (entity schema builder)
 *   2. Links     — Link Type registry (relationship mapper with cardinality)
 *   3. Actions   — Action Type registry (kinetics: typed mutations + HITL)
 *   4. Interfaces— Interface registry (abstract polymorphic shapes)
 */

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirroring the Palantir Ontology data model exactly)
// ─────────────────────────────────────────────────────────────────────────────
interface OntologyProperty { api_name: string; display_name: string; data_type: string; is_primary_key: boolean; is_required: boolean; }
interface OntologyObjectType { api_name: string; display_name: string; plural_display_name: string; description: string; primary_key: string; title_property: string; backing_source: string; icon: string; properties: OntologyProperty[]; implements: string[]; link_types?: unknown[]; action_types?: unknown[]; }
interface OntologyLinkType { api_name: string; display_name_a_side: string; display_name_b_side: string; cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY"; source: string; source_display: string; target: string; target_display: string; }
interface OntologyActionParameter { api_name: string; display_name: string; data_type: string; object_type_ref: string | null; is_required: boolean; description: string; }
interface OntologyActionType { api_name: string; display_name: string; description: string; status: string; hitl_level: number; writeback_target: string; parameters: OntologyActionParameter[]; targets: string[]; }
interface OntologyInterface { api_name: string; display_name: string; description: string; properties: OntologyProperty[]; implemented_by: string[]; }
interface OntologySchema { object_types: OntologyObjectType[]; link_types: OntologyLinkType[]; action_types: OntologyActionType[]; interfaces: OntologyInterface[]; }

const API_BASE = "/api/ontology-admin";
const TABS = ["Objects", "Links", "Actions", "Interfaces"] as const;
type Tab = typeof TABS[number];

const HITL_LABELS: Record<number, string> = { 1: "Level 1 — Immediate", 2: "Level 2 — Supervisor Approval", 3: "Level 3 — Compliance Officer" };
const CARDINALITY_LABELS: Record<string, string> = { ONE_TO_ONE: "One↔One", ONE_TO_MANY: "One↠Many", MANY_TO_MANY: "Many↔Many" };
const DATA_TYPES = ["string", "integer", "double", "boolean", "date", "timestamp"];

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────────────────────
function Badge({ label, color = "#4f8" }: { label: string; color?: string }) {
    return <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{label}</span>;
}
function StatusDot({ active }: { active: boolean }) {
    return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: active ? "#00ff88" : "#ff4444", marginRight: 6 }} />;
}
function Card({ children, onClick, selected }: { children: React.ReactNode; onClick?: () => void; selected?: boolean }) {
    return (
        <div onClick={onClick} style={{ background: selected ? "#1a2940" : "#111827", border: `1px solid ${selected ? "#3b82f6" : "#1f2937"}`, borderRadius: 8, padding: "14px 18px", cursor: onClick ? "pointer" : "default", transition: "all 0.15s", marginBottom: 8 }}>
            {children}
        </div>
    );
}
function Pill({ text }: { text: string }) {
    return <span style={{ background: "#1e3a5f", color: "#60a5fa", borderRadius: 12, padding: "2px 10px", fontSize: 11, marginRight: 4 }}>{text}</span>;
}
function SectionTitle({ title, count }: { title: string; count?: number }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h2 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
            {count !== undefined && <Badge label={String(count)} color="#60a5fa" />}
        </div>
    );
}
function EmptyState({ message }: { message: string }) {
    return <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280", fontSize: 14 }}>{message}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main VOM Component
// ─────────────────────────────────────────────────────────────────────────────
import {
    Database,
    Link2,
    Zap,
    Share2,
    Compass,
    FileText,
    History,
    ChevronDown,
    Plus,
    Search as SearchIcon,
    GitBranch,
    ExternalLink,
    MoreVertical,
    Clock,
    LayoutGrid,
    HelpCircle,
    Settings,
    Grid
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Main VOM Component
// ─────────────────────────────────────────────────────────────────────────────
export default function OntologyManagerPage() {
    const [view, setView] = useState<"discover" | Tab>("discover");
    const [activeBranch, setActiveBranch] = useState("Main");
    const [schema, setSchema] = useState<OntologySchema | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedObject, setSelectedObject] = useState<OntologyObjectType | null>(null);
    const [selectedAction, setSelectedAction] = useState<OntologyActionType | null>(null);
    const [selectedInterface, setSelectedInterface] = useState<OntologyInterface | null>(null);

    // Dropdowns
    const [showBranchSelector, setShowBranchSelector] = useState(false);
    const [showNewDropdown, setShowNewDropdown] = useState(false);

    // Forms
    const [showWizard, setShowWizard] = useState(false);
    const [showNewLinkForm, setShowNewLinkForm] = useState(false);
    const [showNewActionForm, setShowNewActionForm] = useState(false);
    const [showNewInterfaceForm, setShowNewInterfaceForm] = useState(false);

    const fetchSchema = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/schema`);
            if (res.ok) setSchema(await res.json());
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSchema(); }, [fetchSchema]);

    const resourceCounts = {
        Objects: schema?.object_types.length ?? 0,
        Links: schema?.link_types.length ?? 0,
        Actions: schema?.action_types.length ?? 0,
        Interfaces: schema?.interfaces.length ?? 0
    };

    const sidebarItems = [
        { id: "discover", label: "Discover", icon: Compass },
        { id: "proposals", label: "Proposals", icon: FileText },
        { id: "history", label: "History", icon: History },
    ];

    const resources = [
        { id: "Objects", label: "Object types", icon: Database, count: resourceCounts.Objects },
        { id: "Links", label: "Link types", icon: Link2, count: resourceCounts.Links },
        { id: "Actions", label: "Action types", icon: Zap, count: resourceCounts.Actions, separator: true },
        { id: "Groups", label: "Groups", icon: LayoutGrid, count: 3 },
        { id: "Interfaces", label: "Interfaces", icon: Share2, count: resourceCounts.Interfaces },
    ];

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0f1a", fontFamily: "'Inter', sans-serif", color: "#e5e7eb", overflow: "hidden" }}>

            {/* ── HEADER ────────────────────────────────────────────────────── */}
            <div style={{ height: 48, borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, background: "#111827", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 20, height: 20, background: "#3b82f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Database size={12} color="white" />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#f9fafb" }}>Ontology Manager</span>
                    </div>

                    <div style={{ height: 20, width: 1, background: "#1f2937" }} />

                    {/* Search bar inside header */}
                    <div style={{ position: "relative", width: 400 }}>
                        <SearchIcon size={14} style={{ position: "absolute", left: 10, top: 8, color: "#6b7280" }} />
                        <input
                            placeholder="Search resources..."
                            style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 4, padding: "6px 12px 6px 32px", fontSize: 12, width: "100%", color: "#e5e7eb" }}
                        />
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Branch Selector */}
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setShowBranchSelector(!showBranchSelector)}
                            style={{ background: "none", border: "1px solid #1f2937", borderRadius: 4, padding: "5px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#9ca3af", fontSize: 12 }}
                        >
                            <GitBranch size={14} />
                            <span style={{ fontWeight: 600 }}>{activeBranch}</span>
                            <ChevronDown size={14} />
                        </button>
                        {showBranchSelector && (
                            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 200, background: "#111827", border: "1px solid #1f2937", borderRadius: 6, zIndex: 100, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)" }}>
                                <div style={{ padding: 4 }}>
                                    {["Main", "yashwanth/speedrun"].map(b => (
                                        <div key={b} onClick={() => { setActiveBranch(b); setShowBranchSelector(false); }} style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 4, background: b === activeBranch ? "#1e3a5f" : "transparent", fontSize: 12 }}>{b}</div>
                                    ))}
                                    <div style={{ height: 1, background: "#1f2937", marginTop: 4, marginBottom: 4 }} />
                                    <div style={{ padding: "8px 12px", cursor: "pointer", color: "#3b82f6", fontSize: 12, fontWeight: 600 }}>+ Create branch</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* New Button */}
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setShowNewDropdown(!showNewDropdown)}
                            style={{ background: "#3b82f6", border: "none", borderRadius: 4, padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}
                        >
                            New <ChevronDown size={14} />
                        </button>
                        {showNewDropdown && (
                            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 240, background: "#111827", border: "1px solid #1f2937", borderRadius: 6, zIndex: 100, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)" }}>
                                <div style={{ padding: 4 }}>
                                    {[
                                        { label: "Object type", desc: "Map datasets and models to object types", icon: Database, action: () => setShowWizard(true) },
                                        { label: "Link type", desc: "Create relationships between object types", icon: Link2, action: () => { setView("Links"); setShowNewLinkForm(true); } },
                                        { label: "Action type", desc: "Allow users to writeback to their ontology", icon: Zap, action: () => { setView("Actions"); setShowNewActionForm(true); } },
                                        { label: "Shared property", desc: "Create properties that can be shared across...", icon: Settings },
                                        { label: "Interface", desc: "Use interfaces to build against abstract types", icon: Share2, action: () => { setView("Interfaces"); setShowNewInterfaceForm(true); } }
                                    ].map((item, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => { item.action?.(); setShowNewDropdown(false); }}
                                            style={{ padding: "10px 12px", cursor: "pointer", borderRadius: 4, display: "flex", gap: 12 }}
                                        >
                                            <div style={{ width: 16, height: 16, marginTop: 2 }}><item.icon size={16} color="#9ca3af" /></div>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#f9fafb" }}>{item.label}</div>
                                                <div style={{ fontSize: 10, color: "#6b7280" }}>{item.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

                {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
                <div style={{ width: 220, borderRight: "1px solid #1f2937", background: "#0a0f1a", padding: "16px 8px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <div style={{ marginBottom: 16, paddingLeft: 8, paddingRight: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Ontologize Public Ontology</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9ca3af", fontSize: 12, background: "#111827", padding: "6px 8px", borderRadius: 4, cursor: "pointer" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Database size={14} />
                                <span>Ontologize Public</span>
                            </div>
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    {sidebarItems.map(item => (
                        <SidebarItem
                            key={item.id}
                            active={view === item.id}
                            onClick={() => setView(item.id as any)}
                            icon={item.icon}
                            label={item.label}
                        />
                    ))}

                    <div style={{ height: 1, background: "#1f2937", margin: "12px 8px" }} />

                    {!loading && resources.map(item => (
                        <div key={item.id}>
                            <SidebarItem
                                active={view === item.id}
                                onClick={() => setView(item.id as Tab)}
                                icon={item.icon}
                                label={item.label}
                                count={item.count}
                            />
                            {item.separator && <div style={{ height: 1, background: "#1f2937", margin: "12px 8px" }} />}
                        </div>
                    ))}

                    <div style={{ marginTop: "auto", paddingLeft: 8, paddingRight: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        <SidebarItem icon={HelpCircle} label="Health issues" />
                        <SidebarItem icon={Plus} label="Cleanup" />
                        <SidebarItem icon={Settings} label="Ontology configuration" />
                    </div>
                </div>

                {/* ── MAIN VIEWPORT ─────────────────────────────────────────────── */}
                <div style={{ flex: 1, overflowY: "auto", background: "#0d1117" }}>
                    {view === "discover" ? (
                        <DiscoveryView schema={schema} onObjectClick={(ot: OntologyObjectType) => { setView("Objects"); setSelectedObject(ot); }} />
                    ) : (
                        <TabView
                            activeTab={view as Tab}
                            schema={schema}
                            loading={loading}
                            selectedObject={selectedObject}
                            setSelectedObject={setSelectedObject}
                            selectedAction={selectedAction}
                            setSelectedAction={setSelectedAction}
                            selectedInterface={selectedInterface}
                            setSelectedInterface={setSelectedInterface}
                            showWizard={showWizard}
                            setShowWizard={setShowWizard}
                            showNewLinkForm={showNewLinkForm}
                            setShowNewLinkForm={setShowNewLinkForm}
                            showNewActionForm={showNewActionForm}
                            setShowNewActionForm={setShowNewActionForm}
                            showNewInterfaceForm={showNewInterfaceForm}
                            setShowNewInterfaceForm={setShowNewInterfaceForm}
                            fetchSchema={fetchSchema}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function SidebarItem({ active, onClick, icon: Icon, label, count }: { active?: boolean; onClick?: () => void; icon: any; label: string; count?: number }) {
    return (
        <div
            onClick={onClick}
            style={{
                padding: "8px 12px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                background: active ? "#1e3a5f" : "transparent",
                color: active ? "#60a5fa" : "#9ca3af",
                transition: "all 0.2s"
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} />
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {count !== undefined && <span style={{ fontSize: 11, color: "#4b5563" }}>{count}</span>}
        </div>
    );
}

function DiscoveryView({ schema, onObjectClick }: { schema: OntologySchema | null; onObjectClick: (ot: OntologyObjectType) => void }) {
    const recentlyViewed = schema?.object_types.slice(0, 6) ?? [];

    return (
        <div style={{ padding: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>Recently viewed object types <Badge label={String(schema?.object_types.length ?? 0)} color="#6b7280" /></h2>
                <div style={{ display: "flex", gap: 12 }}>
                    <button style={{ background: "none", border: "1px solid #1f2937", borderRadius: 4, padding: "4px 12px", color: "#9ca3af", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <Grid size={14} /> Configure
                    </button>
                    <button style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        See all <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
                    </button>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
                {recentlyViewed.map((ot: OntologyObjectType) => (
                    <div
                        key={ot.api_name}
                        onClick={() => onObjectClick(ot)}
                        style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 20, cursor: "pointer" }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                            <div style={{ width: 32, height: 32, background: "#1e293b", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Database size={16} color="#3b82f6" />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#f9fafb" }}>{ot.display_name}</div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{ot.properties?.length ?? 0} objects</div>
                            </div>
                            <div style={{ marginLeft: "auto" }}><MoreVertical size={14} color="#4b5563" /></div>
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>{ot.description || "No description"}</div>
                        <div style={{ fontSize: 11, color: "#4b5563" }}>3 dependents</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TabView(props: {
    activeTab: Tab;
    schema: OntologySchema | null;
    loading: boolean;
    selectedObject: OntologyObjectType | null;
    setSelectedObject: (ot: OntologyObjectType | null) => void;
    selectedAction: OntologyActionType | null;
    setSelectedAction: (at: OntologyActionType | null) => void;
    selectedInterface: OntologyInterface | null;
    setSelectedInterface: (i: OntologyInterface | null) => void;
    showWizard: boolean;
    setShowWizard: (v: boolean) => void;
    showNewLinkForm: boolean;
    setShowNewLinkForm: (v: boolean) => void;
    showNewActionForm: boolean;
    setShowNewActionForm: (v: boolean) => void;
    showNewInterfaceForm: boolean;
    setShowNewInterfaceForm: (v: boolean) => void;
    fetchSchema: () => void;
}) {
    const { activeTab, schema, loading, selectedObject, setSelectedObject, fetchSchema, selectedAction, setSelectedAction, selectedInterface, setSelectedInterface, showNewLinkForm, setShowNewLinkForm, showNewActionForm, setShowNewActionForm, showNewInterfaceForm, setShowNewInterfaceForm } = props;

    return (
        <div style={{ display: "flex", height: "100%" }}>
            {activeTab === "Objects" && (
                <>
                    <div style={{ width: 280, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto", flexShrink: 0 }}>
                        <SectionTitle title="Object Types" count={schema?.object_types.length} />
                        <button onClick={() => props.setShowWizard(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                            + New Object Type
                        </button>
                        {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                            schema?.object_types.map((ot: OntologyObjectType) => (
                                <Card key={ot.api_name} onClick={() => setSelectedObject(ot)} selected={selectedObject?.api_name === ot.api_name}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{ot.display_name}</div>
                                    <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{ot.api_name}</div>
                                </Card>
                            ))
                        }
                    </div>
                    <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                        {props.showWizard ? (
                            <NewObjectTypeWizard onSuccess={() => { props.setShowWizard(false); fetchSchema(); }} onCancel={() => props.setShowWizard(false)} />
                        ) : selectedObject ? (
                            <ObjectTypeDetail ot={selectedObject} onRefresh={() => { fetchSchema(); setSelectedObject(null); }} />
                        ) : (
                            <EmptyState message="← Select an Object Type to view its definition, or create a new one." />
                        )}
                    </div>
                </>
            )}

            {activeTab === "Links" && (
                <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <SectionTitle title="Link Types" count={schema?.link_types.length} />
                        <button onClick={() => setShowNewLinkForm(!showNewLinkForm)} style={{ background: "#1e3a5f", border: "1px solid #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "7px 14px", cursor: "pointer", fontSize: 12 }}>
                            + New Link Type
                        </button>
                    </div>
                    {showNewLinkForm && <NewLinkTypeForm objectTypes={schema?.object_types ?? []} onSuccess={() => { setShowNewLinkForm(false); fetchSchema(); }} onCancel={() => setShowNewLinkForm(false)} />}
                    {loading ? <p style={{ color: "#6b7280" }}>Loading…</p> :
                        schema?.link_types.length === 0 ? <EmptyState message="No Link Types defined. Create a relationship between two Object Types." /> :
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
                                {schema?.link_types.map((lt: OntologyLinkType) => (
                                    <div key={lt.api_name} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 20 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                            <span style={{ fontWeight: 700, fontSize: 13, color: "#f9fafb" }}>{lt.api_name}</span>
                                            <Badge label={CARDINALITY_LABELS[lt.cardinality] ?? lt.cardinality} color="#a78bfa" />
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                                            <span style={{ background: "#1e3a5f", color: "#60a5fa", borderRadius: 4, padding: "3px 10px" }}>{lt.source_display}</span>
                                            <div style={{ textAlign: "center", flex: 1 }}>
                                                <div style={{ color: "#10b981", fontSize: 11 }}>→ {lt.display_name_a_side}</div>
                                                <div style={{ background: "#1f2937", height: 1, margin: "3px 0" }} />
                                                <div style={{ color: "#f59e0b", fontSize: 11 }}>{lt.display_name_b_side} ←</div>
                                            </div>
                                            <span style={{ background: "#1e3a5f", color: "#60a5fa", borderRadius: 4, padding: "3px 10px" }}>{lt.target_display}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                    }
                </div>
            )}

            {activeTab === "Actions" && (
                <>
                    <div style={{ width: 300, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto" }}>
                        <SectionTitle title="Action Types" count={schema?.action_types.length} />
                        <button onClick={() => setShowNewActionForm(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                            + New Action Type
                        </button>
                        {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                            schema?.action_types.map((at: OntologyActionType) => (
                                <Card key={at.api_name} onClick={() => { setSelectedAction(at); setShowNewActionForm(false); }} selected={selectedAction?.api_name === at.api_name}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <StatusDot active={at.status === "ACTIVE"} />
                                        <span style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{at.display_name}</span>
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{at.api_name}</div>
                                </Card>
                            ))
                        }
                    </div>
                    <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                        {showNewActionForm ? (
                            <NewActionTypeForm objectTypes={schema?.object_types ?? []} onSuccess={() => { setShowNewActionForm(false); fetchSchema(); }} onCancel={() => setShowNewActionForm(false)} />
                        ) : selectedAction ? (
                            <ActionTypeDetail action={selectedAction} />
                        ) : (
                            <EmptyState message="← Select an Action Type to view its definition, parameters, and HITL configuration." />
                        )}
                    </div>
                </>
            )}

            {activeTab === "Interfaces" && (
                <>
                    <div style={{ width: 280, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto" }}>
                        <SectionTitle title="Interfaces" count={schema?.interfaces.length} />
                        <button onClick={() => setShowNewInterfaceForm(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                            + New Interface
                        </button>
                        {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                            schema?.interfaces.map((i: OntologyInterface) => (
                                <Card key={i.api_name} onClick={() => { setSelectedInterface(i); setShowNewInterfaceForm(false); }} selected={selectedInterface?.api_name === i.api_name}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{i.display_name}</div>
                                    <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>interface {i.api_name}</div>
                                </Card>
                            ))
                        }
                    </div>
                    <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                        {showNewInterfaceForm ? (
                            <NewInterfaceForm onSuccess={() => { setShowNewInterfaceForm(false); fetchSchema(); }} onCancel={() => setShowNewInterfaceForm(false)} />
                        ) : selectedInterface ? (
                            <InterfaceDetail iface={selectedInterface} />
                        ) : (
                            <EmptyState message="← Select an Interface to view the shared property contract it enforces." />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function NewObjectTypeWizard({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        datasourceType: "existing",
        datasetId: "",
        apiName: "",
        displayName: "",
        pluralName: "",
        primaryKey: "",
        titleProperty: "",
        properties: [] as any[]
    });
    const [availableDatasets, setAvailableDatasets] = useState<any[]>([]);
    const [loadingDatasets, setLoadingDatasets] = useState(false);
    const [loadingColumns, setLoadingColumns] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (step === 1) {
            setLoadingDatasets(true);
            // Simulated fetch of available datasets
            setTimeout(() => {
                setAvailableDatasets([
                    { id: "all_orders", name: "all_orders", path: "/Ontologize Public/all_orders", columns: ["Order Id", "Customer Id", "Item Name", "Quantity", "Order Date", "Status"] },
                    { id: "consolidated_customers", name: "consolidated_customers", path: "/Ontologize Public/consolidated_customers", columns: ["Customer Id", "Name", "Email", "Region"] },
                    { id: "orders_office_goods", name: "orders_office_goods", path: "/Ontologize Public/orders_office_goods", columns: ["Order Id", "Item", "Price", "Category"] }
                ]);
                setLoadingDatasets(false);
            }, 600);
        }
    }, [step]);

    const handleDatasetSelect = (id: string) => {
        const ds = availableDatasets.find(d => d.id === id);
        if (!ds) return;

        setLoadingColumns(true);
        setTimeout(() => {
            setFormData({
                ...formData,
                datasetId: id,
                displayName: ds.name.replace(/_/g, ' ').replace(/\b\w/g, (l: any) => l.toUpperCase()),
                apiName: ds.name,
                pluralName: ds.name.endsWith('s') ? ds.name : ds.name + 's',
                properties: ds.columns.map((col: string) => ({
                    api_name: col.toLowerCase().replace(/ /g, '_'),
                    display_name: col,
                    data_type: col.includes("Date") ? "date" : col.includes("Quantity") || col.includes("Price") ? "double" : "string"
                }))
            });
            setLoadingColumns(false);
        }, 400);
    };

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/object-types`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_name: formData.apiName,
                    display_name: formData.displayName,
                    plural_display_name: formData.pluralName,
                    description: `Object type backed by ${formData.datasetId}`,
                    primary_key: formData.primaryKey || "order_id",
                    title_property: formData.titleProperty || "item_name",
                    backing_source: formData.datasetId,
                    properties: formData.properties.map(p => ({
                        ...p,
                        is_primary_key: p.display_name === formData.primaryKey,
                        is_required: p.display_name === formData.primaryKey
                    }))
                })
            });
            if (res.ok) {
                // Show floating indexing notification
                const notify = document.createElement("div");
                notify.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #1e3a8a; border: 1px solid #3b82f6; color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 12px;";
                notify.innerHTML = `<div style="width: 16px; height: 16px; border: 2px solid #60a5fa; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div><div><strong>Indexing started</strong><div style="font-size: 11px; opacity: 0.8;">${formData.displayName} object type is being active...</div></div>`;
                document.body.appendChild(notify);

                // Add keyframes for spin
                const style = document.createElement("style");
                style.innerHTML = "@keyframes spin { to { transform: rotate(360deg); } }";
                document.head.appendChild(style);

                setTimeout(() => {
                    notify.style.background = "#065f46";
                    notify.style.borderColor = "#10b981";
                    notify.innerHTML = `<div style="color: #10b981; font-weight: bold;">✓</div><div><strong>Indexing complete</strong><div style="font-size: 11px; opacity: 0.8;">${formData.displayName} is now Active.</div></div>`;
                    setTimeout(() => notify.remove(), 4000);
                }, 5000);

                onSuccess();
            }
            else alert("Failed to save object type");
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, display: "flex", flexDirection: "column", height: "100%", maxWidth: 900, margin: "0 auto" }}>
            {/* Wizard Header */}
            <div style={{ padding: "20px 32px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: "#f9fafb" }}>Create a new object type</h2>
                    <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
                        {["Datasource", "Metadata", "Properties", "Actions"].map((s, i) => (
                            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, opacity: step === i + 1 ? 1 : 0.4 }}>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: step >= i + 1 ? "#3b82f6" : "#1f2937", color: "white", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{i + 1}</div>
                                <span style={{ fontSize: 12, fontWeight: step === i + 1 ? 600 : 400 }}>{s}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <button onClick={onCancel} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>✕</button>
            </div>

            {/* Wizard Content */}
            <div style={{ flex: 1, padding: 32, overflowY: "auto" }}>
                {step === 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div>
                            <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>Object type backing</h3>
                            <div style={{ display: "flex", gap: 16 }}>
                                <div
                                    onClick={() => setFormData({ ...formData, datasourceType: "existing" })}
                                    style={{ flex: 1, padding: 20, border: `2px solid ${formData.datasourceType === "existing" ? "#3b82f6" : "#1f2937"}`, borderRadius: 8, cursor: "pointer", background: formData.datasourceType === "existing" ? "#1e3a5f22" : "transparent" }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Use existing datasource</div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Select a preexisting Foundry dataset</div>
                                </div>
                                <div
                                    style={{ flex: 1, padding: 20, border: "2px solid #1f2937", borderRadius: 8, opacity: 0.4, cursor: "not-allowed" }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Continue without datasource</div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Generate a dataset for permissions purposes</div>
                                </div>
                            </div>
                        </div>

                        {formData.datasourceType === "existing" && (
                            <div>
                                <label style={labelStyle()}>Select datasource</label>
                                <div style={{ position: "relative" }}>
                                    <SearchIcon size={14} style={{ position: "absolute", left: 10, top: 12, color: "#6b7280" }} />
                                    <select
                                        style={{ ...inputStyle(), paddingLeft: 32, height: 40 }}
                                        value={formData.datasetId}
                                        onChange={(e) => handleDatasetSelect(e.target.value)}
                                    >
                                        <option value="">Search resources...</option>
                                        {availableDatasets.map(ds => (
                                            <option key={ds.id} value={ds.id}>{ds.path}</option>
                                        ))}
                                    </select>
                                </div>
                                {(loadingDatasets || loadingColumns) && <p style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>{loadingDatasets ? "Fetching datasets..." : "Loading schema..."}</p>}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <div style={{ gridColumn: "1/-1" }}>
                            <label style={labelStyle()}>Display Name</label>
                            <input style={inputStyle()} value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} placeholder="e.g. Order" />
                        </div>
                        <div>
                            <label style={labelStyle()}>Plural Name</label>
                            <input style={inputStyle()} value={formData.pluralName} onChange={e => setFormData({ ...formData, pluralName: e.target.value })} placeholder="e.g. Orders" />
                        </div>
                        <div>
                            <label style={labelStyle()}>API Name</label>
                            <input style={inputStyle()} value={formData.apiName} onChange={e => setFormData({ ...formData, apiName: e.target.value })} placeholder="e.g. order" />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div>
                            <label style={labelStyle()}>Primary Key</label>
                            <select style={inputStyle()} value={formData.primaryKey} onChange={e => setFormData({ ...formData, primaryKey: e.target.value })}>
                                <option value="">Select primary key...</option>
                                {formData.properties.map(p => (
                                    <option key={p.api_name} value={p.display_name}>{p.display_name}</option>
                                ))}
                            </select>
                            <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Select the property that serves as each Object's unique identifier.</p>
                        </div>
                        <div>
                            <label style={labelStyle()}>Title Property</label>
                            <select style={inputStyle()} value={formData.titleProperty} onChange={e => setFormData({ ...formData, titleProperty: e.target.value })}>
                                <option value="">Select title property...</option>
                                {formData.properties.map(p => (
                                    <option key={p.api_name} value={p.display_name}>{p.display_name}</option>
                                ))}
                            </select>
                            <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>This property will serve as the name of the Object displayed across the platform.</p>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div style={{ textAlign: "center", paddingTop: 40, paddingBottom: 40 }}>
                        <div style={{ width: 64, height: 64, background: "#052e16", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                            <Zap size={32} color="#10b981" />
                        </div>
                        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Ready to create Object Type</h3>
                        <p style={{ color: "#9ca3af", fontSize: 14 }}>Once created, the object type will be saved to the Ontology and indexing will begin automatically.</p>
                    </div>
                )}
            </div>

            {/* Wizard Footer */}
            <div style={{ padding: "20px 32px", borderTop: "1px solid #1f2937", display: "flex", justifyContent: "flex-end", gap: 12, background: "#111827", borderRadius: "0 0 8px 8px" }}>
                {step > 1 && <button onClick={handleBack} style={{ background: "none", border: "1px solid #374151", color: "#e5e7eb", borderRadius: 4, padding: "8px 20px", cursor: "pointer", fontSize: 13 }}>Back</button>}
                {step < 4 ? (
                    <button
                        onClick={handleNext}
                        disabled={step === 1 && !formData.datasetId}
                        style={{ background: "#3b82f6", border: "none", color: "white", borderRadius: 4, padding: "8px 24px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (step === 1 && !formData.datasetId) ? 0.5 : 1 }}
                    >
                        Next
                    </button>
                ) : (
                    <button onClick={handleSubmit} disabled={saving} style={{ background: "#10b981", border: "none", color: "white", borderRadius: 4, padding: "8px 24px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        {saving ? "Creating..." : "Create"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Panels
// ─────────────────────────────────────────────────────────────────────────────
function ObjectTypeDetail({ ot, onRefresh }: { ot: OntologyObjectType; onRefresh: () => void }) {
    const handleDelete = async () => {
        if (!confirm(`Delete Object Type '${ot.api_name}'? This is irreversible.`)) return;
        await fetch(`/api/ontology-admin/object-types/${ot.api_name}`, { method: "DELETE" });
        onRefresh();
    };
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: "#f9fafb" }}>{ot.display_name}</h2>
                    <code style={{ color: "#60a5fa", fontSize: 13 }}>{ot.api_name}</code>
                    <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>{ot.description}</p>
                </div>
                <button onClick={handleDelete} style={{ background: "#7f1d1d", border: "1px solid #dc2626", color: "#fca5a5", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>Delete</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InfoCard label="Primary Key" value={ot.primary_key} />
                <InfoCard label="Title Property" value={ot.title_property} />
                <InfoCard label="Backing Source" value={ot.backing_source} />
            </div>

            {ot.implements?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <h3 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Implements Interfaces</h3>
                    <div style={{ display: "flex", gap: 6 }}>{ot.implements.map(i => <Pill key={i} text={i} />)}</div>
                </div>
            )}

            <h3 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Properties</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                    <tr style={{ borderBottom: "1px solid #1f2937" }}>
                        {["API Name", "Display Name", "Data Type", "PK", "Required"].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ot.properties?.map(p => (
                        <tr key={p.api_name} style={{ borderBottom: "1px solid #111827" }}>
                            <td style={{ padding: "8px 12px" }}><code style={{ color: "#60a5fa", fontSize: 12 }}>{p.api_name}</code></td>
                            <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{p.display_name}</td>
                            <td style={{ padding: "8px 12px" }}><Badge label={p.data_type} color="#10b981" /></td>
                            <td style={{ padding: "8px 12px" }}>{p.is_primary_key ? "✅" : "—"}</td>
                            <td style={{ padding: "8px 12px" }}>{p.is_required ? "✅" : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ActionTypeDetail({ action }: { action: OntologyActionType }) {
    const hitlColor = action.hitl_level === 1 ? "#10b981" : action.hitl_level === 2 ? "#f59e0b" : "#ef4444";
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <StatusDot active={action.status === "ACTIVE"} />
                    <h2 style={{ margin: 0, fontSize: 22, color: "#f9fafb" }}>{action.display_name}</h2>
                </div>
                <code style={{ color: "#60a5fa", fontSize: 13 }}>{action.api_name}</code>
                <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>{action.description}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <InfoCard label="HITL Level" value={HITL_LABELS[action.hitl_level] ?? String(action.hitl_level)} color={hitlColor} />
                <InfoCard label="Writes Back To" value={action.writeback_target} />
                <InfoCard label="Status" value={action.status} />
            </div>

            <div style={{ background: action.hitl_level >= 2 ? "#431407" : "#052e16", border: `1px solid ${hitlColor}33`, borderRadius: 8, padding: 14, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: hitlColor, fontSize: 13, marginBottom: 4 }}>
                    {action.hitl_level >= 2 ? "⚠️ Human-in-the-Loop gate active" : "✅ Immediate execution"}
                </div>
                <div style={{ color: "#9ca3af", fontSize: 12 }}>
                    {action.hitl_level >= 2 ? `This action (HITL Level ${action.hitl_level}) creates a Proposal that must be approved by a ${action.hitl_level === 2 ? "Supervisor" : "Compliance Officer"} before the Ontology is mutated.` : "This action executes immediately applying its Ontology rules without waiting for human review."}
                </div>
            </div>

            <h3 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Parameters</h3>
            {action.parameters?.length === 0 ? <EmptyState message="No parameters defined." /> :
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid #1f2937" }}>
                            {["Parameter", "Display Name", "Type", "Ref Object", "Required", "Description"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {action.parameters.map(p => (
                            <tr key={p.api_name} style={{ borderBottom: "1px solid #111827" }}>
                                <td style={{ padding: "8px 12px" }}><code style={{ color: "#60a5fa", fontSize: 12 }}>{p.api_name}</code></td>
                                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{p.display_name}</td>
                                <td style={{ padding: "8px 12px" }}><Badge label={p.data_type} color="#10b981" /></td>
                                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{p.object_type_ref ?? "—"}</td>
                                <td style={{ padding: "8px 12px" }}>{p.is_required ? "✅" : "—"}</td>
                                <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: 11 }}>{p.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            }
        </div>
    );
}

function InterfaceDetail({ iface }: { iface: OntologyInterface }) {
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 22, color: "#f9fafb" }}>interface {iface.display_name}</h2>
                <code style={{ color: "#a78bfa", fontSize: 13 }}>{iface.api_name}</code>
                <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>{iface.description}</p>
            </div>
            <div style={{ marginBottom: 20 }}>
                <h3 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Implemented By</h3>
                {iface.implemented_by?.length === 0 ? <p style={{ color: "#6b7280", fontSize: 13 }}>No Object Types implement this interface yet.</p> :
                    <div style={{ display: "flex", gap: 6 }}>{iface.implemented_by?.map(ot => <Pill key={ot} text={ot} />)}</div>
                }
            </div>
            <h3 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Required Properties</h3>
            {iface.properties?.map(p => (
                <div key={p.api_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1f2937" }}>
                    <code style={{ color: "#60a5fa", fontSize: 12, width: 140 }}>{p.api_name}</code>
                    <Badge label={p.data_type} color="#10b981" />
                    {p.is_required && <Badge label="required" color="#ef4444" />}
                </div>
            ))}
        </div>
    );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 14 }}>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ color: color ?? "#e5e7eb", fontWeight: 600, fontSize: 13 }}>{value}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Creation Forms
// ─────────────────────────────────────────────────────────────────────────────
function inputStyle(extra = {}): React.CSSProperties {
    return { background: "#0a0f1a", border: "1px solid #374151", borderRadius: 6, color: "#e5e7eb", padding: "7px 10px", fontSize: 13, width: "100%", boxSizing: "border-box" as const, ...extra };
}
function labelStyle(): React.CSSProperties {
    return { color: "#9ca3af", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 1, display: "block", marginBottom: 4 };
}

function NewObjectTypeForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
    const [form, setForm] = useState({ api_name: "", display_name: "", plural_display_name: "", description: "", primary_key: "", title_property: "", backing_source: "connector-postgres", icon: "entity" });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/object-types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, properties: [{ api_name: form.primary_key, display_name: form.primary_key.replace(/_/g, " "), data_type: "string", is_primary_key: true, is_required: true }] }) });
            if (res.ok) onSuccess(); else alert((await res.json()).error);
        } finally { setSaving(false); }
    };

    return (
        <FormWrapper title="New Object Type" onSave={submit} onCancel={onCancel} saving={saving}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={labelStyle()}>API Name*</label><input style={inputStyle()} value={form.api_name} onChange={e => set("api_name", e.target.value)} placeholder="e.g. Aircraft" /></div>
                <div><label style={labelStyle()}>Display Name*</label><input style={inputStyle()} value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="e.g. Aircraft" /></div>
                <div><label style={labelStyle()}>Plural Display Name</label><input style={inputStyle()} value={form.plural_display_name} onChange={e => set("plural_display_name", e.target.value)} placeholder="e.g. Aircraft" /></div>
                <div><label style={labelStyle()}>Primary Key Property*</label><input style={inputStyle()} value={form.primary_key} onChange={e => set("primary_key", e.target.value)} placeholder="e.g. aircraft_id" /></div>
                <div><label style={labelStyle()}>Title Property</label><input style={inputStyle()} value={form.title_property} onChange={e => set("title_property", e.target.value)} placeholder="e.g. tail_number" /></div>
                <div><label style={labelStyle()}>Backing Source</label>
                    <select style={inputStyle()} value={form.backing_source} onChange={e => set("backing_source", e.target.value)}>
                        {["connector-postgres", "connector-kafka", "connector-fhir", "connector-s3"].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle()}>Description</label><textarea style={{ ...inputStyle(), height: 60, resize: "none" }} value={form.description} onChange={e => set("description", e.target.value)} /></div>
            </div>
        </FormWrapper>
    );
}

function NewLinkTypeForm({ objectTypes, onSuccess, onCancel }: { objectTypes: OntologyObjectType[]; onSuccess: () => void; onCancel: () => void }) {
    const [form, setForm] = useState({ api_name: "", display_name_a_side: "", display_name_b_side: "", cardinality: "ONE_TO_MANY", source_object_type: "", target_object_type: "" });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/link-types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
            if (res.ok) onSuccess(); else alert((await res.json()).error);
        } finally { setSaving(false); }
    };

    const otNames = objectTypes.map(o => o.api_name);
    return (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <h3 style={{ color: "#f9fafb", marginTop: 0, marginBottom: 16 }}>New Link Type</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={labelStyle()}>API Name*</label><input style={inputStyle()} value={form.api_name} onChange={e => set("api_name", e.target.value)} placeholder="e.g. employee_manages_team" /></div>
                <div><label style={labelStyle()}>Cardinality*</label>
                    <select style={inputStyle()} value={form.cardinality} onChange={e => set("cardinality", e.target.value)}>
                        <option value="ONE_TO_ONE">One ↔ One</option>
                        <option value="ONE_TO_MANY">One → Many</option>
                        <option value="MANY_TO_MANY">Many ↔ Many</option>
                    </select>
                </div>
                <div><label style={labelStyle()}>Source Object Type (Side A)*</label>
                    <select style={inputStyle()} value={form.source_object_type} onChange={e => set("source_object_type", e.target.value)}>
                        <option value="">Select…</option>
                        {otNames.map(n => <option key={n}>{n}</option>)}
                    </select>
                </div>
                <div><label style={labelStyle()}>Label (A→B)*</label><input style={inputStyle()} value={form.display_name_a_side} onChange={e => set("display_name_a_side", e.target.value)} placeholder="e.g. Manages" /></div>
                <div><label style={labelStyle()}>Target Object Type (Side B)*</label>
                    <select style={inputStyle()} value={form.target_object_type} onChange={e => set("target_object_type", e.target.value)}>
                        <option value="">Select…</option>
                        {otNames.map(n => <option key={n}>{n}</option>)}
                    </select>
                </div>
                <div><label style={labelStyle()}>Label (B→A)*</label><input style={inputStyle()} value={form.display_name_b_side} onChange={e => set("display_name_b_side", e.target.value)} placeholder="e.g. Managed By" /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={submit} disabled={saving} style={{ background: "#1d4ed8", border: "none", color: "#fff", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Creating…" : "Create Link Type"}</button>
                <button onClick={onCancel} style={{ background: "none", border: "1px solid #374151", color: "#9ca3af", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
            </div>
        </div>
    );
}

function NewActionTypeForm({ objectTypes, onSuccess, onCancel }: { objectTypes: OntologyObjectType[]; onSuccess: () => void; onCancel: () => void }) {
    const [form, setForm] = useState({ api_name: "", display_name: "", description: "", hitl_level: 1, writeback_target: "", targets: [] as string[] });
    const [params, setParams] = useState([{ api_name: "", display_name: "", data_type: "string", is_required: true, description: "" }]);
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: string | number | boolean | string[]) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setSaving(true);
        try {
            const body = { ...form, parameters: params, rules: [] };
            const res = await fetch(`${API_BASE}/action-types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (res.ok) onSuccess(); else alert((await res.json()).error);
        } finally { setSaving(false); }
    };

    return (
        <FormWrapper title="New Action Type" onSave={submit} onCancel={onCancel} saving={saving}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={labelStyle()}>API Name*</label><input style={inputStyle()} value={form.api_name} onChange={e => set("api_name", e.target.value)} placeholder="e.g. assign_aircraft_to_route" /></div>
                <div><label style={labelStyle()}>Display Name*</label><input style={inputStyle()} value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="e.g. Assign Aircraft to Route" /></div>
                <div><label style={labelStyle()}>HITL Level</label>
                    <select style={inputStyle()} value={form.hitl_level} onChange={e => set("hitl_level", Number(e.target.value))}>
                        <option value={1}>Level 1 — Immediate Execution</option>
                        <option value={2}>Level 2 — Supervisor Approval</option>
                        <option value={3}>Level 3 — Compliance Officer</option>
                    </select>
                </div>
                <div><label style={labelStyle()}>Writeback Target*</label>
                    <select style={inputStyle()} value={form.writeback_target} onChange={e => set("writeback_target", e.target.value)}>
                        <option value="">Select Object Type…</option>
                        {objectTypes.map(o => <option key={o.api_name}>{o.api_name}</option>)}
                    </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle()}>Description</label><textarea style={{ ...inputStyle(), height: 60, resize: "none" }} value={form.description} onChange={e => set("description", e.target.value)} /></div>
            </div>

            <h4 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 10px" }}>Parameters</h4>
            {params.map((p, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                    <input style={inputStyle()} value={p.api_name} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, api_name: e.target.value } : x))} placeholder="api_name" />
                    <input style={inputStyle()} value={p.display_name} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, display_name: e.target.value } : x))} placeholder="Display Name" />
                    <select style={inputStyle()} value={p.data_type} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, data_type: e.target.value } : x))}>
                        {[...DATA_TYPES, "object_reference"].map(t => <option key={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setParams(ps => ps.filter((_, i) => i !== idx))} style={{ background: "#7f1d1d", border: "none", color: "#fca5a5", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>✕</button>
                </div>
            ))}
            <button onClick={() => setParams(ps => [...ps, { api_name: "", display_name: "", data_type: "string", is_required: false, description: "" }])} style={{ background: "none", border: "1px dashed #374151", color: "#6b7280", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, marginTop: 4 }}>+ Add Parameter</button>
        </FormWrapper>
    );
}

function NewInterfaceForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
    const [form, setForm] = useState({ api_name: "", display_name: "", description: "" });
    const [props, setProps] = useState([{ api_name: "", display_name: "", data_type: "string", is_required: false }]);
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/interfaces`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, properties: props }) });
            if (res.ok) onSuccess(); else alert((await res.json()).error);
        } finally { setSaving(false); }
    };

    return (
        <FormWrapper title="New Interface" onSave={submit} onCancel={onCancel} saving={saving}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={labelStyle()}>API Name*</label><input style={inputStyle()} value={form.api_name} onChange={e => set("api_name", e.target.value)} placeholder="e.g. HasLocation" /></div>
                <div><label style={labelStyle()}>Display Name*</label><input style={inputStyle()} value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="e.g. Has Location" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={labelStyle()}>Description</label><textarea style={{ ...inputStyle(), height: 60, resize: "none" }} value={form.description} onChange={e => set("description", e.target.value)} /></div>
            </div>
            <h4 style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 10px" }}>Required Properties</h4>
            {props.map((p, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                    <input style={inputStyle()} value={p.api_name} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, api_name: e.target.value } : x))} placeholder="api_name" />
                    <input style={inputStyle()} value={p.display_name} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, display_name: e.target.value } : x))} placeholder="Display Name" />
                    <select style={inputStyle()} value={p.data_type} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, data_type: e.target.value } : x))}>
                        {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setProps(ps => ps.filter((_, i) => i !== idx))} style={{ background: "#7f1d1d", border: "none", color: "#fca5a5", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>✕</button>
                </div>
            ))}
            <button onClick={() => setProps(ps => [...ps, { api_name: "", display_name: "", data_type: "string", is_required: false }])} style={{ background: "none", border: "1px dashed #374151", color: "#6b7280", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, marginTop: 4 }}>+ Add Property</button>
        </FormWrapper>
    );
}

function FormWrapper({ title, children, onSave, onCancel, saving }: { title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; saving: boolean }) {
    return (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 24 }}>
            <h3 style={{ color: "#f9fafb", marginTop: 0, marginBottom: 20 }}>{title}</h3>
            {children}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button onClick={onSave} disabled={saving} style={{ background: "#1d4ed8", border: "none", color: "#fff", borderRadius: 6, padding: "9px 22px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Saving…" : "Create"}</button>
                <button onClick={onCancel} style={{ background: "none", border: "1px solid #374151", color: "#9ca3af", borderRadius: 6, padding: "9px 16px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
            </div>
        </div>
    );
}
