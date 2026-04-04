"use client";

import { useState } from "react";
import { X, Briefcase, ChevronDown, Check, ArrowUpRight, BookOpen, Building2 } from "lucide-react";

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (project: { name: string; description: string; portfolio: string }) => void;
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [portfolio, setPortfolio] = useState("Select a portfolio...");
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = () => {
        onCreate({ name, description, portfolio: portfolio === "Select a portfolio..." ? "" : portfolio });
        onClose();
        setName("");
        setDescription("");
        setPortfolio("Select a portfolio...");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded shadow-xl w-[480px] flex flex-col font-['Inter',sans-serif] text-[#111827]">

                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <Briefcase className="w-[18px] h-[18px] text-[#5c7080] fill-[#5c7080]" />
                        <h2 className="text-[15px] font-bold text-gray-800">Create new project</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 flex-1 bg-white min-h-[350px]">
                    <div className="flex flex-col h-full animate-in fade-in duration-200">

                        <div className="mb-4">
                            <label className="block text-sm text-[#5c7080] font-semibold mb-1.5">Name</label>
                            <input
                                type="text"
                                placeholder="Enter value..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-[#5c7080] font-semibold mb-1.5">Project description (optional)</label>
                            <input
                                type="text"
                                placeholder="Enter project description..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-[#5c7080] font-semibold mb-1.5">Portfolio (optional)</label>
                            <div className="relative inline-block w-1/2">
                                <div className="w-full border border-gray-300 rounded bg-white flex items-center px-3 py-1.5 cursor-pointer hover:border-blue-400 shadow-sm">
                                    <BookOpen className="w-4 h-4 text-gray-500 mr-2" />
                                    <span className="text-[13px] font-medium text-gray-700">{portfolio}</span>
                                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-4">
                            <div className="bg-white border text-gray-300 border-gray-200 rounded shadow-sm overflow-hidden">
                                <div
                                    className="p-4 flex items-start justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                                >
                                    <div>
                                        <h4 className="text-[14px] text-gray-800 font-bold mb-1">Advanced</h4>
                                        <p className="text-[12px] text-gray-600 leading-snug pr-4">
                                            The project will be created in <Building2 className="w-3.5 h-3.5 inline text-gray-600 font-bold" /> <span className="font-bold text-gray-800">Ontologize Public</span>. Everyone from <Building2 className="w-3.5 h-3.5 inline text-gray-600 font-bold" /> <span className="font-bold text-gray-800">Ontologize Public</span> will be able to see its existence and be granted the <span className="font-bold border-b border-gray-300 border-dashed">Owner</span> role.
                                        </p>
                                    </div>
                                    <ChevronDown className={`w-5 h-5 text-gray-500 mt-1 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-white">
                    <button className="text-[14px] font-semibold text-[#2b6ba3] hover:underline flex items-center gap-1.5">
                        Manage project templates <ArrowUpRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleSubmit}
                        className={`px-4 py-2 rounded text-[14px] font-medium flex items-center gap-1.5 transition-colors shadow-sm ${name.trim() ? "bg-[#80c8a0] text-white hover:bg-[#6ab38b]" : "bg-[#80c8a0] text-white/90 opacity-80 cursor-not-allowed"}`}
                        disabled={!name.trim()}
                    >
                        <Check className="w-4 h-4" />
                        Create project
                    </button>
                </div>

            </div>
        </div>
    );
}
