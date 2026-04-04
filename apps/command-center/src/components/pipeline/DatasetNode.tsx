import { Handle, Position } from 'reactflow';
import { Database, Scissors, Merge, Copy, Workflow, Sparkles, MessageSquare, PlusCircle } from 'lucide-react';

export function DatasetNode({ id, data }: { id: string, data: any }) {
    return (
        <div className="relative group">
            {/* Action Popup Hover Menu (Right attached with invisible bridge) */}
            <div className="absolute left-[100%] top-1/2 -translate-y-1/2 pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none group-hover:pointer-events-auto">
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col py-1.5 w-36 overflow-hidden text-[12px] font-medium text-gray-700">
                    <button
                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                        onClick={() => data.onTransform?.(id)}
                    >
                        <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <path d="M14 8h-4v8" /><path d="M10 12h4" /><path d="M8 8l8 8" />
                        </svg>
                        Transform
                    </button>
                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 flex-1">
                        <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                        Split
                    </button>

                    <div className="px-3 my-1"><div className="h-px w-full bg-gray-200" /></div>

                    <button
                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        onClick={() => data.onJoin?.(id)}
                    >
                        <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="12" height="12" rx="2" ry="2" />
                            <rect x="9" y="9" width="12" height="12" rx="2" ry="2" strokeDasharray="2 2" />
                        </svg>
                        Join
                    </button>
                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50">
                        <Copy className="w-3.5 h-3.5 text-orange-500" />
                        Union
                    </button>

                    <div className="px-3 my-1"><div className="h-px w-full bg-gray-200" /></div>

                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50">
                        <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                        Use LLM
                    </button>
                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        Generate
                    </button>
                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                        Explain
                    </button>

                    <div className="px-3 my-1"><div className="h-px w-full bg-gray-200" /></div>

                    <button className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-amber-50 text-amber-600">
                        <PlusCircle className="w-3.5 h-3.5" />
                        Add output
                    </button>
                </div>
            </div>

            {/* The Actual Node */}
            <div className="bg-white border border-gray-400 rounded-md shadow-sm w-64 text-left font-sans">
                <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-300 -ml-1 border-2 border-white pointer-events-none opacity-0" />

                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded-sm">
                    Snapshot
                </div>

                <div className="p-3 pb-2 border-b border-gray-200 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-[13px] font-bold text-gray-900 truncate">{data.label}</span>
                </div>
                <div className="px-3 py-2 text-[12px] text-gray-500 bg-[#f9fafb] rounded-b-md">
                    {Array.isArray(data.columns) ? data.columns.length : (data.columns ?? "9")} columns
                </div>

                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white border border-gray-300 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                </div>
                <Handle type="source" position={Position.Right} className="w-4 h-4 bg-transparent border-0 right-0 pointer-events-none opacity-0" />
            </div>
        </div>
    );
}
