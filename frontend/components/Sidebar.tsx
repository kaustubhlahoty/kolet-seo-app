"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Lightbulb, Zap, BookOpen } from "lucide-react";

const nav = [
  { href: "/research", label: "Research",  icon: Search,    desc: "Find keywords" },
  { href: "/ideas",    label: "Ideas",     icon: Lightbulb, desc: "Topic selection" },
  { href: "/generate", label: "Generate",  icon: Zap,       desc: "Write articles" },
  { href: "/library",  label: "Library",   icon: BookOpen,  desc: "All articles" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">K</div>
          <div>
            <div className="text-sm font-semibold text-white">Kolet SEO</div>
            <div className="text-xs text-gray-500">Studio</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon, desc }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                active ? "bg-blue-600/20 text-blue-400" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}>
              <Icon size={16} className={active ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"} />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-gray-600">{desc}</div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800">
        <div className="text-xs text-gray-600">Powered by Claude + DataforSEO</div>
      </div>
    </aside>
  );
}
