import { NextResponse } from "next/server";
import { getGrievances } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const grievances = await getGrievances();
  return NextResponse.json(grievances);
}
