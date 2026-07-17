"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const VALID_TEAMS = new Set(["a", "b", "c", "d", "e"])

// ルート "/" は最後に居たチーム（localStorage）へリダイレクト。初回は /a
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const saved = localStorage.getItem("last_team")
    router.replace(saved && VALID_TEAMS.has(saved) ? `/${saved}` : "/a")
  }, [router])
  return null
}
