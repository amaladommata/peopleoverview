import { NextResponse } from "next/server";
import { getProbation } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const probation = await getProbation();
  return NextResponse.json(probation);
}
