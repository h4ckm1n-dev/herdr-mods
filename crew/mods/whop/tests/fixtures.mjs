// Shape of real `whop stats get … --format json` responses, 2026-11-07 (values altered; no ids/tokens).
const pts = (...v) => ({ data: { points: v.map((value, i) => ({ timestamp: 1790812800 + i * 86400, value })), currency: "usd" }, cta: {} });
export const bizA = { mrr: pts(0, 40, 49), net: pts(10, 0, 39.5), members: pts(1, 2), visits: { data: { points: [] } } };
export const bizB = { mrr: pts(0), net: pts(-5), members: { data: { points: [] } }, visits: pts(1200, 9000) };
