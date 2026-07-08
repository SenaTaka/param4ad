import { redirect } from "next/navigation"

// ルート "/" はチームAへリダイレクト
export default function Home() {
  redirect("/a")
}
