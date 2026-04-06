"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
    Database, Table, FileText, Activity,
    ArrowLeft, Share, Download, Settings,
    Search, Filter, ChevronDown, Info,
    Clock, CheckCircle2, AlertCircle
} from "lucide-react";

interface DatasetPreview {
    columns: string[];
    data: Record<string, any>[];
}

interface DatasetMeta {
    id: string;
    name: string;
    created_at?: string | number;
    file_path?: string;
    rowCount?: number;
    status?: string;
}

export default function DatasetPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const datasetId = params.id as string;
    const projectId = searchParams.get("projectId");

    const [meta, setMeta] = useState<DatasetMeta | null>(null);
    const [preview, setPreview] = useState<DatasetPreview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"preview" | "schema" | "builds" | "profile">("preview");

    const fetchDataset = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch metadata
            // In a real app, we'd have a specific metadata endpoint. 
            // For now, we use the project datasets list and filter.
            if (projectId) {
                const res = await fetch(`/api/ontology-admin/projects/${projectId}/datasets`);
                if (res.ok) {
                    const datasets = await res.json() as DatasetMeta[];
                    const found = datasets.find(d => d.id === datasetId || d.name === datasetId);
                    if (found) setMeta(found);
                    else setMeta({ id: datasetId, name: datasetId });
                }
            }

            // 2. Fetch preview
            const previewRes = await fetch(`/api/ontology-admin/datasets/${datasetId}/preview${projectId ? `?projectId=${projectId}` : ""}`);
            if (previewRes.ok) {
                const data = await previewRes.json();
                if (Array.isArray(data) && data.length > 0) {
                    setPreview({
                        columns: Object.keys(data[0]),
                        data: data
                    });
                }
            }
        } catch (e) {
            console.error("Failed to fetch dataset", e);
        } finally {
            setIsLoading(false);
        }
    }, [datasetId, projectId]);

    useEffect(() => {
        fetchDataset();
    }, [fetchDataset]);

    return (
        <div className="flex flex-col w-full h-full bg-[#f3f5f8] text-[#1c2127]">
            {/* Header */}
            <div className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <Database className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-[16px] font-bold text-gray-900 leading-tight">
                                {meta?.name || datasetId}
                            </h1>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{datasetId.substring(0, 8)}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Healthy</span>
                                <span>•</span>
                                <span>Updated {meta?.created_at ? new Date(meta.created_at).toLocaleDateString() : "recently"}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className="px-3 py-1.5 text-[13px] font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2">
                        <Share className="w-4 h-4" /> Share
                    </button>
                    <button className="px-3 py-1.5 text-[13px] font-bold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Actions <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="h-10 bg-white border-b border-gray-200 px-6 flex items-center gap-8 shrink-0">
                {[
                    { id: "preview", label: "Preview", icon: <Table className="w-4 h-4" /> },
                    { id: "schema", label: "Schema", icon: <FileText className="w-4 h-4" /> },
                    { id: "profile", label: "Profile", icon: <Activity className="w-4 h-4" /> },
                    { id: "builds", label: "Builds", icon: <Clock className="w-4 h-4" /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`h-full flex items-center gap-2 text-[13px] font-bold transition-all relative border-b-2 ${activeTab === tab.id ? "text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-700"
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col p-6">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="h-12 border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Filter values..."
                                    className="pl-9 pr-3 py-1.5 text-[13px] border border-gray-200 rounded-lg w-64 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <button className="text-[13px] text-gray-600 font-bold hover:text-gray-900 flex items-center gap-1.5">
                                <Filter className="w-4 h-4" /> Filter
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] text-gray-500 font-medium">{preview?.data.length || 0} rows found</span>
                            <div className="h-4 w-px bg-gray-200 mx-1" />
                            <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all">
                                <Download className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all">
                                <Settings className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="flex-1 overflow-auto bg-[#fafafa]">
                        {isLoading ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[14px] text-gray-500 font-medium">Loading dataset preview...</span>
                            </div>
                        ) : preview ? (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                                    <tr>
                                        {preview.columns.map(col => (
                                            <th key={col} className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r border-gray-100 last:border-r-0 min-w-[150px]">
                                                <div className="flex items-center justify-between">
                                                    <span>{col}</span>
                                                    <ChevronDown className="w-3.5 h-3.5 text-gray-300" />
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {preview.data.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/40 transition-colors group">
                                            {preview.columns.map(col => (
                                                <td key={col} className="px-4 py-2 border-r border-gray-50 last:border-r-0 text-[13px] text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
                                                    {String(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
                                <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                                <h3 className="text-[16px] font-bold text-gray-900 mb-2">No data available</h3>
                                <p className="text-[13px] max-w-xs leading-relaxed">We couldn&apos;t find any preview data for this dataset. Use a build to materialize the target.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
