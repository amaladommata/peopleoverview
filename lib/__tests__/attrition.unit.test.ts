import { describe, expect, it } from "vitest";
import { computePeriodMetrics, isEmployedOn, tenureBucket } from "../attrition";
import { Employee, ResignationRecord } from "../types";

function emp(overrides: Partial<Employee>): Employee {
  return {
    id: "MM1",
    name: "Test Person",
    doj: null,
    exitDate: null,
    client: "Hulu",
    team: "Team A",
    serviceArea: "Publisher",
    band: "A1",
    billingType: "Billed",
    deliveryLead: "Lead A",
    deliveryHead: "Vivek Pai",
    hrbp: "Alekhya",
    gender: "Male",
    pgRating: null,
    tenureYears: 1,
    voluntary: null,
    reasonCategory: null,
    ...overrides,
  };
}

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe("isEmployedOn", () => {
  it("is false with no DOJ", () => {
    expect(isEmployedOn(emp({ doj: null }), d(2026, 8, 1))).toBe(false);
  });

  it("is false before DOJ", () => {
    expect(isEmployedOn(emp({ doj: d(2026, 8, 10) }), d(2026, 8, 1))).toBe(false);
  });

  it("is true on the DOJ itself", () => {
    expect(isEmployedOn(emp({ doj: d(2026, 8, 10) }), d(2026, 8, 10))).toBe(true);
  });

  it("is true while active (no exit date)", () => {
    expect(isEmployedOn(emp({ doj: d(2026, 1, 1), exitDate: null }), d(2026, 8, 25))).toBe(true);
  });

  it("is false on and after the exit (LWD) date", () => {
    const e = emp({ doj: d(2026, 1, 1), exitDate: d(2026, 8, 5) });
    expect(isEmployedOn(e, d(2026, 8, 5))).toBe(false);
    expect(isEmployedOn(e, d(2026, 8, 6))).toBe(false);
  });

  it("is true the day before the exit date", () => {
    const e = emp({ doj: d(2026, 1, 1), exitDate: d(2026, 8, 5) });
    expect(isEmployedOn(e, d(2026, 8, 4))).toBe(true);
  });
});

describe("tenureBucket", () => {
  it.each([
    [null, "Unknown"],
    [0.5, "<1yr"],
    [1, "1-2yr"],
    [1.9, "1-2yr"],
    [2, "2-3yr"],
    [4.9, "3-5yr"],
    [5, "5yr+"],
    [12, "5yr+"],
  ] as const)("tenureYears=%s -> %s", (years, expected) => {
    expect(tenureBucket(years)).toBe(expected);
  });
});

describe("computePeriodMetrics scoping", () => {
  const roster: Employee[] = [
    emp({ id: "MM1", client: "Hulu", band: "A1", doj: d(2025, 1, 1) }),
    emp({ id: "MM2", client: "Hulu", band: "A2", doj: d(2025, 1, 1) }),
    emp({ id: "MM3", client: "Samsung India", band: "A1", doj: d(2025, 1, 1) }),
    emp({
      id: "MM4",
      client: "Hulu",
      band: "A1",
      doj: d(2024, 1, 1),
      exitDate: d(2026, 8, 15),
      voluntary: true,
    }),
    emp({
      id: "MM5",
      client: "Samsung India",
      band: "A2",
      doj: d(2024, 1, 1),
      exitDate: d(2026, 8, 20),
      voluntary: false,
    }),
  ];

  const start = d(2026, 8, 1);
  const end = d(2026, 8, 31);

  it("scopes headcount and exits together by client", () => {
    const hulu = computePeriodMetrics(roster, [], { client: "Hulu" }, start, end);
    // MM1, MM2 active + MM4 employed until Aug 15 -> opening HC = 3
    expect(hulu.openingHeadcount).toBe(3);
    // closing: MM1, MM2 active, MM4 exited (excluded) -> 2
    expect(hulu.closingHeadcount).toBe(2);
    expect(hulu.exits).toBe(1);
    expect(hulu.exitRows.map((e) => e.id)).toEqual(["MM4"]);
  });

  it("scopes by client AND band together", () => {
    const scoped = computePeriodMetrics(roster, [], { client: "Hulu", band: "A2" }, start, end);
    expect(scoped.closingHeadcount).toBe(1); // only MM2
    expect(scoped.exits).toBe(0);
  });

  it("splits voluntary vs involuntary exits", () => {
    const all = computePeriodMetrics(roster, [], {}, start, end);
    expect(all.exits).toBe(2);
    expect(all.voluntaryExits).toBe(1);
    expect(all.involuntaryExits).toBe(1);
  });

  it("attritionPct is 0 (not NaN) when average headcount is 0", () => {
    const metrics = computePeriodMetrics([], [], {}, start, end);
    expect(metrics.attritionPct).toBe(0);
    expect(Number.isNaN(metrics.attritionPct)).toBe(false);
  });

  it("populates resignation fields once resignationDate exists on any record in scope", () => {
    const resignations: ResignationRecord[] = [
      {
        id: "MM9",
        name: "Someone",
        client: "Hulu",
        team: "Team A",
        deliveryLead: "Lead A",
        band: "A1",
        tenureYears: 2,
        reasonCategory: "Compensation",
        notes: "",
        resignationDate: d(2026, 8, 10),
        status: "Serving Notice",
        withdrawalDate: null,
      },
    ];
    const metrics = computePeriodMetrics(roster, resignations, { client: "Hulu" }, start, end);
    expect(metrics.resignationsReceived).toBe(1);
    expect(metrics.resignationsWithdrawn).toBe(0);
    expect(metrics.inNoticePipeline).toBe(1);
  });
});
