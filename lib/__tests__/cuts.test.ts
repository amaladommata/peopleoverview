import { describe, expect, it } from "vitest";
import { computeDataCut, deliveryLeadRanking, pgRatingVsExit, tenureBandExitDistribution } from "../cuts";
import { Employee } from "../types";

function emp(overrides: Partial<Employee>): Employee {
  return {
    id: "MM1",
    name: "Test",
    doj: new Date(Date.UTC(2024, 0, 1)),
    exitDate: null,
    client: "Hulu",
    team: "Team A",
    serviceArea: "",
    band: "A1",
    billingType: "Billed",
    deliveryLead: "Lead A",
    deliveryHead: "Vivek Pai",
    hrbp: "Alekhya",
    gender: "Male",
    pgRating: null,
    tenureYears: 2,
    voluntary: null,
    reasonCategory: null,
    ...overrides,
  };
}

const start = new Date(Date.UTC(2026, 7, 1));
const end = new Date(Date.UTC(2026, 7, 31));

describe("computeDataCut", () => {
  const roster: Employee[] = [
    emp({ id: "MM1", client: "Hulu" }),
    emp({ id: "MM2", client: "Hulu", exitDate: new Date(Date.UTC(2026, 7, 10)), voluntary: true }),
    emp({ id: "MM3", client: "Samsung India" }),
  ];

  it("produces one row per distinct value, sorted by YTD attrition desc", () => {
    const rows = computeDataCut(roster, [], {}, "client", { start, end }, { start, end }, { start, end });
    expect(rows.map((r) => r.label).sort()).toEqual(["Hulu", "Samsung India"]);
    // Hulu had an exit, Samsung India didn't -> Hulu sorts first
    expect(rows[0].label).toBe("Hulu");
    expect(rows[0].exits).toBe(1);
  });

  it("respects a base scope filter", () => {
    const rows = computeDataCut(
      roster,
      [],
      { client: "Hulu" },
      "band",
      { start, end },
      { start, end },
      { start, end }
    );
    // Only Hulu employees are in scope, all band A1
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("A1");
    expect(rows[0].exits).toBe(1);
  });
});

describe("deliveryLeadRanking", () => {
  it("only includes leads with nonzero attrition, sorted desc", () => {
    const roster: Employee[] = [
      emp({ id: "MM1", deliveryLead: "Lead A" }),
      emp({ id: "MM2", deliveryLead: "Lead A", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true }),
      emp({ id: "MM3", deliveryLead: "Lead B" }),
    ];
    const ranking = deliveryLeadRanking(roster, [], {}, { start, end });
    expect(ranking.map((r) => r.label)).toEqual(["Lead A"]);
  });
});

describe("tenureBandExitDistribution", () => {
  it("computes % of exits per tenure bucket", () => {
    const exitRows = [emp({ tenureYears: 0.5 }), emp({ tenureYears: 0.5 }), emp({ tenureYears: 3 })];
    const dist = tenureBandExitDistribution(exitRows);
    const under1 = dist.find((d) => d.bucket === "<1yr")!;
    expect(under1.count).toBe(2);
    expect(under1.pctOfExits).toBeCloseTo((2 / 3) * 100, 5);
  });

  it("returns [] for no exits", () => {
    expect(tenureBandExitDistribution([])).toEqual([]);
  });
});

describe("pgRatingVsExit", () => {
  it("splits top/mid/bottom band by PG rating, excluding unrated", () => {
    const exitRows = [
      emp({ pgRating: "PG1" }),
      emp({ pgRating: "PG5" }),
      emp({ pgRating: "PG3" }),
      emp({ pgRating: null }),
    ];
    const split = pgRatingVsExit(exitRows);
    expect(split.knownCount).toBe(3);
    expect(split.topBandPct).toBeCloseTo((1 / 3) * 100, 5);
    expect(split.bottomBandPct).toBeCloseTo((1 / 3) * 100, 5);
    expect(split.midBandPct).toBeCloseTo((1 / 3) * 100, 5);
  });
});
