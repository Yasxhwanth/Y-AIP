import { useState, useRef } from "react";
import { UploadCloud, X, File as FileIcon, Loader2 } from "lucide-react";

interface UploadFilesModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    folderId: string;
}

export function UploadFilesModal({ isOpen, onClose, projectId, folderId }: UploadFilesModalProps) {

    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setIsUploading(true);

        const formData = new FormData();
        files.forEach(file => formData.append("files", file));

        try {
            const res = await fetch(`/api/ontology-admin/projects/${projectId}/upload`, {
                method: "POST",
                body: formData
            });
            if (res.ok) {
                setFiles([]);
                onClose();
                // Optionally trigger a refresh on the parent page
                window.location.reload();
            }
        } catch (e) {
            console.error("Upload failed", e);
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded shadow-xl w-[500px] flex flex-col font-['Inter',sans-serif] text-[#111827]">

                <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                />

                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-gray-500" />
                        <h2 className="text-[15px] font-bold text-gray-800">Upload files</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 flex-1 bg-[#fbfcfd] max-h-[500px] overflow-y-auto">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded bg-white w-full h-24 flex flex-col items-center justify-center mb-4 transition-colors hover:border-blue-400 cursor-pointer group"
                    >
                        <UploadCloud className="w-8 h-8 text-gray-300 group-hover:text-blue-400 mb-2 transition-colors" />
                        <span className="text-[13px] text-gray-500">
                            Drop files here or <span className="text-[#2b6ba3] hover:underline cursor-pointer">choose from your computer</span>
                        </span>
                    </div>

                    {files.length > 0 && (
                        <div className="border border-gray-200 bg-white rounded overflow-hidden mb-4 shadow-sm">
                            {files.map((file, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-b-0 group">
                                    <div className="flex items-center gap-2">
                                        <FileIcon className="w-4 h-4 text-gray-400" />
                                        <span className="text-[13px] text-gray-700 font-medium truncate max-w-[250px]">{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[12px] text-gray-400">{(file.size / 1024).toFixed(2)} KB</span>
                                        <X onClick={() => removeFile(i)} className="w-4 h-4 text-gray-400 cursor-pointer hover:text-red-500" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="border-4 border-[#3b82f6] bg-blue-50/30 rounded p-3 mb-2 cursor-pointer flex items-start gap-3">
                        <div className="mt-0.5">
                            <div className="w-4 h-4 rounded-full border-[5px] border-[#3b82f6] bg-white"></div>
                        </div>
                        <div>
                            <div className="text-[13px] font-bold text-gray-900 leading-snug">Upload as individual structured datasets (recommended)</div>
                            <div className="text-[12px] text-gray-600 mt-0.5">Datasets are the most basic representation of tabular data.</div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end px-5 py-4 border-t border-gray-200 bg-white">
                    <button
                        onClick={handleUpload}
                        disabled={isUploading || files.length === 0}
                        className={`bg-[#1f5a95] hover:bg-[#184877] text-white px-4 py-2 rounded text-[13px] font-medium shadow-sm transition-colors flex items-center gap-2 ${(isUploading || files.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isUploading ? "Uploading..." : "Upload"}
                    </button>
                </div>
            </div>
        </div>
    );
}
