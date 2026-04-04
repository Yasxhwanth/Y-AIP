"use client";
import { useState, useEffect } from "react";
import { X, Search, Download, PlusCircle, MinusCircle } from "lucide-react";

interface AddDataModalProps {
    isOpen: boolean;
    onClose: () => void;
    pipelineId: string;
    onAdd?: (datasets: Dataset[]) => void;
}

interface Dataset {
    id: string;
    name: string;
    created_at?: number;
    columns?: { name: string; type: string }[];
}

interface PipelineInfo {
    projectId: string;
    projectName?: string;
    name?: string;
}

export function AddDataModal({ isOpen, onClose, pipelineId, onAdd }: AddDataModalProps) {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDatasets, setSelectedDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [projectName, setProjectName] = useState("workspace");

    useEffect(() => {
        if (!isOpen) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const pRes = await fetch(`/api/ontology-admin/pipelines/${pipelineId}`);
                if (pRes.ok) {
                    const info = await pRes.json() as PipelineInfo;
                    if (info.projectName) setProjectName(info.projectName);

                    if (info.projectId) {
                        const dRes = await fetch(`/api/ontology-admin/projects/${info.projectId}/datasets`);
                        if (dRes.ok) {
                            const dList = await dRes.json() as Dataset[];
                            setDatasets(dList);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch data for Add Data Modal", e);
            }
            setIsLoading(false);
        };
        fetchData();
        setSelectedDatasets([]);
    }, [isOpen, pipelineId]);

    if (!isOpen) return null;

    const isSelected = (d: Dataset) => !!selectedDatasets.find(s => s.id === d.id);

    const toggle = (d: Dataset) => {
        if (isSelected(d)) {
            setSelectedDatasets(prev => prev.filter(s => s.id !== d.id));
        } else {
            setSelectedDatasets(prev => [...prev, d]);
        }
    };

    const handleAddData = async () => {
        // Enrich each selected dataset with its actual column schema before adding
        const enriched = await Promise.all(
            selectedDatasets.map(async (d) => {
                if (d.columns && d.columns.length > 0) return d;
                try {
                    const pRes = await fetch(`/api/ontology-admin/pipelines/${pipelineId}`);
                    if (!pRes.ok) return d;
                    const info = await pRes.json() as PipelineInfo;
                    if (!info.projectId) return d;
                    const cRes = await fetch(`/api/ontology-admin/datasets/${d.id}/preview?projectId=${info.projectId}`);
                    if (!cRes.ok) return d;
                    const cData = await cRes.json();
                    if (cData.columns?.length > 0) return { ...d, columns: cData.columns };
                } catch { /* offline — return without columns */ }
                return d;
            })
        );
        onAdd?.(enriched);
        onClose();
    };

    const baseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");

    return (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-[100] backdrop-blur-[1px]">
            <div className="bg-white rounded shadow-2xl w-[900px] h-[600px] flex flex-col font-sans overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-gray-700" />
                        <h2 className="text-[14px] font-bold text-gray-900">Add data</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 min-h-0 bg-white">
                    {/* Left Pane: Explorer */}
                    <div className="w-1/2 border-r border-gray-200 flex flex-col shrink-0">
                        <div className="p-3 border-b border-gray-200 shrink-0 flex items-center gap-2">
                            <Search className="w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search all files"
                                className="text-[13px] outline-none text-gray-800 placeholder-gray-400 w-full"
                            />
                        </div>

                        <div className="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0 text-[12px] text-gray-600 font-medium">
                            <span className="bg-gray-200 px-1 rounded cursor-pointer hover:bg-gray-300">...</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="cursor-pointer hover:underline">{projectName}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2">
                            {isLoading ? (
                                <div className="p-4 text-[13px] text-gray-500">Loading datasets...</div>
                            ) : datasets.length === 0 ? (
                                <div className="p-4 text-[13px] text-gray-500">No datasets found in workspace.</div>
                            ) : (
                                datasets.map(d => (
                                    <div
                                        key={d.id}
                                        className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 cursor-pointer"
                                        onClick={() => toggle(d)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 pr-4">
                                            <DatasetIcon />
                                            <span className="text-[13px] text-gray-800 font-medium truncate">{baseName(d.name)}</span>
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); toggle(d); }}
                                            className="text-gray-400 hover:text-blue-600 shrink-0"
                                        >
                                            {isSelected(d)
                                                ? <MinusCircle className="w-5 h-5 text-red-500" />
                                                : <PlusCircle className="w-5 h-5 text-blue-600" />
                                            }
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-200 shrink-0">
                            <button
                                onClick={() => setSelectedDatasets(datasets)}
                                className="w-full py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-2 bg-white"
                            >
                                <PlusCircle className="w-4 h-4 text-gray-400" />
                                Add all to selection
                            </button>
                        </div>
                    </div>

                    {/* Right Pane: Staged Datasets */}
                    <div className="w-1/2 flex flex-col shrink-0">
                        <div className="px-4 py-3 border-b border-gray-200 font-bold text-[13px] text-gray-900 shrink-0">
                            Datasets to add ({selectedDatasets.length})
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {selectedDatasets.length === 0 ? (
                                <div className="h-full flex items-center justify-center">
                                    <p className="text-[13px] text-gray-500 font-medium pb-20">No datasets selected</p>
                                </div>
                            ) : (
                                <div className="py-2">
                                    {selectedDatasets.map(d => (
                                        <div key={d.id} className="flex items-start justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                                            <div className="flex items-start gap-3 min-w-0 pr-4">
                                                <div className="mt-0.5 shrink-0"><DatasetIcon /></div>
                                                <div>
                                                    <div className="text-[13px] text-blue-600 font-medium truncate mb-0.5">{baseName(d.name)}</div>
                                                    <div className="text-[11px] text-gray-500 truncate">/{projectName}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => toggle(d)} className="shrink-0">
                                                <MinusCircle className="w-5 h-5 text-red-500 hover:text-red-700" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 flex justify-end border-t border-gray-100 shrink-0">
                            <button
                                onClick={handleAddData}
                                disabled={selectedDatasets.length === 0}
                                className={`px-4 py-1.5 rounded text-[13px] font-semibold text-white flex items-center gap-2 ${selectedDatasets.length === 0 ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                            >
                                <Download className="w-4 h-4" /> Add data
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DatasetIcon() {
    return (
        <div className="w-4 h-4 border border-gray-300 rounded-sm bg-gray-50 flex flex-col items-center justify-center gap-[2px] shrink-0">
            <div className="w-3 h-[2px] bg-gray-400 rounded-full"></div>
            <div className="w-3 h-[2px] bg-gray-400 rounded-full"></div>
        </div>
    );
}
