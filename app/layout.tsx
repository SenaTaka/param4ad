import type { Metadata } from "next"
import "./globals.css"
import BottomNav from "./components/BottomNav"

export const metadata: Metadata = {
  title: "FTG Param Controller",
  description: "LiDAR Follow-the-Gap parameter controller for Raspberry Pi",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-[#04090f] text-gray-100 min-h-screen pb-20">
        {children}
        <BottomNav />
      </body>
    </html>
  )
}
