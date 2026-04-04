import { LayoutTemplate } from "lucide-react";
import { GridEditor } from "@/components/workshop/grid-editor";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function WorkshopPage() {
    const session = await getServerSession(authOptions);
    const operatorEmail = session?.user?.email ?? "admin@yaip.local";

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col font-sans">
            {/* Top Navigation */}
            <header className="border-b border-neutral-800 bg-black px-6 py-3 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-1.5 rounded text-white flex gap-2 items-center text-sm font-bold shadow-[0_0_10px_rgba(79,70,229,0.4)]">
                        <LayoutTemplate className="w-4 h-4" />
                        WKS
                    </div>
                    <h1 className="text-sm font-bold tracking-tight text-white m-0">
                        Workshop Studio <span className="text-neutral-500 font-normal">| Visual Application Builder</span>
                    </h1>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-neutral-400">
                    <div className="bg-neutral-900 border border-neutral-800 px-3 py-1 rounded">
                        {operatorEmail} [BUILDER]
                    </div>
                </div>
            </header>

            {/* Main Workshop Grid Engine */}
            <main className="flex-1 flex overflow-hidden">
                <GridEditor />
            </main>
        </div>
    );
}
