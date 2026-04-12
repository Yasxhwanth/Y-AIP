"use client";
/**
 * app/ontology/page.tsx — Visual Ontology Manager (VOM)
 * Y-AIP Ontology Manager with 4 tabs:
 *   1. Objects   — Object Type registry (entity schema builder)
 *   2. Links     — Link Type registry (relationship mapper with cardinality)
 *   3. Actions   — Action Type registry (kinetics: typed mutations + HITL)
 *   4. Interfaces— Interface registry (abstract polymorphic shapes)
 */

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirroring the Y-AIP Ontology data model exactly)
// ─────────────────────────────────────────────────────────────────────────────
import { SelectDatasetModal } from "@/components/ontology/SelectDatasetModal";
interface OntologyProperty { api_name: string; display_name: string; data_type: string; is_primary_key: boolean; is_required: boolean; }
interface OntologyObjectType { api_name: string; display_name: string; plural_display_name: string; description: string; primary_key: string; title_property: string; backing_source: string; icon: string; properties: OntologyProperty[]; implements: string[]; link_types?: unknown[]; action_types?: unknown[]; index_status?: string; index_count?: number; last_synced?: string | null; }
interface OntologyLinkType { api_name: string; display_name_a_side: string; display_name_b_side: string; cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY"; source: string; source_display: string; target: string; target_display: string; }
interface OntologyActionParameter { api_name: string; display_name: string; data_type: string; object_type_ref: string | null; is_required: boolean; description: string; }
interface OntologyActionType { api_name: string; display_name: string; description: string; status: string; hitl_level: number; writeback_target: string; parameters: OntologyActionParameter[]; targets: string[]; }
interface OntologyInterface { api_name: string; display_name: string; description: string; properties: OntologyProperty[]; implemented_by: string[]; }
interface OntologySchema { object_types: OntologyObjectType[]; link_types: OntologyLinkType[]; action_types: OntologyActionType[]; interfaces: OntologyInterface[]; }
interface DatasetSummary { id: string; name: string; }
interface DatasetColumn { name: string; type?: string; }
interface DraftGeneratedAction { api_name: string; display_name: string; action_type: "create" | "edit" | "delete"; }
interface DraftObjectType extends OntologyObjectType {
    is_draft: true;
    generated_actions: DraftGeneratedAction[];
    edit_count: number;
}
type ObjectSubTab = "Overview" | "Properties" | "Datasources" | "Security" | "Capabilities" | "Interfaces" | "Materializations" | "Automations" | "Usage" | "History" | "Object views";

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
    Grid,
    X, Box, Square, CheckSquare, Edit, Trash2, Calendar, Hash, Type
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Main VOM Component
// ─────────────────────────────────────────────────────────────────────────────
export default function OntologyManagerPage() {
    const [view, setView] = useState<"discover" | "proposals" | "history" | Tab>("discover");
    const [activeBranch, setActiveBranch] = useState("Main");
    const [branches, setBranches] = useState(["Main", "yashwanth/speedrun"]);
    const [schema, setSchema] = useState<OntologySchema | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedObject, setSelectedObject] = useState<OntologyObjectType | null>(null);
    const [selectedAction, setSelectedAction] = useState<OntologyActionType | null>(null);
    const [selectedInterface, setSelectedInterface] = useState<OntologyInterface | null>(null);
    const [draftObject, setDraftObject] = useState<DraftObjectType | null>(null);
    const [showSaveReviewModal, setShowSaveReviewModal] = useState(false);
    const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);

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
        { id: "Properties", label: "Properties", icon: Settings, count: 0 },
        { id: "SharedProps", label: "Shared properties", icon: Share2, count: 138 },
        { id: "Links", label: "Link types", icon: Link2, count: resourceCounts.Links },
        { id: "Actions", label: "Action types", icon: Zap, count: resourceCounts.Actions, separator: true },
        { id: "Groups", label: "Groups", icon: LayoutGrid, count: 3 },
        { id: "Interfaces", label: "Interfaces", icon: Share2, count: resourceCounts.Interfaces },
        { id: "ValueTypes", label: "Value types", icon: Settings, count: 20 },
        { id: "Functions", label: "Functions", icon: Settings, count: 267 },
    ];

    const draftEditCount = draftObject?.edit_count ?? 0;
    const reviewChanges = draftObject ? [
        { label: "Display name", from: null, to: draftObject.display_name },
        { label: "API name", from: "NewObjectType", to: draftObject.api_name },
        { label: "Plural display name", from: null, to: draftObject.plural_display_name },
        { label: "Primary key", from: null, to: draftObject.primary_key || "—" },
        { label: "Title property", from: null, to: draftObject.title_property || "—" },
        { label: "Backing datasource", from: null, to: draftObject.backing_source || "—" },
    ] : [];

    const handleDraftReady = useCallback((draft: DraftObjectType) => {
        setDraftObject(draft);
        setSelectedObject(draft);
        setSelectedAction(null);
        setSelectedInterface(null);
        setView("Objects");
    }, []);

    const handleDiscardDraft = useCallback(() => {
        setDraftObject(null);
        setSelectedObject(null);
        setShowSaveReviewModal(false);
    }, []);

    const handleSaveDraftToOntology = useCallback(async () => {
        if (!draftObject) return;
        setSavingDraft(true);
        try {
            const createRes = await fetch(`${API_BASE}/object-types`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_name: draftObject.api_name,
                    display_name: draftObject.display_name,
                    plural_display_name: draftObject.plural_display_name,
                    description: draftObject.description,
                    primary_key: draftObject.primary_key,
                    title_property: draftObject.title_property,
                    backing_source: draftObject.backing_source,
                    icon: draftObject.icon,
                    properties: draftObject.properties,
                })
            });

            if (!createRes.ok && createRes.status !== 409) {
                const errData = await createRes.json().catch(() => ({}));
                alert(errData?.error ?? "Failed to save object type");
                return;
            }

            await Promise.all(
                draftObject.generated_actions.map((action) =>
                    fetch(`${API_BASE}/action-types`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            api_name: action.api_name,
                            display_name: action.display_name,
                            description: `Auto-generated ${action.action_type} action`,
                            action_type: action.action_type,
                            writeback_target: draftObject.backing_source,
                            parameters: [],
                            targets: [draftObject.api_name]
                        })
                    }).catch(() => null)
                )
            );

            let persisted: OntologyObjectType | null = null;
            try {
                const detailRes = await fetch(`${API_BASE}/object-types/${draftObject.api_name}`);
                if (detailRes.ok) persisted = await detailRes.json();
            } catch { /* ignore */ }

            await fetchSchema();
            setDraftObject(null);
            setShowSaveReviewModal(false);
            setSelectedObject(persisted ?? draftObject);
            setView("Objects");
        } finally {
            setSavingDraft(false);
        }
    }, [draftObject, fetchSchema]);

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "'Inter', sans-serif", color: "#111827", overflow: "hidden" }}>

            {/* ── WIZARD MODAL OVERLAY (rendered at root so it covers everything) ── */}
            {showWizard && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowWizard(false); }}>
                    <NewObjectTypeWizard onSuccess={(draft) => { setShowWizard(false); handleDraftReady(draft); }} onCancel={() => setShowWizard(false)} />
                </div>
            )}

            {showSaveReviewModal && draftObject && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ background: "#ffffff", borderRadius: 10, width: "100%", maxWidth: 760, boxShadow: "0 25px 50px rgba(0,0,0,0.25)", overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Review changes</h2>
                            <button onClick={() => setShowSaveReviewModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>✕</button>
                        </div>
                        <div style={{ borderBottom: "1px solid #e5e7eb", display: "flex", gap: 0 }}>
                            {["All changes", "Warnings", "Errors", "Migrations", "Conflicts"].map((t, i) => (
                                <div key={t} style={{ padding: "10px 16px", fontSize: 13, fontWeight: i === 0 ? 600 : 500, color: i === 0 ? "#2563eb" : "#6b7280", borderBottom: i === 0 ? "2px solid #2563eb" : "2px solid transparent", cursor: "pointer" }}>{t}{i === 0 ? ` (${draftEditCount})` : ""}</div>
                            ))}
                        </div>
                        <div style={{ maxHeight: 480, overflowY: "auto", padding: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
                                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>[Gena] {draftObject.display_name}</span>
                                </div>
                                <span style={{ fontSize: 11, padding: "2px 8px", background: "#dcfce7", color: "#166534", borderRadius: 4, fontWeight: 600 }}>Created</span>
                            </div>
                            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                                <div style={{ padding: "8px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>GENERAL INFORMATION</div>
                                {reviewChanges.map((c, i) => (
                                    <div key={c.label} style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderBottom: i < reviewChanges.length - 1 ? "1px solid #f3f4f6" : undefined, gap: 24 }}>
                                        <span style={{ width: 160, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{c.label}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {c.from && <span style={{ fontSize: 12, padding: "2px 8px", background: "#f3f4f6", borderRadius: 4, color: "#6b7280", textDecoration: "line-through" }}>{c.from}</span>}
                                            <span style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{c.to}</span>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderTop: "1px solid #f3f4f6", gap: 24 }}>
                                    <span style={{ width: 160, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>Properties</span>
                                    <span style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{draftObject.properties.length} properties</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-start", padding: "9px 16px", borderTop: "1px solid #f3f4f6", gap: 24 }}>
                                    <span style={{ width: 160, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>Actions</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {draftObject.generated_actions.length > 0 ? draftObject.generated_actions.map((action) => (
                                            <span key={action.api_name} style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{action.display_name}</span>
                                        )) : <span style={{ fontSize: 12, color: "#6b7280" }}>No action types</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb" }}>
                            <button onClick={handleDiscardDraft} style={{ background: "none", border: "1px solid #d1d5db", color: "#374151", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Discard</button>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
                                    <span>Save changes to a new branch</span>
                                    <div style={{ width: 32, height: 18, background: "#e5e7eb", borderRadius: 9, cursor: "not-allowed", position: "relative" }}>
                                        <div style={{ width: 14, height: 14, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                                    </div>
                                </div>
                                <button onClick={() => setShowConfirmSaveModal(true)} disabled={savingDraft} style={{ background: "#16a34a", border: "none", color: "white", borderRadius: 6, padding: "8px 20px", cursor: savingDraft ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: savingDraft ? 0.7 : 1 }}>
                                    {savingDraft ? "Saving…" : "Save to ontology"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmSaveModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ background: "#ffffff", borderRadius: 8, width: 400, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e5e7eb" }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Save changes to Ontology</h3>
                            <button onClick={() => setShowConfirmSaveModal(false)} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}><X size={16} /></button>
                        </div>
                        <div style={{ padding: 20 }}>
                            <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>Are you sure you want to save all changes to the Ontology?</p>
                        </div>
                        <div style={{ padding: "16px 20px", background: "#f9fafb", display: "flex", justifyContent: "flex-end", gap: 12, borderRadius: "0 0 8px 8px", borderTop: "1px solid #e5e7eb" }}>
                            <button onClick={() => setShowConfirmSaveModal(false)} disabled={savingDraft} style={{ background: "white", border: "1px solid #d1d5db", color: "#374151", borderRadius: 4, padding: "6px 16px", cursor: savingDraft ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                            <button onClick={() => { handleSaveDraftToOntology(); setShowConfirmSaveModal(false); }} disabled={savingDraft} style={{ background: "#16a34a", border: "none", color: "white", borderRadius: 4, padding: "6px 16px", cursor: savingDraft ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>Save changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HEADER ────────────────────────────────────────────────────── */}
            <div style={{ height: 48, borderTop: "3px solid #2563eb", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, background: "#ffffff", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 20, height: 20, background: "#3b82f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Database size={12} color="white" />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Ontology Manager</span>
                    </div>

                    <div style={{ height: 20, width: 1, background: "#e5e7eb" }} />

                    {/* Search bar inside header */}
                    <div style={{ position: "relative", width: 400 }}>
                        <SearchIcon size={14} style={{ position: "absolute", left: 10, top: 8, color: "#6b7280" }} />
                        <input
                            placeholder="Search resources..."
                            style={{ background: "#f3f4f6", border: "1px solid transparent", borderRadius: 4, padding: "6px 12px 6px 32px", fontSize: 13, width: "100%", color: "#111827", outline: "none" }}
                            onFocus={e => e.target.style.border = "1px solid #3b82f6"}
                            onBlur={e => e.target.style.border = "1px solid transparent"}
                        />
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {draftObject && selectedObject?.api_name === draftObject.api_name && (
                        <>
                            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{draftEditCount} edits</span>
                            <button
                                onClick={() => setShowSaveReviewModal(true)}
                                style={{ background: "#16a34a", border: "none", borderRadius: 4, padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}
                            >
                                Save
                            </button>
                        </>
                    )}
                    {/* Branch Selector */}
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setShowBranchSelector(!showBranchSelector)}
                            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, padding: "5px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#4b5563", fontSize: 12 }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <GitBranch size={14} />
                            <span style={{ fontWeight: 600, color: "#111827" }}>{activeBranch}</span>
                            <ChevronDown size={14} />
                        </button>
                        {showBranchSelector && (
                            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 200, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 6, zIndex: 100, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}>
                                <div style={{ padding: 4 }}>
                                    {branches.map(b => (
                                        <div key={b} onClick={() => { setActiveBranch(b); setShowBranchSelector(false); }}
                                            onMouseEnter={e => { if (b !== activeBranch) e.currentTarget.style.background = "#f9fafb"; }}
                                            onMouseLeave={e => { if (b !== activeBranch) e.currentTarget.style.background = "transparent"; }}
                                            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 4, background: b === activeBranch ? "#eff6ff" : "transparent", color: b === activeBranch ? "#2563eb" : "#4b5563", fontSize: 13, fontWeight: b === activeBranch ? 600 : 500 }}>{b}</div>
                                    ))}
                                    <div style={{ height: 1, background: "#e5e7eb", marginTop: 4, marginBottom: 4 }} />
                                    <div
                                        onClick={() => { const name = prompt("Enter new branch name:"); if (name) { setBranches([...branches, name]); setActiveBranch(name); setShowBranchSelector(false); } }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                        style={{ padding: "8px 12px", cursor: "pointer", color: "#2563eb", fontSize: 13, fontWeight: 600, borderRadius: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                        <Plus size={14} /> Create branch
                                    </div>
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
                            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 260, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, zIndex: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
                                <div style={{ padding: 6 }}>
                                    {[
                                        { label: "Object type", desc: "Map datasets and models to object types", icon: Database, action: () => setShowWizard(true) },
                                        { label: "Link type", desc: "Create relationships between object types", icon: Link2, action: () => { setView("Links"); } },
                                        { label: "Action type", desc: "Allow users to writeback to their ontology", icon: Zap, action: () => { setView("Actions"); setShowNewActionForm(true); } },
                                        { label: "Shared property", desc: "Create properties that can be shared across object types", icon: Share2 },
                                        { label: "Group", desc: "Use groups to create ontology taxonomies", icon: LayoutGrid },
                                        { label: "Interface", desc: "Use interfaces to build against abstract types", icon: Share2, action: () => { setView("Interfaces"); setShowNewInterfaceForm(true); } },
                                        { label: "Function", desc: "Define object modifications in code", icon: Settings },
                                        { label: "Value type", desc: "Define constraints that can be applied to property values", icon: Settings }
                                    ].map((item, idx) => (
                                        <div key={idx} onClick={() => { item.action?.(); setShowNewDropdown(false); }}
                                            style={{ padding: "8px 10px", cursor: "pointer", borderRadius: 5, display: "flex", gap: 10, alignItems: "flex-start" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                            <div style={{ width: 28, height: 28, background: "#eff6ff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                                <item.icon size={14} color="#2563eb" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.label}</div>
                                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{item.desc}</div>
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
                {!selectedObject && (
                    <div style={{ width: 220, borderRight: "1px solid #e5e7eb", background: "#ffffff", padding: "16px 8px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                        <div style={{ marginBottom: 16, paddingLeft: 8, paddingRight: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Y-AIP Public Ontology</div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#4b5563", fontSize: 13, background: "#f9fafb", border: "1px solid #e5e7eb", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <Database size={14} color="#3b82f6" />
                                    <span style={{ fontWeight: 500, color: "#111827" }}>Y-AIP Public</span>
                                </div>
                                <ChevronDown size={14} />
                            </div>
                        </div>

                        {sidebarItems.map(item => (
                            <SidebarItem
                                key={item.id}
                                active={view === item.id}
                                onClick={() => setView(item.id)}
                                icon={item.icon}
                                label={item.label}
                            />
                        ))}

                        <div style={{ height: 1, background: "#e5e7eb", margin: "12px 8px" }} />

                        {!loading && resources.map(item => (
                            <div key={item.id}>
                                <SidebarItem
                                    active={view === item.id}
                                    onClick={() => setView(item.id as Tab)}
                                    icon={item.icon}
                                    label={item.label}
                                    count={item.count}
                                />
                                {item.separator && <div style={{ height: 1, background: "#e5e7eb", margin: "12px 8px" }} />}
                            </div>
                        ))}

                        <div style={{ marginTop: "auto", paddingLeft: 8, paddingRight: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            <SidebarItem icon={HelpCircle} label="Health issues" />
                            <SidebarItem icon={Plus} label="Cleanup" />
                            <SidebarItem icon={Settings} label="Ontology configuration" />
                        </div>
                    </div>
                )}

                {/* ── MAIN VIEWPORT ── */}
                <div style={{ flex: 1, overflowY: "auto", background: "#ffffff" }}>
                    {view === "discover" ? (
                        <DiscoveryView schema={schema} onObjectClick={(ot: OntologyObjectType) => { setView("Objects"); setSelectedObject(ot); }} />
                    ) : view === "proposals" || view === "history" ? (
                        <div style={{ padding: 40 }}>
                            <EmptyState message={`${view[0].toUpperCase()}${view.slice(1)} is not available in the current environment.`} />
                        </div>
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
                            showWizard={false}
                            setShowWizard={setShowWizard}
                            showNewLinkForm={showNewLinkForm}
                            setShowNewLinkForm={setShowNewLinkForm}
                            showNewActionForm={showNewActionForm}
                            setShowNewActionForm={setShowNewActionForm}
                            showNewInterfaceForm={showNewInterfaceForm}
                            setShowNewInterfaceForm={setShowNewInterfaceForm}
                            draftObject={draftObject}
                            handleDraftReady={handleDraftReady}
                            handleDiscardDraft={handleDiscardDraft}
                            fetchSchema={fetchSchema}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function SidebarItem({ active, onClick, icon: Icon, label, count }: { active?: boolean; onClick?: () => void; icon: React.ComponentType<{ size?: number; color?: string }>; label: string; count?: number }) {
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
                background: active ? "#e5e7eb" : "transparent",
                color: active ? "#111827" : "#4b5563",
                transition: "all 0.2s"
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f3f4f6"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} color={active ? "#2563eb" : "#6b7280"} />
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{label}</span>
            </div>
            {count !== undefined && <span style={{ fontSize: 11, color: "#6b7280" }}>{count}</span>}
        </div>
    );
}

function DiscoveryView({ schema, onObjectClick }: { schema: OntologySchema | null; onObjectClick: (ot: OntologyObjectType) => void }) {
    const recentlyViewed = schema?.object_types.slice(0, 6) ?? [];
    const count = schema?.object_types.length ?? 0;

    return (
        <div style={{ padding: "32px 40px", background: "#ffffff", minHeight: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Recently viewed object types</span>
                    <span style={{ background: "#f3f4f6", color: "#374151", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{count}</span>
                    <button style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: 0 }}>↺</button>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 5, padding: "5px 12px", color: "#374151", fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <Grid size={13} /> Configure
                    </button>
                    <button style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                        See all <ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} />
                    </button>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {recentlyViewed.length === 0 ? (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "#9ca3af", fontSize: 14 }}>No object types yet. Click New → Object type to create one.</div>
                ) : recentlyViewed.map((ot: OntologyObjectType) => (
                    <div key={ot.api_name} onClick={() => onObjectClick(ot)}
                        style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, cursor: "pointer", transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <div style={{ width: 30, height: 30, background: "#eff6ff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Database size={15} color="#2563eb" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{ot.display_name}</div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{ot.properties?.length ?? 0} objects</div>
                            </div>
                            <MoreVertical size={14} color="#9ca3af" />
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, minHeight: 20 }}>{ot.description || "No description"}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>3 dependents</div>
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
    draftObject: DraftObjectType | null;
    handleDraftReady: (draft: DraftObjectType) => void;
    handleDiscardDraft: () => void;
    fetchSchema: () => void;
}) {
    const {
        activeTab,
        schema,
        loading,
        selectedObject,
        setSelectedObject,
        fetchSchema,
        selectedAction,
        setSelectedAction,
        selectedInterface,
        setSelectedInterface,
        showNewLinkForm,
        setShowNewLinkForm,
        showNewActionForm,
        setShowNewActionForm,
        showNewInterfaceForm,
        setShowNewInterfaceForm,
        draftObject,
        handleDraftReady,
        handleDiscardDraft
    } = props;
    const objectTypes = draftObject
        ? [draftObject, ...(schema?.object_types || []).filter((ot) => ot.api_name !== draftObject.api_name)]
        : (schema?.object_types || []);

    return (
        <div style={{ display: "flex", height: "100%" }}>
            {selectedObject ? (
                <ObjectTypeDetail
                    ot={selectedObject}
                    isDraft={draftObject?.api_name === selectedObject.api_name}
                    onDiscardDraft={handleDiscardDraft}
                    onRefresh={() => { fetchSchema(); setSelectedObject(null); }}
                />
            ) : activeTab === "Objects" && (
                <>
                    <div style={{ width: 280, borderRight: "1px solid #e5e7eb", padding: 20, overflowY: "auto", flexShrink: 0, background: "#f9fafb" }}>
                        <SectionTitle title="Object Types" count={schema?.object_types.length} />
                        <button onClick={() => props.setShowWizard(true)} style={{ width: "100%", background: "#eff6ff", border: "1px dashed #3b82f6", borderRadius: 6, color: "#2563eb", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12, fontWeight: 500 }}>
                            + New Object Type
                        </button>
                        {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                            objectTypes.map((ot: OntologyObjectType) => (
                                <Card key={ot.api_name} onClick={() => setSelectedObject(ot)} selected={selectedObject?.api_name === ot.api_name}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{ot.display_name}</div>
                                        {(ot as DraftObjectType).is_draft && <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>DRAFT</span>}
                                    </div>
                                    <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{ot.api_name}</div>
                                </Card>
                            ))
                        }
                    </div>
                    <div style={{ flex: 1, padding: 24, overflowY: "auto", background: "#ffffff" }}>
                        {props.showWizard ? (
                            <NewObjectTypeWizard onSuccess={(draft) => { props.setShowWizard(false); handleDraftReady(draft); }} onCancel={() => props.setShowWizard(false)} />
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

function NewObjectTypeWizard({ onSuccess, onCancel }: { onSuccess: (draft: DraftObjectType) => void; onCancel: () => void }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        datasourceType: "existing",
        datasetId: "",
        apiName: "",
        displayName: "",
        pluralName: "",
        description: "",
        primaryKey: "",
        titleProperty: "",
        properties: [] as OntologyProperty[],
        actions: { create: false, edit: false, delete: false }
    });
    const [availableDatasets, setAvailableDatasets] = useState<DatasetSummary[]>([]);
    const [loadingDatasets, setLoadingDatasets] = useState(false);
    const [loadingColumns, setLoadingColumns] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
    const showReviewModal = false;
    const setShowReviewModal = (_value: boolean) => { void _value; };

    useEffect(() => {
        if (step === 1 && availableDatasets.length === 0) {
            setLoadingDatasets(true);
            fetch(`${API_BASE}/datasets`)
                .then(r => r.json())
                .then(d => {
                    if (Array.isArray(d)) {
                        setAvailableDatasets(d);
                    } else {
                        console.error("Failed to load datasets:", d);
                        setAvailableDatasets([]);
                    }
                })
                .catch(err => {
                    console.error("Dataset fetch error:", err);
                    setAvailableDatasets([]);
                })
                .finally(() => setLoadingDatasets(false));
        }
    }, [step, availableDatasets.length]);

    const handleDatasetSelect = async (id: string) => {
        const ds = availableDatasets.find(d => d.id === id);
        if (!ds) return;

        setLoadingColumns(true);
        setFormData(prev => ({ ...prev, datasetId: id, displayName: ds.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), apiName: ds.name, pluralName: ds.name.endsWith('s') ? ds.name : ds.name + 's' }));

        try {
            const res = await fetch(`${API_BASE}/datasets/${id}/preview`);
            if (res.ok) {
                const data = await res.json();
                const columns = data.columns || [];
                setFormData(prev => ({
                    ...prev,
                    properties: columns.map((col: DatasetColumn) => ({
                        api_name: col.name.toLowerCase().replace(/ /g, '_'),
                        display_name: col.name,
                        data_type: col.type || "string", // Use backend inferred type
                        is_primary_key: false,
                        is_required: false
                    }))
                }));
            }
        } catch (e) { console.error(e); }
        setLoadingColumns(false);
    };

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const generatedActions: DraftGeneratedAction[] = [];
            if (formData.actions.create) generatedActions.push({ api_name: `create_${formData.apiName}`, display_name: `Create ${formData.displayName}`, action_type: "create" });
            if (formData.actions.edit) generatedActions.push({ api_name: `edit_${formData.apiName}`, display_name: `Modify ${formData.displayName}`, action_type: "edit" });
            if (formData.actions.delete) generatedActions.push({ api_name: `delete_${formData.apiName}`, display_name: `Delete ${formData.displayName}`, action_type: "delete" });

            const normalizedProperties = formData.properties.map((p: OntologyProperty) => ({
                ...p,
                is_primary_key: p.api_name === formData.primaryKey || p.display_name === formData.primaryKey,
                is_required: p.is_required || p.api_name === formData.primaryKey || p.display_name === formData.primaryKey
            }));

            onSuccess({
                api_name: formData.apiName,
                display_name: formData.displayName,
                plural_display_name: formData.pluralName,
                description: formData.description || `Object type backed by ${formData.datasetId}`,
                primary_key: formData.primaryKey || normalizedProperties[0]?.api_name || "id",
                title_property: formData.titleProperty || normalizedProperties[0]?.api_name || "id",
                backing_source: formData.datasetId,
                icon: "entity",
                properties: normalizedProperties,
                implements: [],
                link_types: [],
                action_types: [],
                is_draft: true,
                generated_actions: generatedActions,
                edit_count: 7 + normalizedProperties.length + generatedActions.length,
            });
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    const pendingChanges = [
        { label: "Display name", from: null, to: formData.displayName },
        { label: "API name", from: "NewObjectType", to: formData.apiName },
        { label: "Plural display name", from: null, to: formData.pluralName },
        { label: "Primary key", from: null, to: formData.primaryKey || formData.properties[0]?.display_name || "—" },
        { label: "Title property", from: null, to: formData.titleProperty || formData.properties[0]?.display_name || "—" },
        { label: "Backing datasource", from: null, to: formData.datasetId },
    ];
    const selectedActionLabels = [
        formData.actions.create && `Create ${formData.displayName}`,
        formData.actions.edit && `Modify ${formData.displayName}`,
        formData.actions.delete && `Delete ${formData.displayName}`,
    ].filter(Boolean) as string[];

    return (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", height: "100%", maxWidth: 1000, width: "100%", margin: "0 auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)" }}>

            {/* ── Review Changes Modal ── */}
            {showReviewModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ background: "#ffffff", borderRadius: 10, width: "100%", maxWidth: 680, boxShadow: "0 25px 50px rgba(0,0,0,0.25)", overflow: "hidden" }}>
                        {/* Modal Header */}
                        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Review changes</h2>
                            </div>
                            <button onClick={() => setShowReviewModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>✕</button>
                        </div>

                        {/* Tab bar */}
                        <div style={{ borderBottom: "1px solid #e5e7eb", display: "flex", gap: 0 }}>
                            {["All changes", "Warnings", "Errors", "Migrations", "Conflicts"].map((t, i) => (
                                <div key={t} style={{ padding: "10px 16px", fontSize: 13, fontWeight: i === 0 ? 600 : 500, color: i === 0 ? "#2563eb" : "#6b7280", borderBottom: i === 0 ? "2px solid #2563eb" : "2px solid transparent", cursor: "pointer" }}>{t}</div>
                            ))}
                        </div>

                        {/* Change row: object type entry */}
                        <div style={{ maxHeight: 440, overflowY: "auto" }}>
                            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f3f4f6" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
                                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{formData.displayName || "New Object Type"}</span>
                                    </div>
                                    <span style={{ fontSize: 11, padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, fontWeight: 600 }}>Created</span>
                                </div>

                                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                                    <div style={{ padding: "8px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>GENERAL INFORMATION</div>
                                    {pendingChanges.map((c, i) => (
                                        <div key={c.label} style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderBottom: i < pendingChanges.length - 1 ? "1px solid #f3f4f6" : undefined, gap: 24 }}>
                                            <span style={{ width: 140, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{c.label}</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                {c.from && <span style={{ fontSize: 12, padding: "2px 8px", background: "#f3f4f6", borderRadius: 4, color: "#6b7280", textDecoration: "line-through" }}>{c.from}</span>}
                                                <span style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{c.to || "—"}</span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Properties count */}
                                    <div style={{ display: "flex", alignItems: "center", padding: "9px 16px", borderTop: "1px solid #f3f4f6", gap: 24 }}>
                                        <span style={{ width: 140, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>Properties</span>
                                        <span style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{formData.properties.length} properties</span>
                                    </div>

                                    {/* Actions */}
                                    {selectedActionLabels.length > 0 && (
                                        <div style={{ display: "flex", alignItems: "flex-start", padding: "9px 16px", borderTop: "1px solid #f3f4f6", gap: 24 }}>
                                            <span style={{ width: 140, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>Actions</span>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                                {selectedActionLabels.map(a => (
                                                    <span key={a} style={{ fontSize: 12, padding: "2px 8px", background: "#dbeafe", borderRadius: 4, color: "#1e40af", fontWeight: 600 }}>{a}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb" }}>
                            <button onClick={() => setShowReviewModal(false)} style={{ background: "none", border: "1px solid #d1d5db", color: "#374151", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Discard</button>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
                                    <span>Save changes to a new branch</span>
                                    <div style={{ width: 32, height: 18, background: "#e5e7eb", borderRadius: 9, cursor: "not-allowed", position: "relative" }}>
                                        <div style={{ width: 14, height: 14, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                                    </div>
                                </div>
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving || !formData.displayName || !formData.apiName}
                                    style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 6, padding: "8px 20px", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving || !formData.displayName ? 0.6 : 1 }}
                                >
                                    {saving ? "Saving…" : "Save to ontology"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ padding: "24px 32px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", borderRadius: "12px 12px 0 0" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Create a new object type</h2>
                    <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
                        {["Datasource", "Metadata", "Properties", "Actions"].map((s, i) => (
                            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, opacity: step === i + 1 ? 1 : 0.5 }}>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: step >= i + 1 ? "#3b82f6" : "#e5e7eb", color: step >= i + 1 ? "white" : "#6b7280", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{i + 1}</div>
                                <span style={{ fontSize: 13, fontWeight: step === i + 1 ? 600 : 500, color: step === i + 1 ? "#111827" : "#6b7280" }}>{s}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {false && step > 1 && formData.displayName && (
                        <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
                            {formData.properties.length > 0 ? `${formData.properties.length} edits` : ""}
                        </div>
                    )}
                    {step > 1 && formData.displayName && (
                        <button
                            onClick={() => setShowReviewModal(true)}
                            style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 6, padding: "6px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                            Save
                        </button>
                    )}
                    <button onClick={onCancel} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>✕</button>
                </div>
            </div>

            <div style={{ flex: 1, padding: 32, overflowY: "auto" }}>
                {step === 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
                        <div>
                            <h3 style={{ fontSize: 15, margin: "0 0 12px", color: "#111827" }}>Object type backing</h3>
                            <div style={{ display: "flex", gap: 16 }}>
                                <div
                                    onClick={() => setFormData({ ...formData, datasourceType: "existing" })}
                                    style={{ flex: 1, padding: 20, border: `2px solid ${formData.datasourceType === "existing" ? "#3b82f6" : "#e5e7eb"}`, borderRadius: 8, cursor: "pointer", background: formData.datasourceType === "existing" ? "#eff6ff" : "transparent" }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: "#111827" }}>Use existing datasource</div>
                                    <div style={{ fontSize: 13, color: "#6b7280" }}>Select a preexisting Y-AIP dataset</div>
                                </div>
                                <div
                                    style={{ flex: 1, padding: 20, border: "2px solid #e5e7eb", borderRadius: 8, opacity: 0.5, cursor: "not-allowed" }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: "#111827" }}>Continue without datasource</div>
                                    <div style={{ fontSize: 13, color: "#6b7280" }}>Generate a dataset for permissions purposes</div>
                                </div>
                            </div>
                        </div>

                        {formData.datasourceType === "existing" && (
                            <div>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Select datasource</label>
                                <div style={{ position: "relative" }}>
                                    <button
                                        onClick={() => setIsDatasetModalOpen(true)}
                                        disabled={loadingDatasets || loadingColumns}
                                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, color: formData.datasetId ? "#111827" : "#9ca3af", background: "#ffffff", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                    >
                                        <span>
                                            {formData.datasetId
                                                ? availableDatasets.find(d => d.id === formData.datasetId)?.name || formData.datasetId
                                                : "Search resources..."}
                                        </span>
                                        <div style={{ padding: "2px 8px", background: "#f3f4f6", borderRadius: 4, fontSize: 12, border: "1px solid #e5e7eb", color: "#6b7280" }}>Browse</div>
                                    </button>
                                </div>
                                {(loadingDatasets || loadingColumns) && <p style={{ fontSize: 12, color: "#3b82f6", marginTop: 8 }}>{loadingDatasets ? "Fetching datasets..." : "Loading schema..."}</p>}

                                <SelectDatasetModal
                                    isOpen={isDatasetModalOpen}
                                    onClose={() => setIsDatasetModalOpen(false)}
                                    datasets={availableDatasets}
                                    onSelect={(id) => {
                                        setIsDatasetModalOpen(false);
                                        handleDatasetSelect(id);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div style={{ maxWidth: 640 }}>
                        <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>STEP 2</div>
                        <h3 style={{ fontSize: 18, margin: "0 0 24px", color: "#111827", fontWeight: 700 }}>Configure object type metadata</h3>

                        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                            <div>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Icon</label>
                                <div style={{ width: 40, height: 40, border: "1px solid #d1d5db", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", cursor: "pointer" }}>
                                    <div style={{ width: 24, height: 24, background: "#eff6ff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Box size={14} color="#2563eb" />
                                    </div>
                                    <ChevronDown size={14} style={{ position: "absolute", marginLeft: 28, color: "#9ca3af", background: "white", padding: 2, borderRadius: "50%", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", transform: "translateY(12px) translateX(6px)" }} />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Name</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ width: "100%", padding: "10px 32px 10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, outline: "none", color: "#111827", fontWeight: 500 }} value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} placeholder="e.g. Order" />
                                    {formData.displayName && <button onClick={() => setFormData({ ...formData, displayName: "" })} style={{ position: "absolute", right: 8, top: 10, background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={16} /></button>}
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Plural name</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ width: "100%", padding: "10px 32px 10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, outline: "none", color: "#111827", fontWeight: 500 }} value={formData.pluralName} onChange={e => setFormData({ ...formData, pluralName: e.target.value })} placeholder="e.g. Orders" />
                                    {formData.pluralName && <button onClick={() => setFormData({ ...formData, pluralName: "" })} style={{ position: "absolute", right: 8, top: 10, background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={16} /></button>}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Description</label>
                            <input style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, outline: "none" }} placeholder="Enter optional description..." />
                        </div>

                        <div>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>Groups</label>
                            <button style={{ width: "100%", padding: "10px", border: "1px dashed #d1d5db", borderRadius: 6, fontSize: 13, color: "#2563eb", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, background: "transparent", cursor: "pointer" }}>
                                <Plus size={16} /> Add to group
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div style={{ maxWidth: 800 }}>
                        <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>STEP 3</div>
                        <h3 style={{ fontSize: 18, margin: "0 0 24px", color: "#111827", fontWeight: 700 }}>Create properties</h3>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 16px" }}>
                            <div style={{ display: "flex", gap: 32 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#4b5563" }}>Source</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginLeft: 130 }}>Property</span>
                            </div>
                            <button style={{ background: "none", border: "none", color: "#2563eb", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                <Plus size={14} /> Add property
                            </button>
                        </div>

                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 24, background: "#ffffff" }}>
                            {formData.properties.map((p, idx) => (
                                <div key={p.api_name} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f3f4f6", gap: 16 }}>

                                    {/* Source Column */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, width: 170, border: "1px solid #e5e7eb", padding: "6px 8px", borderRadius: 4, background: "#f9fafb" }}>
                                        <Database size={14} color="#3b82f6" />
                                        <span style={{ fontSize: 13, color: "#374151", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{p.api_name}</span>
                                        <ChevronDown size={14} color="#6b7280" />
                                    </div>

                                    <div style={{ color: "#d1d5db", fontWeight: 500 }}>→</div>

                                    {/* Property Column */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #e5e7eb", padding: "6px 8px", borderRadius: 4, background: "#f9fafb", cursor: "pointer" }}>
                                            {p.data_type === "string" && <Type size={14} color="#6b7280" />}
                                            {p.data_type === "integer" || p.data_type === "double" ? <Hash size={14} color="#6b7280" /> : null}
                                            {p.data_type === "date" || p.data_type === "timestamp" ? <Calendar size={14} color="#6b7280" /> : null}
                                            <ChevronDown size={12} color="#6b7280" />
                                        </div>
                                        <input
                                            value={p.display_name}
                                            onChange={e => {
                                                const newProps = [...formData.properties];
                                                newProps[idx].display_name = e.target.value;
                                                setFormData({ ...formData, properties: newProps });
                                            }}
                                            style={{ flex: 1, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 13, outline: "none", fontWeight: 500, color: "#111827" }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: "flex", gap: 24, padding: "0 16px" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#4b5563" }}>
                                    Primary key <HelpCircle size={12} color="#9ca3af" />
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", appearance: "none", color: formData.primaryKey ? "#111827" : "#6b7280" }} value={formData.primaryKey} onChange={e => setFormData({ ...formData, primaryKey: e.target.value })}>
                                        <option value="">Select a property</option>
                                        {formData.properties.map(p => (
                                            <option key={p.api_name} value={p.display_name}>{p.display_name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: 12, color: "#9ca3af", pointerEvents: "none" }} />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#4b5563" }}>
                                    Title <HelpCircle size={12} color="#9ca3af" />
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", appearance: "none", color: formData.titleProperty ? "#111827" : "#6b7280" }} value={formData.titleProperty} onChange={e => setFormData({ ...formData, titleProperty: e.target.value })}>
                                        <option value="">Select a property</option>
                                        {formData.properties.map(p => (
                                            <option key={p.api_name} value={p.display_name}>{p.display_name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: 12, color: "#9ca3af", pointerEvents: "none" }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div style={{ maxWidth: 640 }}>
                        <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>STEP 4</div>
                        <h3 style={{ fontSize: 18, margin: "0 0 24px", color: "#111827", fontWeight: 700 }}>Generate action types</h3>

                        <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, fontSize: 13, fontWeight: 600, color: "#111827" }}>
                            Select action types to generate <HelpCircle size={14} color="#9ca3af" />
                        </label>

                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 32 }}>
                            {/* Create */}
                            <div onClick={() => setFormData({ ...formData, actions: { ...formData.actions, create: !formData.actions.create } })} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px", borderBottom: "1px solid #e5e7eb", cursor: "pointer", background: formData.actions.create ? "#eff6ff" : "#fff" }}>
                                <div style={{ marginTop: 2 }}>
                                    {formData.actions.create ? <CheckSquare size={18} color="#2563eb" /> : <Square size={18} color="#d1d5db" />}
                                </div>
                                <div style={{ width: 24, height: 24, borderRadius: 4, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -2 }}>
                                    <Database size={12} color="#2563eb" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Create [{formData.displayName || "Object"}]</div>
                                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                                        Set <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{formData.properties[0]?.display_name || "Id"}</span>
                                        {formData.properties.length > 1 && <>, <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{formData.properties[1]?.display_name}</span></>}
                                        {formData.properties.length > 2 && <>, and {formData.properties.length - 2} more properties</>}
                                    </div>
                                </div>
                            </div>
                            {/* Modify */}
                            <div onClick={() => setFormData({ ...formData, actions: { ...formData.actions, edit: !formData.actions.edit } })} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px", borderBottom: "1px solid #e5e7eb", cursor: "pointer", background: formData.actions.edit ? "#eff6ff" : "#fff" }}>
                                <div style={{ marginTop: 2 }}>
                                    {formData.actions.edit ? <CheckSquare size={18} color="#2563eb" /> : <Square size={18} color="#d1d5db" />}
                                </div>
                                <div style={{ width: 24, height: 24, borderRadius: 4, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -2 }}>
                                    <Edit size={12} color="#2563eb" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Modify [{formData.displayName || "Object"}]</div>
                                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                                        Modify <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{formData.properties[0]?.display_name || "Id"}</span>
                                        {formData.properties.length > 1 && <>, <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{formData.properties[1]?.display_name}</span></>}
                                        {formData.properties.length > 2 && <>, and {formData.properties.length - 2} more properties</>}
                                    </div>
                                </div>
                            </div>
                            {/* Delete */}
                            <div onClick={() => setFormData({ ...formData, actions: { ...formData.actions, delete: !formData.actions.delete } })} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px", cursor: "pointer", background: formData.actions.delete ? "#fef2f2" : "#fff" }}>
                                <div style={{ marginTop: 2 }}>
                                    {formData.actions.delete ? <CheckSquare size={18} color="#dc2626" /> : <Square size={18} color="#d1d5db" />}
                                </div>
                                <div style={{ width: 24, height: 24, borderRadius: 4, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -2 }}>
                                    <Trash2 size={12} color="#dc2626" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>Delete [{formData.displayName || "Object"}]</div>
                                    <div style={{ fontSize: 13, color: "#6b7280" }}>Allows deleting object instances and all of their properties</div>
                                </div>
                            </div>
                        </div>

                        <label style={{ display: "block", marginBottom: 16, fontSize: 13, fontWeight: 600, color: "#374151" }}>Choose who can submit this action type</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ flex: 1, padding: "12px", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 6, color: "#9ca3af", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, cursor: "not-allowed" }}>
                                <Box size={16} /> Organization
                            </button>
                            <button style={{ flex: 1, padding: "12px", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 6, color: "#9ca3af", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, cursor: "not-allowed" }}>
                                <Share2 size={16} /> Group
                            </button>
                            <button style={{ flex: 1, padding: "12px", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 6, color: "#9ca3af", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, cursor: "not-allowed" }}>
                                <Settings size={16} /> User
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ padding: "20px 32px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", borderRadius: "0 0 12px 12px" }}>
                <button onClick={onCancel} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <div style={{ display: "flex", gap: 12 }}>
                    {step > 1 && <button onClick={handleBack} style={{ background: "white", border: "1px solid #d1d5db", color: "#374151", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Back</button>}
                    {step < 4 ? (
                        <button
                            onClick={handleNext}
                            disabled={step === 1 && !formData.datasetId}
                            style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 6, padding: "8px 24px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (step === 1 && !formData.datasetId) ? 0.5 : 1 }}
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !formData.displayName || !formData.apiName}
                            style={{ background: "#2563eb", border: "none", color: "white", borderRadius: 6, padding: "8px 24px", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: !formData.displayName || saving ? 0.5 : 1 }}
                        >
                            {saving ? "Openingâ€¦" : "Open in manager"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Detail Panels
// ─────────────────────────────────────────────────────────────────────────────
function ObjectTypeDetail({
    ot,
    onRefresh,
    isDraft = false,
    onDiscardDraft
}: {
    ot: OntologyObjectType;
    onRefresh: () => void;
    isDraft?: boolean;
    onDiscardDraft?: () => void;
}) {
    const [subTab, setSubTab] = useState<ObjectSubTab>("Overview");
    const [indexStatus, setIndexStatus] = useState<{ index_status: string; index_count: number; last_synced: string | null }>({
        index_status: isDraft ? "draft" : (ot.index_status ?? "pending"),
        index_count: ot.index_count ?? 0,
        last_synced: ot.last_synced ?? null
    });
    const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, string>[]; total: number; file: string | null } | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [showIndexMenu, setShowIndexMenu] = useState(false);

    useEffect(() => {
        setIndexStatus({
            index_status: isDraft ? "draft" : (ot.index_status ?? "pending"),
            index_count: ot.index_count ?? 0,
            last_synced: ot.last_synced ?? null
        });
    }, [isDraft, ot.api_name, ot.index_count, ot.index_status, ot.last_synced]);

    // Poll indexing status every 2s while indexing
    useEffect(() => {
        if (isDraft) return;
        const poll = async () => {
            try {
                const r = await fetch(`${API_BASE}/object-types/${ot.api_name}/index-status`);
                if (r.ok) setIndexStatus(await r.json());
            } catch { /* offline */ }
        };
        poll();
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
    }, [isDraft, ot.api_name]);

    // Load preview when Datasources tab opens
    useEffect(() => {
        if (subTab !== "Datasources") return;
        setLoadingPreview(true);
        const previewEndpoint = isDraft
            ? `${API_BASE}/datasets/${encodeURIComponent(ot.backing_source)}/preview`
            : `${API_BASE}/object-types/${ot.api_name}/preview`;
        fetch(previewEndpoint)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && Array.isArray(d.columns)) {
                    d.columns = d.columns.map((c: any) => typeof c === 'string' ? c : (c.api_name || c.name || c.id || JSON.stringify(c)));
                }
                setPreview(d);
            })
            .catch(() => setPreview(null))
            .finally(() => setLoadingPreview(false));
    }, [isDraft, subTab, ot.api_name, ot.backing_source]);

    const handleReindex = async () => {
        if (isDraft) return;
        await fetch(`${API_BASE}/object-types/${ot.api_name}/index`, { method: "POST" });
        setIndexStatus(s => ({ ...s, index_status: "indexing", index_count: 0 }));
    };

    const handleDelete = async () => {
        if (isDraft) {
            onDiscardDraft?.();
            return;
        }
        if (!confirm(`Delete Object Type '${ot.api_name}'? This is irreversible.`)) return;
        await fetch(`/api/ontology-admin/object-types/${ot.api_name}`, { method: "DELETE" });
        onRefresh();
    };

    const isIndexing = indexStatus.index_status === "indexing";
    const isActive = indexStatus.index_status === "active";
    const statusLabel = isDraft
        ? "Unsaved draft"
        : isActive
            ? `${indexStatus.index_count.toLocaleString()} objects`
            : isIndexing
                ? `Indexing… ${indexStatus.index_count}`
                : "0 objects";

    const subNavItems: ObjectSubTab[] = ["Overview", "Properties", "Security", "Datasources", "Index Status", "Capabilities", "Object views", "Interfaces", "Materializations", "Automations", "Usage", "History"];

    return (
        <div style={{ display: "flex", height: "100%", width: "100%" }}>
            {/* ── Left sub-nav ── */}
            <div style={{ width: 220, borderRight: "1px solid #e5e7eb", background: "#ffffff", padding: "16px 0", flexShrink: 0, overflowY: "auto" }}>
                {/* Back button */}
                <div style={{ padding: "0 16px 12px" }}>
                    <button onClick={onRefresh} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                        <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Discover
                    </button>
                </div>
                {/* Object type header in sub-nav */}
                <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 28, height: 28, background: "#eff6ff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Database size={14} color="#2563eb" />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>[{ot.api_name.substring(0, 4)}] {ot.display_name}</div>
                            <div style={{ fontSize: 11, color: isDraft ? "#b45309" : isActive ? "#10b981" : isIndexing ? "#f59e0b" : "#6b7280" }}>
                                {isActive ? `${indexStatus.index_count.toLocaleString()} objects` : isIndexing ? `Indexing… ${indexStatus.index_count}` : "0 objects"}
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ padding: "8px 0" }}>
                    {subNavItems.map(item => (
                        <div key={item} onClick={() => setSubTab(item)}
                            style={{
                                padding: "8px 16px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: subTab === item ? "#eff6ff" : "transparent",
                                color: subTab === item ? "#2563eb" : "#4b5563",
                                fontWeight: subTab === item ? 600 : 500, borderLeft: subTab === item ? "3px solid #2563eb" : "3px solid transparent"
                            }}
                            onMouseEnter={e => { if (subTab !== item) e.currentTarget.style.background = "#f3f4f6"; }}
                            onMouseLeave={e => { if (subTab !== item) e.currentTarget.style.background = "transparent"; }}>
                            <span>{item}</span>
                            {item === "Properties" && <span style={{ fontSize: 11, color: "#6b7280" }}>{ot.properties?.length ?? 0}</span>}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main content ── */}
            <div style={{ flex: 1, overflowY: "auto", background: "#f9fafb" }}>

                {/* ─ OVERVIEW TAB ─ */}
                {subTab === "Overview" && (
                    <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>{ot.display_name}</h2>
                                <code style={{ color: "#2563eb", fontSize: 13, background: "#eff6ff", padding: "2px 6px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{ot.api_name}</code>
                                <p style={{ color: "#4b5563", fontSize: 14, marginTop: 12 }}>{ot.description || "No description provided."}</p>
                            </div>
                            <button onClick={handleDelete} style={{ background: isDraft ? "#fff7ed" : "#fef2f2", border: `1px solid ${isDraft ? "#fdba74" : "#fecaca"}`, color: isDraft ? "#c2410c" : "#dc2626", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>{isDraft ? "Discard draft" : "Delete Object Type"}</button>
                        </div>

                        {isDraft && (
                            <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: 16, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#b45309" }}>Unsaved ontology changes</div>
                                    <div style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>Use the top-right Save button, then click Save to ontology to create this object type and start indexing.</div>
                                </div>
                                <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600, whiteSpace: "nowrap" }}>{statusLabel}</div>
                            </div>
                        )}

                        {/* Indexing status banner */}
                        <div style={{ background: isDraft ? "#f9fafb" : isActive ? "#ecfdf5" : isIndexing ? "#fffbeb" : "#f3f4f6", border: `1px solid ${isDraft ? "#d1d5db" : isActive ? "#10b981" : isIndexing ? "#f59e0b" : "#e5e7eb"}`, borderRadius: 8, padding: 16, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                {isIndexing && <div style={{ width: 18, height: 18, border: "2px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
                                {isActive && <div style={{ color: "#10b981", fontWeight: 700, fontSize: 18 }}>✓</div>}
                                {isDraft && <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />}
                                {!isIndexing && !isActive && !isDraft && <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#9ca3af", flexShrink: 0 }} />}
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: isDraft ? "#4b5563" : isActive ? "#065f46" : isIndexing ? "#b45309" : "#4b5563" }}>
                                        {isActive ? `Active — ${indexStatus.index_count.toLocaleString()} objects indexed` : isIndexing ? `Indexing… ${indexStatus.index_count.toLocaleString()} objects indexed so far` : "Not indexed"}
                                    </div>
                                    {indexStatus.last_synced && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Last synced {new Date(indexStatus.last_synced).toLocaleString()}</div>}
                                </div>
                            </div>
                            <button onClick={handleReindex} style={{ border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#ffffff" }}>↻ Re-index</button>
                        </div>

                        {/* Overview Metadata Grid matching reference */}
                        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, display: "flex", overflow: "hidden", marginBottom: 24 }}>
                            {/* Left Column */}
                            <div style={{ flex: 2, borderRight: "1px solid #e5e7eb" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, padding: "16px 20px" }}>
                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center" }}>Plural name <span style={{ color: "#10b981" }}>*</span></div>
                                    <div style={{ color: "#111827", fontSize: 13, fontWeight: 500 }}>{ot.plural_display_name || `[Gena] ${ot.display_name}s`}</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center" }}>Description</div>
                                    <div style={{ color: "#111827", fontSize: 13 }}>{ot.description || "Type here..."}</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center", display: "flex", alignItems: "center", gap: 4 }}>Aliases <HelpCircle size={12} /></div>
                                    <div style={{ color: "#9ca3af", fontSize: 13 }}>Add aliases...</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center", display: "flex", alignItems: "center", gap: 4 }}>Point of contact <HelpCircle size={12} /></div>
                                    <div style={{ color: "#111827", fontSize: 13 }}>None</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center", display: "flex", alignItems: "center", gap: 4 }}>Contributors <HelpCircle size={12} /></div>
                                    <div style={{ color: "#111827", fontSize: 13 }}>GC</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center" }}>Ontology</div>
                                    <div style={{ color: "#111827", fontSize: 13 }}>Ontologize Public Ontology</div>

                                    <div style={{ color: "#6b7280", fontSize: 13, alignSelf: "center" }}>API name</div>
                                    <div style={{ color: "#111827", fontSize: 13 }}>{ot.api_name}</div>
                                </div>
                            </div>
                            {/* Right Column */}
                            <div style={{ flex: 1, padding: "16px 20px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                                    <div style={{ color: "#6b7280", fontSize: 13 }}>Status</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, border: "1px solid #fde68a" }}>
                                        {ot.status || "Experimental"} <ChevronDown size={12} />
                                    </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                                    <div style={{ color: "#6b7280", fontSize: 13 }}>Visibility</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#2563eb", fontSize: 13, fontWeight: 600 }}>
                                        <div style={{ width: 14, height: 14, background: "#e0e7ff", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}><Box size={10} color="#2563eb" /></div>
                                        Normal <ChevronDown size={12} />
                                    </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, position: "relative" }}>
                                    <div style={{ color: "#6b7280", fontSize: 13 }}>Index status</div>
                                    <div
                                        onClick={() => setShowIndexMenu(!showIndexMenu)}
                                        style={{ display: "flex", alignItems: "center", gap: 6, color: "#2563eb", fontSize: 13, fontWeight: 500, background: "#eff6ff", padding: "2px 8px", borderRadius: 4, cursor: "pointer", border: "1px solid #bfdbfe" }}
                                    >
                                        <div style={{ width: 12, height: 12, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                                        {isActive ? "Active" : isIndexing ? "Running initial sync" : "Pending"}
                                    </div>
                                    {showIndexMenu && (
                                        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 220, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 100 }}>
                                            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                                    <span style={{ fontSize: 12, color: "#6b7280" }}>Status</span>
                                                    <span style={{ fontSize: 12, color: "#2563eb", display: "flex", alignItems: "center", gap: 4 }}>
                                                        <div style={{ width: 10, height: 10, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                                                        {isActive ? "Active" : "Running initial sync"}
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: 12, color: "#6b7280" }}>Started by</span>
                                                    <span style={{ fontSize: 12, color: "#111827", fontWeight: 500 }}>objects-data-funnel</span>
                                                </div>
                                            </div>
                                            <div
                                                onClick={() => { setShowIndexMenu(false); setSubTab("Index Status"); }}
                                                style={{ padding: "10px 16px", fontSize: 13, color: "#2563eb", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                                                onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                            >
                                                View index status <span style={{ marginLeft: "auto" }}>→</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, borderBottom: "1px solid #e5e7eb", paddingBottom: 24 }}>
                                    <div style={{ color: "#6b7280", fontSize: 13 }}>Edits</div>
                                    <div style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>Disabled</div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                                    <div style={{ color: "#6b7280", fontSize: 12 }}>ID</div>
                                    <div style={{ color: "#111827", fontSize: 12 }}>{ot.api_name.toLowerCase()}</div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <div style={{ color: "#6b7280", fontSize: 12 }}>RID</div>
                                    <div style={{ color: "#6b7280", fontSize: 12, fontStyle: "italic" }}>Set on save</div>
                                </div>
                            </div>
                        </div>

                        {/* We hide the old cards beneath if they conflict, but we'll include them as generic details if needed */}
                    </div>
                )}

                {/* ─ PROPERTIES TAB ─ */}
                {subTab === "Properties" && (
                    <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
                        <h3 style={{ color: "#111827", fontSize: 18, marginBottom: 16 }}>Properties <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 400 }}>({ot.properties?.length ?? 0})</span></h3>
                        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                                        {["API Name", "Display Name", "Data Type", "PK", "Required"].map(h => (
                                            <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ot.properties?.map(p => (
                                        <tr key={p.api_name} style={{ borderBottom: "1px solid #e5e7eb" }}>
                                            <td style={{ padding: "10px 16px" }}><code style={{ color: "#2563eb", fontSize: 12 }}>{p.api_name}</code></td>
                                            <td style={{ padding: "10px 16px", color: "#111827", fontWeight: 500 }}>{p.display_name}</td>
                                            <td style={{ padding: "10px 16px" }}><Badge label={p.data_type} color="#10b981" /></td>
                                            <td style={{ padding: "10px 16px" }}>{p.is_primary_key ? "✅" : "—"}</td>
                                            <td style={{ padding: "10px 16px" }}>{p.is_required ? "✅" : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ─ DATASOURCES TAB ─ */}
                {subTab === "Datasources" && (
                    <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
                        {/* Object Storage V2 card */}
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 24, overflow: "hidden", background: "#ffffff" }}>
                            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e5e7eb" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 32, height: 32, background: "#f3f4f6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Database size={16} color="#4b5563" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Object Storage V2</div>
                                        <div style={{ fontSize: 12, color: "#6b7280" }}>The backend service that stores and serves information about objects</div>
                                    </div>
                                </div>
                                <ChevronDown size={16} color="#6b7280" />
                            </div>
                            <div style={{ padding: "16px 20px", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 24, height: 24, background: "#e5e7eb", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={12} color="#4b5563" /></div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Object Storage V2</div>
                                        <div style={{ fontSize: 11, color: "#6b7280" }}>Default object data store</div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 13, color: "#6b7280" }}>
                                    <span>Data: <span style={{ color: "#2563eb", fontWeight: 500 }}>{indexStatus.last_synced ? `${Math.round((Date.now() - new Date(indexStatus.last_synced).getTime()) / 60000)} minutes ago` : "never"}</span></span>
                                    <span>Schema: <span style={{ color: "#2563eb", fontWeight: 500 }}>Up to date</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Live pipeline diagram */}
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 24, overflow: "hidden", background: "#ffffff" }}>
                            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Live pipeline</div>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Append the latest changes made to any backing datasources into relevant stores.</div>
                                </div>
                                <button onClick={handleReindex} style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                                    ↻ Re-sync
                                </button>
                            </div>
                            <div style={{ padding: "32px 20px", background: "#f9fafb" }}>
                                {/* Pipeline stages */}
                                <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
                                    {[
                                        { label: ot.backing_source ?? "all_orders", sublabel: "Source dataset", color: "#2563eb", status: "active" },
                                        { label: "Changelog", sublabel: "Captures row changes", color: "#10b981", status: isActive ? "active" : isIndexing ? "running" : "pending" },
                                        { label: "Merge changes", sublabel: "Deduplicates events", color: "#10b981", status: isActive ? "active" : isIndexing ? "running" : "pending" },
                                        { label: "Indexing", sublabel: `${indexStatus.index_count.toLocaleString()} rows`, color: isActive ? "#10b981" : isIndexing ? "#f59e0b" : "#9ca3af", status: isActive ? "active" : isIndexing ? "running" : "pending" },
                                        { label: "Object Storage V2", sublabel: "Committed store", color: isActive ? "#10b981" : "#9ca3af", status: isActive ? "active" : "pending" }
                                    ].map((stage, i, arr) => (
                                        <div key={stage.label} style={{ display: "flex", alignItems: "center" }}>
                                            <div style={{ textAlign: "center", minWidth: 130 }}>
                                                <div style={{ width: 40, height: 40, borderRadius: 8, background: stage.status === "active" ? "#ecfdf5" : stage.status === "running" ? "#fffbeb" : "#ffffff", border: `1.5px solid ${stage.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", position: "relative" }}>
                                                    {stage.status === "running" && (
                                                        <div style={{ width: 16, height: 16, border: `2px solid ${stage.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                                    )}
                                                    {stage.status === "active" && <div style={{ color: stage.color, fontSize: 16, fontWeight: 700 }}>✓</div>}
                                                    {stage.status === "pending" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d1d5db" }} />}
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: stage.status !== "pending" ? "#111827" : "#6b7280" }}>{stage.label}</div>
                                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{stage.sublabel}</div>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div style={{ height: 2, width: 40, background: stage.status === "active" ? "#10b981" : "#d1d5db", flexShrink: 0 }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Monitor health strip */}
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", marginBottom: 24, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ color: "#4b5563", fontSize: 20 }}>⚡</div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Monitor the health of this object type</div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Configure alerts for failing or slow indexing jobs</div>
                                </div>
                            </div>
                            <button style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>Monitor this object type ↗</button>
                        </div>

                        {/* Indexing Metadata */}
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 24, overflow: "hidden", background: "#ffffff" }}>
                            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
                                <Settings size={16} color="#6b7280" />
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Indexing Metadata</span>
                            </div>
                            <div style={{ padding: "20px", background: "#ffffff" }}>
                                <p style={{ fontSize: 13, color: "#111827", marginBottom: 16 }}>What should the target backing store be for this object type?</p>
                                <div style={{ display: "flex", gap: 16 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #d1d5db", borderRadius: 8, padding: "12px 16px", cursor: "pointer", flex: 1 }}>
                                        <input type="radio" name="storage" defaultChecked={false} />
                                        <span style={{ fontSize: 13, color: "#4b5563" }}>Object Storage v1</span>
                                    </label>
                                    <label style={{ display: "flex", alignItems: "center", gap: 10, border: "2px solid #3b82f6", borderRadius: 8, padding: "12px 16px", cursor: "pointer", flex: 1, background: "#f0fdfa" }}>
                                        <input type="radio" name="storage" defaultChecked={true} />
                                        <span style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>Object Storage v2</span>
                                        <span style={{ background: "#e0e7ff", color: "#2563eb", fontSize: 11, borderRadius: 4, padding: "2px 8px", marginLeft: "auto", fontWeight: 500 }}>Recommended</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* ── DATA PREVIEW TABLE ── */}
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>[{ot.api_name.substring(0, 4)}] {ot.display_name}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>Preview objects</button>
                                    <button style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>Preview table <ChevronDown size={12} /></button>
                                </div>
                            </div>
                            {/* Info bar */}
                            <div style={{ padding: "10px 16px", background: "#eff6ff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2563eb", color: "white", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>i</div>
                                <span style={{ fontSize: 12, color: "#1e3a8a", fontWeight: 500 }}>Edits are not included in this preview</span>
                            </div>
                            {loadingPreview ? (
                                <div style={{ padding: "60px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>Loading data preview…</div>
                            ) : preview && preview.columns.length > 0 ? (
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                                                <th style={{ padding: "8px 12px", color: "#6b7280", textAlign: "left", width: 40, fontWeight: 500 }}>#</th>
                                                {preview.columns.map(col => (
                                                    <th key={col} style={{ padding: "8px 12px", color: "#111827", textAlign: "left", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>
                                                        <div>{col}</div>
                                                        <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 400, marginTop: 2 }}>String</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.rows.map((row, i) => (
                                                <tr key={i} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                                                    <td style={{ padding: "6px 12px", color: "#6b7280", textAlign: "center" }}>{i + 1}</td>
                                                    {preview.columns.map(col => (
                                                        <td key={col} style={{ padding: "6px 12px", color: "#111827", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row[col] ?? ""}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ padding: "10px 16px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280", fontWeight: 500 }}>
                                        Showing {preview.rows.length} of {preview.total?.toLocaleString()} rows • {preview.file}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: "60px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>No data preview available for this object type.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─ PLACEHOLDER TABS ─ */}

                {/* ─ INDEX STATUS TAB ─ */}
                {subTab === "Index Status" && (() => {
                    const progressPct = isActive ? 100 : isIndexing ? Math.min(95, Math.round((indexStatus.index_count / Math.max(1, indexStatus.index_count + 10)) * 100)) : 0;
                    const stages = [
                        { id: "source", label: "Source", desc: ot.backing_source || "dataset", icon: "🗄️", status: "complete" as const },
                        { id: "changelog", label: "Changelog", desc: "Captures row changes", icon: "📋", status: isActive || isIndexing ? "complete" as const : "pending" as const },
                        { id: "merge", label: "Merge", desc: "Deduplicates rows", icon: "🔀", status: isActive || isIndexing ? "complete" as const : "pending" as const },
                        { id: "index", label: "Indexing", desc: `${indexStatus.index_count.toLocaleString()} rows`, icon: "⚙️", status: isActive ? "complete" as const : isIndexing ? "running" as const : "pending" as const },
                        { id: "osv2", label: "Object Storage V2", desc: "Live object store", icon: "✅", status: isActive ? "complete" as const : "pending" as const },
                    ];
                    return (
                        <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>

                            {/* Header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Index Status</h3>
                                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                                        Monitoring indexing health for <strong>{ot.display_name}</strong>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20,
                                        background: isActive ? "#ecfdf5" : isIndexing ? "#fffbeb" : "#f3f4f6",
                                        border: `1px solid ${isActive ? "#6ee7b7" : isIndexing ? "#fcd34d" : "#d1d5db"}`,
                                        fontSize: 13, fontWeight: 600,
                                        color: isActive ? "#065f46" : isIndexing ? "#92400e" : "#4b5563"
                                    }}>
                                        {isIndexing && <div style={{ width: 10, height: 10, border: "2px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                                        {isActive && <span>✓</span>}
                                        {!isActive && !isIndexing && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#9ca3af" }} />}
                                        {isActive ? "Active" : isIndexing ? "Running initial sync" : isDraft ? "Draft — not indexed" : "Pending"}
                                    </div>
                                    <button onClick={handleReindex} disabled={isIndexing || isDraft} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #d1d5db", background: "#ffffff", color: "#374151", borderRadius: 6, padding: "6px 14px", cursor: isIndexing || isDraft ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: isIndexing || isDraft ? 0.5 : 1 }}>
                                        ↻ Re-index
                                    </button>
                                </div>
                            </div>

                            {/* Key Metrics Row */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
                                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px" }}>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Objects</div>
                                    <div style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>{indexStatus.index_count.toLocaleString()}</div>
                                    <div style={{ fontSize: 12, color: isActive ? "#10b981" : "#9ca3af", marginTop: 4 }}>{isActive ? "✓ Fully indexed" : isIndexing ? "Indexing in progress…" : "Not yet indexed"}</div>
                                </div>
                                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px" }}>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Synced</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                                        {indexStatus.last_synced
                                            ? new Date(indexStatus.last_synced).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                            : "—"}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                        {indexStatus.last_synced ? new Date(indexStatus.last_synced).toLocaleDateString() : "Never synced"}
                                    </div>
                                </div>
                                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px" }}>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Properties</div>
                                    <div style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>{ot.properties?.length ?? 0}</div>
                                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                        {ot.properties?.filter((p: any) => p.is_primary_key).length ?? 0} primary key · {ot.properties?.filter((p: any) => !p.is_primary_key).length ?? 0} fields
                                    </div>
                                </div>
                            </div>

                            {/* Progress bar (shown while indexing or always) */}
                            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Indexing Progress</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: isActive ? "#10b981" : "#f59e0b" }}>{progressPct}%</span>
                                </div>
                                <div style={{ height: 10, background: "#f3f4f6", borderRadius: 5, overflow: "hidden" }}>
                                    <div style={{
                                        height: "100%", width: `${progressPct}%`, borderRadius: 5,
                                        background: isActive ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#f59e0b,#fbbf24)",
                                        transition: "width 0.5s ease"
                                    }} />
                                </div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                                    {isActive
                                        ? `Completed — ${indexStatus.index_count.toLocaleString()} objects written to Object Storage V2`
                                        : isIndexing
                                            ? `${indexStatus.index_count.toLocaleString()} objects indexed so far…`
                                            : "Index has not started. Click Re-index to begin."}
                                </div>
                            </div>

                            {/* Pipeline stages */}
                            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 20 }}>Pipeline Stages</div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    {stages.map((stage, i) => (
                                        <div key={stage.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                                            <div style={{ textAlign: "center", flex: "0 0 auto", width: 120 }}>
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: 10, margin: "0 auto 8px",
                                                    background: stage.status === "complete" ? "#ecfdf5" : stage.status === "running" ? "#fffbeb" : "#f9fafb",
                                                    border: `2px solid ${stage.status === "complete" ? "#10b981" : stage.status === "running" ? "#f59e0b" : "#e5e7eb"}`,
                                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
                                                }}>
                                                    {stage.status === "running"
                                                        ? <div style={{ width: 18, height: 18, border: "2px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                                        : <span>{stage.icon}</span>}
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: stage.status === "pending" ? "#9ca3af" : "#111827" }}>{stage.label}</div>
                                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{stage.desc}</div>
                                            </div>
                                            {i < stages.length - 1 && (
                                                <div style={{ flex: 1, height: 2, background: stage.status === "complete" ? "#10b981" : "#e5e7eb", margin: "0 4px 20px" }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Property breakdown */}
                            {ot.properties && ot.properties.length > 0 && (
                                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                                    <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", fontSize: 14, fontWeight: 600, color: "#111827" }}>
                                        Property Types
                                    </div>
                                    <div style={{ padding: "0 0 8px" }}>
                                        {ot.properties.map((prop: any, i: number) => (
                                            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 24px", borderBottom: i < ot.properties.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: prop.is_primary_key ? "#2563eb" : prop.data_type === "integer" || prop.data_type === "double" ? "#10b981" : prop.data_type === "date" ? "#f59e0b" : "#6b7280", marginRight: 12, flexShrink: 0 }} />
                                                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#111827" }}>{prop.display_name || prop.api_name}</div>
                                                <div style={{ fontSize: 12, color: "#6b7280", marginRight: 12 }}>{prop.api_name}</div>
                                                <div style={{ background: "#f3f4f6", color: "#374151", fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>{prop.data_type || "string"}</div>
                                                {prop.is_primary_key && <div style={{ background: "#eff6ff", color: "#2563eb", fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500, marginLeft: 6 }}>PK</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {subTab === "Security" && (

                    <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Object Security</h3>
                            <button style={{ background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>Configure Security</button>
                        </div>
                        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 32, textAlign: "center" }}>
                            <div style={{ color: "#10b981", fontSize: 32, marginBottom: 12 }}>🛡️</div>
                            <div style={{ fontWeight: 600, color: "#111827", marginBottom: 8 }}>Default Permissions Applies</div>
                            <div style={{ color: "#6b7280", fontSize: 13, maxWidth: 400, margin: "0 auto" }}>This object uses the organization&apos;s default security roles. Users with &apos;Viewer&apos; role can read, and &apos;Editor&apos; role can mutate.</div>
                        </div>
                    </div>
                )}

                {subTab === "Capabilities" && (
                    <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Capabilities & Ontology Views</h3>
                            <button style={{ background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>Add Capability</button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Full-text Search</div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Tokenized index for free text searching.</div>
                                <span style={{ background: "#ecfdf5", color: "#10b981", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 500 }}>Enabled</span>
                            </div>
                            <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Time Series Support</div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Index object properties against time series histories.</div>
                                <span style={{ background: "#fffbeb", color: "#f59e0b", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 500 }}>Pending Configuration</span>
                            </div>
                        </div>
                    </div>
                )}

                {["Object views", "Interfaces", "Materializations", "Automations", "Usage", "History"].includes(subTab) && (
                    <div style={{ padding: 60, textAlign: "center", color: "#6b7280", fontSize: 15 }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>⌘</div>
                        <div style={{ fontWeight: 600, color: "#111827", marginBottom: 8, fontSize: 18 }}>{subTab}</div>
                        <div>Content for this module is not available in the current environment.</div>
                    </div>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}


function ActionTypeDetail({ action }: { action: OntologyActionType }) {
    const hitlColor = action.hitl_level === 1 ? "#10b981" : action.hitl_level === 2 ? "#f59e0b" : "#ef4444";
    return (
        <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <StatusDot active={action.status === "ACTIVE"} />
                    <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>{action.display_name}</h2>
                </div>
                <code style={{ color: "#2563eb", fontSize: 13, background: "#eff6ff", padding: "2px 6px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{action.api_name}</code>
                <p style={{ color: "#4b5563", fontSize: 14, marginTop: 12 }}>{action.description || "No description provided."}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                    <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>HITL Level</div>
                    <div style={{ color: hitlColor, fontSize: 13, fontWeight: 600 }}>{HITL_LABELS[action.hitl_level] ?? String(action.hitl_level)}</div>
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                    <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Writes Back To</div>
                    <div style={{ color: "#111827", fontSize: 13, fontWeight: 500 }}>{action.writeback_target}</div>
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                    <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Status</div>
                    <div style={{ color: "#111827", fontSize: 13, fontWeight: 500 }}>{action.status}</div>
                </div>
            </div>

            <div style={{ background: action.hitl_level >= 2 ? "#fff1f2" : "#ecfdf5", border: `1px solid ${hitlColor}33`, borderRadius: 8, padding: 16, marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: hitlColor, fontSize: 13, marginBottom: 6 }}>
                    {action.hitl_level >= 2 ? "⚠️ Human-in-the-Loop gate active" : "✅ Immediate execution"}
                </div>
                <div style={{ color: "#4b5563", fontSize: 13 }}>
                    {action.hitl_level >= 2 ? `This action (HITL Level ${action.hitl_level}) creates a Proposal that must be approved by a ${action.hitl_level === 2 ? "Supervisor" : "Compliance Officer"} before the Ontology is mutated.` : "This action executes immediately applying its Ontology rules without waiting for human review."}
                </div>
            </div>

            <h3 style={{ color: "#111827", fontSize: 18, marginBottom: 16 }}>Parameters</h3>
            {action.parameters?.length === 0 ? <EmptyState message="No parameters defined." /> :
                <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                                {["Parameter", "Display Name", "Type", "Ref Object", "Required", "Description"].map(h => (
                                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {action.parameters.map(p => (
                                <tr key={p.api_name} style={{ borderBottom: "1px solid #e5e7eb" }}>
                                    <td style={{ padding: "10px 16px" }}><code style={{ color: "#2563eb", fontSize: 12 }}>{p.api_name}</code></td>
                                    <td style={{ padding: "10px 16px", color: "#111827", fontWeight: 500 }}>{p.display_name}</td>
                                    <td style={{ padding: "10px 16px" }}><Badge label={p.data_type} color="#10b981" /></td>
                                    <td style={{ padding: "10px 16px", color: "#6b7280" }}>{p.object_type_ref ?? "—"}</td>
                                    <td style={{ padding: "10px 16px" }}>{p.is_required ? "✅" : "—"}</td>
                                    <td style={{ padding: "10px 16px", color: "#6b7280", fontSize: 11 }}>{p.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            }
        </div>
    );
}

function InterfaceDetail({ iface }: { iface: OntologyInterface }) {
    return (
        <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>interface {iface.display_name}</h2>
                <code style={{ color: "#7c3aed", fontSize: 13, background: "#f3e8ff", padding: "2px 6px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{iface.api_name}</code>
                <p style={{ color: "#4b5563", fontSize: 14, marginTop: 12 }}>{iface.description || "No description provided."}</p>
            </div>
            <div style={{ marginBottom: 28, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
                <h3 style={{ color: "#111827", fontSize: 16, marginTop: 0, marginBottom: 12 }}>Implemented By</h3>
                {iface.implemented_by?.length === 0 ? <p style={{ color: "#6b7280", fontSize: 13 }}>No Object Types implement this interface yet.</p> :
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {iface.implemented_by?.map(ot => (
                            <span key={ot} style={{ background: "#f3f4f6", border: "1px solid #d1d5db", padding: "4px 10px", borderRadius: 16, fontSize: 12, color: "#4b5563", fontWeight: 500 }}>
                                {ot}
                            </span>
                        ))}
                    </div>
                }
            </div>
            <h3 style={{ color: "#111827", fontSize: 18, marginBottom: 16 }}>Required Properties</h3>
            <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                {iface.properties?.map((p, i) => (
                    <div key={p.api_name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: i === (iface.properties?.length ?? 0) - 1 ? "none" : "1px solid #e5e7eb" }}>
                        <code style={{ color: "#2563eb", fontSize: 13, width: 160 }}>{p.api_name}</code>
                        <Badge label={p.data_type} color="#10b981" />
                        {p.is_required && <Badge label="required" color="#ef4444" />}
                    </div>
                ))}
            </div>
        </div>
    );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ color: color ?? "#111827", fontWeight: 600, fontSize: 13 }}>{value}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Creation Forms
// ─────────────────────────────────────────────────────────────────────────────
function inputStyle(extra = {}): React.CSSProperties {
    return { background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", padding: "8px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" as const, ...extra };
}
function labelStyle(): React.CSSProperties {
    return { color: "#4b5563", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, fontWeight: 600, display: "block", marginBottom: 6 };
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
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ color: "#111827", marginTop: 0, marginBottom: 20 }}>New Link Type</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button onClick={submit} disabled={saving} style={{ background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, padding: "8px 24px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{saving ? "Creating…" : "Create Link Type"}</button>
                <button onClick={onCancel} style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Cancel</button>
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

            <h4 style={{ color: "#4b5563", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, margin: "24px 0 12px" }}>Parameters</h4>
            {params.map((p, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 12 }}>
                    <input style={inputStyle()} value={p.api_name} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, api_name: e.target.value } : x))} placeholder="api_name" />
                    <input style={inputStyle()} value={p.display_name} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, display_name: e.target.value } : x))} placeholder="Display Name" />
                    <select style={inputStyle()} value={p.data_type} onChange={e => setParams(ps => ps.map((x, i) => i === idx ? { ...x, data_type: e.target.value } : x))}>
                        {[...DATA_TYPES, "object_reference"].map(t => <option key={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setParams(ps => ps.filter((_, i) => i !== idx))} style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 500 }}>✕</button>
                </div>
            ))}
            <button onClick={() => setParams(ps => [...ps, { api_name: "", display_name: "", data_type: "string", is_required: false, description: "" }])} style={{ background: "none", border: "1px dashed #d1d5db", color: "#6b7280", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, marginTop: 4, fontWeight: 500 }}>+ Add Parameter</button>
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
            <h4 style={{ color: "#4b5563", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, margin: "24px 0 12px" }}>Required Properties</h4>
            {props.map((p, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 12 }}>
                    <input style={inputStyle()} value={p.api_name} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, api_name: e.target.value } : x))} placeholder="api_name" />
                    <input style={inputStyle()} value={p.display_name} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, display_name: e.target.value } : x))} placeholder="Display Name" />
                    <select style={inputStyle()} value={p.data_type} onChange={e => setProps(ps => ps.map((x, i) => i === idx ? { ...x, data_type: e.target.value } : x))}>
                        {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setProps(ps => ps.filter((_, i) => i !== idx))} style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 500 }}>✕</button>
                </div>
            ))}
            <button onClick={() => setProps(ps => [...ps, { api_name: "", display_name: "", data_type: "string", is_required: false }])} style={{ background: "none", border: "1px dashed #d1d5db", color: "#6b7280", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, marginTop: 4, fontWeight: 500 }}>+ Add Property</button>
        </FormWrapper>
    );
}

function FormWrapper({ title, children, onSave, onCancel, saving }: { title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; saving: boolean }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 32, maxWidth: 800, margin: "0 auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <h3 style={{ color: "#111827", marginTop: 0, marginBottom: 24, fontSize: 20 }}>{title}</h3>
            {children}
            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
                <button onClick={onSave} disabled={saving} style={{ background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, padding: "10px 24px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{saving ? "Saving…" : "Create"}</button>
                <button onClick={onCancel} style={{ background: "none", border: "1px solid #d1d5db", color: "#4b5563", borderRadius: 6, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Cancel</button>
            </div>
        </div>
    );
}
