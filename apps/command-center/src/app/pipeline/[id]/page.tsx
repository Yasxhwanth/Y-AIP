"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import {
    Download, Plus, Settings, ChevronRight, CheckCircle2,
    Share, FileText, Database, UploadCloud, Edit3, Grid,
    Trash2, Search, X, Sparkles, BarChart2, Info, ChevronDown, Workflow, Type, Save, GitBranch,
    MousePointer2, LayoutGrid, Filter, Sigma, Layers, Undo2, Redo2, Star, Clock as LucideClock, RefreshCw, Lock as LucideLock
} from "lucide-react";
import { AddDataModal } from "@/components/pipeline/AddDataModal";
import { UploadFilesModal } from "@/components/files/UploadFilesModal";
import ReactFlow, { Background, Controls, Node, Edge, applyNodeChanges, NodeChange } from "reactflow";
import "reactflow/dist/style.css";
import { DatasetNode } from "@/components/pipeline/DatasetNode";
import { OutputNode } from "@/components/pipeline/OutputNode";
import { TransformNode } from "@/components/pipeline/TransformNode";
import { JoinConfigBoard, JoinConfig, JoinColumn } from "@/components/pipeline/JoinConfigBoard";
import { UnionConfigBoard, UnionEditorState } from "@/components/pipeline/UnionConfigBoard";

interface PipelineMeta {
    name: string;
    path?: string;
    projectId?: string;
    projectName?: string;
    projectSpace?: string;
}

interface TransformEntry {
    id: string;
    type: string;
    params: Record<string, unknown>;
    applied: boolean;
}

interface DatasetColumn {
    name: string;
    type: string;
}

interface PipelineOutput {
    id: string;
    nodeId: string;
    sourceNodeId: string;
    name: string;
    fileName: string;
    columns: DatasetColumn[];
    selectedColumnNames?: string[]; // If undefined, all columns are selected
    status: "draft" | "deploying" | "deployed";
    deployedAt?: string;
    filePath?: string;
    rowCount?: number;
}

interface DeployState {
    status: "idle" | "deploying" | "deployed";
    pipelineId?: string;
    outputs?: Array<{
        id: string;
        name: string;
        fileName: string;
        filePath: string;
        rowCount: number;
        deployedAt: string;
    }>;
    lastDeploymentAt?: string;
}


// Removed global NODE_TYPES to use useMemo inside component

const DEFAULT_COLUMNS = [
    { name: "order_id", type: "String" },
    { name: "customer_id", type: "String" },
    { name: "status", type: "String" },
    { name: "assignee", type: "String" },
    { name: "quantity", type: "Integer" },
    { name: "item_name", type: "String" },
    { name: "unit_price", type: "Integer" },
    { name: "order_due_date", type: "Date" },
    { name: "days_until_due", type: "Integer" },
];

const ALL_TRANSFORMS = [
    "Absolute value", "Add constant column", "Add numbers", "Add or update map",
    "Add or update struct field", "Add value to date", "Aggregate",
    "Aggregate multiple columns", "All array elements satisfy", "Cast",
    "Drop columns", "Filter rows", "Join arrays", "Normalize column names",
    "Rename columns", "Select columns", "Sort rows", "Union", "Window aggregate"
];

const PIPELINE_GRAPH_PREFIX = "yaip-pipeline-graph";

function graphStorageKey(pipelineId: string, branch: string) {
    return `${PIPELINE_GRAPH_PREFIX}:${pipelineId}:${branch}`;
}

function isVirtualDatasetId(datasetId: string) {
    return datasetId.startsWith("join-") || datasetId.startsWith("transform-") || datasetId.startsWith("union-") || datasetId.startsWith("output-");
}

function sanitizeOutputName(name: string) {
    return name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "output";
}

function evaluateFilterCondition(value: string, condition: string, expectedValue: string, treatEmpty: boolean) {
    const normalized = value ?? "";
    if (condition === "is not null") return treatEmpty ? normalized.trim() !== "" && normalized !== "null" : normalized !== "null";
    if (condition === "is null") return treatEmpty ? normalized.trim() === "" || normalized === "null" : normalized === "null";
    if (condition === "contains") return normalized.toLowerCase().includes(expectedValue.toLowerCase());
    if (condition === "is equal to") return normalized === expectedValue;
    return true;
}

function readTransformString(params: Record<string, unknown>, key: string, fallback = "") {
    return typeof params[key] === "string" ? params[key] : fallback;
}

function readTransformBoolean(params: Record<string, unknown>, key: string, fallback = false) {
    return typeof params[key] === "boolean" ? params[key] : fallback;
}

function readTransformStringArray(params: Record<string, unknown>, key: string) {
    return Array.isArray(params[key]) ? (params[key] as string[]) : [];
}

function applyTransformsToPreview(
    inputColumns: DatasetColumn[],
    inputRows: Record<string, string>[],
    transforms: TransformEntry[],
): { columns: DatasetColumn[]; rows: Record<string, string>[] } {
    let columns = [...inputColumns];
    let rows = inputRows.map((row) => ({ ...row }));

    for (const transform of transforms.filter((entry) => entry.applied)) {
        if (transform.type === "Drop columns") {
            const dropColumns = readTransformStringArray(transform.params, "columns");
            if (dropColumns.length === 0) continue;
            const dropNormalized = new Set(dropColumns.map(c => c.toLowerCase()));
            columns = columns.filter((column) => !dropNormalized.has(column.name.toLowerCase()));
            rows = rows.map((row) => Object.fromEntries(
                Object.entries(row).filter(([key]) => !dropNormalized.has(key.toLowerCase()))
            ));
        }

        if (transform.type === "Select columns") {
            const selectColumns = readTransformStringArray(transform.params, "columns");
            if (selectColumns.length === 0) continue;
            const selected = new Set(selectColumns);
            columns = columns.filter((column) => selected.has(column.name));
            rows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => selected.has(key))));
        }

        if (transform.type === "Rename columns") {
            const source = readTransformString(transform.params, "source");
            const target = readTransformString(transform.params, "target");
            if (!source || !target || source === target) continue;

            // Case-insensitive match for the column
            const matchedCol = columns.find(c => c.name.toLowerCase() === source.toLowerCase());
            if (!matchedCol) continue;

            const actualSource = matchedCol.name;
            columns = columns.map((column) => column.name === actualSource ? { ...column, name: target } : column);

            rows = rows.map((row) => {
                // Find the actual key in the row object (case-insensitive)
                const actualKey = Object.keys(row).find(k => k.toLowerCase() === source.toLowerCase());
                if (!actualKey) return row;

                const next = { ...row, [target]: row[actualKey] };
                if (actualKey !== target) delete next[actualKey];
                return next;
            });
        }

        if (transform.type === "Cast") {
            const column = readTransformString(transform.params, "column");
            const toType = readTransformString(transform.params, "toType");
            if (!column || !toType) continue;
            const targetColumn = readTransformString(transform.params, "targetColumn", column);
            const existing = columns.find((entry) => entry.name === targetColumn);

            if (existing) {
                columns = columns.map((entry) => entry.name === targetColumn ? { ...entry, type: toType } : entry);
            } else {
                columns = [...columns, { name: targetColumn, type: toType }];
            }

            rows = rows.map((row) => ({
                ...row,
                [targetColumn]: row[column] ?? "",
            }));
        }

        if (transform.type === "Normalize column names") {
            const removeSpecial = readTransformBoolean(transform.params, "removeSpecial");
            const renameMap = new Map<string, string>();
            columns = columns.map((column) => {
                let normalized = column.name.toLowerCase().trim().replace(/\s+/g, "_");
                if (removeSpecial) {
                    normalized = normalized.replace(/[^a-z0-9_]/g, "");
                }
                renameMap.set(column.name, normalized);
                return { ...column, name: normalized };
            });

            rows = rows.map((row) => {
                const next: Record<string, string> = {};
                for (const [key, value] of Object.entries(row)) {
                    next[renameMap.get(key) ?? key] = value;
                }
                return next;
            });
        }

        if (transform.type === "Filter rows") {
            const column = readTransformString(transform.params, "column");
            if (!column) continue;
            const condition = readTransformString(transform.params, "condition", "is not null");
            const expectedValue = readTransformString(transform.params, "value");
            const treatEmpty = readTransformBoolean(transform.params, "treatEmpty");
            const keepMode = readTransformString(transform.params, "mode", "Keep rows") === "Keep rows";

            rows = rows.filter((row) => {
                const pass = evaluateFilterCondition(row[column] ?? "", condition, expectedValue, treatEmpty);
                return keepMode ? pass : !pass;
            });
        }
    }

    return { columns, rows };
}

// Palantir speedrun: Clean Bureau/Office Goods ⟕ consolidated_customers preset
// Automatically sets the correct join condition and hides redundant ID columns
function applyJoinPreset(cfg: JoinConfig, leftLabel: string, rightLabel: string): JoinConfig {
    const L = leftLabel.toLowerCase();
    const R = rightLabel.toLowerCase();
    const isBureau = L.includes("bureau") || L.includes("clean bureau");
    const isOffice = L.includes("office goods") || L.includes("clean office goods");
    const isCustomerList = R.includes("consolidated") && R.includes("customer");

    if (!(isBureau || isOffice) || !isCustomerList) return cfg;

    const leftNames = new Set(cfg.leftColumns.map(c => c.name));
    const rightNames = new Set(cfg.rightColumns.map(c => c.name));

    let leftCol = "";
    let rightCol = "";
    if (isBureau && leftNames.has("customer_id") && rightNames.has("bureau_customer_id")) {
        leftCol = "customer_id";
        rightCol = "bureau_customer_id";
    } else if (isOffice && leftNames.has("customer_id") && rightNames.has("officegoods_customer_id")) {
        leftCol = "customer_id";
        rightCol = "officegoods_customer_id";
    }

    return {
        ...cfg,
        name: isBureau ? "Join Bureau" : "Join Office Goods",
        conditions: leftCol && rightCol
            ? [{ leftCol, operator: "is equal to", rightCol }]
            : cfg.conditions,
        rightColumns: cfg.rightColumns.map(c => ({
            ...c,
            selected: (c.name === "officegoods_customer_id" || c.name === "bureau_customer_id") ? false : c.selected,
        })),
    };
}

function normalizeUnionType(t: string): string {
    const x = t.toLowerCase();
    if (x === "decimal" || x === "double" || x === "float") return "numeric";
    if (x === "long" || x === "int") return "integer";
    return x;
}

function compareUnionSchemas(
    a: { name: string; type: string }[],
    b: { name: string; type: string }[]
): string | null {
    const mapA = new Map(a.map((c) => [c.name, c.type]));
    const mapB = new Map(b.map((c) => [c.name, c.type]));
    const keysA = new Set(mapA.keys());
    const keysB = new Set(mapB.keys());
    if (keysA.size !== keysB.size || [...keysA].some((k) => !keysB.has(k))) {
        const onlyA = [...keysA].filter((k) => !keysB.has(k)).map(k => `"${k}"`);
        const onlyB = [...keysB].filter((k) => !keysA.has(k)).map(k => `"${k}"`);
        const orderHint =
            [...onlyA, ...onlyB, ...keysA].some((k) => /order/i.test(k)) ||
                [...mapA.keys()].some((k) => /orderid/i.test(k.replace(/_/g, "")))
                ? " One side may use orderId while the other uses order_id — rename in an upstream transform so names match."
                : "";
        return `Schema mismatch. Left has ${onlyA.length ? onlyA.join(", ") : "no unique cols"}, Right has ${onlyB.length ? onlyB.join(", ") : "no unique cols"}.${orderHint}`;
    }
    for (const k of keysA) {
        const t1 = mapA.get(k)!;
        const t2 = mapB.get(k)!;
        if (normalizeUnionType(t1) !== normalizeUnionType(t2)) {
            return `Column "${k}" has incompatible types (${t1} vs ${t2}).`;
        }
    }
    return null;
}

function buildUnionPreviewRows(columns: { name: string; type: string }[]): Record<string, string>[] {
    const n = 12;
    const fill = (rIdx: number, prefix: "A" | "B"): Record<string, string> => {
        const row: Record<string, string> = {};
        for (const col of columns) {
            let val = "";
            if (col.name === "order_id" || col.name === "orderId")
                val = `${prefix}${rIdx}74270364-fc220883-${rIdx}`;
            else if (col.name === "customer_id" || col.name === "customerId") val = `${prefix}5661392${rIdx}`;
            else if (col.name === "status")
                val = prefix === "A" ? (rIdx % 2 === 0 ? "assigned" : "closed") : rIdx % 3 === 0 ? "open" : "closed";
            else if (col.name === "assignee")
                val = prefix === "A" ? (rIdx % 2 === 0 ? "Laverne Koss" : "Latoya Gulgowski") : "Kristen Mohr";
            else if (col.name === "quantity") val = String(prefix === "A" ? (rIdx % 9) + 1 : ((rIdx * 3) % 12) + 1);
            else if (col.name === "item_name")
                val = prefix === "A" ? ["Stapler", '30" Monitor', "Paper Clips"][rIdx % 3] : ["Printer", "Desk", "A4 Paper"][rIdx % 3];
            else if (col.name === "unit_price")
                val = String(prefix === "A" ? ((rIdx * 13) % 100) * 10 : ((rIdx * 7) % 80) * 10);
            else if (col.name === "order_due_date")
                val =
                    prefix === "A"
                        ? `2023-07-${String((rIdx % 28) + 1).padStart(2, "0")}T12:00:00Z`
                        : `2023-08-${String((rIdx % 28) + 1).padStart(2, "0")}T12:00:00Z`;
            else if (col.name === "days_until_due") val = String(prefix === "A" ? (rIdx % 14) + 1 : (rIdx % 10) + 2);
            else if (col.name === "consolidated_customer_id") val = `cc-${rIdx}-${prefix === "A" ? "bureau" : "office"}`;
            else if (col.name === "customer_name")
                val = prefix === "A" ? ["Acme Co", "Globex", "Initech"][rIdx % 3] : ["Umbrella LLC", "Stark Ind", "Wayne Ent"][rIdx % 3];
            else val = `v_${col.name}_${rIdx}${prefix === "B" ? "_b" : ""}`;
            row[col.name] = val;
        }
        return row;
    };
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < n; i++) rows.push(fill(i, "A"));
    for (let i = 0; i < n; i++) rows.push(fill(i, "B"));
    return rows;
}

