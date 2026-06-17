import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "FTG Param Controller",
  description: "LiDAR Follow-the-Gap parameter controller for Raspberry Pi",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-[#04090f] text-gray-100 min-h-screen">{children}</body>
    </html>
  )
}
