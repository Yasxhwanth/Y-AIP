"use client";
import React, { useState } from "react";
import { X, Search, Clock, Star, Folder, Database, Share2, User, ChevronRight, Check } from "lucide-react";

interface Dataset {
    id: string;
    name: string;
    path: string;
}

interface SelectDatasetModalProps {
    isOpen: boolean;
    onClose: () => void;
    datasets: Dataset[];
    onSelect: (datasetId: string) => void;
}

export function SelectDatasetModal({ isOpen, onClose, datasets, onSelect }: SelectDatasetModalProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    if (!isOpen) return null;

    const filtered = datasets.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.path.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0d1117]/60 backdrop-blur-sm">
            {/* Modal Container */}
            <div className="bg-white rounded-md shadow-2xl flex flex-col overflow-hidden text-gray-800" style={{ width: 1000, height: 700 }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 shrink-0">
                    <div className="font-semibold text-[15px] min-w-[200px]">Select dataset</div>

                    <div className="flex items-center flex-1 max-w-[600px] gap-3">
                        <div className="flex items-center text-gray-400 gap-1">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </div>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full h-8 pl-9 pr-3 text-[13px] border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition p-1 rounded hover:bg-gray-100 min-w-[24px] flex justify-end">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Body */}
                <div className="flex flex-1 min-h-0">

                    {/* Left Sidebar */}
                    <div className="w-[240px] bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto pt-3">
                        <div className="px-3 mb-4">
                            <select className="w-full h-8 text-[13px] border border-gray-300 rounded px-2 outline-none bg-white font-medium text-gray-700">
                                <option>Select a space...</option>
                            </select>
                        </div>

                        <div className="flex flex-col text-[13px] text-gray-700 font-medium">
                            <div className="flex items-center gap-3 px-4 py-1.5 hover:bg-gray-200 cursor-pointer bg-gray-200 text-gray-900 border-l-2 border-blue-600">
                                <Clock className="w-4 h-4 text-gray-500" /> Recent files
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent">
                                <Star className="w-4 h-4 text-gray-500" /> Favorites
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent">
                                <Database className="w-4 h-4 text-gray-500" /> All projects
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent">
                                <svg className="w-4 h-4 text-purple-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                Data Catalog
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent">
                                <div className="w-4 h-4 bg-blue-600 rounded-sm"></div> Object datasources
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent">
                                <Share2 className="w-4 h-4 text-gray-500" /> Shared with you
                            </div>
                            <div className="flex items-center gap-3 px-[18px] py-1.5 hover:bg-gray-200 cursor-pointer border-l-2 border-transparent mt-2">
                                <User className="w-4 h-4 text-gray-500" /> Your files
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="px-4 mt-6">
                            <div className="text-[12px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">Type</div>

                            {[
                                { name: "Module", count: 5, color: "bg-purple-500" },
                                { name: "Folder", count: 5, color: "bg-yellow-500" },
                                { name: "Dataset", count: 4, color: "bg-blue-400" },
                                { name: "Pipeline Builder", count: 2, color: "bg-teal-500" },
                                { name: "Code repository", count: 1, color: "bg-blue-300" }
                            ].map(filter => (
                                <div key={filter.name} className="flex items-center justify-between py-1 mb-1 group cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" className="rounded border-gray-300 pointer-events-none" />
                                        <div className={`w-3.5 h-3.5 ${filter.color} rounded-sm flex items-center justify-center`}><div className="w-2 h-[2px] bg-white opacity-60"></div></div>
                                        <span className="text-[13px] text-gray-700">{filter.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] text-gray-500">{filter.count}</span>
                                        <div className="w-8 h-2 bg-blue-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(filter.count / 17) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="text-[12px] text-blue-600 mt-2 cursor-pointer hover:underline">Show more</div>

                            <div className="text-[12px] font-semibold text-gray-500 mt-6 mb-2 uppercase tracking-wide">Tags</div>
                            <div className="text-[13px] text-gray-400 italic">No tags</div>
                        </div>
                    </div>

                    {/* Right Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white">
                        <div className="h-10 border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
                            <div className="flex items-center text-[13px] text-gray-600 font-medium">
                                <span className="hover:text-blue-600 cursor-pointer">All</span>
                                <ChevronRight className="w-4 h-4 mx-1" />
                                <span className="text-gray-900 font-semibold cursor-pointer border-b-2 border-blue-600 leading-10">Recent files</span>
                            </div>
                            <div className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer hover:text-gray-900">
                                Show hidden <input type="checkbox" className="rounded border-gray-300" />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-[13px]">No matching files found.</div>
                            ) : (
                                filtered.map(d => {
                                    const isSelected = selectedId === d.id;
                                    return (
                                        <div
                                            key={d.id}
                                            className={`group flex items-center justify-between px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                            onClick={() => setSelectedId(d.id)}
                                            onDoubleClick={() => {
                                                setSelectedId(d.id);
                                                onSelect(d.id);
                                            }}
                                        >
                                            <div className="flex items-start gap-3 min-w-0 pr-4">
                                                <div className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 bg-blue-100 rounded-sm">
                                                    <div className="w-3 h-[2px] bg-blue-500 mb-1 rounded-full"></div>
                                                    <div className="w-3 h-[2px] bg-blue-500 rounded-full" style={{ position: 'absolute', marginTop: 4 }}></div>
                                                </div>
                                                <div>
                                                    <div className={`text-[14px] font-semibold truncate mb-0.5 ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{d.name}</div>
                                                    <div className="text-[12px] text-gray-500 truncate">{d.path}</div>
                                                </div>
                                            </div>
                                            <div className={`shrink-0 text-[13px] font-medium flex items-center gap-1 ${isSelected ? 'text-blue-600 opacity-100' : 'opacity-0 group-hover:opacity-100 text-blue-500'}`}>
                                                Open <ChevronRight className="w-4 h-4" />
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-200 flex justify-end gap-3 shrink-0 bg-gray-50">
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-[4px] border border-gray-300 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 bg-white shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={!selectedId}
                                onClick={() => selectedId && onSelect(selectedId)}
                                className={`px-4 py-1.5 rounded-[4px] text-[13px] font-semibold text-white shadow-sm transition-colors ${selectedId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'}`}
                            >
                                Select
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
