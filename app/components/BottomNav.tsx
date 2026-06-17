"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  {
    href: "/",
    label: "パラメータ",
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <circle cx="9" cy="6" r="2.5" fill={active ? "currentColor" : "none"} strokeWidth={active ? 0 : 1.8} />
        <line x1="4" y1="12" x2="20" y2="12" />
        <circle cx="16" cy="12" r="2.5" fill={active ? "currentColor" : "none"} strokeWidth={active ? 0 : 1.8} />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="10" cy="18" r="2.5" fill={active ? "currentColor" : "none"} strokeWidth={active ? 0 : 1.8} />
      </svg>
    ),
  },
  {
    href: "/sim",
    label: "シミュレータ",
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <polygon points="10,8 10,16 17,12" fill={active ? "currentColor" : "none"} strokeWidth={active ? 0 : 1.8} />
      </svg>
    ),
  },
  {
    href: "/explain",
    label: "解説",
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        <line x1="9" y1="7" x2="15" y2="7" />
        <line x1="9" y1="11" x2="15" y2="11" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0b1828]/95 backdrop-blur-md border-t border-[#1a3048]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-w-3xl mx-auto flex">
        {TABS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 transition-colors relative ${
                active ? "text-cyan-400" : "text-gray-500 hover:text-gray-300 active:text-gray-200"
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full" />
              )}
              {tab.icon(active)}
              <span className={`text-[10px] font-medium tracking-wide ${active ? "text-cyan-400" : "text-gray-500"}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
