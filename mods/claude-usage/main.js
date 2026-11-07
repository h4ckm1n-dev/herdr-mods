// Claude usage: 5h / 7d quota meters in the bottom bar. Source: the statusline's cache file (no fetch here).
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE } from "./kit.js";
import { theme, exec } from "herdr";

const RATE_FILE = "/tmp/claude/statusline-usage-cache.json"; // written by ~/.claude/statusline-command.sh
const POLL_MS = 30_000;
// resets_at is UTC; "2h05m" / "3d4h" left
const resetIn = (iso) => {
  const m = Math.floor((Date.parse(iso ?? "") - Date.now()) / 60000);
  if (!(m >= 0)) return "";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d${h}h` : h ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${Math.max(1, m)}m`;
};

export default class ClaudeUsage extends View {
  init(_props, cx) {
    this.rate = null;
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("cat", [RATE_FILE]);
        this.rate = r.code === 0 ? JSON.parse(r.stdout) : null;
      } catch { this.rate = null; } // ponytail: no cache yet = empty band, not an error
      cx.notify();
    });
  }

  meter(t, key, w, label, pct, reset) {
    const p = Math.max(0, Math.min(100, Math.round(pct ?? 0)));
    const color = p >= 90 ? t.blocked : p >= 50 ? t.working : t.done;
    return h_flex().id(`u-${key}`).flex_none().gap(4).items_center()
      .child(div().text_size(SIZE.micro).text_color(t.dim).child(label))
      .child(h_flex().w(w).h(4).rounded(2).overflow_hidden().bg(t.border)
        .child(div().h_full().rounded(2).flex_basis(0).flex_grow(p / 100).bg(color))
        .child(div().h_full().flex_basis(0).flex_grow(1 - p / 100)))
      .child(div().text_size(SIZE.meta).text_color(p >= 50 ? color : t.muted).child(`${p}%`))
      .child(div().text_size(SIZE.micro).text_color(t.dim).child(reset));
  }

  render() {
    const t = theme(), r = this.rate;
    const bar = h_flex().id("claude-usage").size_full().min_h(0).px(12).gap(12).items_center().bg(t.chrome);
    if (!r) return bar;
    const sep = () => div().w(1).h(14).flex_none().bg(t.border);
    return bar
      .child(this.meter(t, "5h", 28, "5h", r.five_hour?.utilization, resetIn(r.five_hour?.resets_at)))
      .child(sep())
      .child(this.meter(t, "7d", 28, "7d", r.seven_day?.utilization, resetIn(r.seven_day?.resets_at)))
      .child(div().flex_1());
  }
}
