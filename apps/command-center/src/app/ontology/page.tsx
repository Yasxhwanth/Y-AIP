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
export default function OntologyManagerPage() {
    const [activeTab, setActiveTab] = useState<Tab>("Objects");
    const [schema, setSchema] = useState<{ object_types: OntologyObjectType[]; link_types: OntologyLinkType[]; action_types: OntologyActionType[]; interfaces: OntologyInterface[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedObject, setSelectedObject] = useState<OntologyObjectType | null>(null);
    const [selectedAction, setSelectedAction] = useState<OntologyActionType | null>(null);
    const [selectedInterface, setSelectedInterface] = useState<OntologyInterface | null>(null);

    // Forms
    const [showNewObjectForm, setShowNewObjectForm] = useState(false);
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

    const tabCounts: Record<Tab, number> = {
        Objects: schema?.object_types.length ?? 0,
        Links: schema?.link_types.length ?? 0,
        Actions: schema?.action_types.length ?? 0,
        Interfaces: schema?.interfaces.length ?? 0
    };

    return (
        <div style={{ minHeight: "100vh", background: "#0a0f1a", fontFamily: "'Inter', sans-serif", color: "#e5e7eb" }}>
            {/* Header */}
            <div style={{ borderBottom: "1px solid #1f2937", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>🧬</span>
                        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#f9fafb" }}>Ontology Manager</h1>
                        <Badge label="BETA" color="#f59e0b" />
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>Define Object Types, Link Types, Action Types, and Interfaces</p>
                </div>
                <button onClick={fetchSchema} style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6, color: "#9ca3af", padding: "6px 14px", cursor: "pointer", fontSize: 12 }}>
                    ↺ Refresh
                </button>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: "flex", borderBottom: "1px solid #1f2937", padding: "0 32px" }}>
                {TABS.map(tab => (
                    <button key={tab} onClick={() => { setActiveTab(tab); setSelectedObject(null); setSelectedAction(null); setSelectedInterface(null); }}
                        style={{ background: "none", border: "none", color: activeTab === tab ? "#3b82f6" : "#6b7280", fontWeight: activeTab === tab ? 700 : 400, borderBottom: activeTab === tab ? "2px solid #3b82f6" : "2px solid transparent", padding: "12px 20px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        {tab}
                        <span style={{ background: activeTab === tab ? "#1e3a5f" : "#1f2937", color: activeTab === tab ? "#60a5fa" : "#4b5563", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{tabCounts[tab]}</span>
                    </button>
                ))}
            </div>

            {/* Body */}
            <div style={{ display: "flex", height: "calc(100vh - 117px)" }}>

                {/* ── OBJECTS TAB ─────────────────────────────────────────────── */}
                {activeTab === "Objects" && (
                    <>
                        {/* Left: Object Type List */}
                        <div style={{ width: 280, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto" }}>
                            <SectionTitle title="Object Types" count={schema?.object_types.length} />
                            <button onClick={() => setShowNewObjectForm(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                                + New Object Type
                            </button>
                            {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                                schema?.object_types.length === 0 ? <EmptyState message="No Object Types defined." /> :
                                    schema?.object_types.map(ot => (
                                        <Card key={ot.api_name} onClick={() => setSelectedObject(ot)} selected={selectedObject?.api_name === ot.api_name}>
                                            <div style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{ot.display_name}</div>
                                            <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{ot.api_name}</div>
                                            <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                                <Badge label={`${ot.properties?.length ?? 0} props`} color="#10b981" />
                                                {ot.implements?.map(i => <Pill key={i} text={i} />)}
                                            </div>
                                        </Card>
                                    ))
                            }
                        </div>

                        {/* Right: Object Type Detail */}
                        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                            {showNewObjectForm ? (
                                <NewObjectTypeForm onSuccess={() => { setShowNewObjectForm(false); fetchSchema(); }} onCancel={() => setShowNewObjectForm(false)} />
                            ) : selectedObject ? (
                                <ObjectTypeDetail ot={selectedObject} onRefresh={() => { fetchSchema(); setSelectedObject(null); }} />
                            ) : (
                                <EmptyState message="← Select an Object Type to view its definition, or create a new one." />
                            )}
                        </div>
                    </>
                )}

                {/* ── LINKS TAB ───────────────────────────────────────────────── */}
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
                                    {schema?.link_types.map(lt => (
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

                {/* ── ACTIONS TAB ─────────────────────────────────────────────── */}
                {activeTab === "Actions" && (
                    <>
                        <div style={{ width: 300, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto" }}>
                            <SectionTitle title="Action Types" count={schema?.action_types.length} />
                            <button onClick={() => setShowNewActionForm(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                                + New Action Type
                            </button>
                            {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                                schema?.action_types.map(at => (
                                    <Card key={at.api_name} onClick={() => { setSelectedAction(at); setShowNewActionForm(false); }} selected={selectedAction?.api_name === at.api_name}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <StatusDot active={at.status === "ACTIVE"} />
                                            <span style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{at.display_name}</span>
                                        </div>
                                        <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{at.api_name}</div>
                                        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                                            <Badge label={`HITL ${at.hitl_level}`} color={at.hitl_level === 1 ? "#10b981" : at.hitl_level === 2 ? "#f59e0b" : "#ef4444"} />
                                            <Badge label={`${at.parameters?.length ?? 0} params`} color="#6366f1" />
                                        </div>
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

                {/* ── INTERFACES TAB ──────────────────────────────────────────── */}
                {activeTab === "Interfaces" && (
                    <>
                        <div style={{ width: 280, borderRight: "1px solid #1f2937", padding: 20, overflowY: "auto" }}>
                            <SectionTitle title="Interfaces" count={schema?.interfaces.length} />
                            <button onClick={() => setShowNewInterfaceForm(true)} style={{ width: "100%", background: "#1e3a5f", border: "1px dashed #3b82f6", borderRadius: 6, color: "#60a5fa", padding: "8px 0", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                                + New Interface
                            </button>
                            {loading ? <p style={{ color: "#6b7280", fontSize: 13 }}>Loading…</p> :
                                schema?.interfaces.map(i => (
                                    <Card key={i.api_name} onClick={() => { setSelectedInterface(i); setShowNewInterfaceForm(false); }} selected={selectedInterface?.api_name === i.api_name}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: "#f9fafb" }}>{i.display_name}</div>
                                        <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>interface {i.api_name}</div>
                                        <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            <Badge label={`${i.properties?.length ?? 0} props`} color="#10b981" />
                                            <Badge label={`${i.implemented_by?.length ?? 0} implementations`} color="#a78bfa" />
                                        </div>
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
