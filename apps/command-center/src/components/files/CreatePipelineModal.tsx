"use client";
import { useState } from "react";
import { X, Folder } from "lucide-react";

interface CreatePipelineModalProps {
    isOpen: boolean;
    onClose: () => void;
    locationPath: string;
    projectId: string;
    folderId: string;
}

type PipelineType = "batch" | "streaming";
type ComputeType = "standard" | "lightweight" | "external";

export function CreatePipelineModal({ isOpen, onClose, locationPath, projectId, folderId }: CreatePipelineModalProps) {
    const defaultName = `Pipeline Builder - ${new Date().toISOString().replace("T", " ").substring(0, 19)}`;
    const [name, setName] = useState(defaultName);
    const [type, setType] = useState<PipelineType>("batch");
    const [compute, setCompute] = useState<ComputeType>("standard");
    const [isCreating, setIsCreating] = useState(false);

    if (!isOpen) return null;

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const res = await fetch(`/api/ontology-admin/projects/${projectId}/pipelines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: Math.random().toString(36).substring(2, 8),
                    name,
                    folderId,
                    type,
                    compute
                })
            });
            const data = await res.json() as { success: boolean; pipelineId?: string };
            if (data.success && data.pipelineId) {
                window.location.href = `/pipeline/${data.pipelineId}`;
            } else {
                console.error("Failed to create pipeline:", data);
                setIsCreating(false);
            }
        } catch (e) {
            console.error(e);
            setIsCreating(false);
        }
    };

    const typeCard = (value: PipelineType, label: string, desc: string) => (
        <div
            onClick={() => setType(value)}
            className={`p-4 rounded border-2 cursor-pointer transition-colors ${type === value ? "border-blue-600 bg-blue-50/30" : "border-gray-200 hover:border-blue-400 bg-white"}`}
        >
            <div className="flex items-center gap-2 mb-1">
                <div className={`w-3.5 h-3.5 rounded-full border-[4px] ${type === value ? "border-blue-600 bg-white" : "border-gray-300 bg-white"}`}></div>
                <span className="text-[14px] font-bold text-gray-900">{label}</span>
            </div>
            <p className="text-[12px] text-gray-500 leading-tight pl-5">{desc}</p>
        </div>
    );

    const computeCard = (value: ComputeType, label: string, desc: string, badge?: string, badgeVariant?: "blue" | "gray") => (
        <div
            onClick={() => setCompute(value)}
            className={`p-3 rounded border-2 cursor-pointer transition-colors ${compute === value ? "border-blue-600 bg-blue-50/30" : "border-gray-200 hover:border-blue-400 bg-white"}`}
        >
            <div className="flex items-center gap-2 mb-1">
                <div className={`w-3.5 h-3.5 rounded-full border-[4px] shrink-0 ${compute === value ? "border-blue-600 bg-white" : "border-gray-300 bg-white"}`}></div>
                <span className="text-[13px] font-bold text-gray-900">{label}</span>
                {badge && (
                    <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ml-auto shrink-0 ${badgeVariant === "blue" ? "bg-blue-100 text-blue-700" : "border border-gray-300 text-gray-500"}`}>
                        {badge}
                    </span>
                )}
            </div>
            <p className="text-[11px] text-gray-500 leading-tight pl-5">{desc}</p>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-[100] backdrop-blur-[1px]">
            <div className="bg-white rounded shadow-2xl w-[600px] flex flex-col font-sans">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h2 className="text-[16px] font-bold text-gray-900">Create new pipeline</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Name & Location */}
                    <div className="mb-6">
                        <label className="block text-[13px] font-bold text-gray-800 mb-1.5">Pipeline name and location</label>
                        <div className="flex gap-2">
                            <div className="flex-1 flex items-center border border-gray-300 rounded focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all bg-white overflow-hidden shadow-sm">
                                <div className="pl-3 py-2 text-gray-400">
                                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M21 8H3V6h18v2zm0 8H3v-2h18v2zm0-4H3v-2h18v2z" /></svg>
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full px-2 py-2 text-[13px] text-gray-900 outline-none placeholder-gray-400"
                                />
                            </div>
                            <button className="px-3 py-2 border border-gray-300 rounded text-[13px] font-semibold text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap shadow-sm">
                                <Folder className="w-4 h-4 text-gray-500" /> Edit location
                            </button>
                        </div>
                        <div className="mt-1.5 text-[11px] text-gray-500 truncate" title={locationPath}>{locationPath}</div>
                    </div>

                    {/* Pipeline Type */}
                    <div className="mb-6">
                        <h3 className="text-[13px] font-bold text-gray-800 mb-3">Pipeline type</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {typeCard("batch", "Batch pipeline", "Builds and transforms entire datasets on each deploy. Use for data that is ingested periodically.")}
                            {typeCard("streaming", "Streaming pipeline", "Transforms data continuously as new data is made available. For high frequency ingestion.")}
                        </div>
                    </div>

                    {/* Compute */}
                    <div className={`transition-opacity duration-300 ${type === "batch" ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
                        <h3 className="text-[13px] font-bold text-gray-800 mb-3">Select batch compute</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {computeCard("standard", "Standard", "Build your pipelines with full expression support.", "Default", "blue")}
                            {computeCard("lightweight", "Lightweight", "Speed up your builds with limited expressions.", "Beta", "gray")}
                            {computeCard("external", "External", "Use external compute platforms, limited expressions.", "Beta", "gray")}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b">
                    <button onClick={onClose} className="px-4 py-1.5 text-[13px] font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                        &larr; Back
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating || !name}
                        className={`px-4 py-1.5 rounded text-[13px] font-semibold text-white transition-colors shadow-sm ${isCreating || !name ? "bg-green-700/60 cursor-not-allowed" : "bg-green-700 hover:bg-green-800"}`}
                    >
                        {isCreating ? "Creating..." : "Create pipeline"}
                    </button>
                </div>
            </div>
        </div>
    );
}
