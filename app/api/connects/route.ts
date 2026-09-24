import { NextResponse } from "next/server";
import { getConnects } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const connects = await getConnects();
  return NextResponse.json(connects);
}
