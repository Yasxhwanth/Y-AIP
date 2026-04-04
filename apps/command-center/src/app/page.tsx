import { AtlasViewer } from "@/components/atlas-viewer";
import { ProposalsInbox } from "@/components/proposals-inbox";
import { Shield } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LoginButton } from "@/components/login-button";
import { LogoutButton } from "@/components/logout-button";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full border border-neutral-800 bg-neutral-950 p-8 rounded-xl shadow-2xl space-y-6 text-center">
          <div className="bg-white p-3 rounded-full inline-flex mx-auto">
            <Shield className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white m-0">Y-AIP <span className="text-neutral-500 font-medium">| Nexus Command</span></h1>
            <p className="text-sm text-neutral-400 mt-2">Zero-Trust Enterprise Intelligence Platform</p>
          </div>
          <div className="pt-4 border-t border-neutral-800">
            <LoginButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black">
      {/* Top Nav */}
      <header className="border-b border-neutral-800 bg-neutral-950 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-md">
            <Shield className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white m-0">
            Y-AIP <span className="text-neutral-500 font-medium">| Nexus Command</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-neutral-400 font-mono">SYS.ONLINE</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded font-mono text-xs text-neutral-400">
            <span>OP: {session.user?.name || session.user?.email || "Unknown"}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Left/Main Column: Atlas Viewer */}
        <div className="xl:col-span-2 space-y-6">
          <section className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-2xl">
            <AtlasViewer />
          </section>
        </div>

        {/* Right Column: Proposals Inbox */}
        <div className="space-y-6">
          <section className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-2xl sticky top-24">
            <ProposalsInbox />
          </section>
        </div>

      </div>
    </main>
  );
}
