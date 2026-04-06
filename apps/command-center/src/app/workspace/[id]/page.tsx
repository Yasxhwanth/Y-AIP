"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Folder, FileText,
    Trash2, ChevronRight, Share,
    Star, Building2,
    UploadCloud, Link as LinkIcon, Puzzle,
    Plus,
    Info, Search, Copy, X, Database,
    Bot, Blocks
} from "lucide-react";
import { UploadFilesModal } from "@/components/files/UploadFilesModal";
import { CreatePipelineModal } from "@/components/files/CreatePipelineModal";

interface WorkspaceItem {
    id: string;
    name: string;
    type: "folder" | "dataset";
    created_at?: number;
    description?: string;
}

interface ProjectInfo {
    id: string;
    name: string;
    description?: string;
    space?: string;
    views?: string | number;
    last_modified?: number | string;
    created_at?: number | string;
    rid?: string;
    tags?: string[];
    portfolio?: string;
}


export default function ProjectWorkspace() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<ProjectInfo | null>(null);
    const [contents, setContents] = useState<WorkspaceItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedDescription, setEditedDescription] = useState("");

    const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isCreatePipelineModalOpen, setIsCreatePipelineModalOpen] = useState(false);

    const fetchProjectContents = useCallback(async () => {
        setIsLoading(true);
        try {
            const pRes = await fetch(`/api/ontology-admin/projects/${projectId}`);
            if (pRes.ok) {
                const pInfo = await pRes.json() as ProjectInfo;
                setProject(pInfo);
                setEditedDescription(pInfo.description || "");
            }

            const [fRes, dRes] = await Promise.all([
                fetch(`/api/ontology-admin/projects/${projectId}/folders`),
                fetch(`/api/ontology-admin/projects/${projectId}/datasets`)
            ]);

            let folderList: Omit<WorkspaceItem, "type">[] = [];
            let datasetList: Omit<WorkspaceItem, "type">[] = [];

            if (fRes.ok) folderList = await fRes.json() as Omit<WorkspaceItem, "type">[];
            if (dRes.ok) datasetList = await dRes.json() as Omit<WorkspaceItem, "type">[];

            const combined: WorkspaceItem[] = [
                ...folderList.map(f => ({ ...f, type: "folder" as const })),
                ...datasetList.map(d => ({ ...d, type: "dataset" as const }))
            ].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

            setContents(combined);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchProjectContents();
    }, [fetchProjectContents]);

    const handleSaveDescription = async () => {
        try {
            await fetch(`/api/ontology-admin/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: editedDescription })
            });
            setProject((current) => current ? { ...current, description: editedDescription } : current);
            setIsEditingDescription(false);
        } catch (e) {
            console.error("Failed to update description", e);
        }
    };

    const handleRenameProject = async () => {
        const newName = prompt("Enter new project name:", project?.name);
        if (!newName || newName === project?.name) return;

        try {
            await fetch(`/api/ontology-admin/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName })
            });
            setProject((current) => current ? { ...current, name: newName } : current);
            setIsActionsOpen(false);
        } catch (e) {
            console.error("Failed to rename project", e);
        }
    };

    const handleDeleteProject = async () => {
        if (!confirm("Are you sure you want to move this project to Trash?")) return;

        try {
            await fetch(`/api/ontology-admin/projects/${projectId}`, { method: "DELETE" });
            window.location.href = "/files";
        } catch (e) {
            console.error("Failed to delete project", e);
        }
    };

    const handleCreateFolder = async () => {
        const folderName = prompt("Enter folder name:");
        if (!folderName) return;

        try {
            await fetch(`/api/ontology-admin/projects/${projectId}/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: folderName, folderId: Math.random().toString(36).substring(2, 8) })
            });
            fetchProjectContents();
            setIsNewMenuOpen(false);
        } catch (e) {
            console.error("Failed to create folder", e);
        }
    };

    const formatDateShort = (timestamp?: number | string) => {
        if (!timestamp) return "--";
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ", " + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const formatDateFull = (timestamp?: number | string) => {
        if (!timestamp) return "--";
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="flex flex-col w-full h-full bg-[#f8fbff] text-[#111827] font-['Inter',sans-serif]">

            <div className="h-10 bg-[#f4f6f8] border-b border-gray-300 flex items-center px-4 text-[13px] text-[#5c7080] shrink-0">
                <Folder className="w-4 h-4 mr-2 text-gray-400" />
                <span className="font-semibold text-gray-800 hover:text-blue-600 cursor-pointer">{project?.space || "Ontologize"}</span>
                <ChevronRight className="w-3.5 h-3.5 mx-1 text-gray-400" />
                <span className="font-semibold flex items-center gap-2 text-gray-800 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">
                    <Folder className="w-3.5 h-3.5 text-gray-400" />
                    {project ? project.name : "Loading..."}
                    <Star className="w-3.5 h-3.5 text-gray-300 ml-1" />
                    <Building2 className="w-3.5 h-3.5 text-gray-400 ml-1" /> <span className="text-gray-500 font-mono text-[11px] ml-0.5">{project?.views || "0"}</span>
                </span>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0 bg-white">
                    <div className="h-14 border-b border-gray-200 flex items-center justify-between px-8 bg-white shrink-0">
                        <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Files</h1>
                        <div className="flex items-center gap-4 relative">
                            <button
                                onClick={() => setIsActionsOpen(!isActionsOpen)}
                                className="text-[13px] font-semibold text-gray-600 flex items-center gap-1 cursor-pointer hover:text-gray-800"
                            >
                                Actions <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {isActionsOpen && (
                                <div className="absolute right-[80px] top-full mt-2 w-48 bg-white rounded shadow-lg border border-gray-200 z-50 py-1">
                                    <button onClick={handleRenameProject} className="w-full text-left px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" /> Rename
                                    </button>
                                    <button className="w-full text-left px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                        <Share className="w-4 h-4 text-gray-400" /> Share
                                    </button>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <button onClick={handleDeleteProject} className="w-full text-left px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium">
                                        <Trash2 className="w-4 h-4" /> Move to Trash
                                    </button>
                                </div>
                            )}

                            <button
                                onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                                className="bg-[#238656] hover:bg-[#1d6b45] text-white px-3 py-1.5 rounded-sm text-[13px] font-semibold flex items-center gap-2 transition-colors shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5" /> New <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {isNewMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-[520px] bg-white rounded shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200 z-50 flex flex-col">
                                    <div className="p-2 border-b border-gray-100">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input type="text" placeholder="Search for apps..." className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded focus:border-blue-500 focus:outline-none placeholder-gray-400" />
                                        </div>
                                    </div>
                                    <div className="flex h-[320px]">
                                        <div className="w-[200px] border-r border-gray-100 bg-[#f9fafb] py-1">
                                            {[
                                                { name: "All", active: true },
                                                { name: "Analytics & Operations", active: false },
                                                { name: "Application development", active: false },
                                                { name: "Data integration", active: false },
                                                { name: "Models", active: false },
                                                { name: "Ontology", active: false },
                                                { name: "Security & governance", active: false },
                                                { name: "Support", active: false }
                                            ].map(cat => (
                                                <div key={cat.name} className={`px-4 py-1.5 text-[13px] cursor-pointer ${cat.active ? 'bg-blue-100/50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100 font-medium'}`}>
                                                    {cat.name}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex-1 overflow-y-auto py-1">
                                            <div
                                                onClick={handleCreateFolder}
                                                className="flex items-center gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                            >
                                                <Folder className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                                                <span className="text-[13px] font-medium text-gray-800">Folder</span>
                                            </div>
                                            <div className="flex items-start gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer">
                                                <LinkIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-[13px] font-medium text-[#111827]">Web link</div>
                                                    <div className="text-[12px] text-gray-500 italic mt-0.5">Save a link to an external website.</div>
                                                </div>
                                            </div>
                                            <div
                                                onClick={() => { setIsUploadModalOpen(true); setIsNewMenuOpen(false); }}
                                                className="flex items-start gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors border-l-2 border-transparent hover:border-blue-500"
                                            >
                                                <UploadCloud className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-[13px] font-medium text-[#111827]">Upload files...</div>
                                                    <div className="text-[12px] text-gray-500 italic mt-0.5">Upload files directly from your computer.</div>
                                                </div>
                                            </div>
                                            <div
                                                onClick={() => { setIsCreatePipelineModalOpen(true); setIsNewMenuOpen(false); }}
                                                className="flex items-start gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer"
                                            >
                                                <Database className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-[13px] font-medium text-[#111827]">Pipeline Builder</div>
                                                    <div className="text-[12px] text-gray-500 leading-tight mt-0.5">Create data pipelines using built-in transformations.</div>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer">
                                                <Bot className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-[13px] font-medium text-[#111827]">AIP Agent</div>
                                                    <div className="text-[12px] text-gray-500 leading-tight mt-0.5">Build no-code interactive assistants equipped with enterprise-specific information and tools.</div>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer">
                                                <Blocks className="w-4 h-4 text-[#8a6a94] mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-[13px] font-medium text-[#111827]">AIP Logic</div>
                                                    <div className="text-[12px] text-gray-500 leading-tight mt-0.5">Build composable no-code functions that can parse, modify, and expand your Ontology.</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-2 border-t border-gray-100 bg-[#f9fafb] text-[10px] text-gray-400 flex items-center justify-between">
                                        <span>HOTKEYS <span className="bg-white border rounded px-1 ml-1 text-gray-500 font-mono shadow-sm">shift</span> <span className="bg-white border rounded px-1 text-gray-500 font-mono shadow-sm">N</span> Open menu</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-200 text-[#5c7080] text-[10px] font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-8 py-3 w-1/2">NAME ^</th>
                                    <th className="px-4 py-3">LAST UPDATED</th>
                                    <th className="px-4 py-3">TAGS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr><td colSpan={3} className="text-center py-10 text-sm text-gray-500">Loading contents...</td></tr>
                                ) : contents.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="text-center py-20 text-sm text-gray-400 italic">This project is empty. Click &quot;New&quot; to add content.</td>
                                    </tr>
                                ) : (
                                    contents.map((item, idx) => (
                                        <tr
                                            key={item.id || idx}
                                            className="hover:bg-[#f5f8fa] cursor-pointer group"
                                            onClick={() => {
                                                if (item.type === 'dataset') {
                                                    router.push(`/dataset/${item.id}?projectId=${projectId}`);
                                                }
                                            }}
                                        >
                                            <td className="px-8 py-[10px] font-medium text-[#2b6ba3] text-[13px]">
                                                <div className="flex items-center gap-3">
                                                    {item.type === 'folder' ? (
                                                        <Folder className="w-[18px] h-[18px] fill-[#f6c244] text-[#daaa31]" />
                                                    ) : (
                                                        <FileText className="w-[18px] h-[18px] text-gray-400" />
                                                    )}
                                                    <span className="group-hover:underline">{item.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-[10px] text-[#5c7080] text-[13px]">
                                                {formatDateShort(item.created_at)}
                                            </td>
                                            <td className="px-4 py-[10px] text-[#5c7080] text-[13px]">--</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="w-[300px] border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
                    <div className="h-10 border-b border-gray-200 flex items-center justify-between px-3 bg-[#f8fbff]">
                        <div className="flex items-center gap-1.5 font-bold text-[#1f2937] text-[12px]">
                            <Info className="w-4 h-4 text-blue-600 fill-blue-100" /> Overview
                        </div>
                        <X className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" />
                    </div>

                    <div className="p-4 overflow-y-auto flex-1">
                        <h2 className="text-[14px] font-bold text-gray-800 mb-6 flex items-start gap-2">
                            <Folder className="w-[18px] h-[18px] shrink-0 text-gray-400 mt-0.5" />
                            {project?.name || "Loading..."}
                        </h2>

                        <div className="mb-6 group">
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-[12px] font-bold text-gray-800">Description</h3>
                                <button className="text-[11px] text-blue-600 font-bold opacity-0 group-hover:opacity-100" onClick={() => setIsEditingDescription(true)}>Edit</button>
                            </div>
                            {isEditingDescription ? (
                                <div className="flex flex-col gap-2">
                                    <textarea
                                        className="w-full border border-gray-300 rounded p-2 text-[13px] focus:outline-none focus:border-blue-500"
                                        rows={3}
                                        value={editedDescription}
                                        onChange={(e) => setEditedDescription(e.target.value)}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsEditingDescription(false)} className="text-[12px] text-gray-500">Cancel</button>
                                        <button onClick={handleSaveDescription} className="text-[12px] bg-blue-600 text-white px-2 py-0.5 rounded">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <p className={`text-[13px] ${project?.description ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                                    {project?.description || "Enter description..."}
                                </p>
                            )}
                        </div>

                        <div className="mb-6 flex justify-between items-start">
                            <div>
                                <h3 className="text-[12px] font-bold text-gray-800 mb-1">Documentation</h3>
                                <p className="text-[13px] text-gray-400">No documentation</p>
                            </div>
                            <button className="text-[13px] text-blue-600 font-semibold hover:underline">Add &gt;</button>
                        </div>

                        <div className="mb-6 border-t border-gray-100 pt-4">
                            <h3 className="text-[12px] font-bold text-gray-800 mb-3">Marketplace installation</h3>
                            <div className="border border-gray-200 rounded text-[13px] text-gray-700 font-semibold px-3 py-2 flex items-center justify-between mb-2 shadow-sm bg-[#f8fbff]">
                                <span className="flex items-center gap-2 text-blue-800">
                                    <Puzzle className="w-4 h-4 fill-blue-200 text-blue-600" /> Speedrun: Your First Agentic AIP Workflow - Y-AIP
                                </span>
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="border border-gray-200 rounded text-[13px] text-gray-700 font-semibold px-3 py-2 flex items-center justify-between shadow-sm">
                                <span className="flex items-center gap-2">
                                    <Puzzle className="w-4 h-4 text-gray-400" /> Deep Dive: Creating Your First Ontology
                                </span>
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            </div>
                        </div>

                        <div className="mb-6 border-t border-gray-100 pt-4 flex justify-between items-start">
                            <div className="pr-4">
                                <h3 className="text-[12px] font-bold text-gray-800 mb-1">Project point of contact</h3>
                                <p className="text-[12px] leading-snug text-gray-500">Add a user or group to act as the point of contact for issues or questions regarding this project.</p>
                            </div>
                            <button className="text-[13px] text-blue-600 font-bold hover:underline shrink-0">+ Add</button>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <h3 className="text-[12px] font-bold text-gray-800 mb-3">Metadata</h3>
                            <div className="space-y-3">
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">RID</div>
                                    <div className="flex-1 text-gray-800 bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px] flex justify-between overflow-hidden">
                                        <span className="truncate">{project?.rid || project?.id || "unknown..."}</span>
                                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-pointer shrink-0 ml-1" />
                                    </div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Location</div>
                                    <div className="flex-1 text-gray-800">/{project?.space || "Ontologize Public"}/ <br /> [{project?.name || ""}] <span className="text-blue-600 cursor-pointer hover:underline text-[11px] ml-1">Copy</span></div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Space</div>
                                    <div className="flex-1 text-gray-800">{project?.space || "Ontologize Public"}</div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Tags</div>
                                    <div className="flex-1 text-gray-500 italic">
                                        {project?.tags?.length ? project.tags.join(", ") : "No tags"}
                                    </div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Portfolio</div>
                                    <div className="flex-1 text-gray-400 italic">{project?.portfolio || "No portfolio"}</div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Created</div>
                                    <div className="flex-1 text-gray-800">{formatDateFull(project?.created_at)}</div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium whitespace-nowrap">Last modified</div>
                                    <div className="flex-1 text-gray-800">{formatDateFull(project?.created_at)}</div>
                                </div>
                                <div className="flex text-[12px] items-start">
                                    <div className="w-[100px] text-gray-500 font-medium">Views <Info className="w-3 h-3 inline text-gray-300 ml-1" /></div>
                                    <div className="flex-1 text-gray-800">{project?.views || "0"}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <UploadFilesModal
                isOpen={isUploadModalOpen}
                onClose={() => { setIsUploadModalOpen(false); fetchProjectContents(); }}
                projectId={projectId}
                folderId={project?.id || projectId}
            />

            <CreatePipelineModal
                isOpen={isCreatePipelineModalOpen}
                onClose={() => setIsCreatePipelineModalOpen(false)}
                locationPath={project ? `/${project.space || "Ontologize Public"}/${project.name}` : ""}
                projectId={projectId}
                folderId={project?.id || projectId}
            />
        </div>
    );
}

function ChevronDown({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    )
}
