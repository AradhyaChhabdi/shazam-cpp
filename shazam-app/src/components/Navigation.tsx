import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

const navItems = [
  { label: "Listen", href: "/" },
  { label: "Library", href: "/songs" },
  { label: "Admin", href: "/admin/login" },
];

export default function Navigation() {
  const router = useRouter();
  const { data: session } = useSession();

  const getIsActive = (href: string) => {
    if (href === "/") return router.pathname === "/";
    return router.pathname.startsWith(href);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border-surface-border">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white/70" />
          </div>
          <span className="text-[15px] font-semibold text-white">ShazamCPP</span>
        </Link>

        {/* Center nav pills */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const active = getIsActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-resonate-dim hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Admin user icon */}
        <Link
          href="/admin/login"
          className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/12 transition"
          aria-label="Admin"
        >
          <svg
            className="w-4 h-4 text-resonate-dim"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </Link>
      </div>
    </nav>
  );
}
