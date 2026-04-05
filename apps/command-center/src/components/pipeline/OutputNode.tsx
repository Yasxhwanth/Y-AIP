import { Handle, Position } from 'reactflow';
import { Database, Edit3, FileOutput, Loader2 } from 'lucide-react';

type OutputNodeData = {
    label: string;
    columns?: { name: string; type: string }[];
    status?: "draft" | "deploying" | "deployed";
    onEditOutput?: (id: string) => void;
};

export function OutputNode({ id, data }: { id: string, data: OutputNodeData }) {
    const status = data.status ?? "draft";

    return (
        <div className="relative group">
            <div className="bg-white border border-gray-400 rounded-md shadow-sm w-48 text-left font-sans flex flex-col items-stretch relative">
                <Handle type="target" position={Position.Left} className="w-4 h-4 bg-transparent border-0 -ml-2 pointer-events-none opacity-0" />

                <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-gray-300 rounded flex items-center justify-center -ml-1 text-sky-600 shadow-sm z-10">
                    <FileOutput className="w-3.5 h-3.5" />
                </div>

                <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2 bg-sky-50/60">
                    <Database className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="text-[13px] font-bold text-gray-900 truncate">{data.label}</span>
                </div>

                <div className="px-3 py-1.5 text-[11px] text-gray-500 bg-[#f9fafb] flex items-center justify-between gap-2">
                    <span>{Array.isArray(data.columns) ? data.columns.length : 0} columns</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        status === "deployed"
                            ? "bg-emerald-50 text-emerald-700"
                            : status === "deploying"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                    }`}>
                        {status === "deploying" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {status === "deployed" ? "Deployed" : status === "deploying" ? "Deploying" : "Draft"}
                    </span>
                </div>

                <button
                    onClick={() => data.onEditOutput?.(id)}
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-300 rounded shadow-sm px-2 py-0.5 text-[11px] font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1 hover:bg-gray-50 transition-colors"
                >
                    <Edit3 className="w-3 h-3" /> Edit
                </button>
            </div>
        </div>
    );
}
