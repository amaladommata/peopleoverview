import { describe, expect, it } from "vitest";
import { computePeriodMetrics } from "../attrition";
import { generateTakeaways } from "../takeaways";
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

describe("generateTakeaways", () => {
  it("always states headcount and exit count first", () => {
    const roster = [emp({})];
    const metrics = computePeriodMetrics(roster, [], {}, start, end);
    const lines = generateTakeaways(metrics, 15);
    expect(lines[0]).toMatch(/Current headcount is 1, with 0 exits/);
  });

  it("flags a client with >50% of exits, by name and percent", () => {
    const roster = [
      emp({ id: "MM1", client: "Hulu", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true }),
      emp({ id: "MM2", client: "Hulu", exitDate: new Date(Date.UTC(2026, 7, 10)), voluntary: true }),
      emp({ id: "MM3", client: "Samsung India", exitDate: new Date(Date.UTC(2026, 7, 15)), voluntary: true }),
    ];
    const metrics = computePeriodMetrics(roster, [], {}, start, end);
    const lines = generateTakeaways(metrics, 15);
    expect(lines.some((l) => l.includes("Hulu accounts for 67%"))).toBe(true);
  });

  it("does not flag a client at or below 50% of exits", () => {
    const roster = [
      emp({ id: "MM1", client: "Hulu", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true }),
      emp({ id: "MM2", client: "Samsung India", exitDate: new Date(Date.UTC(2026, 7, 10)), voluntary: true }),
    ];
    const metrics = computePeriodMetrics(roster, [], {}, start, end);
    const lines = generateTakeaways(metrics, 15);
    expect(lines.some((l) => l.includes("accounts for"))).toBe(false);
  });

  it("flags a reason category over 60% of exits", () => {
    const roster = [
      emp({ id: "MM1", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true, reasonCategory: "Compensation" }),
      emp({ id: "MM2", exitDate: new Date(Date.UTC(2026, 7, 6)), voluntary: true, reasonCategory: "Compensation" }),
      emp({ id: "MM3", exitDate: new Date(Date.UTC(2026, 7, 7)), voluntary: true, reasonCategory: "Health" }),
    ];
    const metrics = computePeriodMetrics(roster, [], {}, start, end);
    const lines = generateTakeaways(metrics, 15);
    expect(lines.some((l) => l.includes("Compensation is cited in 67%"))).toBe(true);
  });

  it("flags over-target attrition distinctly from within-target", () => {
    const roster = [
      emp({ id: "MM1", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true }),
    ];
    const metrics = computePeriodMetrics(roster, [], {}, start, end);
    const lines = generateTakeaways(metrics, 0.01);
    expect(lines.some((l) => l.includes("over the 0.01% target"))).toBe(true);
  });

  it("notes 100% voluntary vs a voluntary/involuntary split", () => {
    const allVoluntary = [emp({ id: "MM1", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true })];
    const mixed = [
      emp({ id: "MM1", exitDate: new Date(Date.UTC(2026, 7, 5)), voluntary: true }),
      emp({ id: "MM2", exitDate: new Date(Date.UTC(2026, 7, 6)), voluntary: false }),
    ];
    const allVolLines = generateTakeaways(computePeriodMetrics(allVoluntary, [], {}, start, end), 15);
    const mixedLines = generateTakeaways(computePeriodMetrics(mixed, [], {}, start, end), 15);
    expect(allVolLines.some((l) => l.includes("were voluntary"))).toBe(true);
    expect(mixedLines.some((l) => l.includes("voluntary and 1 involuntary"))).toBe(true);
  });
});
