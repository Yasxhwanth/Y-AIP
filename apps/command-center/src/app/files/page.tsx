"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Folder, Search, Star, Loader2 } from "lucide-react";
import { CreateProjectModal } from "@/components/files/CreateProjectModal";

interface FileRow {
    id: string;
    name: string;
    description: string;
    views: number;
    role: string;
    tags: string[];
    created_at: number;
}

interface ProjectData {
    name: string;
    description?: string;
    space?: string;
    [key: string]: unknown;
}

export default function FilesWorkspace() {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [files, setFiles] = useState<FileRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("Your projects");

    const fetchProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/ontology-admin/projects");
            if (res.ok) setFiles(await res.json() as FileRow[]);
        } catch (e) {
            console.error("Failed to fetch projects frontend", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleCreateProject = async (projectData: ProjectData) => {
        try {
            const res = await fetch("/api/ontology-admin/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: Math.random().toString(36).substr(2, 6),
                    ...projectData
                })
            });
            if (res.ok) {
                fetchProjects();
            } else {
                console.error("Failed to create project frontend");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return "Just now";
        const date = new Date(timestamp);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    return (
        <div className="flex w-full h-full bg-[#f8fbff] font-sans text-gray-800">
            <div className="flex-1 flex flex-col min-w-0 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] relative z-10">

                {/* Top header navigation */}
                <div className="h-12 border-b border-gray-200 flex items-center justify-between px-6 bg-white">
                    <div className="flex items-center text-sm">
                        <span className="font-medium text-gray-800 flex items-center gap-2">
                            <Folder className="w-4 h-4 text-gray-500" />
                            All files
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[1200px] mx-auto pt-16 pb-12 px-8">

                        {/* Hero Section */}
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold text-[#1f2937] tracking-tight mb-6">Explore all files</h1>
                            <div className="max-w-xl mx-auto relative group">
                                <Search className="w-4 h-4 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-[0_2px_5px_rgba(0,0,0,0.02)] transition-all text-sm"
                                />
                            </div>
                        </div>

                        {/* Tabs & Controls */}
                        <div className="flex items-end justify-between border-b border-gray-200 mb-0">
                            <div className="flex gap-1">
                                {["Your projects", "Recents", "Favorites"].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2.5 text-[14px] font-semibold transition-colors relative ${activeTab === tab
                                            ? "text-[#1f2937]"
                                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t"
                                            }`}
                                    >
                                        {tab}
                                        {activeTab === tab && (
                                            <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 rounded-t-md"></div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-4 pb-2">
                                <span className="text-[13px] font-semibold text-[#2b6ba3] hover:underline cursor-pointer">View all projects</span>
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="bg-[#238656] hover:bg-[#1d6b45] text-white px-3 py-1.5 rounded-sm text-[13px] font-medium flex items-center gap-1 transition-colors shadow-sm"
                                >
                                    + New project
                                </button>
                            </div>
                        </div>

                        {/* Data Table */}
                        <div className="bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-200 text-[#5c7080] text-[11px] font-semibold uppercase tracking-wider">
                                        <th className="py-3 px-4 w-1/2">FILES</th>
                                        <th className="py-3 px-4">PORTFOLIO</th>
                                        <th className="py-3 px-4">ROLE</th>
                                        <th className="py-3 px-4 text-right">LAST VIEWED</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="py-20 text-center">
                                                <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-4" />
                                                <p className="text-sm text-gray-500">Loading projects...</p>
                                            </td>
                                        </tr>
                                    ) : files.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-16 text-center">
                                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                                    <Folder className="w-8 h-8 text-gray-300" />
                                                </div>
                                                <h3 className="text-gray-800 font-medium mb-1">No projects found</h3>
                                                <p className="text-sm text-gray-500 mb-4">You do not have any projects or files yet.</p>
                                                <button onClick={() => setIsModalOpen(true)} className="text-blue-600 font-medium text-sm hover:underline">
                                                    Create your first project
                                                </button>
                                            </td>
                                        </tr>
                                    ) : (
                                        files.map(file => (
                                            <tr
                                                key={file.id}
                                                onClick={() => router.push(`/workspace/${file.id}`)}
                                                className="border-b border-gray-100 hover:bg-[#f5f8fa] group cursor-pointer transition-colors"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-0.5 w-[18px] h-[14px] border border-gray-300 rounded-[2px] bg-white flex items-center justify-center flex-shrink-0">
                                                            <div className="w-[10px] h-[2px] bg-gray-400 rounded-sm"></div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium text-[#2b6ba3] text-[14px] group-hover:underline">{file.name}</span>
                                                                <Star className="w-3.5 h-3.5 text-gray-300" />
                                                            </div>
                                                            {file.description ? (
                                                                <span className="text-[12px] text-gray-500 italic mt-0.5">{file.description}</span>
                                                            ) : (
                                                                <span className="text-[12px] text-gray-400 italic mt-0.5">No description</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-[13px] italic">--</td>
                                                <td className="px-4 py-3 text-gray-800 font-medium text-[13px]">{file.role}</td>
                                                <td className="px-4 py-3 text-right text-gray-800 font-medium text-[13px]">{formatDate(file.created_at)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            </div>

            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreateProject}
            />
        </div>
    );
}
