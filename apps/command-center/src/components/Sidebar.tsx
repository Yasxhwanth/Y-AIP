"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    Home,
    Search,
    Bell,
    Sparkles,
    Clock,
    FolderOpen,
    Database,
    AppWindow,
    LayoutGrid,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

export function GlobalSidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    const primaryNav = [
        { name: "Home", href: "/", icon: Home },
        { name: "Search...", href: "/search", icon: Search, shortcut: "⌘J" },
        { name: "Notifications", href: "/notifications", icon: Bell },
        { name: "What's New", href: "/whats-new", icon: Sparkles },
    ];

    const secondaryNav = [
        { name: "Recent", href: "/recent", icon: Clock },
        { name: "Files", href: "/files", icon: FolderOpen },
        { name: "Ontology", href: "/ontology", icon: Database },
        { name: "Applications", href: "/applications", icon: AppWindow },
    ];

    const appNav = [
        { name: "Projects & files", href: "/files", icon: FolderOpen },
    ];

    const moduleNav = [
        { name: "Workshop Studio", href: "/workshop", icon: LayoutGrid },
    ];

    const renderNavItems = (items: typeof primaryNav) => (
        <div className="flex flex-col gap-0.5">
            {items.map((item) => {
                const isActive =
                    (pathname?.startsWith(item.href) && item.href !== "/") ||
                    (pathname === "/" && item.href === "/");
                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        title={collapsed ? item.name : undefined}
                        className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-all duration-150 ${isActive
                                ? "bg-emerald-900/40 text-emerald-400 font-medium border-l-2 border-emerald-500 rounded-l-none pl-[10px]"
                                : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                            }`}
                    >
                        <div className={`flex items-center ${collapsed ? "justify-center w-full" : "gap-3"}`}>
                            <item.icon className="w-4 h-4 flex-shrink-0" />
                            {!collapsed && <span className="truncate">{item.name}</span>}
                        </div>
                        {!collapsed && item.shortcut && (
                            <span className="text-xs text-neutral-600 font-mono tracking-widest flex-shrink-0">
                                {item.shortcut}
                            </span>
                        )}
                    </Link>
                );
            })}
        </div>
    );

    return (
        <div
            className={`flex-shrink-0 bg-[#161b22] border-r border-[#30363d] h-screen flex flex-col transition-all duration-200 ease-in-out ${collapsed ? "w-[56px]" : "w-[240px]"
                }`}
        >
            {/* Logo + Collapse toggle */}
            <div className={`flex items-center h-14 border-b border-[#30363d] flex-shrink-0 ${collapsed ? "justify-center px-2" : "px-4 justify-between"}`}>
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-400 flex items-center justify-center">
                            <div className="w-3 h-3 bg-white rounded-full" />
                        </div>
                        <span className="text-white font-bold tracking-tight">Y-AIP</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className="p-1.5 rounded-md hover:bg-white/10 text-neutral-500 hover:text-neutral-200 transition-colors flex-shrink-0"
                >
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {renderNavItems(primaryNav)}

                <div className="h-px bg-[#30363d] mx-1" />

                {renderNavItems(secondaryNav)}

                <div className="h-px bg-[#30363d] mx-1" />

                <div>
                    {!collapsed && (
                        <div className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase mb-1.5 px-2">
                            Applications
                        </div>
                    )}
                    {renderNavItems(appNav)}
                </div>

                <div>
                    {!collapsed && (
                        <div className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase mb-1.5 px-2">
                            Modules
                        </div>
                    )}
                    {renderNavItems(moduleNav)}
                </div>
            </div>
        </div>
    );
}
