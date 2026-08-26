import { NextResponse } from "next/server";
import { getPip } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const pip = await getPip();
  return NextResponse.json(pip);
}
