"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Search, Lightbulb, Zap, BookOpen, Settings, LogOut, User, Users } from "lucide-react";
import { API_BASE } from "@/lib/api";

const allNav = [
  { href: "/research", label: "Research",  icon: Search,    desc: "Find keywords",   roles: ["admin"] },
  { href: "/ideas",    label: "Ideas",     icon: Lightbulb, desc: "Topic selection", roles: ["admin"] },
  { href: "/generate", label: "Generate",  icon: Zap,       desc: "Write articles",  roles: ["admin"] },
  { href: "/library",  label: "Library",   icon: BookOpen,  desc: "All articles",    roles: ["admin", "reviewer"] },
];

const allNavBottom = [
  { href: "/admin/users", label: "Users",    icon: Users,    desc: "Manage access",   roles: ["admin"] },
  { href: "/admin",       label: "Settings", icon: Settings, desc: "API credentials", roles: ["admin"] },
];

export function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "reviewer";

  const nav    = allNav.filter(n => n.roles.includes(role));
  const bottom = allNavBottom.filter(n => n.roles.includes(role));

  const [unresolvedCount, setUnresolvedCount] = useState(0);
  useEffect(() => {
    function fetchCount() {
      fetch(`${API_BASE}/api/notifications/unread-comments`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.count != null) setUnresolvedCount(d.count); })
        .catch(() => null);
    }
    fetchCount();
    const timer = setInterval(fetchCount, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-kolet-yellow flex items-center justify-center font-bold text-sm text-kolet-black">K</div>
          <div>
            <div className="text-sm font-semibold text-white">Kolet SEO</div>
            <div className="text-xs text-gray-600">Studio</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, desc }) => {
          const active = path.startsWith(href);
          const badge  = href === "/library" && unresolvedCount > 0 ? unresolvedCount : null;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                active
                  ? "bg-kolet-yellow/10 text-kolet-yellow"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
              }`}>
              <Icon size={16} className={active ? "text-kolet-yellow" : "text-gray-600 group-hover:text-gray-300"} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-gray-600">{desc}</div>
              </div>
              {badge !== null && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-kolet-yellow text-kolet-black text-[10px] font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {active && badge === null && <div className="ml-auto w-1 h-4 rounded-full bg-kolet-yellow" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      {bottom.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {bottom.map(({ href, label, icon: Icon, desc }) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                  active
                    ? "bg-kolet-yellow/10 text-kolet-yellow"
                    : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                }`}>
                <Icon size={16} className={active ? "text-kolet-yellow" : "text-gray-600 group-hover:text-gray-300"} />
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-gray-600">{desc}</div>
                </div>
                {active && <div className="ml-auto w-1 h-4 rounded-full bg-kolet-yellow" />}
              </Link>
            );
          })}
        </div>
      )}

      {/* User info + logout */}
      <div className="px-4 py-4 border-t border-gray-800">
        {session?.user && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
              <User size={12} className="text-gray-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-300 truncate">
                {session.user.name || session.user.email}
              </div>
              <div className="text-xs text-gray-600 capitalize">{role}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
        <div className="text-xs text-gray-700">Powered by Claude + DataforSEO</div>
      </div>
    </aside>
  );
}
