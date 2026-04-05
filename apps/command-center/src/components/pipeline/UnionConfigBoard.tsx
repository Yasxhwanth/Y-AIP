"use client";

import { useState } from "react";
import { X, Save, Plus, AlertTriangle } from "lucide-react";

export interface UnionEditorState {
    inputNodeIds: [string, string];
    name: string;
    unionType: "Union by name";
    /** After successful Create union — preview is available */
    previewReady: boolean;
    /** Node was written to the graph */
    committedToGraph: boolean;
}

interface Props {
    state: UnionEditorState;
    inputLabels: [string, string];
    schemaError: string | null;
    outputColumns: { name: string; type: string }[];
    previewRows: Record<string, string>[];
    onUpdate: (p: Partial<UnionEditorState>) => void;
    onRemoveInput: (which: 0 | 1) => void;
    onCreateUnion: () => void;
    onApply: () => void;
    onClose: () => void;
}

export function UnionConfigBoard({
    state,
    inputLabels,
    schemaError,
    outputColumns,
    previewRows,
    onUpdate,
    onRemoveInput,
    onCreateUnion,
    onApply,
    onClose,
}: Props) {
    const [unionTypeOpen, setUnionTypeOpen] = useState(false);

    return (
        <div className="flex flex-1 min-h-0 bg-white text-[12px]">
            {/* Left: union settings */}
            <div className="w-[280px] border-r border-gray-200 flex flex-col shrink-0 bg-[#fafbfc]">
                <div className="p-3 border-b border-gray-200 flex items-center gap-2">
                    <span className="w-7 h-7 rounded bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
                        <span className="w-4 h-4 bg-red-500 border-2 border-red-700 rounded-sm" aria-hidden />
                    </span>
                    <input
                        value={state.name}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        className="flex-1 text-[13px] font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-500"
                    />
                </div>
                <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto">
                    <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Inputs</div>
                        <div className="flex flex-col gap-1.5">
                            {inputLabels.map((label, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-[12px]"
                                >
                                    <span className="flex-1 font-medium text-gray-800 truncate">{label}</span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveInput(i as 0 | 1)}
                                        className="text-gray-400 hover:text-red-600 p-0.5"
                                        title="Remove input"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Output</div>
                        <div className="bg-white border border-gray-200 rounded px-2 py-1.5 text-[12px] font-medium text-gray-700">
                            {state.name || "Union output"}
                        </div>
                    </div>
                    <div className="relative">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Union type</div>
                        <button
                            type="button"
                            onClick={() => setUnionTypeOpen((o) => !o)}
                            className="w-full text-left border border-gray-300 rounded px-2 py-1.5 bg-white text-[12px] font-medium text-gray-800 flex justify-between items-center"
                        >
                            {state.unionType}
                            <span className="text-gray-400">▾</span>
                        </button>
                        {unionTypeOpen && (
                            <div className="absolute z-20 left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg py-0.5">
                                <button
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[12px]"
                                    onClick={() => {
                                        onUpdate({ unionType: "Union by name" });
                                        setUnionTypeOpen(false);
                                    }}
                                >
                                    Union by name
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Center: preview / CTA */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                <div className="h-9 border-b border-gray-200 flex items-center justify-end px-3 gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onApply}
                        disabled={!state.previewReady}
                        className={`px-3 py-1 text-[11px] font-bold rounded flex items-center gap-1 ${state.previewReady ? "text-white bg-blue-600 hover:bg-blue-700" : "text-gray-400 bg-gray-100 cursor-not-allowed"}`}
                    >
                        <Save className="w-3 h-3" /> Apply
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50 bg-white flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Close
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[200px]">
                    {schemaError && (
                        <div className="max-w-md mb-4 flex gap-2 p-3 rounded border border-amber-200 bg-amber-50 text-amber-900 text-[12px]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <div className="font-bold mb-0.5">Schema mismatch</div>
                                <p>{schemaError}</p>
                            </div>
                        </div>
                    )}

                    {!state.previewReady ? (
                        <div className="text-center max-w-md">
                            <p className="text-[13px] text-gray-500 mb-6">
                                Create union transform to preview the output. Both inputs must share the same column names and compatible types (e.g. <code className="text-xs bg-gray-100 px-1 rounded">order_id</code> on both sides).
                            </p>
                            <button
                                type="button"
                                onClick={onCreateUnion}
                                disabled={!!schemaError}
                                className={`px-6 py-2.5 text-[13px] font-bold rounded shadow-sm flex items-center gap-2 mx-auto ${schemaError ? "text-gray-400 bg-gray-100 cursor-not-allowed" : "text-white bg-blue-600 hover:bg-blue-700"}`}
                            >
                                <Plus className="w-4 h-4" /> Create union
                            </button>
                        </div>
                    ) : (
                        <div className="w-full flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-[12px] font-semibold text-gray-700">
                                    Preview — {previewRows.length} rows · {outputColumns.length} columns
                                </span>
                                {state.committedToGraph && (
                                    <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                                        Applied
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-auto border border-gray-200 rounded">
                                <table className="w-full text-left border-collapse text-[11px]">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            {outputColumns.map((c) => (
                                                <th key={c.name} className="px-2 py-1.5 border-b border-gray-200 font-semibold text-gray-700 whitespace-nowrap">
                                                    {c.name}
                                                    <span className="block text-[9px] font-normal text-gray-400">{c.type}</span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.slice(0, 100).map((row, i) => (
                                            <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/40">
                                                {outputColumns.map((c) => (
                                                    <td key={c.name} className="px-2 py-1 font-mono text-gray-800 whitespace-nowrap max-w-[140px] truncate">
                                                        {row[c.name] ?? ""}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
