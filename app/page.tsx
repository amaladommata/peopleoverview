// Phase 1 placeholder — data layer + calculation engine only (PRD §12).
// UI sections (period switcher, KPI tiles, charts) land in Phase 2+.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">People Overview</h1>
        <p className="mt-2 text-gray-600">
          Phase 1 (data layer + attrition calc) complete. Dashboard UI coming in Phase 2.
        </p>
      </div>
    </main>
  );
}
