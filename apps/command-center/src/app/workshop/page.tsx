"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    LayoutTemplate, Plus, Search, HelpCircle,
    MoreHorizontal, Filter, Grid, List,
    Clock, Star, Layout, Inbox, Map, BarChart2,
    FileText, User, ChevronRight, X
} from "lucide-react";

interface WorkshopModule {
    id: string;
    name: string;
    creator: string;
    lastEditedBy: string;
    lastViewed: string;
}

const RECENT_MODULES: WorkshopModule[] = [
    { id: "mod-1", name: "[Gena] Orders Inbox", creator: "Gena", lastEditedBy: "Gena", lastViewed: "2 minutes ago" },
    { id: "mod-2", name: "Fulfillment Dashboard", creator: "System", lastEditedBy: "Admin", lastViewed: "1 hour ago" },
];

export default function WorkshopLandingPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"recents" | "favorites">("recents");
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newModuleName, setNewModuleName] = useState("");
    const [modules, setModules] = useState<WorkshopModule[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/workshop-admin/dashboards")
            .then(res => res.json())
            .then(data => {
                if (data.dashboards) {
                    const mapped = data.dashboards.map((d: any) => ({
                        id: d.id,
                        name: d.name,
                        creator: "Guest", // backend doesn't store creator yet
                        lastEditedBy: "Guest",
                        lastViewed: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "Just now"
                    }));
                    setModules(mapped);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch modules:", err);
                setLoading(false);
            });
    }, []);

    const handleCreateModule = async () => {
        if (!newModuleName) return;
        const id = "mod-" + Math.random().toString(36).substr(2, 9);

        try {
            const res = await fetch("/api/workshop-admin/dashboards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: id,
                    name: newModuleName,
                    layout: [],
                    widgets: []
                })
            });

            if (res.ok) {
                router.push(`/workshop/${id}`);
            }
        } catch (err) {
            console.error("Failed to create module:", err);
        }
        setShowSaveModal(false);
    };

    return (
        <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
            {/* Header */}
            <header style={{ height: 48, background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 24, height: 24, background: "#4f46e5", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <LayoutTemplate size={14} color="white" />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Workshop</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer" }}>
                        <div style={{ width: 16, height: 16, background: "#dc2626", borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}></div>
                        <ChevronRight size={14} color="#6b7280" style={{ transform: "rotate(90deg)" }} />
                    </div>
                    <button
                        onClick={() => setShowSaveModal(true)}
                        style={{ background: "#059669", color: "white", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                    >
                        <Plus size={14} /> New module
                    </button>
                    <button style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}>
                        <HelpCircle size={18} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ flex: 1, overflowY: "auto", padding: "40px 80px" }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <div style={{ marginBottom: 32 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 8px 0" }}>Workshop</h1>
                        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Create high-quality, easy-to-maintain operational applications using native object components in a point-and-click environment.</p>
                    </div>

                    {/* Templates Section */}
                    <div style={{ marginBottom: 48 }}>
                        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16 }}>Create new module</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
                            <TemplateCard icon={Layout} label="Blank module" onClick={() => setShowSaveModal(true)} />
                            <TemplateCard icon={Inbox} label="Inbox template" onClick={() => setShowSaveModal(true)} />
                            <TemplateCard icon={Map} label="Map template" onClick={() => setShowSaveModal(true)} />
                            <TemplateCard icon={BarChart2} label="Metrics template" onClick={() => setShowSaveModal(true)} isSelected />
                        </div>
                    </div>

                    {/* Recents Section */}
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 24, borderBottom: "1px solid #e5e7eb", marginBottom: 16, padding: "0 4px" }}>
                            <Tab id="recents" label="Recents" activeId={activeTab} onClick={() => setActiveTab("recents")} />
                            <Tab id="favorites" label="Favorites" activeId={activeTab} onClick={() => setActiveTab("favorites")} />
                        </div>

                        <div style={{ background: "#ffffff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                                        <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280", width: "40%" }}>MODULE</th>
                                        <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>CREATOR</th>
                                        <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>LAST EDITED BY</th>
                                        <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>LAST VIEWED</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modules.map(module => (
                                        <tr key={module.id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => router.push(`/workshop/${module.id}`)}>
                                            <td style={{ padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 24, height: 24, background: "#e0e7ff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <LayoutTemplate size={14} color="#4f46e5" />
                                                </div>
                                                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{module.name}</span>
                                            </td>
                                            <td style={{ padding: "16px", fontSize: 13, color: "#4b5563" }}>{module.creator}</td>
                                            <td style={{ padding: "16px", fontSize: 13, color: "#4b5563" }}>{module.lastEditedBy}</td>
                                            <td style={{ padding: "16px", fontSize: 13, color: "#4b5563" }}>{module.lastViewed}</td>
                                        </tr>
                                    ))}
                                    {loading && [...Array(5)].map((_, i) => (
                                        <tr key={`skeleton-${i}`} style={{ borderBottom: "1px solid #f3f4f6", opacity: 0.3 }}>
                                            <td style={{ padding: "16px" }}><div style={{ height: 24, background: "#f3f4f6", borderRadius: 4, width: "100%" }}></div></td>
                                            <td style={{ padding: "16px" }}><div style={{ height: 24, background: "#f3f4f6", borderRadius: 4, width: "60%" }}></div></td>
                                            <td style={{ padding: "16px" }}><div style={{ height: 24, background: "#f3f4f6", borderRadius: 4, width: "60%" }}></div></td>
                                            <td style={{ padding: "16px" }}><div style={{ height: 24, background: "#f3f4f6", borderRadius: 4, width: "40%" }}></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Save As Modal */}
            {showSaveModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ background: "white", width: 500, borderRadius: 12, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>Save as...</h3>
                            <button onClick={() => setShowSaveModal(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: "24px 20px" }}>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>File name</label>
                                <div style={{ position: "relative" }}>
                                    <div style={{ position: "absolute", left: 12, top: 10 }}>
                                        <LayoutTemplate size={16} color="#4f46e5" />
                                    </div>
                                    <input
                                        autoFocus
                                        value={newModuleName}
                                        onChange={(e) => setNewModuleName(e.target.value)}
                                        placeholder="[Gena] Orders Inbox"
                                        style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" }}
                                    />
                                    {newModuleName && (
                                        <div style={{ position: "absolute", right: 12, top: 10 }}>
                                            <CheckCircle size={16} color="#059669" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Location</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, height: 36, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, display: "flex", alignItems: "center", padding: "0 12px", gap: 8, fontSize: 13, color: "#374151" }}>
                                        <div style={{ width: 16, height: 16, background: "#fbbf24", borderRadius: 4 }}></div>
                                        Speedrun: Your First E2E Workflow
                                    </div>
                                    <button style={{ height: 36, padding: "0 12px", background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                                        Browse <ChevronRight size={14} style={{ transform: "rotate(90deg)" }} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: "16px 20px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 12 }}>
                            <button onClick={() => setShowSaveModal(false)} style={{ background: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                            <button
                                onClick={handleCreateModule}
                                disabled={!newModuleName}
                                style={{ background: "#059669", color: "white", border: "none", borderRadius: 6, padding: "8px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !newModuleName ? 0.5 : 1 }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TemplateCard({ icon: Icon, label, onClick, isSelected }: { icon: any, label: string, onClick: () => void, isSelected?: boolean }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: "#ffffff", borderRadius: 8, border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                height: 160, display: "flex", flexDirection: "column", cursor: "pointer", overflow: "hidden"
            }}
        >
            <div style={{ flex: 1, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <Icon size={48} color="#d1d5db" strokeWidth={1} />
                {isSelected && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 48, height: 48, borderRadius: 24, background: "#059669", display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid #fff" }}>
                            <Plus size={24} color="white" />
                        </div>
                    </div>
                )}
            </div>
            <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#111827", borderTop: "1px solid #e5e7eb" }}>
                {label}
            </div>
        </div>
    );
}

function Tab({ id, label, activeId, onClick }: { id: string, label: string, activeId: string, onClick: () => void }) {
    const isActive = id === activeId;
    return (
        <div
            onClick={onClick}
            style={{
                padding: "8px 4px", fontSize: 13, fontWeight: 600, color: isActive ? "#2563eb" : "#6b7280",
                borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent", cursor: "pointer"
            }}
        >
            {label}
        </div>
    );
}

function CheckCircle({ size, color }: { size: number, color: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 11.08V12C21.9981 14.1564 21.3005 16.2547 20.0093 17.9882C18.7182 19.7217 16.9033 20.9982 14.8354 21.6263C12.7674 22.2544 10.5573 22.1991 8.52447 21.4688C6.49162 20.7385 4.74614 19.3739 3.54852 17.5782C2.3509 15.7825 1.76518 13.6506 1.87986 11.4937C1.99454 9.33679 2.8034 7.27579 4.18534 5.61128C5.56728 3.94677 7.44777 2.76866 9.54487 2.25208C11.642 1.73551 13.8471 1.90882 15.84 2.74792M22 4L12 14.01L9 11.01" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