function ActionRow({ icon, title, desc, onClick, highlight }: { icon: React.ReactNode; title: string; desc: string; onClick?: () => void; highlight?: boolean }) {
    return (
        <button onClick={onClick} className={`flex items-start gap-3 p-3 rounded-sm text-left w-full ${highlight ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
            <div className="mt-0.5">{icon}</div>
            <div>
                <div className={`text-[13px] font-semibold ${highlight ? "text-blue-700" : "text-gray-900"}`}>{title}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{desc}</div>
            </div>
        </button>
    );
}

// ─── Individual Transform Card ──────────────────────────────────────────────
function TransformCard({
    entry,
    columns,
    onApply,
    onRemove,
}: {
    entry: TransformEntry;
    columns: { name: string; type: string }[];
    onApply: (id: string, params: Record<string, unknown>) => void;
    onRemove: (id: string) => void;
}) {
    const readStringParam = (key: string, fallback = "") => typeof entry.params[key] === "string" ? String(entry.params[key]) : fallback;
    const readBooleanParam = (key: string, fallback = false) => typeof entry.params[key] === "boolean" ? Boolean(entry.params[key]) : fallback;
    const readStringArrayParam = (key: string) => Array.isArray(entry.params[key]) ? (entry.params[key] as string[]) : [];

    const [castColumn, setCastColumn] = useState(readStringParam("column", columns[columns.length - 1]?.name ?? ""));
    const [castTargetColumn, setCastTargetColumn] = useState(readStringParam("targetColumn"));
    const [castType, setCastType] = useState(readStringParam("toType", "Timestamp"));
    const [castExprOpen, setCastExprOpen] = useState(false);

    const [filterMode, setFilterMode] = useState<"Keep rows" | "Remove rows">(readStringParam("mode", "Keep rows") === "Remove rows" ? "Remove rows" : "Keep rows");
    const [filterMatchMode, setFilterMatchMode] = useState<"all conditions" | "any condition">(readStringParam("matchMode", "all conditions") === "any condition" ? "any condition" : "all conditions");
    const [filterColumn, setFilterColumn] = useState(readStringParam("column", columns[0]?.name ?? ""));
    const [filterCondition, setFilterCondition] = useState(readStringParam("condition", "is not null"));
    const [filterValue, setFilterValue] = useState(readStringParam("value"));
    const [filterTreatEmpty, setFilterTreatEmpty] = useState(readBooleanParam("treatEmpty", true));

    const [normalizeRemoveSpecial, setNormalizeRemoveSpecial] = useState(readBooleanParam("removeSpecial", false));

    const [dropColumns, setDropColumns] = useState<string[]>(readStringArrayParam("columns"));
    const [selectCols, setSelectCols] = useState<string[]>(readStringArrayParam("columns"));
    const [renameSource, setRenameSource] = useState(readStringParam("source"));
    const [renameTarget, setRenameTarget] = useState(readStringParam("target"));

    const [isApplied, setIsApplied] = useState(entry.applied);
    const castDropRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (castDropRef.current && !castDropRef.current.contains(e.target as globalThis.Node)) {
                setCastExprOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleApply = () => {
        let params: Record<string, unknown> = {};
        if (entry.type === "Cast") params = { column: castColumn, targetColumn: castTargetColumn || castColumn, toType: castType };
        if (entry.type === "Filter rows") params = { mode: filterMode, matchMode: filterMatchMode, column: filterColumn, condition: filterCondition, value: filterValue, treatEmpty: filterTreatEmpty };
        if (entry.type === "Normalize column names") params = { removeSpecial: normalizeRemoveSpecial };
        if (entry.type === "Drop columns") params = { columns: dropColumns };
        if (entry.type === "Select columns") params = { columns: selectCols };
        if (entry.type === "Rename columns") params = { source: renameSource, target: renameTarget };
        setIsApplied(true);
        onApply(entry.id, params);
    };

    const titleMap: Record<string, string> = {
        "Cast": "CAST TO TIMESTAMP",
        "Filter rows": "FILTER",
        "Normalize column names": "NORMALIZE COLUMN NAMES",
        "Drop columns": "DROP COLUMNS",
        "Rename columns": "RENAME COLUMNS",
    };

    const displayTitle = titleMap[entry.type] ?? entry.type.toUpperCase();

    const isDirty = () => {
        if (!isApplied) return true;
        if (entry.type === "Cast") {
            return readStringParam("column") !== castColumn
                || readStringParam("targetColumn", readStringParam("column")) !== (castTargetColumn || castColumn)
                || readStringParam("toType") !== castType;
        }
        if (entry.type === "Filter rows") {
            return readStringParam("column") !== filterColumn
                || readStringParam("condition") !== filterCondition
                || readBooleanParam("treatEmpty") !== filterTreatEmpty
                || readStringParam("value") !== filterValue
                || readStringParam("mode") !== filterMode
                || readStringParam("matchMode") !== filterMatchMode;
        }
        if (entry.type === "Normalize column names") return readBooleanParam("removeSpecial") !== normalizeRemoveSpecial;
        if (entry.type === "Drop columns") return JSON.stringify(readStringArrayParam("columns")) !== JSON.stringify(dropColumns);
        if (entry.type === "Select columns") return JSON.stringify(readStringArrayParam("columns")) !== JSON.stringify(selectCols);
        if (entry.type === "Rename columns") {
            // Also treat as dirty when new values have been entered but not yet saved
            if (renameSource && renameTarget && !isApplied) return true;
            return readStringParam("source") !== renameSource || readStringParam("target") !== renameTarget;
        }
        return false;
    };

    const dirty = isDirty();

    return (
        <div className={`w-full bg-white border rounded-md shadow-sm overflow-visible mb-0 ${isApplied ? "border-gray-200" : "border-blue-400"}`}>
            {/* Card Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-[#f8f9fa]">
                <div className="flex items-center gap-2">
                    <span className="font-serif italic text-gray-500 text-[11px]">fx</span>
                    <span className="text-[11px] font-bold text-gray-700 tracking-widest uppercase">{displayTitle}</span>
                    <BarChart2 className="w-3.5 h-3.5 text-gray-400 ml-1" />
                </div>
                <div className="flex items-center gap-3 text-[12px] text-gray-400">
                    <button onClick={() => onRemove(entry.id)} className="hover:text-red-500 flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                    <button className="hover:text-blue-600 flex items-center gap-1">+ Preview</button>
                    <button className="hover:text-gray-600"><Settings className="w-3 h-3" /></button>
                    <button className="hover:text-gray-700"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="13" height="13" rx="2" /><path d="M5 7H4a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-1" /></svg></button>
                    <button onClick={() => onRemove(entry.id)} className="hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
            </div>

            {/* Card Body */}
            <div className="px-4 py-4 flex flex-col gap-4 text-[13px]">
                {/* ── CAST ── */}
                {entry.type === "Cast" && (<>
                    {/* Function selector */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-serif italic text-gray-400 text-[12px]">fx</span>
                        <div className="flex-1 border border-gray-300 rounded px-2 py-1.5 flex items-center justify-between bg-white text-[13px] text-gray-700 font-medium">
                            Cast to Timestamp
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <button className="text-gray-400 hover:text-gray-600 text-[12px] flex items-center gap-0.5">
                            <span className="w-4 h-4 rounded-full border border-current text-[9px] flex items-center justify-center font-bold">?</span>
                        </button>
                        <button className="text-gray-400 hover:text-gray-600">···</button>
                    </div>

                    {/* Expression row */}
                    <div className="flex items-center gap-2">
                        <label className="font-semibold text-gray-600 w-24 shrink-0">Expression <span className="text-red-500">*</span></label>
                        <div className="relative flex-1" ref={castDropRef}>
                            <button
                                onClick={() => setCastExprOpen(o => !o)}
                                className={`w-full border rounded px-3 py-1.5 flex items-center justify-between text-[13px] bg-white ${castExprOpen ? "border-blue-500 ring-1 ring-blue-200" : "border-gray-300"}`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Database className="w-3 h-3 text-blue-500" />
                                    <span className="font-medium">{castColumn}</span>
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            {castExprOpen && (
                                <div className="absolute z-50 top-full left-0 mt-1 w-[300px] bg-white border border-gray-300 rounded shadow-xl overflow-hidden">
                                    <div className="px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                                        <input type="text" placeholder="Search..." className="w-full text-[13px] outline-none bg-transparent" />
                                    </div>
                                    <div className="flex border-b border-gray-200 text-[11px] font-semibold bg-white">
                                        {(["Columns", "Value", "Expressions"] as const).map(tab => (
                                            <button key={tab} className="flex-1 py-1.5 text-center text-gray-600 hover:text-blue-600 border-b-2 border-transparent data-[active]:border-blue-500 data-[active]:text-blue-600">{tab}</button>
                                        ))}
                                    </div>
                                    <div className="overflow-y-auto max-h-48 py-1">
                                        {columns.map(col => (
                                            <button key={col.name}
                                                onClick={() => { setCastColumn(col.name); setIsApplied(false); setCastExprOpen(false); }}
                                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-blue-50 ${castColumn === col.name ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
                                            >
                                                <span className="font-serif italic text-gray-400 text-[10px] w-3">»</span>
                                                <span className="text-[12px] font-medium">{col.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button className="px-1.5 py-1 bg-gray-100 border border-gray-200 rounded text-gray-500 text-[11px] font-bold hover:bg-gray-200">···</button>
                        <span className="text-gray-400">→</span>
                        <div className="flex-1 border border-gray-200 rounded px-3 py-1.5 flex items-center justify-between bg-white text-[13px] text-gray-700 focus-within:border-blue-500 focus-within:ring-1">
                            <input
                                type="text"
                                value={castTargetColumn}
                                onChange={e => { setCastTargetColumn(e.target.value); setIsApplied(false); }}
                                placeholder={castColumn || "Target column"}
                                className="w-full bg-transparent outline-none placeholder:text-gray-400"
                            />
                            {(!castTargetColumn || castTargetColumn === castColumn) && (
                                <span className="text-[10px] font-bold text-orange-500 uppercase ml-2 select-none">Replace</span>
                            )}
                        </div>
                    </div>

                    {/* Type row */}
                    <div className="flex items-center gap-2">
                        <label className="font-semibold text-gray-600 w-24 shrink-0">Type <span className="text-red-500">*</span></label>
                        <select value={castType} onChange={e => { setCastType(e.target.value); setIsApplied(false); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white font-medium appearance-none pr-8 outline-none focus:border-blue-500">
                            {["Timestamp", "String", "Integer", "Double", "Long", "Boolean", "Date", "Float"].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <ChevronDown className="w-3 h-3 text-gray-400 -ml-6 pointer-events-none" />
                    </div>
                </>)}

                {/* ── FILTER ROWS ── */}
                {entry.type === "Filter rows" && (<>
                    {/* Keep/Remove + match mode */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={filterMode} onChange={e => { setFilterMode(e.target.value as "Keep rows" | "Remove rows"); setIsApplied(false); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white font-medium outline-none focus:border-blue-500">
                            <option>Keep rows</option>
                            <option>Remove rows</option>
                        </select>
                        <span className="text-gray-500 text-[13px]">that match</span>
                        <select value={filterMatchMode} onChange={e => { setFilterMatchMode(e.target.value as "all conditions" | "any condition"); setIsApplied(false); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white font-medium outline-none focus:border-blue-500">
                            <option>all conditions</option>
                            <option>any condition</option>
                        </select>
                    </div>

                    {/* Condition row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={filterColumn} onChange={e => { setFilterColumn(e.target.value); setIsApplied(false); }}
                            className="flex-1 min-w-[140px] border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white font-medium outline-none focus:border-blue-500">
                            {columns.map(col => <option key={col.name} value={col.name}>{col.name}</option>)}
                        </select>
                        <select value={filterCondition} onChange={e => { setFilterCondition(e.target.value); setIsApplied(false); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white font-medium italic outline-none focus:border-blue-500">
                            <option value="is not null">is not null</option>
                            <option value="is null">is null</option>
                            <option value="equals">equals</option>
                            <option value="not equals">not equals</option>
                            <option value="contains">contains</option>
                            <option value="starts with">starts with</option>
                            <option value="ends with">ends with</option>
                            <option value="greater than">&gt;</option>
                            <option value="less than">&lt;</option>
                            <option value="greater than or equal">&gt;=</option>
                            <option value="less than or equal">&lt;=</option>
                        </select>
                        {!["is null", "is not null"].includes(filterCondition) && (
                            <input
                                type="text"
                                value={filterValue}
                                onChange={e => { setFilterValue(e.target.value); setIsApplied(false); }}
                                placeholder="Value..."
                                className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1.5 text-[13px] outline-none focus:border-blue-500 bg-white font-medium placeholder-gray-400"
                            />
                        )}
                    </div>

                    {/* Treat empty + add condition */}
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={filterTreatEmpty} onChange={e => { setFilterTreatEmpty(e.target.checked); setIsApplied(false); }}
                                className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
                            <span className="text-[12px] text-gray-700 font-medium">Treat empty string as null</span>
                        </label>
                        <button className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-blue-600 font-medium ml-auto">
                            <Plus className="w-3 h-3" /> Add condition
                        </button>
                    </div>
                </>)}

                {/* ── NORMALIZE COLUMN NAMES ── */}
                {entry.type === "Normalize column names" && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2 text-blue-600">
                            <Info className="w-4 h-4 mt-0.5 shrink-0" />
                            <span className="text-[13px]">
                                Normalizes column names to use{" "}
                                <a href="#" className="underline font-medium hover:text-blue-700">lower_snake_case.</a>
                            </span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${normalizeRemoveSpecial ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}
                                onClick={() => { setNormalizeRemoveSpecial((v: boolean) => !v); setIsApplied(false); }}>
                                {normalizeRemoveSpecial && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <span className="text-[13px] text-gray-700 group-hover:text-gray-900 font-medium">Remove special characters</span>
                            <span className="w-4 h-4 rounded-full border border-gray-400 flex items-center justify-center text-[9px] font-bold text-gray-500 cursor-help">?</span>
                        </label>
                    </div>
                )}

                {/* ── SELECT COLUMNS ── */}
                {entry.type === "Select columns" && (
                    <div className="flex flex-col gap-2">
                        <label className="font-semibold text-gray-800 text-[12px] flex items-center gap-1">
                            Columns to keep <span className="text-red-500">*</span>
                        </label>
                        <div className="border border-gray-300 rounded px-2 py-1.5 flex items-center gap-2 bg-white flex-wrap focus-within:border-blue-500">
                            {selectCols.map(col => (
                                <div key={col} className="bg-blue-50 border border-blue-200 rounded-sm px-2 py-0.5 text-[12px] font-medium text-blue-700 flex items-center gap-1.5">
                                    <Database className="w-3 h-3" /> {col}
                                    <X className="w-3 h-3 text-blue-400 hover:text-red-500 cursor-pointer" onClick={() => { setSelectCols(d => d.filter(c => c !== col)); setIsApplied(false); }} />
                                </div>
                            ))}
                            <input
                                list={`sel-cols-list-${entry.id}`}
                                placeholder="Search for columns..."
                                className="flex-1 min-w-[150px] outline-none text-[13px] text-gray-700 bg-transparent placeholder-gray-400"
                                onChange={e => {
                                    const val = e.target.value;
                                    if (columns.some(c => c.name === val) && !selectCols.includes(val)) {
                                        setSelectCols(d => [...d, val]);
                                        setIsApplied(false);
                                        e.target.value = "";
                                    }
                                }}
                            />
                            <datalist id={`sel-cols-list-${entry.id}`}>
                                {columns.filter(c => !selectCols.includes(c.name)).map(c => <option key={c.name} value={c.name} />)}
                            </datalist>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setSelectCols(columns.map(c => c.name)); setIsApplied(false); }} className="text-[12px] text-blue-600 font-semibold hover:underline">Select all</button>
                            <button onClick={() => { setSelectCols([]); setIsApplied(false); }} className="text-[12px] text-blue-600 font-semibold hover:underline">Clear all</button>
                        </div>
                    </div>
                )}

                {/* ── DROP COLUMNS ── */}
                {entry.type === "Drop columns" && (
                    <div className="flex flex-col gap-2">
                        <label className="font-semibold text-gray-800 text-[12px] flex items-center gap-1">
                            Columns to drop <span className="text-red-500">*</span> <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] ml-1">?</span>
                        </label>
                        <div className="border border-gray-300 rounded px-2 py-1.5 flex items-center gap-2 bg-white flex-wrap focus-within:border-blue-500">
                            {dropColumns.map(col => (
                                <div key={col} className="bg-gray-100/80 rounded-sm px-2 py-0.5 text-[13px] font-medium text-gray-800 flex items-center gap-1.5 shadow-sm">
                                    <span className="font-serif font-bold italic text-gray-400 text-[10px]">{"{}"}</span> {col}
                                    <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => { setDropColumns(d => d.filter(c => c !== col)); setIsApplied(false); }} />
                                </div>
                            ))}
                            <input
                                list={`drop-cols-list-${entry.id}`}
                                placeholder="Search for columns..."
                                className="flex-1 min-w-[150px] outline-none text-[13px] text-gray-700 bg-transparent placeholder-gray-400"
                                onChange={e => {
                                    const val = e.target.value;
                                    if (columns.some(c => c.name === val) && !dropColumns.includes(val)) {
                                        setDropColumns(d => [...d, val]);
                                        setIsApplied(false);
                                        e.target.value = "";
                                    }
                                }}
                            />
                            <datalist id={`drop-cols-list-${entry.id}`}>
                                {columns.filter(c => !dropColumns.includes(c.name)).map(c => <option key={c.name} value={c.name} />)}
                            </datalist>
                        </div>
                    </div>
                )}

                {/* ── RENAME COLUMNS ── */}
                {entry.type === "Rename columns" && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 w-full">
                            <div className="flex-1 border border-gray-300 rounded px-3 py-1.5 flex items-center justify-between bg-white text-[13px] hover:border-gray-400 relative">
                                <select
                                    value={renameSource} onChange={e => { setRenameSource(e.target.value); setIsApplied(false); }}
                                    className="w-full absolute inset-0 opacity-0 cursor-pointer"
                                >
                                    <option value="" disabled>Select column...</option>
                                    {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 font-serif italic text-gray-500 flex items-center justify-center text-[8px]">a</span>
                                    <span className="font-medium text-gray-800">{renameSource || "Select column..."}</span>
                                </span>
                                <ChevronDown className="w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>

                            <span className="text-gray-400 text-[10px] w-4 text-center shrink-0">→</span>

                            <div className="flex-1 border border-blue-500 rounded px-3 py-1.5 flex items-center justify-between bg-white focus-within:ring-1 focus-within:ring-blue-200">
                                <input
                                    type="text"
                                    value={renameTarget}
                                    onChange={e => { setRenameTarget(e.target.value); setIsApplied(false); }}
                                    className="w-full bg-transparent outline-none text-[13px] font-medium"
                                />
                                <span className="text-[10px] font-bold text-emerald-600 ml-2 select-none uppercase tracking-wide">New</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-[12px] font-medium text-gray-600 px-1">
                            <button className="flex items-center gap-1.5 hover:text-blue-600"><Plus className="w-3.5 h-3.5" /> Add rename</button>
                            <button className="flex items-center gap-1.5 hover:text-blue-600"><Edit3 className="w-3 h-3" /> Add multiple...</button>
                        </div>
                    </div>
                )}

                {/* Apply / Cancel footer */}
                <div className="flex justify-end gap-3 pt-2 mt-1 border-t border-gray-100">
                    <button onClick={() => onRemove(entry.id)} className="px-4 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded bg-white hover:bg-gray-50">Cancel</button>
                    <button
                        onClick={handleApply}
                        disabled={!dirty}
                        className={`px-6 py-1.5 text-[13px] font-bold rounded shadow-sm ${dirty ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-100 text-gray-400 border border-gray-200 shadow-none cursor-not-allowed"
                            }`}
                    >
                        {dirty ? "Apply" : "Applied"}
                    </button>
                </div>
            </div>
        </div>
    );
}


// ─── Search / Picker Panel ──────────────────────────────────────────────────
function TransformPicker({
    onSelect,
}: {
    onSelect: (type: string) => void;
}) {
    const [search, setSearch] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiOpen, setAiOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

    const filtered = search
        ? ALL_TRANSFORMS.filter(t => t.toLowerCase().includes(search.toLowerCase()))
        : ALL_TRANSFORMS;

    const handleGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setAiLoading(true);
        await new Promise(r => setTimeout(r, 1200)); // Simulate LLM call
        // Heuristic: map common phrases to transform types
        const lower = aiPrompt.toLowerCase();
        let suggested = "Cast";
        if (lower.includes("filter") || lower.includes("remove") || lower.includes("null")) suggested = "Filter rows";
        if (lower.includes("normaliz") || lower.includes("column name") || lower.includes("snake")) suggested = "Normalize column names";
        if (lower.includes("cast") || lower.includes("timestamp") || lower.includes("date")) suggested = "Cast";
        setAiLoading(false);
        setAiOpen(false);
        setAiPrompt("");
        onSelect(suggested);
    };

    return (
        <div className="w-full bg-white border-t border-gray-200 shrink-0">
            {/* AI Modal */}
            {aiOpen && (
                <div className="border-b border-gray-200 px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="text-[13px] font-bold text-gray-900">Generate transform with AI</span>
                        <button onClick={() => setAiOpen(false)} className="ml-auto text-gray-400 hover:text-gray-700"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex gap-2">
                        <input
                            autoFocus
                            type="text"
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleGenerate()}
                            placeholder='e.g. "remove rows where order_id is empty"'
                            className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-[13px] outline-none focus:border-blue-500 bg-white"
                        />
                        <button onClick={handleGenerate} disabled={aiLoading}
                            className="px-4 py-1.5 text-[13px] font-bold text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5">
                            {aiLoading ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {aiLoading ? "Thinking..." : "Generate"}
                        </button>
                    </div>
                </div>
            )}

            {/* Search bar */}
            <div className="flex items-center px-3 py-2 gap-2 border-b border-gray-200">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search transforms and columns..."
                    className="flex-1 bg-transparent outline-none text-[13px] text-gray-800 placeholder-gray-400"
                />
                <span className="text-[12px] text-gray-400 font-mono border border-gray-200 rounded px-1">/</span>
                <button
                    onClick={() => { setSearch(""); setAiOpen(o => !o); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition-colors ml-1"
                >
                    <Sparkles className="w-3.5 h-3.5" /> Generate
                </button>
                <div className="flex items-center gap-1 ml-1 text-gray-400">
                    <button title="Grid view" className="hover:text-gray-600"><Grid className="w-3.5 h-3.5" /></button>
                    <button title="Stats" className="hover:text-gray-600"><BarChart2 className="w-3.5 h-3.5" /></button>
                    <button title="More" className="hover:text-gray-600"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg></button>
                </div>
            </div>

            {/* Transform list (compact, horizontal) */}
            {search && (
                <div className="bg-white border-t border-gray-100 max-h-40 overflow-y-auto py-1">
                    {filtered.length === 0 && <div className="px-4 py-3 text-[13px] text-gray-400 italic">No transforms match &quot;{search}&quot;</div>}
                    {filtered.map(name => (
                        <button key={name} onClick={() => { onSelect(name); setSearch(""); }}
                            className="w-full text-left px-4 py-1.5 text-[13px] text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors">
                            {name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}


// ─── Main Page ──────────────────────────────────────────────────────────────
export default function PipelineBuilderWorkspace() {
    const params = useParams();
    const pipelineId = params.id as string;
    const [pipeline, setPipeline] = useState<PipelineMeta | null>(null);
    const [isAddDataOpen, setIsAddDataOpen] = useState(false);
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    const nodeTypes = useMemo(() => ({ datasetNode: DatasetNode, transformNode: TransformNode, outputNode: OutputNode }), []);

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [outputs, setOutputs] = useState<PipelineOutput[]>([]);
    const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
    const [rightPanelMode, setRightPanelMode] = useState<"outputs" | "deploy">("outputs");
    const [deployState, setDeployState] = useState<DeployState | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [persistedBranches, setPersistedBranches] = useState<Record<string, { nodes?: Node[]; edges?: Edge[] }>>({});
    const [pendingOutputSourceId, setPendingOutputSourceId] = useState<string | null>(null);


    const [activeTransformNodeId, setActiveTransformNodeId] = useState<string | null>(null);
    const [transformPathName, setTransformPathName] = useState("Transform path 1");
    const [transforms, setTransforms] = useState<TransformEntry[]>([]);
    const [allApplied, setAllApplied] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // ── Join state ────────────────────────────────────────────────────────────
    // Step 1: user clicked Join on a node – pick the right table
    const [joinPickerNodeId, setJoinPickerNodeId] = useState<string | null>(null);
    // Step 2: full config open
    const [activeJoinConfig, setActiveJoinConfig] = useState<JoinConfig | null>(null);
    // In-flight join config being edited
    const [editingJoinConfig, setEditingJoinConfig] = useState<JoinConfig | null>(null);
    // Per-join preview data (left + right rows loaded from dataset previews)
    const [joinLeftRows, setJoinLeftRows] = useState<Record<string, string>[]>([]);
    const [joinRightRows, setJoinRightRows] = useState<Record<string, string>[]>([]);
    const [joinPendingRightId, setJoinPendingRightId] = useState<string | null>(null);

    const [unionPickerAnchorId, setUnionPickerAnchorId] = useState<string | null>(null);
    const [unionPendingSecondId, setUnionPendingSecondId] = useState<string | null>(null);
    const [editingUnion, setEditingUnion] = useState<UnionEditorState | null>(null);
    const [unionSchemaError, setUnionSchemaError] = useState<string | null>(null);
    const [unionPreviewRows, setUnionPreviewRows] = useState<Record<string, string>[]>([]);
    const [unionOutputColumns, setUnionOutputColumns] = useState<DatasetColumn[]>([]);

    const [branches] = useState<string[]>(["Main", "Join Clean Bureau with Customer List"]);
    const [activeBranch, setActiveBranch] = useState("Main");
    const [saveNotice, setSaveNotice] = useState<string | null>(null);

    const nodesRef = useRef<Node[]>(nodes);
    const edgesRef = useRef<Edge[]>(edges);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    // Preview resizer
    const [previewHeight, setPreviewHeight] = useState(250);
    const [isResizingPreview, setIsResizingPreview] = useState(false);
    const [rightPanelWidth, setRightPanelWidth] = useState(300);
    const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
    const [previewTab, setPreviewTab] = useState<"Input table" | "Output table">("Output table");

    // ── Selection Preview (Graph Mode) ─────────────────────────────────────────
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectionPreviewParams, setSelectionPreviewParams] = useState<{ columns: { name: string, type: string }[], rows: Record<string, string>[] } | null>(null);
    const [selectionTab, setSelectionTab] = useState<"preview" | "transforms" | "suggestions">("preview");
    const [nodeTransforms, setNodeTransforms] = useState<TransformEntry[]>([]);
    const [selectionSuggestions, setSelectionSuggestions] = useState<{ title: string; desc: string; icon: string; severity: "info" | "warning" | "tip" }[]>([]);
    const [colSearch, setColSearch] = useState("");

    const isJoinDatasetNode = useCallback((node: Node) => {
        return node.type === "datasetNode" && (node.id.startsWith("join-") || node.data?.nodeKind === "join");
    }, []);

    const isUnionDatasetNode = useCallback((node: Node) => {
        return node.type === "datasetNode" && (node.id.startsWith("union-") || node.data?.nodeKind === "union");
    }, []);

    const handleSave = useCallback(async () => {
        if (nodes.length === 0) return;
        setIsSaving(true);
        try {
            try {
                localStorage.setItem(graphStorageKey(pipelineId, activeBranch), JSON.stringify({ nodes, edges }));
            } catch { /* quota / private mode */ }
            await fetch(`/api/ontology/pipelines/${pipelineId}/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodes, edges, transforms, activeBranch, outputs, deployState })
            });
            setPersistedBranches((prev) => ({ ...prev, [activeBranch]: { nodes, edges } }));
        } catch (e) {
            console.error("Save failed:", e);
        } finally {
            setTimeout(() => setIsSaving(false), 500);
        }
    }, [pipelineId, nodes, edges, transforms, activeBranch, outputs, deployState]);

    const handleExplicitSave = useCallback(async () => {
        await handleSave();
        const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setSaveNotice(`Saved at ${t}`);
        window.setTimeout(() => setSaveNotice(null), 3200);
    }, [handleSave]);

    // Auto-save debounce effect
    useEffect(() => {
        if (!pipelineId || nodes.length === 0) return;
        const timer = setTimeout(() => {
            handleSave();
        }, 2000);
        return () => clearTimeout(timer);
    }, [nodes, edges, transforms, pipelineId, handleSave]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingPreview) {
                const newHeight = window.innerHeight - e.clientY;
                setPreviewHeight(Math.max(100, Math.min(newHeight, window.innerHeight - 200)));
            }
            if (isResizingRightPanel) {
                const newWidth = window.innerWidth - e.clientX;
                setRightPanelWidth(Math.max(200, Math.min(newWidth, window.innerWidth - 300)));
            }
        };
        const handleMouseUp = () => {
            setIsResizingPreview(false);
            setIsResizingRightPanel(false);
        };
        if (isResizingPreview || isResizingRightPanel) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }
        return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
    }, [isResizingPreview, isResizingRightPanel]);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => setNodes(nds => applyNodeChanges(changes, nds)),
        []
    );

    const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
        setSelectedNodeId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
    }, []);

    const onNodeClick = useCallback(
        (e: React.MouseEvent, node: Node) => {
            if (node.type === "outputNode") {
                const output = outputs.find((entry) => entry.nodeId === node.id);
                if (output) {
                    setSelectedOutputId(output.id);
                    setRightPanelMode("outputs");
                }
            }
            if (unionPickerAnchorId) {
                if (node.id === unionPickerAnchorId) return;
                if (node.type === "datasetNode" || node.type === "transformNode") {
                    if (e.metaKey || e.ctrlKey) {
                        setUnionPendingSecondId((prev) => (prev === node.id ? null : node.id));
                    } else {
                        setUnionPendingSecondId(node.id);
                    }
                }
                return;
            }
            if (!joinPickerNodeId || node.id === joinPickerNodeId) return;
            if (node.type !== "datasetNode" && node.type !== "transformNode") return;
            setJoinPendingRightId(node.id);
        },
        [joinPickerNodeId, unionPickerAnchorId, outputs]
    );

    const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.type === "datasetNode" || node.type === "transformNode") {
            setSelectedNodeId(node.id);
            setSelectionTab("preview");
        }
    }, []);

    const handleRemoveSelectedNode = useCallback(() => {
        if (!selectedNodeId) return;
        const outputNodeIdsToRemove = outputs
            .filter((output) => output.nodeId === selectedNodeId || output.sourceNodeId === selectedNodeId)
            .map((output) => output.nodeId);
        const nodeIdsToRemove = new Set([selectedNodeId, ...outputNodeIdsToRemove]);

        setNodes((nds) => nds.filter((n) => !nodeIdsToRemove.has(n.id)));
        setEdges((eds) => eds.filter((e) => !nodeIdsToRemove.has(String(e.source)) && !nodeIdsToRemove.has(String(e.target))));
        setOutputs((prev) => prev.filter((output) => !nodeIdsToRemove.has(output.nodeId) && !nodeIdsToRemove.has(output.sourceNodeId)));
        setSelectedNodeId(null);
        if (selectedOutputId && nodeIdsToRemove.has(`output-${selectedOutputId}`)) {
            setSelectedOutputId(null);
        }
    }, [selectedNodeId, outputs, selectedOutputId]);

    const handleTransformOpen = useCallback(async (nodeId: string) => {
        setActiveTransformNodeId(nodeId);
        try {
            const res = await fetch(`/api/ontology/pipelines/${pipelineId}/transforms/${nodeId}`);
            if (res.ok) {
                const data = await res.json() as { pathName: string; transforms: TransformEntry[] };
                setTransformPathName(data.pathName ?? "Transform path 1");
                setTransforms(data.transforms ?? []);
                setAllApplied((data.transforms ?? []).length > 0 && (data.transforms ?? []).every(t => t.applied));
                return;
            }
        } catch { /* offline */ }
        setTransforms([]);
        setAllApplied(false);
        setTransformPathName("Transform path 1");
    }, [pipelineId]);

    const handleJoinStart = useCallback((nodeId: string) => {
        setJoinPendingRightId(null);
        setJoinPickerNodeId(nodeId);
        setUnionPickerAnchorId(null);
        setUnionPendingSecondId(null);
    }, []);

    const handleUnionStart = useCallback((nodeId: string) => {
        setJoinPickerNodeId(null);
        setJoinPendingRightId(null);
        setUnionPendingSecondId(null);
        setUnionPickerAnchorId(nodeId);
    }, []);

    const loadNodeColumns = useCallback(async (node: Node): Promise<DatasetColumn[]> => {
        const dsId = typeof node.data?.datasetId === "string" ? node.data.datasetId : "";
        if (!dsId || isVirtualDatasetId(dsId) || node.id.startsWith("join-") || node.id.startsWith("union-")) {
            return (node.data?.columns ?? []) as DatasetColumn[];
        }
        if (!pipeline?.projectId) {
            return (node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[];
        }

        try {
            const previewRes = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
            if (previewRes.ok) {
                const previewData = await previewRes.json() as { columns?: DatasetColumn[] };
                if (Array.isArray(previewData.columns) && previewData.columns.length > 0) {
                    setNodes((prev) => prev.map((entry) => entry.id === node.id ? { ...entry, data: { ...entry.data, columns: previewData.columns } } : entry));
                    return previewData.columns;
                }
            }
        } catch { /* ignore */ }

        try {
            const schemaRes = await fetch(`/api/ontology-admin/datasets/${dsId}/schema?projectId=${pipeline.projectId}`);
            if (schemaRes.ok) {
                const schemaData = await schemaRes.json() as { columns?: DatasetColumn[]; fields?: DatasetColumn[]; schema?: DatasetColumn[] };
                const cols = schemaData.columns ?? schemaData.fields ?? schemaData.schema ?? [];
                if (cols.length > 0) {
                    setNodes((prev) => prev.map((entry) => entry.id === node.id ? { ...entry, data: { ...entry.data, columns: cols } } : entry));
                    return cols;
                }
            }
        } catch { /* ignore */ }

        return (node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[];
    }, [pipeline?.projectId]);

    const loadNodeRows = useCallback(async (node: Node): Promise<Record<string, string>[]> => {
        const dsId = typeof node.data?.datasetId === "string" ? node.data.datasetId : "";
        if (!dsId || isVirtualDatasetId(dsId) || node.id.startsWith("join-") || node.id.startsWith("union-")) {
            return buildUnionPreviewRows((node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[]).slice(0, 24);
        }
        if (!pipeline?.projectId) {
            return [];
        }

        try {
            const res = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
            if (res.ok) {
                const data = await res.json() as { rows?: Record<string, string>[] };
                return data.rows ?? [];
            }
        } catch { /* ignore */ }

        return [];
    }, [pipeline?.projectId]);

    const handleEditJoinNode = useCallback(async (nodeId: string) => {
        const joinNode = nodes.find((node) => node.id === nodeId);
        if (!joinNode) return;

        const inboundEdges = edges.filter((edge) => edge.target === nodeId).slice(0, 2);
        const leftNodeId = String(joinNode.data?.joinConfig?.leftNodeId ?? inboundEdges[0]?.source ?? "");
        const rightNodeId = String(joinNode.data?.joinConfig?.rightNodeId ?? inboundEdges[1]?.source ?? "");
        const leftNode = nodes.find((node) => node.id === leftNodeId);
        const rightNode = nodes.find((node) => node.id === rightNodeId);
        if (!leftNode || !rightNode) return;

        const savedConfig = joinNode.data?.joinConfig as JoinConfig | undefined;
        const [leftColsRaw, rightColsRaw, leftRows, rightRows] = await Promise.all([
            loadNodeColumns(leftNode),
            loadNodeColumns(rightNode),
            loadNodeRows(leftNode),
            loadNodeRows(rightNode),
        ]);

        const selectedColumnNames = new Set(((joinNode.data?.columns ?? []) as DatasetColumn[]).map((column) => column.name));
        const fallbackConfig: JoinConfig = {
            id: nodeId,
            name: String(joinNode.data?.label ?? "Join"),
            joinType: "Left join",
            leftNodeId,
            rightNodeId,
            conditions: [{ leftCol: "", operator: "is equal to", rightCol: "" }],
            leftColumns: leftColsRaw.map((column) => ({ ...column, selected: selectedColumnNames.size === 0 || selectedColumnNames.has(column.name) })),
            rightColumns: rightColsRaw.map((column) => ({ ...column, selected: selectedColumnNames.size === 0 || selectedColumnNames.has(column.name) })),
            applied: true,
        };

        const nextConfig = savedConfig ? { ...savedConfig, id: nodeId, name: String(joinNode.data?.label ?? savedConfig.name) } : applyJoinPreset(
            fallbackConfig,
            String(leftNode.data?.label ?? ""),
            String(rightNode.data?.label ?? ""),
        );

        setJoinLeftRows(leftRows);
        setJoinRightRows(rightRows);
        setJoinPickerNodeId(null);
        setJoinPendingRightId(null);
        setUnionPickerAnchorId(null);
        setUnionPendingSecondId(null);
        setEditingUnion(null);
        setActiveTransformNodeId(null);
        setSelectedNodeId(nodeId);
        setActiveJoinConfig(nextConfig);
        setEditingJoinConfig(nextConfig);
    }, [nodes, edges, loadNodeColumns, loadNodeRows]);

    const handleEditUnionNode = useCallback(async (nodeId: string) => {
        const unionNode = nodes.find((node) => node.id === nodeId);
        if (!unionNode) return;

        const inboundEdges = edges.filter((edge) => edge.target === nodeId).slice(0, 2);
        const inputNodeIds = (
            Array.isArray(unionNode.data?.unionInputNodeIds) && unionNode.data.unionInputNodeIds.length === 2
                ? unionNode.data.unionInputNodeIds
                : inboundEdges.map((edge) => String(edge.source))
        ) as [string, string];
        const [leftInputId, rightInputId] = inputNodeIds;
        if (!leftInputId || !rightInputId) return;

        const leftNode = nodes.find((node) => node.id === leftInputId);
        const rightNode = nodes.find((node) => node.id === rightInputId);
        if (!leftNode || !rightNode) return;

        const [leftCols, rightCols] = await Promise.all([loadNodeColumns(leftNode), loadNodeColumns(rightNode)]);
        const outputCols = ((unionNode.data?.columns ?? leftCols) as DatasetColumn[]).map((column) => ({ ...column }));
        const schemaError = compareUnionSchemas(leftCols, rightCols);

        setJoinPickerNodeId(null);
        setJoinPendingRightId(null);
        setUnionPickerAnchorId(null);
        setUnionPendingSecondId(null);
        setActiveTransformNodeId(null);
        setActiveJoinConfig(null);
        setEditingJoinConfig(null);
        setSelectedNodeId(nodeId);
        setUnionSchemaError(schemaError);
        setUnionOutputColumns(outputCols);
        setUnionPreviewRows(schemaError ? [] : buildUnionPreviewRows(outputCols));
        setEditingUnion({
            inputNodeIds,
            name: String(unionNode.data?.label ?? "Union"),
            unionType: "Union by name",
            previewReady: !schemaError,
            committedToGraph: true,
        });
    }, [nodes, edges, loadNodeColumns]);

    const handleEditOutput = useCallback((outputNodeId: string) => {
        const output = outputs.find((entry) => entry.nodeId === outputNodeId || entry.id === outputNodeId);
        if (!output) return;
        setSelectedOutputId(output.id);
        setRightPanelMode("outputs");
    }, [outputs]);

    const handleAddOutput = useCallback((sourceNodeId: string) => {
        setPendingOutputSourceId(sourceNodeId);
        setSelectedOutputId(null);
        setRightPanelMode("outputs");
    }, []);

    const handleCreateNewDatasetOutput = useCallback((sourceNodeId: string) => {
        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        if (!sourceNode) return;

        const outputId = `out-${Date.now()}`;
        const outputNodeId = `output-${outputId}`;
        const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const baseName = `New dataset [${dateStr}]...`;
        const columns = (sourceNode.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[];

        const nextOutput: PipelineOutput = {
            id: outputId,
            nodeId: outputNodeId,
            sourceNodeId,
            name: baseName,
            fileName: `${sanitizeOutputName(baseName)}.csv`,
            columns,
            selectedColumnNames: columns.map(c => c.name),
            status: "draft",
        };

        setOutputs((prev) => [...prev, nextOutput]);
        setSelectedOutputId(outputId);
        setPendingOutputSourceId(null);
        setRightPanelMode("outputs");

        setNodes((prev) => [
            ...prev,
            {
                id: outputNodeId,
                position: { x: sourceNode.position.x + 290, y: sourceNode.position.y },
                type: "outputNode",
                data: {
                    label: baseName,
                    datasetId: sourceNodeId,
                    sourceNodeId,
                    columns,
                    status: "draft",
                    onEditOutput: handleEditOutput,
                },
            },
        ]);

        setEdges((prev) => [
            ...prev,
            {
                id: `edge-${sourceNodeId}-${outputNodeId}`,
                source: sourceNodeId,
                target: outputNodeId,
                type: "default",
                animated: true,
                style: { stroke: "#64748b", strokeWidth: 2 },
            },
        ]);
    }, [nodes, handleEditOutput]);

    const handleTransformClose = useCallback(() => {
        const isEditingExisting = activeTransformNodeId?.startsWith("transform-");
        const transformNodeId = isEditingExisting ? (activeTransformNodeId as string) : `transform-${activeTransformNodeId || ""}`;
        const appliedTransforms = transforms.filter(t => t.applied);

        if (appliedTransforms.length > 0) {
            setNodes(prev => {
                const sourceNode = prev.find(n => n.id === activeTransformNodeId);
                if (!sourceNode) return prev;

                const parentNodeId = isEditingExisting ? String(sourceNode.data?.sourceDatasetId ?? "") : (activeTransformNodeId as string);
                const parentNode = prev.find(n => n.id === parentNodeId);
                const parentCols = (parentNode?.data?.columns ?? []) as DatasetColumn[];

                const simulatedPreview = applyTransformsToPreview(parentCols, [], appliedTransforms);
                const nextSchemaColumns = simulatedPreview.columns;

                const existing = prev.find(n => n.id === transformNodeId);
                if (existing) {
                    return prev.map(n => n.id === transformNodeId ? {
                        ...n,
                        data: { ...n.data, label: transformPathName, columns: nextSchemaColumns, sourceDatasetId: parentNodeId, datasetId: transformNodeId, onEdit: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput }
                    } : n);
                } else {
                    return [...prev, {
                        id: transformNodeId,
                        position: { x: sourceNode.position.x + 350, y: sourceNode.position.y },
                        type: "transformNode",
                        data: { label: transformPathName, columns: nextSchemaColumns, sourceDatasetId: parentNodeId, datasetId: transformNodeId, onEdit: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput }
                    }];
                }
            });

            setEdges(prev => {
                if (isEditingExisting) return prev;
                const edgeId = `edge-${activeTransformNodeId}-${transformNodeId}`;
                if (!prev.find(e => e.id === edgeId)) {
                    return [...prev, {
                        id: edgeId,
                        source: activeTransformNodeId || "",
                        target: transformNodeId,
                        type: 'default',
                        animated: true,
                        style: { stroke: '#9ca3af', strokeWidth: 2 }
                    }];
                }
                return prev;
            });
        }

        // Always persist the current transform state to disk on close
        fetch(`/api/ontology/pipelines/${pipelineId}/transforms/${transformNodeId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pathName: transformPathName, transforms }),
        }).catch(() => { /* offline — best-effort */ });

        setActiveTransformNodeId(null);
        setTransforms([]);
        setAllApplied(false);
    }, [activeTransformNodeId, transforms, transformPathName, pipelineId, setNodes, setEdges, handleTransformOpen, handleJoinStart, handleUnionStart, handleAddOutput]);

    const attachPipelineNodeHandlers = useCallback(
        (list: Node[]): Node[] =>
            list.map((n) => {
                if (n.type === "datasetNode") {
                    return { ...n, data: { ...n.data, onTransform: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput } };
                }
                if (n.type === "transformNode") {
                    return { ...n, data: { ...n.data, onEdit: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput } };
                }
                if (n.type === "outputNode") {
                    return { ...n, data: { ...n.data, onEditOutput: handleEditOutput } };
                }
                return n;
            }),
        [handleTransformOpen, handleJoinStart, handleUnionStart, handleAddOutput, handleEditOutput]
    );

    const switchBranch = useCallback((next: string) => {
        if (next === activeBranch) return;
        try {
            localStorage.setItem(graphStorageKey(pipelineId, activeBranch), JSON.stringify({
                nodes: nodesRef.current,
                edges: edgesRef.current,
            }));
        } catch { /* ignore */ }
        setActiveBranch(next);
        try {
            const raw = localStorage.getItem(graphStorageKey(pipelineId, next));
            if (raw) {
                const d = JSON.parse(raw) as { nodes?: Node[]; edges?: Edge[] };
                setNodes(attachPipelineNodeHandlers(d.nodes ?? []));
                setEdges(d.edges ?? []);
            } else {
                const persisted = persistedBranches[next];
                if (persisted) {
                    setNodes(attachPipelineNodeHandlers(persisted.nodes ?? []));
                    setEdges(persisted.edges ?? []);
                } else {
                    setNodes([]);
                    setEdges([]);
                }
            }
        } catch {
            const persisted = persistedBranches[next];
            if (persisted) {
                setNodes(attachPipelineNodeHandlers(persisted.nodes ?? []));
                setEdges(persisted.edges ?? []);
            } else {
                setNodes([]);
                setEdges([]);
            }
        }
        setJoinPickerNodeId(null);
        setJoinPendingRightId(null);
        setUnionPickerAnchorId(null);
        setUnionPendingSecondId(null);
        setEditingUnion(null);
        setSelectedNodeId(null);
    }, [activeBranch, pipelineId, attachPipelineNodeHandlers, persistedBranches]);

    const graphLoadedForPipeline = useRef<string | null>(null);
    useEffect(() => {
        if (!pipelineId) return;
        if (graphLoadedForPipeline.current === pipelineId) return;
        graphLoadedForPipeline.current = pipelineId;
        const load = async () => {
            try {
                const res = await fetch(`/api/ontology/pipelines/${pipelineId}/save`);
                if (res.ok) {
                    const state = await res.json() as {
                        branches?: Record<string, { nodes?: Node[]; edges?: Edge[] }>;
                        outputs?: PipelineOutput[];
                        deployState?: DeployState | null;
                        activeBranch?: string;
                    };

                    if (state.branches) setPersistedBranches(state.branches);
                    if (Array.isArray(state.outputs)) setOutputs(state.outputs);
                    if (state.deployState) setDeployState(state.deployState);
                    if (typeof state.activeBranch === "string" && branches.includes(state.activeBranch)) {
                        setActiveBranch(state.activeBranch);
                    }

                    const persistedMain = state.branches?.Main;
                    if (persistedMain?.nodes && persistedMain.nodes.length > 0) {
                        setNodes(attachPipelineNodeHandlers(persistedMain.nodes));
                        setEdges(persistedMain.edges ?? []);
                    }
                }
            } catch { /* ignore persisted state */ }

            try {
                const raw = localStorage.getItem(graphStorageKey(pipelineId, "Main"));
                if (!raw) return;
                const d = JSON.parse(raw) as { nodes?: Node[]; edges?: Edge[] };
                if (d.nodes && d.nodes.length > 0) {
                    setNodes(attachPipelineNodeHandlers(d.nodes));
                    setEdges(d.edges ?? []);
                }
            } catch { /* ignore */ }
        };
        void load();
    }, [pipelineId, attachPipelineNodeHandlers, branches]);

    const handleJoinSelectRight = useCallback(async (rightNodeId: string) => {
        const leftNodeId = joinPickerNodeId!;
        setJoinPickerNodeId(null);
        setJoinPendingRightId(null);
        const leftNode = nodes.find(n => n.id === leftNodeId);
        const rightNode = nodes.find(n => n.id === rightNodeId);
        if (!leftNode || !rightNode) return;

        // Helper: ALWAYS try API first to get fresh columns — cached data may be stale/wrong
        const fetchCols = async (node: typeof leftNode): Promise<{ name: string; type: string }[]> => {
            const dsId = node.data?.datasetId;
            // For join/transform derived nodes, use cached columns only (no API)
            if (!dsId || dsId.startsWith("join-") || dsId.startsWith("transform-") || dsId.startsWith("union-")) {
                return node.data?.columns ?? [];
            }
            if (pipeline?.projectId) {
                // 1) Try the preview endpoint first (returns columns + rows)
                try {
                    const res = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
                    if (res.ok) {
                        const d = await res.json();
                        if (d.columns?.length > 0) {
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, columns: d.columns } } : n));
                            return d.columns;
                        }
                    }
                } catch { /* offline */ }
                // 2) Try the schema/columns-only endpoint
                try {
                    const res = await fetch(`/api/ontology-admin/datasets/${dsId}/schema?projectId=${pipeline.projectId}`);
                    if (res.ok) {
                        const d = await res.json();
                        const cols = d.columns ?? d.fields ?? d.schema ?? [];
                        if (cols.length > 0) {
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, columns: cols } } : n));
                            return cols;
                        }
                    }
                } catch { /* offline */ }
                // 3) Fall back to fetching the full project dataset list and finding this dataset
                try {
                    const res = await fetch(`/api/ontology-admin/projects/${pipeline.projectId}/datasets`);
                    if (res.ok) {
                        const all = await res.json() as { id: string; columns?: { name: string; type: string }[] }[];
                        const match = all.find(d => d.id === dsId);
                        if (match?.columns && match.columns.length > 0) {
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, columns: match.columns } } : n));
                            return match.columns;
                        }
                    }
                } catch { /* offline */ }
            }
            // Last resort: use whatever is cached on the node (may be stale)
            return node.data?.columns ?? [];
        };

        const [leftColsRaw, rightColsRaw] = await Promise.all([fetchCols(leftNode), fetchCols(rightNode)]);
        const leftCols: JoinColumn[] = leftColsRaw.map((c: { name: string; type: string }) => ({ ...c, selected: true }));
        const rightCols: JoinColumn[] = rightColsRaw.map((c: { name: string; type: string }) => ({ ...c, selected: true }));

        const newConfig: JoinConfig = {
            id: `join-${leftNodeId}-${rightNodeId}`,
            name: "Join",
            joinType: "Left join",
            leftNodeId,
            rightNodeId,
            conditions: [{ leftCol: "", operator: "is equal to", rightCol: "" }],
            leftColumns: leftCols,
            rightColumns: rightCols,
            applied: false,
        };
        const leftLab = String(leftNode.data?.label ?? "");
        const rightLab = String(rightNode.data?.label ?? "");
        const presetConfig = applyJoinPreset(newConfig, leftLab, rightLab);
        setEditingJoinConfig(presetConfig);
        setActiveJoinConfig(presetConfig);

        if (pipeline?.projectId) {
            const load = async (dsId: string, setter: (r: Record<string, string>[]) => void) => {
                try {
                    const res = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
                    if (res.ok) { const d = await res.json(); setter(d.rows ?? []); }
                } catch { /* offline */ }
            };
            load(leftNode.data?.datasetId ?? "", setJoinLeftRows);
            load(rightNode.data?.datasetId ?? "", setJoinRightRows);
        }
    }, [joinPickerNodeId, nodes, pipeline]);

    const handleJoinApply = useCallback((config: JoinConfig) => {
        const leftNode = nodes.find(n => n.id === config.leftNodeId);
        const rightNode = nodes.find(n => n.id === config.rightNodeId);
        if (!leftNode || !rightNode) return;

        // Use a stable id derived only from the two source nodes — never include a timestamp
        // The config.id may have a timestamp suffix; strip it so existing check always matches
        const joinNodeId = `join-${config.leftNodeId}-${config.rightNodeId}`;
        const joinedCols = [
            ...config.leftColumns.filter(c => c.selected),
            ...config.rightColumns.filter(c => c.selected),
        ];

        setNodes(prev => {
            const pos = { x: Math.max(leftNode.position.x, rightNode.position.x) + 320, y: (leftNode.position.y + rightNode.position.y) / 2 };
            const existing = prev.find(n => n.id === joinNodeId);
            if (existing) return prev.map(n => n.id === joinNodeId ? { ...n, data: { ...n.data, label: config.name, columns: joinedCols, onTransform: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart } } : n);
            return [...prev, {
                id: joinNodeId, position: pos, type: "datasetNode",
                data: { label: config.name, columns: joinedCols, datasetId: joinNodeId, onTransform: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput },
            }];
        });

        setEdges(prev => {
            const newEdges = [];
            const leftEdgeId = `edge-${config.leftNodeId}-${joinNodeId}`;
            const rightEdgeId = `edge-${config.rightNodeId}-${joinNodeId}`;
            if (!prev.find(e => e.id === leftEdgeId)) newEdges.push({ id: leftEdgeId, source: config.leftNodeId, target: joinNodeId, type: "default", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } });
            if (!prev.find(e => e.id === rightEdgeId)) newEdges.push({ id: rightEdgeId, source: config.rightNodeId, target: joinNodeId, type: "default", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } });
            return [...prev, ...newEdges];
        });

        // Persist join config by patching the pipeline record (no separate transforms endpoint)
        fetch(`/api/ontology-admin/pipelines/${pipelineId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastJoin: { nodeId: joinNodeId, name: config.name, config } }),
        }).catch(() => { /* offline — pipeline save is best-effort */ });

        setActiveJoinConfig(null);
        setEditingJoinConfig(null);
    }, [nodes, handleTransformOpen, handleJoinStart, handleUnionStart, handleAddOutput, pipelineId]);

    const handleUnionPickerConfirm = useCallback(() => {
        if (!unionPickerAnchorId || !unionPendingSecondId) return;
        const a = unionPickerAnchorId;
        const b = unionPendingSecondId;
        const na = nodes.find((n) => n.id === a);
        const nb = nodes.find((n) => n.id === b);
        const la = String(na?.data?.label ?? "");
        const lb = String(nb?.data?.label ?? "");
        let name = "Union";
        if (
            (la.includes("Join Office Goods") && lb.includes("Join Bureau")) ||
            (lb.includes("Join Office Goods") && la.includes("Join Bureau"))
        ) {
            name = "Union Orders";
        }
        setEditingUnion({
            inputNodeIds: [a, b],
            name,
            unionType: "Union by name",
            previewReady: false,
            committedToGraph: false,
        });
        setUnionSchemaError(null);
        setUnionPreviewRows([]);
        setUnionPickerAnchorId(null);
        setUnionPendingSecondId(null);
    }, [unionPickerAnchorId, unionPendingSecondId, nodes]);

    const handleUnionCreateUnion = useCallback(() => {
        if (!editingUnion) return;
        const unionName = editingUnion.name.trim() || "Union";
        const [id1, id2] = editingUnion.inputNodeIds;
        const n1 = nodes.find((n) => n.id === id1);
        const n2 = nodes.find((n) => n.id === id2);
        const c1 = (n1?.data?.columns ?? []) as { name: string; type: string }[];
        const c2 = (n2?.data?.columns ?? []) as { name: string; type: string }[];
        const err = compareUnionSchemas(c1, c2);
        if (err) {
            setUnionSchemaError(err);
            return;
        }
        setUnionSchemaError(null);
        const sorted = [id1, id2].slice().sort();
        const unionNodeId = `union-${sorted[0]}-${sorted[1]}`;
        const outCols = c1.map((c) => ({ ...c }));
        setUnionPreviewRows(buildUnionPreviewRows(outCols));
        setUnionOutputColumns(outCols);
        setEditingUnion((u) => (u ? { ...u, name: unionName, previewReady: true, committedToGraph: true } : null));

        setNodes((prev) => {
            const a = prev.find((n) => n.id === id1);
            const b = prev.find((n) => n.id === id2);
            if (!a || !b) return prev;
            const pos = { x: Math.max(a.position.x, b.position.x) + 340, y: (a.position.y + b.position.y) / 2 };
            const existing = prev.find((n) => n.id === unionNodeId);
            const dataHandlers = { onTransform: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput };
            if (existing) {
                return prev.map((n) =>
                    n.id === unionNodeId ? { ...n, data: { ...n.data, label: unionName, columns: outCols, datasetId: unionNodeId, unionInputNodeIds: [id1, id2], ...dataHandlers } } : n
                );
            }
            return [
                ...prev,
                {
                    id: unionNodeId,
                    position: pos,
                    type: "datasetNode" as const,
                    data: { label: unionName, columns: outCols, datasetId: unionNodeId, unionInputNodeIds: [id1, id2], ...dataHandlers },
                },
            ];
        });

        setEdges((prev) => {
            const e1 = `edge-${id1}-${unionNodeId}`;
            const e2 = `edge-${id2}-${unionNodeId}`;
            const add: Edge[] = [];
            if (!prev.find((e) => e.id === e1))
                add.push({
                    id: e1,
                    source: id1,
                    target: unionNodeId,
                    type: "default",
                    animated: true,
                    style: { stroke: "#dc2626", strokeWidth: 2 },
                });
            if (!prev.find((e) => e.id === e2))
                add.push({
                    id: e2,
                    source: id2,
                    target: unionNodeId,
                    type: "default",
                    animated: true,
                    style: { stroke: "#dc2626", strokeWidth: 2 },
                });
            return [...prev, ...add];
        });

        fetch(`/api/ontology-admin/pipelines/${pipelineId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastUnion: { nodeId: unionNodeId, name: unionName, inputNodeIds: [id1, id2] } }),
        }).catch(() => { });
    }, [editingUnion, nodes, handleTransformOpen, handleJoinStart, handleUnionStart, handleAddOutput, pipelineId]);

    const handleUnionApplyBoard = useCallback(() => {
        if (!editingUnion?.previewReady) return;
        setEditingUnion(null);
        setUnionSchemaError(null);
        setUnionPreviewRows([]);
    }, [editingUnion]);

    const handleUnionCloseBoard = useCallback(() => {
        setEditingUnion(null);
        setUnionSchemaError(null);
        setUnionPreviewRows([]);
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/ontology-admin/pipelines/${pipelineId}`);
                if (res.ok) setPipeline(await res.json() as PipelineMeta);
            } catch { /* ignore */ }
        };
        load();
    }, [pipelineId]);

    const fetchDatasetPreview = useCallback(async (datasetId: string, isDeploy = false) => {
        if (!pipeline?.projectId) {
            return { columns: DEFAULT_COLUMNS, rows: buildUnionPreviewRows(DEFAULT_COLUMNS) };
        }

        try {
            const url = `/api/ontology-admin/datasets/${datasetId}/preview?projectId=${pipeline.projectId}${isDeploy ? '&limit=all' : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json() as { columns?: DatasetColumn[]; rows?: Record<string, string>[] };
                if (Array.isArray(data.columns) && Array.isArray(data.rows)) {
                    return { columns: data.columns, rows: data.rows };
                }
            }
        } catch { /* ignore */ }

        return { columns: DEFAULT_COLUMNS, rows: buildUnionPreviewRows(DEFAULT_COLUMNS) };
    }, [pipeline?.projectId]);

    const resolveNodePreview = useCallback(async (nodeId: string, visited = new Set<string>(), isDeploy = false): Promise<{ columns: DatasetColumn[]; rows: Record<string, string>[] }> => {
        if (visited.has(nodeId)) {
            return { columns: DEFAULT_COLUMNS, rows: buildUnionPreviewRows(DEFAULT_COLUMNS) };
        }
        visited.add(nodeId);

        const node = nodes.find((entry) => entry.id === nodeId);
        if (!node) {
            return { columns: DEFAULT_COLUMNS, rows: buildUnionPreviewRows(DEFAULT_COLUMNS) };
        }

        if (node.type === "outputNode" && typeof node.data?.sourceNodeId === "string") {
            return resolveNodePreview(node.data.sourceNodeId, visited, isDeploy);
        }

        if (node.type === "transformNode") {
            const sourceNodeId = String(node.data?.sourceDatasetId ?? "");
            const base = await resolveNodePreview(sourceNodeId, visited, isDeploy);
            try {
                const res = await fetch(`/api/ontology/pipelines/${pipelineId}/transforms/${nodeId}`);
                if (res.ok) {
                    const data = await res.json() as { transforms?: TransformEntry[] };
                    return applyTransformsToPreview(base.columns, base.rows, data.transforms ?? []);
                }
            } catch { /* ignore */ }
            return base;
        }

        if (node.id.startsWith("join-")) {
            const inbound = edges.filter((edge) => edge.target === node.id).slice(0, 2);
            const [left, right] = await Promise.all(inbound.map((edge) => resolveNodePreview(String(edge.source), new Set(visited), isDeploy)));

            // For mock/fake data generation during join, limit rows visually if not deploying. Otherwise zip arrays bounded by matching row counts
            const joinedRows = Array.from({ length: Math.min(left?.rows?.length ?? 0, right?.rows?.length ?? 0, isDeploy ? Infinity : 50) }).map((_, index) => ({
                ...(left?.rows?.[index] ?? {}),
                ...(right?.rows?.[index] ?? {}),
            }));
            return {
                columns: (node.data?.columns ?? [...(left?.columns ?? []), ...(right?.columns ?? [])]) as DatasetColumn[],
                rows: joinedRows.length > 0 ? joinedRows : buildUnionPreviewRows((node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[]).slice(0, 24),
            };
        }

        if (node.id.startsWith("union-")) {
            const inbound = edges.filter((edge) => edge.target === node.id).slice(0, 2);
            const previews = await Promise.all(inbound.map((edge) => resolveNodePreview(String(edge.source), new Set(visited), isDeploy)));
            let rows = previews.flatMap((preview) => preview.rows);
            if (!isDeploy) rows = rows.slice(0, 100);
            return {
                columns: (node.data?.columns ?? previews[0]?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[],
                rows: rows.length > 0 ? rows : buildUnionPreviewRows((node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[]),
            };
        }

        const datasetId = String(node.data?.datasetId ?? "");
        if (datasetId && !isVirtualDatasetId(datasetId)) {
            return fetchDatasetPreview(datasetId, isDeploy);
        }

        return {
            columns: (node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[],
            rows: buildUnionPreviewRows((node.data?.columns ?? DEFAULT_COLUMNS) as DatasetColumn[]).slice(0, 24),
        };
    }, [nodes, edges, fetchDatasetPreview, pipelineId]);

    const handleDeployPipeline = useCallback(async () => {
        if (!pipeline?.projectId || outputs.length === 0) return;

        setRightPanelMode("deploy");
        setIsDeploying(true);
        setDeployState({ status: "deploying" });
        setOutputs((prev) => prev.map((output) => ({ ...output, status: "deploying" })));
        setNodes((prev) => prev.map((node) => node.type === "outputNode" ? { ...node, data: { ...node.data, status: "deploying" } } : node));

        try {
            const outputPayload = await Promise.all(outputs.map(async (output) => {
                const preview = await resolveNodePreview(output.sourceNodeId, new Set<string>(), true);
                return {
                    id: output.id,
                    name: output.name,
                    columns: preview.columns,
                    rows: preview.rows,
                };
            }));

            const res = await fetch(`/api/ontology/pipelines/${pipelineId}/deploy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: pipeline.projectId,
                    outputs: outputPayload,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to deploy pipeline");

            const deployedOutputs = (data.deployState?.outputs ?? []) as NonNullable<DeployState["outputs"]>;
            setDeployState(data.deployState as DeployState);
            setOutputs((prev) => prev.map((output) => {
                const deployed = deployedOutputs.find((entry) => entry.id === output.id);
                return deployed ? {
                    ...output,
                    status: "deployed",
                    deployedAt: deployed.deployedAt,
                    fileName: deployed.fileName,
                    filePath: deployed.filePath,
                    rowCount: deployed.rowCount,
                } : output;
            }));
            setNodes((prev) => prev.map((node) => {
                const deployed = deployedOutputs.find((entry) => `output-${entry.id}` === node.id);
                if (!deployed) return node;
                return {
                    ...node,
                    data: {
                        ...node.data,
                        label: deployed.name,
                        status: "deployed",
                    },
                };
            }));
            void handleSave();
        } catch (error) {
            console.error("Deploy failed:", error);
            setDeployState({ status: "idle" });
            setOutputs((prev) => prev.map((output) => ({ ...output, status: "draft" })));
            setNodes((prev) => prev.map((node) => node.type === "outputNode" ? { ...node, data: { ...node.data, status: "draft" } } : node));
        } finally {
            setIsDeploying(false);
        }
    }, [pipeline?.projectId, outputs, pipelineId, resolveNodePreview, handleSave]);

    useEffect(() => {
        setNodes((prev) => prev.map((node) => {
            if (node.type !== "outputNode") return node;
            const output = outputs.find((entry) => entry.nodeId === node.id);
            if (!output) return node;
            return {
                ...node,
                data: {
                    ...node.data,
                    label: output.name,
                    columns: output.columns,
                    status: output.status,
                    onEditOutput: handleEditOutput,
                },
            };
        }));
    }, [outputs, handleEditOutput]);

    useEffect(() => {
        if (outputs.length === 0) {
            setSelectedOutputId(null);
            return;
        }
        if (!selectedOutputId || !outputs.some((output) => output.id === selectedOutputId)) {
            setSelectedOutputId(outputs[0].id);
        }
    }, [outputs, selectedOutputId]);

    const pipelineName = pipeline?.name ?? "Loading...";
    const spaceName = pipeline?.projectSpace ?? "Ontology";
    const projectName = pipeline?.projectName ?? "Workspace";

    const activeNode = nodes.find(n => n.id === activeTransformNodeId);
    const activeNodeLabel = activeNode?.data?.label ?? "dataset";

    const [datasetPreviewParams, setDatasetPreviewParams] = useState<{ columns: { name: string, type: string }[], rows: Record<string, string>[] } | null>(null);

    useEffect(() => {
        if (!activeTransformNodeId || !pipeline?.projectId || !activeNode) return;
        const loadPreview = async () => {
            try {
                // Fetch using explicit datasetId
                const dsId = activeNode.data?.datasetId;
                if (!dsId) return;

                if (dsId.startsWith("join-") || dsId.startsWith("transform-") || dsId.startsWith("union-")) {
                    setDatasetPreviewParams(null); // Force dynamic mock row generation
                    return;
                }

                const res = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.columns && data.rows) {
                        setDatasetPreviewParams(data);
                    }
                } else {
                    setDatasetPreviewParams(null);
                }
            } catch (e) {
                console.error("Preview load err", e);
                setDatasetPreviewParams(null);
            }
        };
        loadPreview();
    }, [activeTransformNodeId, pipeline?.projectId, activeNode]);

    // Fetch Preview for Graph Mode Selection
    const selNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
    const selNodeDatasetId = selNode?.data?.datasetId ?? null;
    const selNodeColumns = selNode?.data?.columns ?? DEFAULT_COLUMNS;

    useEffect(() => {
        if (activeTransformNodeId || !pipeline?.projectId || !selectedNodeId || !selNodeDatasetId) {
            setSelectionPreviewParams(null);
            return;
        }

        const loadSelectionPreview = async () => {
            try {
                const dsId = selNodeDatasetId;
                if (dsId.startsWith("join-") || dsId.startsWith("transform-") || dsId.startsWith("union-")) {
                    const cols = selNodeColumns.length > 0 ? selNodeColumns : DEFAULT_COLUMNS;
                    setSelectionPreviewParams({ columns: cols, rows: buildUnionPreviewRows(cols).slice(0, 24) });
                    return;
                }

                const res = await fetch(`/api/ontology-admin/datasets/${dsId}/preview?projectId=${pipeline.projectId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.columns && data.rows) setSelectionPreviewParams(data);
                    else setSelectionPreviewParams(null);
                } else setSelectionPreviewParams(null);
            } catch {
                setSelectionPreviewParams(null);
            }
        };
        loadSelectionPreview();
    }, [selectedNodeId, selNodeDatasetId, selNodeColumns, activeTransformNodeId, pipeline?.projectId]);

    // Auto-reset tab when node changes
    useEffect(() => { setSelectionTab("preview"); setColSearch(""); }, [selectedNodeId]);

    // Load node transforms when Transformations tab is active
    useEffect(() => {
        if (selectionTab !== "transforms" || !selectedNodeId || !pipelineId) {
            setNodeTransforms([]);
            return;
        }
        fetch(`/api/ontology/pipelines/${pipelineId}/transforms/${selectedNodeId}`)
            .then(r => r.ok ? r.json() : null)
            .then((d: { transforms?: TransformEntry[] } | null) => setNodeTransforms(d?.transforms ?? []))
            .catch(() => setNodeTransforms([]));
    }, [selectionTab, selectedNodeId, pipelineId]);

    // Generate AI suggestions from column metadata when tab is active
    useEffect(() => {
        if (selectionTab !== "suggestions" || !selectionPreviewParams) { setSelectionSuggestions([]); return; }
        const cols = selectionPreviewParams.columns;
        const rows = selectionPreviewParams.rows;
        const suggestions: { title: string; desc: string; icon: string; severity: "info" | "warning" | "tip" }[] = [];

        // Null detection
        cols.forEach(col => {
            const nullCount = rows.filter(r => !r[col.name] || r[col.name] === "null" || r[col.name] === "").length;
            const pct = rows.length > 0 ? Math.round((nullCount / rows.length) * 100) : 0;
            if (pct > 30) suggestions.push({ title: `High nulls in "${col.name}"`, desc: `${pct}% of rows have empty values. Consider filtering or imputing missing values.`, icon: "⚠️", severity: "warning" });
        });

        // Numeric column type inference
        cols.forEach(col => {
            const sample = rows.slice(0, 20).filter(r => r[col.name]).map(r => r[col.name]);
            const allNumeric = sample.length > 0 && sample.every(v => !isNaN(Number(v)));
            if (allNumeric && col.type === "String") suggestions.push({ title: `Cast "${col.name}" to numeric`, desc: `This column contains numeric values but is typed as String. Cast it to Integer or Double for aggregations.`, icon: "🔢", severity: "tip" });
        });

        // Date column detection
        const datePatterns = [/\d{4}-\d{2}-\d{2}/, /\d{2}\/\d{2}\/\d{4}/, /\d{4}\//];
        cols.forEach(col => {
            const sample = rows.slice(0, 10).filter(r => r[col.name]).map(r => r[col.name]);
            const looksLikeDate = sample.length > 0 && sample.some(v => datePatterns.some(p => p.test(v)));
            if (looksLikeDate && col.type === "String") suggestions.push({ title: `Cast "${col.name}" to Timestamp`, desc: `This column appears to contain date/time values. Cast it to Timestamp to enable date operations.`, icon: "📅", severity: "tip" });
        });

        // ID column renaming
        cols.filter(c => c.name.startsWith("_") || / id$/i.test(c.name) || /^id_/i.test(c.name)).forEach(col => {
            suggestions.push({ title: `Rename "${col.name}"`, desc: `Column names starting with underscore or generic id patterns may reduce readability. Consider a more descriptive name.`, icon: "✏️", severity: "info" });
        });

        // Duplicate column suggestion
        const colNames = cols.map(c => c.name.toLowerCase());
        const dupes = colNames.filter((v, i) => colNames.indexOf(v) !== i);
        if (dupes.length > 0) suggestions.push({ title: "Duplicate column names detected", desc: `Columns with the same name (${dupes.join(", ")}) can cause join errors. Use 'Rename Columns' to fix.`, icon: "🔁", severity: "warning" });

        // General suggestion
        suggestions.push({ title: "Normalize column names", desc: "Standardize all column names to snake_case and remove special characters for consistent downstream use.", icon: "🔧", severity: "info" });

        if (cols.length > 20) suggestions.push({ title: `Drop unused columns (${cols.length} total)`, desc: "Large column counts slow down joins and transforms. Use 'Drop Columns' to remove columns not needed for the output.", icon: "🗑️", severity: "tip" });

        setSelectionSuggestions(suggestions);
    }, [selectionTab, selectionPreviewParams]);

    const activeNodeColumns: { name: string; type: string }[] = useMemo(() => {
        if (datasetPreviewParams?.columns && datasetPreviewParams.columns.length > 0) return datasetPreviewParams.columns;
        return activeNode?.data?.columns ?? DEFAULT_COLUMNS;
    }, [datasetPreviewParams, activeNode]);

    const previewColumns = useMemo(() => {
        if (previewTab === "Input table") return activeNodeColumns;
        let cols = [...activeNodeColumns];
        const appliedTransforms = transforms.filter(t => t.applied);

        for (const t of appliedTransforms) {
            if (t.type === "Drop columns") {
                const dropColumns = readTransformStringArray(t.params, "columns");
                if (dropColumns.length === 0) continue;
                cols = cols.filter(c => !dropColumns.includes(c.name));
            }
            if (t.type === "Select columns") {
                const selectColumns = readTransformStringArray(t.params, "columns");
                if (selectColumns.length === 0) continue;
                cols = cols.filter(c => selectColumns.includes(c.name));
            }
            if (t.type === "Rename columns") {
                const source = readTransformString(t.params, "source");
                const target = readTransformString(t.params, "target");
                if (!source || !target) continue;
                cols = cols.map(c => c.name === source ? { ...c, name: target } : c);
            }
            if (t.type === "Cast") {
                const column = readTransformString(t.params, "column");
                const toType = readTransformString(t.params, "toType");
                if (!column || !toType) continue;
                const targetColumn = readTransformString(t.params, "targetColumn", column);
                if (targetColumn === column) {
                    cols = cols.map(c => c.name === column ? { ...c, type: toType } : c);
                } else {
                    if (!cols.find(c => c.name === targetColumn)) {
                        cols.push({ name: targetColumn, type: toType });
                    }
                }
            }
            if (t.type === "Normalize column names" && readTransformBoolean(t.params, "removeSpecial")) {
                cols = cols.map(c => ({
                    ...c,
                    name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")
                }));
            }
        }
        return cols;
    }, [activeNodeColumns, transforms, previewTab]);

    const rawRows = useMemo(() => {
        if (datasetPreviewParams?.rows) return datasetPreviewParams.rows;

        return Array.from({ length: 20 }).map((_, rIdx) => {
            const row: Record<string, string> = { "id": String(rIdx + 1) };
            for (const col of activeNodeColumns) {
                let val = "";
                if (col.name === "order_id" || col.name === "orderId") val = rIdx % 3 === 0 && rIdx > 0 ? "null" : `9266e88b-cc45-49b${rIdx}`;
                if (col.name === "customer_id" || col.name === "customerId") val = `c3bd1328-d18b-4b5a...`;
                if (col.name === "status") val = rIdx % 4 === 0 ? "open" : "closed";
                if (col.name === "assignee") val = rIdx % 3 === 0 ? "null" : "Kristen Mohr";
                if (col.name === "quantity") val = String(((rIdx * 17) % 50) + 1);
                if (col.name === "item_name" || col.name === "itemName") val = ["Stapler", "Printer", "Paper Shredder", '30" Monitor', "Office Desk", "A4 Paper"][rIdx % 6];
                if (col.name === "unit_price" || col.name === "unitPrice") val = String(((rIdx * 13) % 100) * 10);
                if (col.name === "order_due_date" || col.name === "dueDateTime") val = `2024-03-${String((rIdx % 28) + 1).padStart(2, "0")}T00:00:00Z`;
                if (col.name === "orderPlacementDate") val = `2024-02-${String((rIdx % 28) + 1).padStart(2, "0")}T00:00:00Z`;
                if (col.name === "officegoods_customer_id" || col.name === "bureau_customer_id") val = `c3bd1328-d18b-${rIdx}b5a...`;
                if (!val) val = `mock_${col.name}_${rIdx}`; // Fallback for unspecified join columns
                row[col.name] = val;
            }
            return row;
        });
    }, [activeNodeColumns, datasetPreviewParams]);

    const previewRows = useMemo(() => {
        if (previewTab === "Input table") return rawRows;
        let rows = [...rawRows];
        const appliedTransforms = transforms.filter(t => t.applied);

        for (const t of appliedTransforms) {
            if (t.type === "Filter rows") {
                const col = readTransformString(t.params, "column");
                if (!col) continue;
                const cond = readTransformString(t.params, "condition", "is not null");
                const treatEmpty = readTransformBoolean(t.params, "treatEmpty");
                const value = readTransformString(t.params, "value");
                const keep = readTransformString(t.params, "mode", "Keep rows") === "Keep rows";

                rows = rows.filter(r => {
                    let v = r[col];
                    if (treatEmpty && v === "") v = "null";
                    const isNull = v === undefined || v === "null";

                    let match = false;
                    if (cond === "is not null") match = !isNull;
                    else if (cond === "is null") match = isNull;
                    else if (cond === "equals") match = v === value;
                    else if (cond === "not equals") match = v !== value;
                    else if (cond === "contains") match = v?.includes(value);
                    else if (cond === "starts with") match = v?.startsWith(value);
                    else if (cond === "ends with") match = v?.endsWith(value);
                    else {
                        // Numeric
                        const numV = Number(v), numVal = Number(value);
                        if (!isNaN(numV) && !isNaN(numVal)) {
                            if (cond === "greater than") match = numV > numVal;
                            else if (cond === "less than") match = numV < numVal;
                            else if (cond === "greater than or equal") match = numV >= numVal;
                            else if (cond === "less than or equal") match = numV <= numVal;
                        }
                    }

                    return keep ? match : !match;
                });
            }
            if (t.type === "Drop columns") {
                const dropColumns = readTransformStringArray(t.params, "columns");
                if (dropColumns.length === 0) continue;
                rows = rows.map(r => {
                    const newRow = { ...r };
                    dropColumns.forEach((c) => delete newRow[c]);
                    return newRow;
                });
            }
            if (t.type === "Select columns") {
                const selectColumns = readTransformStringArray(t.params, "columns");
                if (selectColumns.length === 0) continue;
                rows = rows.map(r => {
                    const newRow: Record<string, string> = { id: r.id };
                    selectColumns.forEach((c) => {
                        if (r[c] !== undefined) newRow[c] = r[c];
                    });
                    return newRow;
                });
            }
            if (t.type === "Rename columns") {
                const source = readTransformString(t.params, "source");
                const target = readTransformString(t.params, "target");
                if (!source || !target) continue;
                rows = rows.map(r => {
                    const newRow = { ...r };
                    newRow[target] = newRow[source];
                    delete newRow[source];
                    return newRow;
                });
            }
            if (t.type === "Cast") {
                const column = readTransformString(t.params, "column");
                const targetColumn = readTransformString(t.params, "targetColumn");
                if (!column || !targetColumn || column === targetColumn) continue;
                rows = rows.map(r => {
                    const newRow = { ...r };
                    newRow[targetColumn] = newRow[column];
                    return newRow;
                });
            }
            if (t.type === "Normalize column names" && readTransformBoolean(t.params, "removeSpecial")) {
                rows = rows.map(r => {
                    const newRow: Record<string, string> = { id: r.id };
                    for (const [k, v] of Object.entries(r)) {
                        if (k === 'id') continue;
                        const newK = k.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                        newRow[newK] = v;
                    }
                    return newRow;
                });
            }
        }
        return rows;
    }, [rawRows, transforms, previewTab]);

    const addTransform = (type: string) => {
        const entry: TransformEntry = {
            id: `t-${Date.now()}`,
            type,
            applied: false,
            params: type === "Cast" ? { column: activeNodeColumns[activeNodeColumns.length - 1]?.name ?? "", toType: "Timestamp" }
                : type === "Filter rows" ? { column: activeNodeColumns[0]?.name ?? "", condition: "is not null", treatEmpty: true }
                    : type === "Drop columns" ? { columns: [] }
                        : type === "Rename columns" ? { source: "", target: "" }
                            : {}
        };
        setTransforms(prev => [...prev, entry]);
        setAllApplied(false);
    };

    const applyCard = (id: string, params: Record<string, unknown>) => {
        setTransforms(prev => prev.map(t => t.id === id ? { ...t, params, applied: true } : t));
        setAllApplied(false);
    };

    const removeTransform = (id: string) => {
        setTransforms(prev => prev.filter(t => t.id !== id));
        setAllApplied(false);
    };

    const handleApplyAll = async () => {
        const allMarked = transforms.map(t => ({ ...t, applied: true }));
        setIsSaving(true);
        // Compute the same transformNodeId as handleTransformClose uses
        const isEditingExisting = activeTransformNodeId?.startsWith("transform-");
        const transformNodeId = isEditingExisting ? (activeTransformNodeId as string) : `transform-${activeTransformNodeId || ""}`;
        try {
            await fetch(`/api/ontology/pipelines/${pipelineId}/transforms/${transformNodeId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pathName: transformPathName, transforms: allMarked })
            });
        } catch { /* offline */ }
        setTransforms(allMarked);
        setAllApplied(true);
        setIsSaving(false);
    };

    return (
        <div className="flex flex-col w-full h-screen bg-[#f1f5f9] text-[#111827] font-sans">
            {/* ── Top Toolbar ── */}
            <div className="h-[56px] bg-white border-b border-gray-200 flex items-center px-4 shrink-0 shadow-sm z-10 w-full justify-between relative">
                {activeTransformNodeId ? (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-gray-50 border border-green-400 rounded px-2 py-1 focus-within:border-blue-500 focus-within:ring-1 transition-all">
                            <svg className="w-3.5 h-3.5 text-gray-400 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16m-7 6h7" /></svg>
                            <input type="text" value={transformPathName} onChange={e => setTransformPathName(e.target.value)}
                                className="bg-transparent outline-none text-[13px] font-bold text-gray-900 w-40" />
                        </div>
                        <button className="p-1 text-gray-400 hover:text-gray-700 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button className="p-1 text-gray-400 hover:text-gray-700 rounded"><Search className="w-3.5 h-3.5" /></button>
                        <button className="p-1 text-gray-400 hover:text-gray-700 rounded font-mono text-[11px]">&lt;/&gt;</button>
                        <button className="p-1 text-gray-400 hover:text-gray-700 rounded font-bold italic text-[11px]">fx +</button>
                        <div className="w-px h-4 bg-gray-300 mx-1" />
                        <button className="p-1 text-gray-400 hover:text-gray-700"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M9 9a3 3 0 015.12 2.12c0 2-3 3-3 3M12 17h.01" /></svg></button>
                        <button className="p-1 text-gray-400 hover:text-red-600"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg></button>
                    </div>
                ) : (
                    <div className="flex flex-col h-full justify-center min-w-0 flex-1 pr-32 pl-1">
                        <div className="flex items-center text-[12px] text-gray-500 mb-0.5 gap-0.5 min-w-0">
                            <span className="font-medium mr-0.5 text-teal-700 shrink-0">⬡</span>
                            <span className="opacity-70 shrink-0">[{spaceName}]</span>
                            <ChevronRight className="w-3 h-3 mx-0.5 opacity-50 shrink-0" />
                            <span className="truncate min-w-0">{projectName}</span>
                            <ChevronRight className="w-3 h-3 mx-0.5 opacity-50 shrink-0" />
                            <span className="font-bold text-gray-900 truncate">{pipelineName}</span>
                            <button type="button" className="ml-0.5 p-0.5 rounded text-gray-400 hover:text-amber-500 hover:bg-gray-50 shrink-0" title="Favorite" aria-label="Favorite">
                                <Star className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                        </div>
                        <div className="flex items-center gap-4 text-[12px] font-medium text-gray-600 flex-wrap">
                            <span className="hover:text-gray-900 cursor-pointer">File ▾</span>
                            <span className="hover:text-gray-900 cursor-pointer">Settings ▾</span>
                            <span className="hover:text-gray-900 cursor-pointer">Help ▾</span>
                            <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                                <FileText className="w-3.5 h-3.5 text-gray-500" />
                                <span className="bg-[#5c6a7a] text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm tracking-wide">Batch</span>
                            </div>
                        </div>
                    </div>
                )}

                {!activeTransformNodeId && (
                    <div className="flex items-end h-full absolute left-1/2 -translate-x-1/2 pointer-events-none">
                        <div className="flex gap-8 text-[13px] font-medium text-gray-500 h-full pointer-events-auto">
                            <button type="button" className="text-blue-600 border-b-2 border-blue-600 h-10 mt-auto pb-1.5 font-semibold px-0.5">Graph</button>
                            <button type="button" className="hover:text-gray-800 h-10 mt-auto pb-1.5 border-b-2 border-transparent px-0.5">Proposals</button>
                            <button type="button" className="hover:text-gray-800 h-10 mt-auto pb-1.5 border-b-2 border-transparent px-0.5">History</button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2 shrink-0 z-[11]">
                    {activeTransformNodeId ? (
                        <>
                            <button className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 12V3h4v9h2l-4 4-4-4h2zm-8 9V3H3v9H1l4 4 4-4H7z" /></svg> Expand all
                            </button>
                            <div className="h-4 w-px bg-gray-300 mx-1" />
                            <button
                                onClick={handleApplyAll}
                                disabled={allApplied || transforms.length === 0 || isSaving}
                                className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-bold rounded ${allApplied || transforms.length === 0
                                    ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                    }`}
                            >
                                {isSaving
                                    ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                                {isSaving ? "Saving..." : allApplied ? "Applied" : "Apply all"}
                            </button>
                            <button
                                onClick={handleTransformClose}
                                className="px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 rounded flex items-center gap-1.5 border border-gray-300 ml-1"
                            >
                                <X className="w-3.5 h-3.5" /> Close
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="hidden sm:flex items-center gap-0.5 mr-1 border-r border-gray-200 pr-2">
                                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-100" title="Undo" aria-label="Undo">
                                    <Undo2 className="w-4 h-4" />
                                </button>
                                <button type="button" className="p-1.5 rounded text-gray-500 hover:bg-gray-100" title="Redo" aria-label="Redo">
                                    <Redo2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="relative">
                                <GitBranch className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none z-[1]" />
                                <select
                                    value={activeBranch}
                                    onChange={(e) => switchBranch(e.target.value)}
                                    className="appearance-none h-8 pl-8 pr-7 text-[12px] font-semibold text-gray-800 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer max-w-[200px] truncate"
                                    title="Pipeline branch"
                                    aria-label="Pipeline branch"
                                >
                                    {branches.map((b) => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleExplicitSave()}
                                disabled={nodes.length === 0 || isSaving}
                                title="Save pipeline"
                                className="flex items-center gap-1.5 h-8 px-3 text-[13px] font-bold text-white bg-[#1a7f37] hover:bg-[#156d2f] rounded border border-[#146c2e] disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                            >
                                <Save className="w-3.5 h-3.5 shrink-0" />
                                {isSaving ? "Saving…" : "Save"}
                            </button>
                            {saveNotice && <span className="text-[10px] text-[#1a7f37] font-medium max-w-[100px] truncate hidden xl:inline" title={saveNotice}>{saveNotice}</span>}
                            <span className="text-[13px] font-medium text-gray-500 flex items-center gap-1.5 hidden md:flex">
                                {isSaving ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                {isSaving ? "Saving..." : "Saved"}
                            </span>
                            <button type="button" className="h-8 px-3 text-[13px] font-semibold text-gray-500 bg-white border border-gray-300 rounded cursor-not-allowed opacity-70 flex items-center gap-1.5" disabled>
                                <FileText className="w-4 h-4 text-gray-400" /> Propose
                            </button>
                            <div className="relative group/deploy flex shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setRightPanelMode("deploy")}
                                    disabled={outputs.length === 0}
                                    className="h-8 px-3 text-[13px] font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-l border border-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Deploy
                                </button>
                                <button
                                    className="h-8 px-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-r border-y border-r border-blue-700 flex items-center justify-center text-white border-l border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={outputs.length === 0}
                                >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <div className="absolute right-0 top-full mt-1 w-56 bg-[#1f2937] text-white text-[12px] rounded shadow-xl py-2 px-3 z-[100] opacity-0 group-hover/deploy:opacity-100 pointer-events-none transition-opacity">
                                    <div className="flex items-center justify-between">
                                        <span>Deploy all pipeline outputs</span>
                                        <Settings className="w-3.5 h-3.5 opacity-60" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center h-8 px-2 bg-[#ecfdf3] text-[#0d6832] text-[13px] font-semibold rounded border border-[#b4dfc4] gap-1 group relative cursor-pointer" title="20 healthy outputs">
                                <CheckCircle2 className="w-3.5 h-3.5" /> 20
                                <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 shadow-lg rounded p-2 text-[11px] text-gray-600 opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap font-normal">
                                    All outputs are healthy
                                </div>
                            </div>
                            <button type="button" className="flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded bg-white">
                                <Share className="w-3.5 h-3.5 text-gray-500" /> Share
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!activeTransformNodeId && !activeJoinConfig && !editingUnion && (
                <div className="h-10 bg-white border-b border-gray-200 flex items-center justify-between px-3 gap-3 shrink-0 z-[5] text-[12px] text-gray-800">
                    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-1">
                        <span className="text-[11px] font-semibold text-gray-500 mr-1 shrink-0">Tools</span>
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200 shrink-0"
                            title="Select"
                        >
                            <MousePointer2 className="w-3.5 h-3.5 text-gray-600" />
                            <span className="hidden lg:inline">Select</span>
                        </button>
                        <button
                            type="button"
                            disabled={!selectedNodeId}
                            onClick={handleRemoveSelectedNode}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200 disabled:opacity-35 disabled:pointer-events-none"
                            title="Remove selected node"
                        >
                            <Trash2 className="w-3.5 h-3.5 text-gray-600" />
                            <span className="hidden lg:inline">Remove</span>
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200 shrink-0"
                            title="Layout nodes on the graph"
                        >
                            <LayoutGrid className="w-3.5 h-3.5 text-gray-600" />
                            <span className="hidden lg:inline">Layout</span>
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200 shrink-0"
                            title="Text annotation"
                        >
                            <Type className="w-3.5 h-3.5 text-gray-600" />
                            <span className="hidden lg:inline">Text</span>
                        </button>

                        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" aria-hidden />

                        <button
                            type="button"
                            onClick={() => setIsAddDataOpen(true)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 bg-white shrink-0"
                        >
                            <Plus className="w-3.5 h-3.5 text-gray-600" />
                            Add data
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 bg-white shrink-0"
                            title="Reusables"
                        >
                            <Layers className="w-3.5 h-3.5 text-gray-600" />
                            Reusables
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>

                        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" aria-hidden />

                        <span className="text-[11px] font-semibold text-gray-500 mr-0.5 shrink-0 hidden lg:inline">Transform</span>
                        <div className="flex items-center gap-0.5 border border-gray-200 rounded-md px-0.5 py-0.5 bg-[#f4f6f8] shrink-0">
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                onClick={() => selectedNodeId && handleTransformOpen(selectedNodeId)}
                                className="p-1.5 rounded hover:bg-white text-gray-600 hover:text-blue-700 disabled:opacity-35 disabled:pointer-events-none"
                                title="Transform"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M14 8h-4v8M10 12h4M8 8l8 8" /></svg>
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                className="p-1.5 rounded hover:bg-white text-gray-500 hover:text-gray-800 disabled:opacity-35 disabled:pointer-events-none"
                                title="Filter rows"
                            >
                                <Filter className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                className="p-1.5 rounded hover:bg-white text-gray-500 hover:text-indigo-700 disabled:opacity-35 disabled:pointer-events-none"
                                title="Expression"
                            >
                                <Sigma className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                onClick={() => selectedNodeId && handleJoinStart(selectedNodeId)}
                                className="p-1.5 rounded hover:bg-white text-indigo-600 disabled:opacity-35 disabled:pointer-events-none"
                                title="Join"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="10" height="10" rx="1.5" /><rect x="11" y="11" width="10" height="10" rx="1.5" strokeDasharray="2 2" /></svg>
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-35 disabled:pointer-events-none"
                                title="Aggregate"
                            >
                                <BarChart2 className="w-4 h-4 text-gray-500" />
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                className="p-1.5 rounded hover:bg-white text-gray-500 disabled:opacity-35 disabled:pointer-events-none"
                                title="Pivot"
                            >
                                <Grid className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                disabled={!selectedNodeId}
                                onClick={() => selectedNodeId && handleUnionStart(selectedNodeId)}
                                className="p-1.5 rounded hover:bg-white disabled:opacity-35 disabled:pointer-events-none"
                                title="Union"
                            >
                                <span className="w-4 h-4 border-2 border-red-600 bg-red-500 rounded-sm block" aria-hidden />
                            </button>
                        </div>

                        <button
                            type="button"
                            className="ml-1 flex items-center gap-1 px-2 py-1 rounded text-[12px] font-semibold text-violet-800 hover:bg-violet-50 border border-violet-200 bg-violet-50/60 shrink-0"
                            title="AIP"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AIP
                        </button>
                        <button
                            type="button"
                            disabled={!selectedNodeId}
                            onClick={() => selectedNodeId && handleTransformOpen(selectedNodeId)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium text-gray-700 hover:bg-gray-100 border border-transparent disabled:opacity-35 disabled:pointer-events-none shrink-0"
                            title="Edit"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                        </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {joinPickerNodeId && (
                            <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 truncate max-w-[200px] 2xl:max-w-[320px] hidden sm:inline">
                                Join → <strong>Start</strong>
                            </span>
                        )}
                        {unionPickerAnchorId && (
                            <span className="text-[11px] text-red-900 bg-red-50 border border-red-200 rounded px-2 py-0.5 truncate max-w-[200px] hidden sm:inline">
                                Union → <strong>Start</strong>
                            </span>
                        )}
                        <div className="relative hidden md:block">
                            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <input
                                type="search"
                                placeholder="Search…"
                                className="h-8 w-[140px] lg:w-[180px] pl-8 pr-2 text-[12px] text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                                readOnly
                                title="Search (preview)"
                            />
                        </div>
                        <button
                            type="button"
                            className="h-8 px-2.5 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 shrink-0"
                        >
                            Legend
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-1 min-h-0 relative">
                {activeTransformNodeId ? (
                    /* ═══ TRANSFORM BOARD ═══ */
                    <div className="absolute inset-0 bg-[#f8f9fa] z-20 flex flex-col overflow-hidden">
                        <div className="flex flex-1 min-h-0 overflow-hidden">
                            {/* ── Canvas center ── */}
                            <div className="flex-1 flex flex-col min-h-0">
                                {/* Scrollable card stack */}
                                <div className="flex-1 overflow-y-auto px-8 pt-8 pb-4 flex flex-col items-center">
                                    <div className="w-full max-w-[700px] flex flex-col gap-0">
                                        {/* Source chip */}
                                        <div className="bg-white border border-gray-300 rounded-md shadow-sm flex items-center gap-3 px-4 py-3 mb-0">
                                            <div className="bg-blue-50 p-1.5 rounded border border-blue-200"><Database className="w-4 h-4 text-blue-600" /></div>
                                            <div>
                                                <div className="font-bold text-[13px] text-gray-900">{activeNodeLabel}</div>
                                                <div className="text-[11px] text-gray-400">{activeNodeColumns.length} columns</div>
                                            </div>
                                        </div>

                                        {/* Connector */}
                                        {transforms.length > 0 && <div className="flex justify-center h-5"><div className="w-px bg-gray-300" /></div>}

                                        {/* Transform cards */}
                                        {transforms.map((t, idx) => {
                                            const previousTransforms = transforms.slice(0, idx).filter(tr => tr.applied);
                                            const progressiveColumns = applyTransformsToPreview(activeNodeColumns, [], previousTransforms).columns;
                                            return (
                                                <div key={t.id} className="flex flex-col items-center w-full">
                                                    <TransformCard
                                                        entry={t}
                                                        columns={progressiveColumns}
                                                        onApply={applyCard}
                                                        onRemove={removeTransform}
                                                    />
                                                    {idx < transforms.length - 1 && (
                                                        <div className="flex justify-center h-4 w-full"><div className="w-px bg-gray-300" /></div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── Search bar pinned at bottom ── */}
                                <TransformPicker onSelect={addTransform} />
                            </div>

                            {/* ── Right Sidebar: Pipeline outputs ── */}
                            <div style={{ width: rightPanelWidth }} className="border-l border-gray-200 bg-white flex flex-col shrink-0 relative">
                                <div onMouseDown={() => setIsResizingRightPanel(true)} className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-blue-300 opacity-40 -translate-x-1/2" />
                                <div className="h-10 border-b border-gray-200 flex items-center justify-between px-3">
                                    <span className="text-[13px] font-bold text-gray-900">{rightPanelMode === "deploy" ? "Deploy this pipeline" : "Pipeline outputs"}</span>
                                    <div className="flex items-center gap-2">
                                        <button className="text-gray-400 hover:text-gray-700"><Settings className="w-3.5 h-3.5" /></button>
                                        <button className="text-gray-400 hover:text-gray-700"><Search className="w-3.5 h-3.5" /></button>
                                        <button
                                            onClick={() => {
                                                const sourceNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode")) : null;
                                                if (sourceNode) handleAddOutput(sourceNode.id);
                                            }}
                                            disabled={!selectedNodeId || !nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode"))}
                                            className="px-2 py-1 text-[12px] font-semibold text-gray-700 border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Plus className="w-3 h-3" /> Add
                                        </button>
                                    </div>
                                </div>
                                {rightPanelMode === "deploy" && (
                                    <div className="flex-1 flex flex-col">
                                        <div className="p-4 border-b border-gray-200 text-[12px] text-gray-500">
                                            Update pipeline logic and build target outputs.
                                        </div>
                                        <div className="p-4 space-y-4 flex-1">
                                            <div>
                                                <div className="text-[12px] font-bold text-gray-900 mb-2">Last deployment</div>
                                                <div className="text-[12px] text-gray-600">{deployState?.lastDeploymentAt ? new Date(deployState.lastDeploymentAt).toLocaleString() : "None"}</div>
                                            </div>
                                            <div>
                                                <div className="text-[12px] font-bold text-gray-900 mb-2">Select outputs to build</div>
                                                <div className="space-y-2">
                                                    {outputs.length === 0 ? (
                                                        <div className="text-[12px] text-gray-500 italic">No outputs defined</div>
                                                    ) : outputs.map((output) => (
                                                        <label key={output.id} className="flex items-center gap-2 text-[12px] text-gray-800">
                                                            <input type="checkbox" checked readOnly className="accent-blue-600" />
                                                            <span className="font-medium">{output.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            {isDeploying && (
                                                <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
                                                    Running task 1/1. Writing output datasets into the project workspace.
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 border-t border-gray-200 flex items-center gap-2">
                                            <button
                                                onClick={() => setRightPanelMode("outputs")}
                                                className="flex-1 py-2 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                                            >
                                                View outputs
                                            </button>
                                            <button
                                                onClick={() => void handleDeployPipeline()}
                                                disabled={outputs.length === 0 || isDeploying}
                                                className="flex-1 py-2 text-[12px] font-bold text-white bg-[#1a7f37] rounded hover:bg-[#156d2f] disabled:opacity-45 disabled:cursor-not-allowed"
                                            >
                                                {isDeploying ? "Deploying..." : "Deploy pipeline"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {rightPanelMode === "outputs" && outputs.length > 0 && (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <div className="border-b border-gray-200 px-3 py-2 space-y-2">
                                            {outputs.map((output) => (
                                                <button
                                                    key={output.id}
                                                    onClick={() => setSelectedOutputId(output.id)}
                                                    className={`w-full text-left rounded border px-3 py-2 ${selectedOutputId === output.id ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
                                                >
                                                    <div className="text-[12px] font-bold text-gray-900">{output.name}</div>
                                                    <div className="text-[11px] text-gray-500">{output.columns.length} columns</div>
                                                </button>
                                            ))}
                                        </div>
                                        {selectedOutputId && (() => {
                                            const selectedOutput = outputs.find((output) => output.id === selectedOutputId);
                                            if (!selectedOutput) return null;
                                            return (
                                                <div className="flex-1 overflow-y-auto">
                                                    <div className="p-4 space-y-4">
                                                        <div>
                                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Dataset name</label>
                                                            <input
                                                                value={selectedOutput.name}
                                                                onChange={(e) => {
                                                                    const value = e.target.value;
                                                                    setOutputs((prev) => prev.map((output) => output.id === selectedOutput.id ? { ...output, name: value, fileName: `${sanitizeOutputName(value)}.csv` } : output));
                                                                    setNodes((prev) => prev.map((node) => node.id === selectedOutput.nodeId ? { ...node, data: { ...node.data, label: value } } : node));
                                                                }}
                                                                className="w-full border border-gray-300 rounded px-3 py-2 text-[13px] text-gray-900"
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Source node</div>
                                                            <div className="text-[12px] text-gray-800 font-medium">{nodes.find((node) => node.id === selectedOutput.sourceNodeId)?.data?.label ?? selectedOutput.sourceNodeId}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Mapped columns</div>
                                                            <div className="max-h-[320px] overflow-y-auto border border-gray-200 rounded">
                                                                {selectedOutput.columns.map((column) => (
                                                                    <div key={column.name} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-b-0 text-[12px]">
                                                                        <span className="text-gray-900 font-medium">{column.name}</span>
                                                                        <span className="text-gray-500">{column.type}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 border-t border-gray-200">
                                                        <button
                                                            onClick={() => setRightPanelMode("deploy")}
                                                            className="w-full py-2 text-[12px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700"
                                                        >
                                                            Deploy output
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                                {rightPanelMode === "outputs" && outputs.length === 0 && (
                                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                                        <div className="mb-4 text-gray-300"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="16" cy="12" r="4" /><path d="M4 12h6M12 9l3 3-3 3" /></svg></div>
                                        <h4 className="text-[13px] font-bold text-gray-900 mb-1">Pipeline outputs</h4>
                                        <p className="text-[11px] text-gray-500 leading-relaxed mb-5">Pipeline outputs are the artifacts your pipeline builds.</p>
                                        <button
                                            onClick={() => {
                                                const sourceNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode")) : null;
                                                if (sourceNode) handleAddOutput(sourceNode.id);
                                            }}
                                            disabled={!selectedNodeId || !nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode"))}
                                            className="px-4 py-1.5 text-[12px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                                        >
                                            <Plus className="w-3 h-3" /> Add pipeline output
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Bottom Data Preview (resizable) ── */}
                        <div style={{ height: previewHeight }} className="border-t border-gray-300 bg-white flex flex-col shrink-0 relative">
                            <div onMouseDown={() => setIsResizingPreview(true)}
                                className="absolute top-0 left-0 right-0 h-1.5 cursor-row-resize z-50 hover:bg-blue-300 opacity-40 -translate-y-1/2" />

                            <div className="h-10 bg-[#f4f6f8] border-b border-gray-200 flex px-2 items-center shrink-0">
                                <button
                                    onClick={() => setPreviewTab("Input table")}
                                    className={`px-4 h-full text-[13px] font-semibold flex items-center gap-2 ${previewTab === "Input table" ? "text-blue-700 border-b-2 border-blue-600 bg-white" : "text-gray-500 hover:text-gray-900 border-b-2 border-transparent"}`}
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M4 12l4-4m-4 4l4 4" /></svg> Input table
                                </button>
                                <button
                                    onClick={() => setPreviewTab("Output table")}
                                    className={`px-4 h-full text-[13px] font-bold flex items-center gap-2 ${previewTab === "Output table" ? "text-blue-700 border-b-2 border-blue-600 bg-white" : "text-gray-500 hover:text-gray-900 border-b-2 border-transparent"}`}
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M20 12l-4-4m4 4l-4 4" /></svg> Output table
                                </button>
                                <div className="ml-auto flex items-center gap-4 pr-3">
                                    <span className="text-[11px] text-gray-500 font-medium">Showing {previewRows.length} rows</span>
                                    <span className="w-px h-3 bg-gray-300" />
                                    <span className="text-[11px] text-gray-500 font-medium">{previewColumns.length} columns</span>
                                    <div className="flex items-center gap-1.5 ml-2 text-gray-400"><Search className="w-3.5 h-3.5" /><span className="text-[12px]">Search columns...</span></div>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                                <div className="h-8 border-b border-gray-200 flex items-center px-4 bg-white shrink-0">
                                    <Database className="w-3.5 h-3.5 text-blue-500 mr-2" />
                                    <span className="text-[12px] font-bold text-gray-800">{activeNodeLabel}</span>
                                    <div className="ml-4 px-2 py-0.5 bg-gray-100 border border-gray-200 rounded flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-600">
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                        No input sampling
                                    </div>
                                    <button className="ml-auto text-[11px] font-semibold text-gray-500 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">Calculate row count</button>
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#f8fafc] sticky top-0 border-b border-gray-200 z-10 shadow-sm">
                                            <tr>
                                                <th className="w-8 border-r border-gray-200 bg-gray-100" />
                                                {previewColumns.map(col => (
                                                    <th key={col.name} className="px-3 py-1.5 border-r border-gray-200 font-normal min-w-[140px] align-top bg-[#f8fafc]">
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center text-[8px] font-bold text-gray-500">{col.type.slice(0, 2).toLowerCase()}</span>
                                                            <span className="text-[12px] font-semibold text-gray-800">{col.name}</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 pl-4">{col.type}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="text-[12px] text-gray-700 font-mono">
                                            {previewRows.map((row, rIdx) => (
                                                <tr key={rIdx} className="border-b border-gray-100 hover:bg-blue-50/30">
                                                    <td className="w-8 border-r border-gray-200 text-center text-gray-400 text-[10px] font-semibold bg-gray-50 py-1.5">{rIdx + 1}</td>
                                                    {previewColumns.map(col => {
                                                        const val = row[col.name] ?? "";
                                                        return (
                                                            <td key={col.name} className="px-3 py-1.5 border-r border-gray-100 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis">
                                                                {val === "null" || val === "" ? <span className="text-gray-400 italic">null</span> : val}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : editingUnion ? (
                    <div className="flex-1 bg-white relative flex flex-col z-0 min-w-0 overflow-hidden">
                        <UnionConfigBoard
                            state={editingUnion}
                            inputLabels={[
                                String(nodes.find((n) => n.id === editingUnion.inputNodeIds[0])?.data?.label ?? "Input 1"),
                                String(nodes.find((n) => n.id === editingUnion.inputNodeIds[1])?.data?.label ?? "Input 2"),
                            ]}
                            schemaError={unionSchemaError}
                            outputColumns={(nodes.find((n) => n.id === editingUnion.inputNodeIds[0])?.data?.columns ?? DEFAULT_COLUMNS) as { name: string; type: string }[]}
                            previewRows={unionPreviewRows}
                            onUpdate={(p) => setEditingUnion((u) => (u ? { ...u, ...p } : null))}
                            onRemoveInput={() => handleUnionCloseBoard()}
                            onCreateUnion={handleUnionCreateUnion}
                            onApply={handleUnionApplyBoard}
                            onClose={handleUnionCloseBoard}
                        />
                    </div>
                ) : activeJoinConfig && editingJoinConfig ? (
                    <div className="flex-1 bg-white relative flex flex-col z-0 min-w-0 overflow-hidden">
                        <JoinConfigBoard
                            joinConfig={editingJoinConfig}
                            leftLabel={nodes.find(n => n.id === editingJoinConfig.leftNodeId)?.data?.label ?? "Left Table"}
                            rightLabel={nodes.find(n => n.id === editingJoinConfig.rightNodeId)?.data?.label ?? "Right Table"}
                            leftRows={joinLeftRows}
                            rightRows={joinRightRows}
                            onUpdate={(cfg) => setEditingJoinConfig(cfg)}
                            onApply={handleJoinApply}
                            onClose={() => { setActiveJoinConfig(null); setEditingJoinConfig(null); }}
                        />
                    </div>
                ) : (
                    /* ═══ GRAPH MODE ═══ */
                    <div className="flex-1 bg-gray-50 relative flex flex-col z-0 min-w-0">
                        <div className="flex-1 relative min-w-0">
                            {nodes.length > 0 ? (
                                <div className="absolute inset-0">
                                    <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onSelectionChange={onSelectionChange} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} edges={edges}>
                                        <Background color="#e5e7eb" gap={16} />
                                        <Controls />
                                    </ReactFlow>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-[440px] bg-white border border-gray-200 rounded-sm shadow-sm flex flex-col z-10 overflow-hidden pointer-events-auto">
                                        <div className="p-6 pb-5 relative">
                                            <h2 className="text-[18px] font-bold text-gray-900 mb-2 mt-1">Welcome to Pipeline Builder</h2>
                                            <p className="text-[13px] text-gray-600 leading-relaxed pr-24">Get started by adding datasets, then define transform logic to derive target outputs.</p>
                                            <button className="mt-4 px-3 py-1.5 w-fit font-bold text-[13px] bg-white text-blue-700 border border-blue-600 rounded flex items-center gap-2 hover:bg-blue-50">
                                                <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-bold italic">i</span> Take a tour
                                            </button>
                                            <div className="absolute right-6 top-8 w-24 h-16 pointer-events-none opacity-80">
                                                <div className="absolute w-20 h-12 bg-gray-100 rounded border border-gray-200 right-0 top-0" />
                                                <div className="absolute w-12 h-14 bg-blue-50 border-2 border-blue-400 rounded left-0 bottom-0 shadow-sm" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col border-t border-gray-100 p-2 gap-1 pb-3">
                                            <ActionRow icon={<Download className="w-4 h-4 text-gray-600" />} title="Add Foundry data" desc="Recommended if you have already ingested data into Foundry." onClick={() => setIsAddDataOpen(true)} highlight />
                                            <ActionRow icon={<Database className="w-4 h-4 text-gray-600" />} title="Add data to Foundry" desc="Import data from outside Foundry and start using it now" onClick={() => { }} />
                                            <ActionRow icon={<UploadCloud className="w-4 h-4 text-gray-600" />} title="Upload from your computer" desc="Recommended if you have sample data available locally." onClick={() => setIsUploadOpen(true)} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Graph Mode Selection Preview Bottom Pane ── */}
                        {selectedNodeId && nodes.find(n => n.id === selectedNodeId) && (() => {
                            const selNode = nodes.find(n => n.id === selectedNodeId)!;
                            const filteredCols = (selectionPreviewParams?.columns ?? []).filter(c =>
                                colSearch === "" || c.name.toLowerCase().includes(colSearch.toLowerCase())
                            );
                            return (
                                <div
                                    style={{ height: previewHeight }}
                                    className="border-t border-gray-300 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.06)] z-20 flex flex-col shrink-0 relative min-w-0"
                                >
                                    {/* Resize handle */}
                                    <div
                                        className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50 group"
                                        onMouseDown={() => setIsResizingPreview(true)}
                                    >
                                        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors" />
                                    </div>

                                    {/* ── Tab Bar ── */}
                                    <div className="flex items-center gap-0 px-4 h-10 border-b border-gray-200 shrink-0 bg-white">
                                        {([
                                            { key: "preview", label: "Selection preview", icon: <Database className="w-3.5 h-3.5" /> },
                                            { key: "transforms", label: "Transformations", icon: <Workflow className="w-3.5 h-3.5" /> },
                                            { key: "suggestions", label: `Suggestions ${selectionSuggestions.length > 0 ? selectionSuggestions.length : ""}`, icon: <Sparkles className="w-3.5 h-3.5" /> },
                                        ] as const).map(tab => (
                                            <button
                                                key={tab.key}
                                                onClick={() => setSelectionTab(tab.key)}
                                                className={`h-full px-3 mr-1 border-b-[2px] text-[13px] flex items-center gap-1.5 whitespace-nowrap transition-colors ${selectionTab === tab.key
                                                    ? "border-blue-600 font-bold text-blue-700"
                                                    : "border-transparent font-medium text-gray-500 hover:text-gray-800"
                                                    }`}
                                            >
                                                <span className={selectionTab === tab.key ? "text-blue-600" : "text-gray-400"}>{tab.icon}</span>
                                                {tab.label}
                                            </button>
                                        ))}
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-[11px] font-semibold text-gray-500">{selNode.data?.label}</span>
                                            <button
                                                onClick={() => setSelectedNodeId(null)}
                                                className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* ═══ TAB: SELECTION PREVIEW ═══ */}
                                    {selectionTab === "preview" && (
                                        <div className="flex-1 overflow-hidden flex">
                                            {/* Left: column list */}
                                            <div className="w-[180px] border-r border-gray-200 flex flex-col shrink-0 bg-[#fafafa]">
                                                <div className="px-2 py-2 border-b border-gray-200">
                                                    <div className="relative">
                                                        <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
                                                        <input
                                                            value={colSearch}
                                                            onChange={e => setColSearch(e.target.value)}
                                                            type="text"
                                                            placeholder={`${(selectionPreviewParams?.columns ?? []).length} columns`}
                                                            className="w-full text-[11px] pl-6 pr-2 py-1 bg-white border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto py-0.5">
                                                    {filteredCols.map(c => (
                                                        <div key={c.name} className="px-2 py-1 text-[11px] text-gray-700 font-mono truncate hover:bg-blue-50/60 cursor-pointer flex items-center gap-1.5">
                                                            <span className="w-4 h-4 rounded bg-gray-100 text-[9px] flex items-center justify-center text-gray-400 shrink-0 font-bold">{c.type.slice(0, 2).toLowerCase()}</span>
                                                            {c.name}
                                                        </div>
                                                    ))}
                                                    {filteredCols.length === 0 && <div className="p-3 text-[11px] text-gray-400 italic text-center">No match</div>}
                                                </div>
                                                {/* Stats footer */}
                                                <div className="border-t border-gray-200 px-2 py-1.5 text-[10px] text-gray-500 space-y-0.5">
                                                    <div className="flex justify-between"><span>Rows</span><span className="font-semibold text-gray-700">{(selectionPreviewParams?.rows ?? []).length}</span></div>
                                                    <div className="flex justify-between"><span>Columns</span><span className="font-semibold text-gray-700">{(selectionPreviewParams?.columns ?? []).length}</span></div>
                                                </div>
                                            </div>

                                            {/* Right: data table */}
                                            <div className="flex-1 overflow-auto bg-white">
                                                {(selectionPreviewParams?.rows ?? []).length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                                        <Database className="w-8 h-8 opacity-30" />
                                                        <p className="text-[13px] italic">No data rows — dataset may be empty or still loading</p>
                                                    </div>
                                                ) : (
                                                    <table className="w-full text-left border-collapse min-w-max">
                                                        <thead className="sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                                                            <tr>
                                                                <th className="w-8 border-r border-gray-200 bg-gray-50" />
                                                                {filteredCols.map(col => (
                                                                    <th key={col.name} className="px-3 py-2 border-r border-gray-200 bg-gray-50 font-normal min-w-[110px] max-w-[180px]">
                                                                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 truncate">
                                                                            <Type className="w-3 h-3 text-gray-400 shrink-0" />{col.name}
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-400 uppercase tracking-wide pl-4">{col.type}</div>
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="text-[12px] text-gray-700 font-mono">
                                                            {(selectionPreviewParams?.rows ?? []).slice(0, 100).map((row, rIdx) => (
                                                                <tr key={rIdx} className="border-b border-gray-100 hover:bg-blue-50/25 group">
                                                                    <td className="w-8 border-r border-gray-200 text-center text-[10px] text-gray-400 bg-[#fafafa] group-hover:bg-blue-50/40 py-1.5 font-semibold">{rIdx + 1}</td>
                                                                    {filteredCols.map(col => {
                                                                        const val = row[col.name] ?? "";
                                                                        return (
                                                                            <td key={col.name} className="px-3 py-1.5 border-r border-gray-100 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis">
                                                                                {val === "null" || val === "" ? <span className="text-gray-300 italic">null</span> : val}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ TAB: TRANSFORMATIONS ═══ */}
                                    {selectionTab === "transforms" && (
                                        <div className="flex-1 overflow-auto bg-[#fafafa] p-6">
                                            <div className="max-w-2xl mx-auto">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <h3 className="text-[15px] font-bold text-gray-900">Transform chain — {selNode.data?.label}</h3>
                                                        <p className="text-[13px] text-gray-500 mt-1">{nodeTransforms.length === 0 ? "No transforms applied yet" : `${nodeTransforms.filter(t => t.applied).length} of ${nodeTransforms.length} transforms applied`}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedNodeId(null); handleTransformOpen(selectedNodeId!); }}
                                                        className="px-3 py-1.5 text-[12px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1.5"
                                                    >
                                                        <Workflow className="w-3.5 h-3.5" /> Open Transform Board
                                                    </button>
                                                </div>

                                                {nodeTransforms.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3 border border-dashed border-gray-300 rounded-lg bg-white mt-4">
                                                        <Workflow className="w-10 h-10 opacity-20 text-blue-500" />
                                                        <p className="text-[13px] italic">No transforms defined for this node</p>
                                                        <button
                                                            onClick={() => { setSelectedNodeId(null); handleTransformOpen(selectedNodeId!); }}
                                                            className="mt-2 px-4 py-1.5 text-[12px] font-bold text-blue-600 border border-blue-400 rounded-md hover:bg-blue-50 shadow-sm transition-colors"
                                                        >
                                                            + Add transforms
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-3 mt-4">
                                                        {nodeTransforms.map((t, idx) => (
                                                            <div key={t.id} className={`bg-white rounded-lg border shadow-sm px-4 py-3 flex items-start gap-4 transition-colors ${t.applied ? "border-green-300 bg-green-50/20" : "border-gray-200"
                                                                }`}>
                                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5 ${t.applied ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                                                    }`}>{idx + 1}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[14px] font-bold text-gray-900">{t.type}</span>
                                                                        {t.applied ? <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded tracking-wide">APPLIED</span> : <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded tracking-wide">PENDING</span>}
                                                                    </div>
                                                                    <div className="text-[12px] text-gray-600 mt-1.5 font-mono bg-gray-50 rounded p-2 border border-gray-100">
                                                                        {Object.entries(t.params || {}).map(([k, v]) => (
                                                                            <span key={k} className="mr-4 inline-block"><span className="text-gray-400">{k}:</span> <span className="text-gray-800 font-semibold">{String(v)}</span></span>
                                                                        ))}
                                                                        {Object.keys(t.params || {}).length === 0 && <span className="text-gray-400 italic">No parameters</span>}
                                                                    </div>
                                                                </div>
                                                                {t.applied && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-1" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ TAB: SUGGESTIONS ═══ */}
                                    {selectionTab === "suggestions" && (
                                        <div className="flex-1 overflow-auto bg-[#fafafa] p-6">
                                            <div className="max-w-2xl mx-auto">
                                                <div className="flex items-center gap-2 mb-5">
                                                    <Sparkles className="w-5 h-5 text-amber-500" />
                                                    <h3 className="text-[15px] font-bold text-gray-900">AI Suggestions</h3>
                                                    <span className="ml-auto text-[11px] text-gray-400 italic font-mono bg-white px-2 py-1 rounded border border-gray-200">Powered by schema inference</span>
                                                </div>

                                                {selectionSuggestions.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3 border border-dashed border-gray-300 rounded-lg bg-white">
                                                        <CheckCircle2 className="w-10 h-10 opacity-30 text-green-500" />
                                                        <p className="text-[13px] italic">Your schema looks perfectly optimized!</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-3">
                                                        {selectionSuggestions.map((s, i) => (
                                                            <div key={i} className={`bg-white rounded-lg border shadow-sm px-4 py-3 flex items-start gap-4 transition-all hover:shadow-md ${s.severity === "warning" ? "border-amber-300 bg-amber-50/20" :
                                                                s.severity === "tip" ? "border-blue-300 bg-blue-50/20" :
                                                                    "border-gray-200 hover:border-gray-300"
                                                                }`}>
                                                                <span className="text-2xl shrink-0 mt-1">{s.icon}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-[14px] font-bold text-gray-900 mb-1">{s.title}</div>
                                                                    <div className="text-[12.5px] text-gray-600 leading-relaxed">{s.desc}</div>
                                                                </div>
                                                                <span className={`text-[10px] font-bold px-2 py-1 rounded shrink-0 tracking-wide mt-1 ${s.severity === "warning" ? "bg-amber-100 text-amber-800" :
                                                                    s.severity === "tip" ? "bg-blue-100 text-blue-800" :
                                                                        "bg-gray-100 text-gray-700"
                                                                    }`}>{s.severity.toUpperCase()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {!activeTransformNodeId && (
                    <div style={{ width: rightPanelWidth }} className="border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto relative">
                        <div onMouseDown={() => setIsResizingRightPanel(true)} className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-blue-300 opacity-40 -translate-x-1/2" />
                        <div className="h-10 border-b border-gray-200 flex items-center justify-between px-3 shrink-0">
                            <span className="text-[13px] font-bold text-gray-900">{
                                rightPanelMode === "deploy" ? "Deploy this pipeline" :
                                    pendingOutputSourceId ? "Select output type" : "Pipeline outputs"
                            }</span>
                            <div className="flex items-center gap-2">
                                <button className="text-gray-400 hover:text-gray-700"><Settings className="w-3.5 h-3.5" /></button>
                                <button
                                    onClick={() => {
                                        const sourceNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode")) : null;
                                        if (sourceNode) handleAddOutput(sourceNode.id);
                                    }}
                                    disabled={!selectedNodeId || !nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode"))}
                                    className="px-2 py-1 text-[12px] font-semibold text-gray-700 border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            </div>
                        </div>
                        {rightPanelMode === "deploy" ? (
                            <div className="flex-1 flex flex-col">
                                <div className="p-4 border-b border-gray-200 text-[12px] text-gray-500">
                                    Update pipeline logic and build target outputs.
                                </div>
                                <div className="p-4 space-y-5 flex-1 overflow-y-auto">
                                    <div>
                                        <div className="text-[12px] font-bold text-gray-900 mb-2">Last deployment</div>
                                        <div className="text-[12px] text-gray-600 font-medium">{deployState?.lastDeploymentAt ? new Date(deployState.lastDeploymentAt).toLocaleString() : "None"}</div>
                                    </div>

                                    {!isDeploying && (
                                        <>
                                            <div className="pt-1">
                                                <div className="flex items-center justify-between mb-3 text-[12px]">
                                                    <span className="font-bold text-gray-900">Compute profile</span>
                                                    <button className="text-blue-600 font-semibold hover:underline">Configure</button>
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="flex-1 flex flex-col gap-1">
                                                        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Default</div>
                                                        <div className="px-3 py-1.5 border border-gray-200 rounded text-[12px] bg-gray-50 flex items-center justify-between">
                                                            <span className="font-medium">Extra small</span>
                                                            <ChevronDown className="w-3 h-3 text-gray-400" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-[12px] font-bold text-gray-900 mb-2">Select outputs to build</div>
                                                <div className="space-y-2 border border-gray-100 rounded p-2">
                                                    <div className="flex items-center gap-2 text-[12px] text-gray-800">
                                                        <ChevronDown className="w-3 h-3 text-gray-400" />
                                                        <input type="checkbox" checked readOnly className="accent-blue-600" />
                                                        <span className="font-bold">All</span>
                                                    </div>
                                                    <div className="ml-5 flex items-center gap-2 text-[12px] text-gray-800">
                                                        <ChevronDown className="w-3 h-3 text-gray-400" />
                                                        <input type="checkbox" checked readOnly className="accent-blue-600" />
                                                        <span className="font-bold">Single jobs</span>
                                                    </div>
                                                    <div className="ml-10 space-y-2">
                                                        {outputs.length === 0 ? (
                                                            <div className="text-[12px] text-gray-500 italic">No outputs defined</div>
                                                        ) : outputs.map((output) => (
                                                            <label key={output.id} className="flex items-center gap-2 text-[12px] text-gray-800 cursor-pointer group">
                                                                <input type="checkbox" checked readOnly className="accent-blue-600" />
                                                                <Grid className="w-3 h-3 text-blue-500" />
                                                                <span className="font-medium group-hover:text-blue-600">{output.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {isDeploying && (
                                        <div className="space-y-4">
                                            <div className="bg-[#f8f9fa] border border-gray-200 rounded p-4 shadow-sm">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                                        <span className="text-[14px] font-bold text-gray-900">Running task 1/1</span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-400 font-mono">1/1</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-[12px] mb-6">
                                                    <div>
                                                        <div className="text-gray-400 mb-0.5 uppercase text-[10px] font-bold tracking-wider">Start time</div>
                                                        <div className="text-gray-700 font-medium">Aug 28, 2025, 3:56 PM</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-400 mb-0.5 uppercase text-[10px] font-bold tracking-wider">Duration</div>
                                                        <div className="text-gray-700 font-medium">11s</div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-3 border-t border-gray-100">
                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Deployment tasks</div>
                                                    <div className="flex items-center gap-2 text-[12px] text-gray-700">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                        <span className="font-medium">Deployed logic for 1 target</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[12px] text-gray-700">
                                                        <span className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                                                        <span className="font-medium">Building output (0/1)</span>
                                                        <button className="ml-auto text-blue-600 font-semibold hover:underline">Build report</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <button className="w-full py-2 border border-red-200 text-red-600 text-[13px] font-bold rounded hover:bg-red-50 transition-colors">
                                                Cancel deployment
                                            </button>
                                            <button className="w-full py-2 bg-blue-600 text-white text-[13px] font-bold rounded hover:bg-blue-700 shadow-md transition-all active:scale-[0.98]">
                                                View deployment history
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-gray-200 flex items-center gap-2">
                                    <button
                                        onClick={() => setRightPanelMode("outputs")}
                                        className="flex-1 py-1.5 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-1.5"
                                    >
                                        <Grid className="w-3 h-3" /> View changes
                                    </button>
                                    <button
                                        onClick={() => void handleDeployPipeline()}
                                        disabled={outputs.length === 0 || isDeploying}
                                        className="flex-2 py-1.5 px-4 text-[12px] font-bold text-white bg-[#1a7f37] rounded hover:bg-[#156d2f] disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                    >
                                        {isDeploying ? (
                                            <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deploying...</>
                                        ) : (
                                            <><Settings className="w-3 h-3 rotate-90" /> Deploy pipeline</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (pendingOutputSourceId && !selectedOutputId) ? (
                            <div className="flex-1 p-5 overflow-y-auto">
                                <div className="flex items-center gap-2 text-gray-500 mb-6 cursor-pointer hover:text-gray-900 transition-colors" onClick={() => setPendingOutputSourceId(null)}>
                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                    <span className="text-[12px] font-medium">Back to outputs</span>
                                </div>

                                <h4 className="text-[15px] font-bold text-gray-900 mb-1">Add output</h4>
                                <p className="text-[12px] text-gray-500 mb-6 leading-relaxed">Choose how you would like to write the data from <span className="font-bold text-gray-700">{nodes.find(n => n.id === pendingOutputSourceId)?.data?.label}</span></p>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => handleCreateNewDatasetOutput(pendingOutputSourceId)}
                                        className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group shadow-sm"
                                    >
                                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors shrink-0">
                                            <Database className="w-5 h-5 text-blue-600 group-hover:text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13.5px] font-bold text-gray-900 group-hover:text-blue-700 transition-colors">New dataset</div>
                                            <div className="text-[11.5px] text-gray-500 font-medium">Create and deploy a new dataset within the current project.</div>
                                        </div>
                                    </button>

                                    <div className="opacity-50 cursor-not-allowed">
                                        <div className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-lg text-left bg-gray-50/30">
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                                <UploadCloud className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[13.5px] font-bold text-gray-400">Stream</div>
                                                <div className="text-[11.5px] text-gray-400 font-medium">Write to an existing stream or create a new one.</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="opacity-50 cursor-not-allowed">
                                        <div className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-lg text-left bg-gray-50/30">
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                                <Plus className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[13.5px] font-bold text-gray-400">Existing dataset</div>
                                                <div className="text-[11.5px] text-gray-400 font-medium">Select an existing dataset as the write target.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : outputs.length === 0 ? (
                            <>
                                <div className="flex-1 p-6 flex flex-col items-center justify-center text-center mt-12">
                                    <div className="mb-4 text-gray-300"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="16" cy="12" r="4" /><path d="M4 12h6M12 9l3 3-3 3" /></svg></div>
                                    <h4 className="text-[14px] font-bold text-gray-900 mb-2">Pipeline outputs</h4>
                                    <p className="text-[12px] text-gray-500 leading-relaxed mb-6 px-1">Pipeline Builder ensures all outputs are defined, healthy, and ready to deploy.</p>
                                    <button
                                        onClick={() => {
                                            const sourceNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode")) : null;
                                            if (sourceNode) handleAddOutput(sourceNode.id);
                                        }}
                                        disabled={!selectedNodeId || !nodes.find((node) => node.id === selectedNodeId && (node.type === "datasetNode" || node.type === "transformNode"))}
                                        className="px-4 py-1.5 text-[13px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add pipeline output
                                    </button>
                                </div>
                                <div className="p-4 border-t border-gray-200 mt-auto">
                                    <h3 className="text-[12px] font-bold text-gray-900 mb-3 uppercase tracking-wider">Output settings</h3>
                                    <div className="mb-3"><span className="text-[12px] text-gray-500 block mb-0.5">Target ontology</span><span className="text-[12px] font-medium text-gray-800 italic">No ontology selected</span></div>
                                    <div className="mb-4"><span className="text-[12px] text-gray-500 block mb-0.5">Output folder</span><span className="text-[12px] font-medium text-gray-800">{pipeline?.projectName ? `/${pipeline.projectName}` : "Project workspace"}</span></div>
                                    <button className="w-full py-1 text-[13px] font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Edit output settings</button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="border-b border-gray-200 px-3 py-2 space-y-2">
                                    {outputs.map((output) => (
                                        <button
                                            key={output.id}
                                            onClick={() => setSelectedOutputId(output.id)}
                                            className={`w-full text-left rounded border px-3 py-2 ${selectedOutputId === output.id ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
                                        >
                                            <div className="text-[12px] font-bold text-gray-900">{output.name}</div>
                                            <div className="text-[11px] text-gray-500">{output.status === "deployed" ? "Deployed" : output.status === "deploying" ? "Deploying" : "Draft"}</div>
                                        </button>
                                    ))}
                                </div>
                                {selectedOutputId && (() => {
                                    const selectedOutput = outputs.find((output) => output.id === selectedOutputId);
                                    if (!selectedOutput) return null;
                                    return (
                                        <div className="flex-1 overflow-y-auto">
                                            <div className="p-4 space-y-4">
                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Dataset name</label>
                                                    <input
                                                        value={selectedOutput.name}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setOutputs((prev) => prev.map((output) => output.id === selectedOutput.id ? { ...output, name: value, fileName: `${sanitizeOutputName(value)}.csv` } : output));
                                                            setNodes((prev) => prev.map((node) => node.id === selectedOutput.nodeId ? { ...node, data: { ...node.data, label: value } } : node));
                                                        }}
                                                        className="w-full border border-gray-300 rounded px-3 py-2 text-[13px] text-gray-900 focus:ring-1 focus:ring-blue-500 outline-none"
                                                        placeholder="e.g. all_orders"
                                                    />
                                                    <p className="mt-1 text-[10px] text-gray-400 italic">Rename this output to <span className="font-bold text-gray-500">all_orders</span> for the tutorial.</p>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">File name</div>
                                                    <div className="text-[12px] text-gray-800 font-medium">{selectedOutput.fileName}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Source node</div>
                                                    <div className="text-[12px] text-gray-800 font-medium">{nodes.find((node) => node.id === selectedOutput.sourceNodeId)?.data?.label ?? selectedOutput.sourceNodeId}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Mapped columns</div>
                                                    <div className="max-h-[320px] overflow-y-auto border border-gray-200 rounded bg-white">
                                                        {selectedOutput.columns.map((column) => {
                                                            const isSelected = !selectedOutput.selectedColumnNames || selectedOutput.selectedColumnNames.includes(column.name);
                                                            const typeLower = column.type.toLowerCase();
                                                            return (
                                                                <div key={column.name} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 text-[12px] group hover:bg-blue-50/30 transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;
                                                                            const currentSelected = selectedOutput.selectedColumnNames ?? selectedOutput.columns.map(c => c.name);
                                                                            const nextSelected = checked
                                                                                ? [...currentSelected, column.name]
                                                                                : currentSelected.filter(c => c !== column.name);
                                                                            setOutputs(prev => prev.map(o => o.id === selectedOutput.id ? { ...o, selectedColumnNames: nextSelected } : o));
                                                                        }}
                                                                        className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                                                                    />
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        {typeLower.includes("string") ? <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1 rounded shrink-0">abc</span> :
                                                                            typeLower.includes("int") || typeLower.includes("long") || typeLower.includes("double") ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1 rounded shrink-0">123</span> :
                                                                                typeLower.includes("time") || typeLower.includes("date") ? <LucideClock className="w-3 h-3 text-amber-600 shrink-0" /> :
                                                                                    <div className="w-3 h-3 bg-gray-200 rounded shrink-0" />}
                                                                        <span className={`text-gray-900 font-medium truncate ${!isSelected ? "opacity-40" : ""}`}>{column.name}</span>
                                                                    </div>
                                                                    <div className="hidden group-hover:flex items-center gap-1.5 shrink-0">
                                                                        <button className="text-gray-400 hover:text-gray-600"><Edit3 className="w-3 h-3" /></button>
                                                                        <button className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="mt-2 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <button className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                                                                <RefreshCw className="w-2.5 h-2.5" /> Use upstream schema
                                                            </button>
                                                            <button className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                                                                <Plus className="w-2.5 h-2.5" /> Add column
                                                            </button>
                                                        </div>
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            {selectedOutput.selectedColumnNames?.length ?? selectedOutput.columns.length} of {selectedOutput.columns.length} selected
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="pt-2 space-y-1">
                                                    {[
                                                        { label: "Configure expectations", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                                                        { label: "Configure write mode", icon: <Database className="w-3.5 h-3.5" />, value: "Snapshot" },
                                                        { label: "Configure write format", icon: <FileText className="w-3.5 h-3.5" />, value: "Parquet" },
                                                        { label: "Configure markings", icon: <LucideLock className="w-3.5 h-3.5" /> }
                                                    ].map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg bg-[#fafafa] hover:bg-white transition-all cursor-pointer group shadow-sm transition-all hover:border-gray-300">
                                                            <div className="flex items-center gap-2.5">
                                                                <span className="text-gray-400 group-hover:text-blue-500 transition-colors">{item.icon}</span>
                                                                <span className="text-[12.5px] font-bold text-gray-900">{item.label}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-gray-500">
                                                                {item.value && <span className="text-[11.5px] font-medium bg-gray-100 px-2 py-0.5 rounded text-gray-600">{item.value}</span>}
                                                                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="p-4 border-t border-gray-200">
                                                <button
                                                    onClick={() => setRightPanelMode("deploy")}
                                                    className="w-full py-2 text-[12px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700"
                                                >
                                                    Deploy output
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AddDataModal
                isOpen={isAddDataOpen}
                onClose={() => setIsAddDataOpen(false)}
                pipelineId={pipelineId}
                onAdd={(datasets) => {
                    const newNodes = datasets.map((d, i) => ({
                        id: `dataset-${d.id}-${Date.now() + i}`,
                        position: { x: 180 + i * 300, y: 200 },
                        data: { label: d.name, datasetId: d.id, columns: d.columns ?? DEFAULT_COLUMNS, onTransform: handleTransformOpen, onJoin: handleJoinStart, onUnion: handleUnionStart, onAddOutput: handleAddOutput },
                        type: "datasetNode"
                    }));
                    setNodes(prev => [...prev, ...newNodes]);
                }}
            />
            {pipeline?.projectId && (
                <UploadFilesModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} projectId={pipeline.projectId} folderId={pipeline.projectId} />
            )}

            {/* ── Join Step 1: Pick right dataset overlay ── */}
            {joinPickerNodeId && (
                <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                            <div className="text-[14px] font-bold text-gray-900">Select another table to join</div>
                            <div className="text-[12px] text-gray-500">
                                Left: <span className="font-semibold text-gray-800">{nodes.find(n => n.id === joinPickerNodeId)?.data?.label ?? ""}</span>
                            </div>
                        </div>
                        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-[12px] text-gray-500">
                            Select the <strong>right table</strong> on the graph or in the list below, then press <strong>Start</strong> (Palantir: Clean Bureau → Join → consolidated_customers → Start).
                        </div>
                        <div className="flex-1 overflow-y-auto py-2">
                            {nodes.filter(n => n.id !== joinPickerNodeId && (n.type === "datasetNode" || n.type === "transformNode")).map(n => (
                                <div
                                    key={n.id}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setJoinPendingRightId(n.id); } }}
                                    onClick={() => setJoinPendingRightId(n.id)}
                                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left border-b border-gray-100 cursor-pointer group ${joinPendingRightId === n.id ? "bg-blue-100 ring-1 ring-inset ring-blue-300" : "hover:bg-blue-50"}`}
                                >
                                    <span className="w-8 h-8 bg-indigo-50 border border-indigo-200 rounded flex items-center justify-center">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
                                    </span>
                                    <div>
                                        <div className="text-[13px] font-semibold text-gray-900">{n.data?.label}</div>
                                        <div className="text-[11px] text-gray-400">{Array.isArray(n.data?.columns) && n.data.columns.length > 0 ? n.data.columns.length : 0} columns</div>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setNodes(v => v.map(nx => nx.id === n.id ? { ...nx, data: { ...nx.data, columns: [] } } : nx));
                                            }}
                                            className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                                            title="Clear stale column cache and re-fetch from backend"
                                        >
                                            Refresh Schema
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {nodes.filter(n => n.id !== joinPickerNodeId && (n.type === "datasetNode" || n.type === "transformNode")).length === 0 && (
                                <div className="px-5 py-8 text-center text-[13px] text-gray-400 italic">No other datasets or transforms on the canvas. Add another dataset first.</div>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-gray-200 flex justify-between items-center gap-3">
                            <div className="text-[11px] text-gray-500 truncate">
                                {joinPendingRightId
                                    ? <>Right: <span className="font-semibold text-gray-800">{nodes.find(x => x.id === joinPendingRightId)?.data?.label ?? joinPendingRightId}</span></>
                                    : <>No right table selected yet</>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { setJoinPickerNodeId(null); setJoinPendingRightId(null); }}
                                    className="px-4 py-1.5 text-[13px] font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!joinPendingRightId}
                                    onClick={() => joinPendingRightId && void handleJoinSelectRight(joinPendingRightId)}
                                    className={`px-4 py-1.5 text-[13px] font-bold rounded text-white border ${joinPendingRightId ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-700" : "bg-gray-300 border-gray-300 cursor-not-allowed"}`}
                                >
                                    Start
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {unionPickerAnchorId && (
                <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-[540px] max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200">
                            <div className="text-[14px] font-bold text-gray-900">Union datasets</div>
                            <div className="text-[12px] text-gray-500 mt-1">
                                First branch:{" "}
                                <span className="font-semibold text-gray-800">
                                    {nodes.find((n) => n.id === unionPickerAnchorId)?.data?.label ?? ""}
                                </span>
                            </div>
                        </div>
                        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-[12px] text-gray-600">
                            Select <strong>Join Bureau</strong> (or another node with the same schema), on the graph or below, then press{" "}
                            <strong>Start</strong>. Hold <strong>Cmd/Ctrl</strong> while clicking on the graph to refine selection.
                        </div>
                        <div className="flex-1 overflow-y-auto py-2">
                            {nodes
                                .filter(
                                    (n) =>
                                        n.id !== unionPickerAnchorId && (n.type === "datasetNode" || n.type === "transformNode")
                                )
                                .map((n) => (
                                    <div
                                        key={n.id}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setUnionPendingSecondId(n.id);
                                            }
                                        }}
                                        onClick={() => setUnionPendingSecondId(n.id)}
                                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left border-b border-gray-100 cursor-pointer ${unionPendingSecondId === n.id ? "bg-red-50 ring-1 ring-inset ring-red-200" : "hover:bg-red-50/60"}`}
                                    >
                                        <span className="w-8 h-8 bg-red-50 border border-red-200 rounded flex items-center justify-center">
                                            <span className="w-3.5 h-3.5 bg-red-500 border border-red-700 rounded-sm" />
                                        </span>
                                        <div>
                                            <div className="text-[13px] font-semibold text-gray-900">{n.data?.label}</div>
                                            <div className="text-[11px] text-gray-400">
                                                {Array.isArray(n.data?.columns) && n.data.columns.length > 0 ? n.data.columns.length : 0}{" "}
                                                columns
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            {nodes.filter(
                                (n) => n.id !== unionPickerAnchorId && (n.type === "datasetNode" || n.type === "transformNode")
                            ).length === 0 && (
                                    <div className="px-5 py-8 text-center text-[13px] text-gray-400 italic">
                                        No other nodes to union. Add another dataset or join output first.
                                    </div>
                                )}
                        </div>
                        <div className="px-5 py-3 border-t border-gray-200 flex justify-between items-center gap-3">
                            <div className="text-[11px] text-gray-500 truncate">
                                {unionPendingSecondId ? (
                                    <>
                                        Second:{" "}
                                        <span className="font-semibold text-gray-800">
                                            {nodes.find((x) => x.id === unionPendingSecondId)?.data?.label ?? unionPendingSecondId}
                                        </span>
                                    </>
                                ) : (
                                    <>Pick the second input</>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUnionPickerAnchorId(null);
                                        setUnionPendingSecondId(null);
                                    }}
                                    className="px-4 py-1.5 text-[13px] font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!unionPendingSecondId}
                                    onClick={() => void handleUnionPickerConfirm()}
                                    className={`px-4 py-1.5 text-[13px] font-bold rounded text-white border ${unionPendingSecondId ? "bg-red-600 hover:bg-red-700 border-red-700" : "bg-gray-300 border-gray-300 cursor-not-allowed"}`}
                                >
                                    Start
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
