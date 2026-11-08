// Pure mapping from `whop stats get` JSON to what the band shows (no Herdr imports; node --test loads it).

// Snapshot metrics read the latest point; flow metrics sum the window.
export const METRICS = {
  mrr: { key: "monthly_recurring_revenue", agg: "last" },
  net: { key: "net_revenue", agg: "sum" },
  members: { key: "paid_active_members", agg: "last" },
  // traffic_people = unique visitors across own sites (Whop Pixel) + whop.com store; page_visits misses own sites.
  // One "year" bucket dedupes people across days (daily sum double-counts repeat visitors).
  // ponytail: a window spanning Dec 31 returns 2 buckets and slightly over-counts; acceptable.
  visits: { key: "traffic_people", agg: "sum", interval: "year" },
};

const values = (res) => (Array.isArray(res?.data?.points) ? res.data.points.map((p) => p?.value).filter((v) => typeof v === "number" && Number.isFinite(v)) : []);

/** One business's series → one number (0 when the series is empty: Whop omits points for "nothing yet"). */
export function reduce(res, agg) {
  const v = values(res);
  if (!v.length) return 0;
  return agg === "last" ? v[v.length - 1] : v.reduce((a, b) => a + b, 0);
}

/** 12500 -> "12.5k"; 1.2e6 -> "1.2M"; 950 -> "950". */
export function compact(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const a = Math.abs(x), sign = x < 0 ? "−" : "";
  const n = (y) => String(Math.round(y * 10) / 10);
  return sign + (a >= 1e6 ? `${n(a / 1e6)}M` : a >= 1e4 ? `${n(a / 1e3)}k` : String(Math.round(a)));
}

/**
 * byBiz: [{ mrr, net, members, visits }] — raw `whop stats get` responses per business.
 * Returns the totals across businesses, formatted.
 */
export function toDisplay(byBiz) {
  const total = (k) => (byBiz ?? []).reduce((s, b) => s + reduce(b?.[k], METRICS[k].agg), 0);
  const net = total("net");
  return {
    mrr: `$${compact(total("mrr"))}`,
    net: `$${compact(net)}`,
    netNegative: net < 0,
    members: compact(total("members")),
    visits: compact(total("visits")),
  };
}
