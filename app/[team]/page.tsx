import { notFound } from "next/navigation"
import TeamController from "@/app/TeamController"
import { isValidTeam } from "@/lib/keys"

export function generateStaticParams() {
  return ["a", "b", "c", "d", "e"].map(team => ({ team }))
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ team: string }>
}) {
  const { team } = await params
  if (!isValidTeam(team)) notFound()
  return <TeamController team={team} />
}
