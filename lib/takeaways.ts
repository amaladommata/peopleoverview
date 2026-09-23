import { PeriodMetrics } from "./types";

// Rule-based leadership takeaways (PRD §7.7). Plain threshold checks over
// computePeriodMetrics() output — no LLM, no external API call, every
// sentence traceable to a number already on the page. Re-evaluated on every
// render, so it changes automatically whenever the sheet or the selected
// period/filters change.
export function generateTakeaways(metrics: PeriodMetrics, targetAttritionPct: number): string[] {
  const lines: string[] = [];

  lines.push(
    `Current headcount is ${metrics.closingHeadcount}, with ${metrics.exits} exit${
      metrics.exits === 1 ? "" : "s"
    } this period.`
  );

  if (metrics.exits > 0) {
    const byClient = new Map<string, number>();
    for (const e of metrics.exitRows) {
      byClient.set(e.client, (byClient.get(e.client) ?? 0) + 1);
    }
    let topClient: string | null = null;
    let topClientCount = 0;
    for (const [client, count] of byClient) {
      if (count > topClientCount) {
        topClient = client;
        topClientCount = count;
      }
    }
    if (topClient && topClientCount / metrics.exits > 0.5) {
      const pct = Math.round((topClientCount / metrics.exits) * 100);
      lines.push(
        `${topClient} accounts for ${pct}% of this period's exits (${topClientCount} of ${metrics.exits}) — worth a named follow-up.`
      );
    }

    const byReason = new Map<string, number>();
    for (const e of metrics.exitRows) {
      const reason = e.reasonCategory ?? "Unspecified";
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    let topReason: string | null = null;
    let topReasonCount = 0;
    for (const [reason, count] of byReason) {
      if (count > topReasonCount) {
        topReason = reason;
        topReasonCount = count;
      }
    }
    if (topReason && topReasonCount / metrics.exits > 0.6) {
      const pct = Math.round((topReasonCount / metrics.exits) * 100);
      lines.push(`${topReason} is cited in ${pct}% of exits — above the 60% flag threshold.`);
    }
  }

  if (metrics.attritionPct > targetAttritionPct) {
    lines.push(
      `Attrition this period is ${metrics.attritionPct.toFixed(2)}%, over the ${targetAttritionPct}% target.`
    );
  } else {
    lines.push(
      `Attrition this period is ${metrics.attritionPct.toFixed(2)}%, within the ${targetAttritionPct}% target.`
    );
  }

  if (metrics.exits > 0) {
    if (metrics.voluntaryExits === metrics.exits) {
      lines.push(`All ${metrics.exits} exits this period were voluntary.`);
    } else if (metrics.involuntaryExits > 0) {
      lines.push(
        `${metrics.voluntaryExits} voluntary and ${metrics.involuntaryExits} involuntary exit${
          metrics.involuntaryExits === 1 ? "" : "s"
        } this period.`
      );
    }
  }

  return lines;
}
