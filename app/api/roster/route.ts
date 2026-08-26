import { NextResponse } from "next/server";
import { getRoster } from "@/lib/data-source";

export const dynamic = "force-dynamic";

// Server-only route; maps the raw sheet response to the typed Employee[]
// contract before it ever reaches the client (PRD §4 — no raw sheet data
// exposed to the browser).
export async function GET() {
  const roster = await getRoster();
  return NextResponse.json(roster);
}
