"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { X, ChevronDown, Plus, ArrowLeftRight, Database, Save, Edit3, Search, Check } from "lucide-react";

export interface JoinColumn {
    name: string;
    type: string;
    selected: boolean;
}

export interface MatchCondition {
    leftCol: string;
    operator: "is equal to" | "is not equal to" | "is less than" | "is greater than" | "is less than or equal to" | "is greater than or equal to";
    rightCol: string;
}

export interface JoinConfig {
    id: string;
    name: string;
    joinType: "Left join" | "Right join" | "Inner join" | "Full outer join" | "Cross join";
    leftNodeId: string;
    rightNodeId: string;
    conditions: MatchCondition[];
    leftColumns: JoinColumn[];
    rightColumns: JoinColumn[];
    applied: boolean;
}

interface Props {
    joinConfig: JoinConfig;
    leftLabel: string;
    rightLabel: string;
    leftRows: Record<string, string>[];
    rightRows: Record<string, string>[];
    onUpdate: (config: JoinConfig) => void;
    onApply: (config: JoinConfig) => void;
    onClose: () => void;
}

const JOIN_TYPES = ["Left join", "Right join", "Inner join", "Full outer join", "Cross join"] as const;
const OPERATORS = ["is equal to", "is not equal to", "is less than", "is greater than", "is less than or equal to", "is greater than or equal to"] as const;

const JOIN_DESCRIPTIONS: Record<string, string> = {
    "Left join": "Keeps all rows from the left table and only matching rows from the right.",
    "Right join": "Keeps all rows from the right table and only matching rows from the left.",
    "Inner join": "Returns only rows where the join condition is satisfied in both tables.",
    "Full outer join": "Returns all rows from both tables, with nulls where there is no match.",
    "Cross join": "Returns the Cartesian product of both tables.",
};

function computeJoinedRows(leftRows: Record<string, string>[], rightRows: Record<string, string>[], config: JoinConfig): Record<string, string>[] {
    if (!config.conditions.length || !config.conditions[0].leftCol || !config.conditions[0].rightCol) return [];
    const leftSel = config.leftColumns.filter(c => c.selected).map(c => c.name);
    const rightSel = config.rightColumns.filter(c => c.selected).map(c => c.name);
    const joined: Record<string, string>[] = [];
    for (const lRow of leftRows) {
        let matched = false;
        for (const rRow of rightRows) {
            const ok = config.conditions.every(cond => {
                if (!cond.leftCol || !cond.rightCol) return true;
                const lv = lRow[cond.leftCol] ?? "", rv = rRow[cond.rightCol] ?? "";
                if (cond.operator === "is equal to") return lv === rv;
                if (cond.operator === "is not equal to") return lv !== rv;
                if (cond.operator === "is less than") return lv < rv;
                if (cond.operator === "is greater than") return lv > rv;
                return false;
            });
            if (ok) {
                matched = true;
                const row: Record<string, string> = {};
                leftSel.forEach(c => { row[c] = lRow[c] ?? ""; });
                rightSel.forEach(c => { row[c] = rRow[c] ?? ""; });
                joined.push(row);
            }
        }
        if (!matched && config.joinType === "Left join") {
            const row: Record<string, string> = {};
            leftSel.forEach(c => { row[c] = lRow[c] ?? ""; });
            rightSel.forEach(c => { row[c] = ""; });
            joined.push(row);
        }
    }
    return joined;
}

