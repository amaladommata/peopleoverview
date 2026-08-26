import { NextResponse } from "next/server";
import { getResignations } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const resignations = await getResignations();
  return NextResponse.json(resignations);
}