function ColPicker({ value, columns, onChange, placeholder = "Select a column" }: {
    value: string; columns: JoinColumn[]; onChange: (v: string) => void; placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        if (open) document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, [open]);
    const filtered = columns.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));
    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 border border-gray-300 rounded bg-white text-[11px] text-gray-800 px-2 py-1 min-w-[160px] hover:border-blue-400 focus:outline-none transition-colors">
                <span className="flex-1 text-left truncate">{value || <span className="text-gray-400">{placeholder}</span>}</span>
                <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-[200] top-full mt-0.5 bg-white border border-gray-300 rounded shadow-xl w-[220px] overflow-hidden">
                    <div className="p-1.5 border-b border-gray-100">
                        <div className="relative">
                            <Search className="w-2.5 h-2.5 absolute left-2 top-1.5 text-gray-400" />
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                                placeholder="Filter..." className="w-full pl-6 pr-2 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-blue-400" />
                        </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto py-0.5">
                        {filtered.length === 0 && <div className="px-3 py-1.5 text-[11px] text-gray-400 italic">No matches</div>}
                        {filtered.map(c => (
                            <button key={c.name} onClick={() => { onChange(c.name); setOpen(false); setQ(""); }}
                                className={`w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-blue-50 text-[11px] ${c.name === value ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
                                <span className="text-[9px] text-gray-400 w-6 text-right shrink-0">{c.type.slice(0, 2)}</span>
                                <span className="flex-1 truncate">{c.name}</span>
                                {c.name === value && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function JoinConfigBoard({ joinConfig, leftLabel, rightLabel, leftRows, rightRows, onUpdate, onApply, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<"Left input table" | "Right input table" | "Joined table" | "Errors">("Joined table");
    const [previewH, setPreviewH] = useState(200);
    const [joinTypeOpen, setJoinTypeOpen] = useState(false);
    const joinTypeRef = useRef<HTMLDivElement>(null);
    const [leftQ, setLeftQ] = useState("");
    const [rightQ, setRightQ] = useState("");
    const [leftMode, setLeftMode] = useState<"All" | "Selected" | "Not selected">("All");
    const [rightMode, setRightMode] = useState<"All" | "Selected" | "Not selected">("All");

    useEffect(() => {
        const fn = (e: MouseEvent) => { if (joinTypeRef.current && !joinTypeRef.current.contains(e.target as Node)) setJoinTypeOpen(false); };
        if (joinTypeOpen) document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, [joinTypeOpen]);

    const up = (p: Partial<JoinConfig>) => onUpdate({ ...joinConfig, ...p });
    const upCond = (i: number, p: Partial<MatchCondition>) => up({ conditions: joinConfig.conditions.map((c, j) => j === i ? { ...c, ...p } : c) });
    const addCond = () => up({ conditions: [...joinConfig.conditions, { leftCol: "", operator: "is equal to", rightCol: "" }] });
    const rmCond = (i: number) => up({ conditions: joinConfig.conditions.filter((_, j) => j !== i) });
    const togL = (n: string) => up({ leftColumns: joinConfig.leftColumns.map(c => c.name === n ? { ...c, selected: !c.selected } : c) });
    const togR = (n: string) => up({ rightColumns: joinConfig.rightColumns.map(c => c.name === n ? { ...c, selected: !c.selected } : c) });
    const selAllL = (v: boolean) => up({ leftColumns: joinConfig.leftColumns.map(c => ({ ...c, selected: v })) });
    const selAllR = (v: boolean) => up({ rightColumns: joinConfig.rightColumns.map(c => ({ ...c, selected: v })) });

    const joinedRows = useMemo(() => computeJoinedRows(leftRows, rightRows, joinConfig), [leftRows, rightRows, joinConfig]);
    const joinedCols = [
        ...joinConfig.leftColumns.filter(c => c.selected).map(c => ({ ...c, _side: "left" as const })),
        ...joinConfig.rightColumns.filter(c => c.selected).map(c => ({ ...c, _side: "right" as const })),
    ];
    const previewRows = activeTab === "Left input table" ? leftRows : activeTab === "Right input table" ? rightRows : joinedRows;
    const previewCols = activeTab === "Left input table"
        ? joinConfig.leftColumns.filter(c => c.selected).map(c => ({ ...c, _side: "left" as const }))
        : activeTab === "Right input table"
            ? joinConfig.rightColumns.filter(c => c.selected).map(c => ({ ...c, _side: "right" as const }))
            : joinedCols;

    const filtL = joinConfig.leftColumns.filter(c => {
        const ms = !leftQ || c.name.toLowerCase().includes(leftQ.toLowerCase());
        const mm = leftMode === "All" || (leftMode === "Selected" ? c.selected : !c.selected);
        return ms && mm;
    });
    const filtR = joinConfig.rightColumns.filter(c => {
        const ms = !rightQ || c.name.toLowerCase().includes(rightQ.toLowerCase());
        const mm = rightMode === "All" || (rightMode === "Selected" ? c.selected : !c.selected);
        return ms && mm;
    });

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-white text-[12px]">

            {/* ── Header ── */}
            <div className="h-9 border-b border-gray-200 flex items-center px-3 gap-2 shrink-0 bg-white shadow-sm z-10">
                <input value={joinConfig.name} onChange={e => up({ name: e.target.value })}
                    className="text-[12px] font-bold text-gray-900 bg-transparent outline-none hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded px-1.5 py-0.5 focus:border-blue-500 focus:bg-white min-w-[100px] max-w-[220px]" />
                <button className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-gray-50 rounded text-gray-400 text-[11px] border border-transparent hover:border-gray-200">
                    <Edit3 className="w-3 h-3" /> Description
                </button>
                <div className="flex-1" />
                <button onClick={() => onApply({ ...joinConfig, applied: true })}
                    className="px-3 py-1 text-[11px] font-bold text-white bg-[#e87c2e] hover:bg-[#cf6b22] rounded flex items-center gap-1 transition-colors">
                    <Save className="w-3 h-3" /> Apply
                </button>
                <button onClick={onClose} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50 bg-white flex items-center gap-1 transition-colors">
                    <X className="w-3 h-3" /> Close
                </button>
            </div>

            {/* ── Config area ── */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 flex flex-col gap-2">

                    {/* Join type */}
                    <div className="flex items-center gap-0">
                        <span className="text-gray-600 font-semibold w-32 shrink-0 text-[11px]">Join type</span>
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative" ref={joinTypeRef}>
                                <button onClick={() => setJoinTypeOpen(o => !o)}
                                    className="flex items-center gap-1.5 border border-blue-400 rounded px-2 py-0.5 bg-white text-[#2052a6] font-semibold text-[11px] hover:bg-blue-50 transition-colors">
                                    <ArrowLeftRight className="w-3 h-3" />
                                    {joinConfig.joinType}
                                    <ChevronDown className="w-2.5 h-2.5" />
                                </button>
                                {joinTypeOpen && (
                                    <div className="absolute z-50 top-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg text-[11px] w-40">
                                        {JOIN_TYPES.map(jt => (
                                            <button key={jt} onClick={() => { up({ joinType: jt }); setJoinTypeOpen(false); }}
                                                className={`w-full text-left px-2.5 py-1 flex items-center gap-1.5 hover:bg-blue-50 ${joinConfig.joinType === jt ? "text-blue-700 font-semibold" : "text-gray-700"}`}>
                                                {joinConfig.joinType === jt ? <Check className="w-3 h-3 text-blue-600" /> : <div className="w-3 h-3" />}
                                                {jt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <span className="text-gray-500 text-[11px] flex-1">{JOIN_DESCRIPTIONS[joinConfig.joinType]}</span>
                        </div>
                    </div>

                    {/* Input tables */}
                    <div className="flex items-center">
                        <span className="text-gray-600 font-semibold w-32 shrink-0 text-[11px]">Input tables</span>
                        <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded px-2 py-0.5">
                                <Database className="w-3 h-3 text-[#2052a6]" /> {leftLabel}
                            </span>
                            <button className="flex items-center gap-1 px-2 py-0.5 border border-gray-300 rounded text-[11px] font-semibold text-gray-600 hover:bg-gray-50 bg-white">
                                <ArrowLeftRight className="w-2.5 h-2.5 text-gray-400" /> Swap
                            </button>
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 rounded px-2 py-0.5">
                                <Database className="w-3 h-3 text-[#2052a6]" /> {rightLabel}
                            </span>
                        </div>
                    </div>

                    {/* Match condition */}
                    <div className="flex items-start">
                        <span className="text-gray-600 font-semibold w-32 shrink-0 text-[11px] mt-1">Match condition</span>
                        <div className="flex-1 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-blue-600 font-semibold text-[11px]">rows</span>
                                <span className="text-gray-500 text-[11px]">that match</span>
                                <div className="relative">
                                    <select className="appearance-none border border-gray-300 rounded px-2 pr-6 py-0.5 text-[11px] font-semibold text-gray-700 bg-white outline-none focus:border-blue-500 cursor-pointer">
                                        <option>all conditions</option>
                                        <option>any conditions</option>
                                    </select>
                                    <ChevronDown className="w-2.5 h-2.5 text-gray-400 absolute right-1.5 top-1 pointer-events-none" />
                                </div>
                                <div className="ml-auto inline-flex text-[11px] border border-[#2052a6] rounded overflow-hidden">
                                    <button className="px-2 py-0.5 font-bold bg-[#2052a6] text-white">Basic</button>
                                    <button className="px-2 py-0.5 font-bold text-[#2052a6] hover:bg-blue-50">Advanced</button>
                                </div>
                            </div>

                            {joinConfig.conditions.map((cond, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                                    <div className="w-5 h-5 flex items-center justify-center bg-blue-50 border border-blue-200 rounded shrink-0">
                                        <ArrowLeftRight className="w-2.5 h-2.5 text-blue-400" />
                                    </div>
                                    <ColPicker value={cond.leftCol} columns={joinConfig.leftColumns} onChange={v => upCond(idx, { leftCol: v })} />
                                    <div className="relative">
                                        <select value={cond.operator} onChange={e => upCond(idx, { operator: e.target.value as MatchCondition["operator"] })}
                                            className="appearance-none border border-gray-300 rounded px-2 pr-6 py-1 text-[11px] font-semibold text-gray-700 bg-white outline-none focus:border-blue-500 cursor-pointer">
                                            {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                                        </select>
                                        <ChevronDown className="w-2.5 h-2.5 text-gray-400 absolute right-1.5 top-1.5 pointer-events-none" />
                                    </div>
                                    <ColPicker value={cond.rightCol} columns={joinConfig.rightColumns} onChange={v => upCond(idx, { rightCol: v })} />
                                    {joinConfig.conditions.length > 1 && (
                                        <button onClick={() => rmCond(idx)} className="text-gray-300 hover:text-red-400 p-0.5 rounded hover:bg-gray-100">
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}

                            <button onClick={addCond} className="flex items-center gap-1 px-2 py-0.5 border border-gray-300 rounded text-[11px] font-semibold text-gray-600 hover:bg-gray-50 w-fit bg-white mt-0.5">
                                <Plus className="w-3 h-3 text-gray-400" /> Add match condition
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Select columns header ── */}
                <div className="px-4 py-1 font-semibold text-[11px] text-gray-600 border-b border-gray-100 bg-white shrink-0">Select columns</div>

                {/* ── Column panels ── */}
                <div className="flex-1 flex overflow-hidden min-h-0">

                    {/* Left */}
                    <div className="flex-1 border-r border-gray-200 flex flex-col min-h-0 bg-white">
                        <div className="px-3 pt-2 pb-1.5 shrink-0 border-b border-gray-100 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400">Left:</span>
                                <Database className="w-3 h-3 text-[#2052a6]" />
                                <span className="text-[11px] font-bold text-gray-800 truncate">{leftLabel}</span>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
                                <input type="checkbox" className="w-3 h-3 rounded-sm text-blue-600"
                                    checked={joinConfig.leftColumns.every(c => c.selected)} onChange={e => selAllL(e.target.checked)} />
                                Auto-select all left columns
                            </label>
                            <div className="flex items-center gap-1">
                                <div className="flex-1 relative">
                                    <Search className="w-2.5 h-2.5 absolute left-2 top-1.5 text-gray-400" />
                                    <input value={leftQ} onChange={e => setLeftQ(e.target.value)} placeholder="Search for columns..."
                                        className="w-full pl-6 pr-2 py-1 text-[11px] border border-gray-300 rounded focus:border-blue-500 outline-none placeholder-gray-400" />
                                </div>
                                <div className="border border-gray-300 rounded text-[10px] text-gray-500 font-semibold px-1.5 py-1 flex items-center gap-1 cursor-pointer hover:bg-gray-50 whitespace-nowrap">
                                    Select types <ChevronDown className="w-2.5 h-2.5" />
                                </div>
                            </div>
                        </div>
                        {/* filter bar */}
                        <div className="px-3 py-1 border-b border-gray-100 flex items-center gap-2 bg-white shrink-0">
                            <span className="text-[10px] font-semibold text-gray-700 mr-1">
                                {joinConfig.leftColumns.filter(c => c.selected).length} of {joinConfig.leftColumns.length} selected
                            </span>
                            {(["Selected", "Not selected"] as const).map(m => (
                                <button key={m} onClick={() => setLeftMode(leftMode === m ? "All" : m)}
                                    className={`text-[10px] font-bold border-b ${leftMode === m ? "border-gray-700 text-gray-800" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                                    {m}
                                </button>
                            ))}
                            <div className="flex gap-1 ml-auto">
                                <button onClick={() => selAllL(true)} className="text-[10px] text-[#2052a6] font-semibold hover:underline">Select all</button>
                                <button onClick={() => selAllL(false)} className="text-[10px] text-[#2052a6] font-semibold hover:underline border border-gray-200 rounded px-1 py-0.5 hover:bg-gray-50">Deselect all</button>
                            </div>
                        </div>
                        {/* list */}
                        <div className="flex-1 overflow-y-auto">
                            {filtL.map(col => (
                                <button key={col.name} onClick={() => togL(col.name)}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-left border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${!col.selected ? "opacity-60" : ""}`}>
                                    <span className={`text-[11px] font-medium flex-1 truncate ${col.selected ? "text-[#2052a6]" : "text-gray-600"}`}>{col.name}</span>
                                    <span className="text-[10px] text-gray-400">{col.type}</span>
                                    <div className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center rounded-sm border ${col.selected ? "border-[#2052a6] bg-[#2052a6]" : "border-gray-300"}`}>
                                        {col.selected && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-px bg-gray-100 shrink-0" />

                    {/* Right */}
                    <div className="flex-1 flex flex-col min-h-0 bg-white">
                        <div className="px-3 pt-2 pb-1.5 shrink-0 border-b border-gray-100 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400">Right:</span>
                                <Database className="w-3 h-3 text-[#2052a6]" />
                                <span className="text-[11px] font-bold text-gray-800 truncate flex-1">{rightLabel}</span>
                                <input placeholder="Prefix right columns" className="px-2 py-0.5 border border-gray-300 rounded text-[11px] placeholder-gray-400 outline-none focus:border-blue-500 w-[130px]" />
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
                                <input type="checkbox" className="w-3 h-3 rounded-sm text-blue-600"
                                    checked={joinConfig.rightColumns.every(c => c.selected)} onChange={e => selAllR(e.target.checked)} />
                                Auto-select all right columns
                            </label>
                            <div className="flex items-center gap-1">
                                <div className="flex-1 relative">
                                    <Search className="w-2.5 h-2.5 absolute left-2 top-1.5 text-gray-400" />
                                    <input value={rightQ} onChange={e => setRightQ(e.target.value)} placeholder="Search for columns..."
                                        className="w-full pl-6 pr-2 py-1 text-[11px] border border-gray-300 rounded focus:border-blue-500 outline-none placeholder-gray-400" />
                                </div>
                                <div className="border border-gray-300 rounded text-[10px] text-gray-500 font-semibold px-1.5 py-1 flex items-center gap-1 cursor-pointer hover:bg-gray-50 whitespace-nowrap">
                                    Select types <ChevronDown className="w-2.5 h-2.5" />
                                </div>
                            </div>
                        </div>
                        {/* filter bar */}
                        <div className="px-3 py-1 border-b border-gray-100 flex items-center gap-2 bg-white shrink-0">
                            <span className="text-[10px] font-semibold text-gray-700 mr-1">
                                {joinConfig.rightColumns.filter(c => c.selected).length} of {joinConfig.rightColumns.length} selected
                            </span>
                            {(["Selected", "Not selected"] as const).map(m => (
                                <button key={m} onClick={() => setRightMode(rightMode === m ? "All" : m)}
                                    className={`text-[10px] font-bold border-b ${rightMode === m ? "border-gray-700 text-gray-800" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                                    {m}
                                </button>
                            ))}
                            <div className="flex gap-1 ml-auto">
                                <button onClick={() => selAllR(true)} className="text-[10px] text-[#2052a6] font-semibold hover:underline">Select all</button>
                                <button onClick={() => selAllR(false)} className="text-[10px] text-[#2052a6] font-semibold hover:underline border border-gray-200 rounded px-1 py-0.5 hover:bg-gray-50">Deselect all</button>
                            </div>
                        </div>
                        {/* list */}
                        <div className="flex-1 overflow-y-auto">
                            {filtR.map(col => (
                                <button key={col.name} onClick={() => togR(col.name)}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-left border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${!col.selected ? "opacity-60" : ""}`}>
                                    <span className={`text-[11px] font-medium flex-1 truncate ${col.selected ? "text-[#2052a6]" : "text-gray-600"}`}>{col.name}</span>
                                    <span className="text-[10px] text-gray-400">{col.type}</span>
                                    <div className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center rounded-sm border ${col.selected ? "border-[#2052a6] bg-[#2052a6]" : "border-gray-300"}`}>
                                        {col.selected && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Preview resize handle ── */}
                <div className="h-1 cursor-ns-resize bg-gray-200 hover:bg-blue-400 transition-colors shrink-0"
                    onMouseDown={e => {
                        e.preventDefault();
                        const sy = e.clientY, sh = previewH;
                        const mv = (ev: MouseEvent) => setPreviewH(Math.max(80, Math.min(600, sh + sy - ev.clientY)));
                        const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
                        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
                    }} />

                {/* ── Preview tabs ── */}
                <div className="shrink-0 flex flex-col border-t border-gray-200 bg-white" style={{ height: previewH }}>
                    <div className="h-8 border-b border-gray-200 flex items-center px-3 gap-3 shrink-0">
                        {(["Left input table", "Right input table", "Joined table", "Errors"] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`h-full text-[11px] font-bold border-b-2 transition-colors ${activeTab === tab ? "text-[#2052a6] border-[#2052a6]" : "text-gray-400 border-transparent hover:text-gray-700"}`}>
                                {tab}
                            </button>
                        ))}
                        <span className="ml-auto text-[10px] text-gray-400">{previewRows.slice(0, 300).length} rows · {previewCols.length} cols</span>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {activeTab === "Errors" ? (
                            <div className="flex items-center justify-center h-full text-[11px] text-gray-400 italic">No errors found.</div>
                        ) : previewCols.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-[11px] text-gray-400 italic">
                                {activeTab === "Joined table" ? "Save your changes to preview the output" : "No columns selected"}
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#f8fafc] sticky top-0 border-b border-gray-200">
                                    <tr>
                                        <th className="w-6 border-r border-gray-200 bg-gray-100" />
                                        {previewCols.map((col, ci) => (
                                            <th key={`${col._side}-${col.name}-${ci}`} className="px-2 py-1 border-r border-gray-200 font-normal min-w-[110px] align-top">
                                                <div className="text-[10px] font-semibold text-gray-800">{col.name}</div>
                                                <div className="text-[9px] text-gray-400">{col.type}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="text-[11px] text-gray-700 font-mono">
                                    {previewRows.slice(0, 300).map((row, rIdx) => (
                                        <tr key={rIdx} className="border-b border-gray-100 hover:bg-blue-50/20">
                                            <td className="w-6 border-r border-gray-200 text-center text-gray-400 text-[9px] bg-gray-50 py-0.5">{rIdx + 1}</td>
                                            {previewCols.map((col, ci) => {
                                                const val = row[col.name] ?? "";
                                                return (
                                                    <td key={`${col._side}-${col.name}-${ci}`} className="px-2 py-1 border-r border-gray-100 whitespace-nowrap max-w-[140px] overflow-hidden text-ellipsis">
                                                        {val === "" ? <span className="text-gray-400 italic">null</span> : val}
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
            </div>
        </div>
    );
}
