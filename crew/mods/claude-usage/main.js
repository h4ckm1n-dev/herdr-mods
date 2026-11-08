// Agent usage: 5h / 7d quota meters for Claude Code and Codex in the bottom bar.
// Source: limits.py (the Claude statusline cache, Codex's own session reports). Nothing fetched.
// One tool: its meters with time to reset. Both: each behind its icon, resets in the tooltip.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE, agentColor } from "./kit.js";
import { theme, exec, appHome, knownAgents } from "herdr";

const POLL_MS = 30_000;
const TOOLS = [["codex", "Codex"], ["claude", "Claude"]];
const OWN = { claude: "mods/claude-usage/claude.svg", codex: "mods/claude-usage/codex.svg" };
// resets_at is UTC; "2h05m" / "3d4h" left
const resetIn = (iso) => {
  const m = Math.floor((Date.parse(iso ?? "") - Date.now()) / 60000);
  if (!(m >= 0)) return "";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d${h}h` : h ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${Math.max(1, m)}m`;
};

export default class AgentUsage extends View {
  init(_props, cx) {
    this.limits = {};
    this.icons = {}; // the program table's icon per agent key (as the New menu draws them)
    cx.spawn(async (cx) => {
      try { for (const a of await knownAgents({})) if (a?.icon) this.icons[a.key] = a; } catch {}
      cx.notify();
    });
    this.script = `${appHome()}/mods/claude-usage/limits.py`;
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", this.script]);
        this.limits = r.code === 0 ? JSON.parse(r.stdout) : {};
      } catch { this.limits = {}; } // ponytail: no data yet = empty band, not an error
      cx.notify();
    });
  }

  meter(t, key, label, w, showReset) {
    const p = Math.max(0, Math.min(100, Math.round(w?.utilization ?? 0)));
    const color = p >= 90 ? t.blocked : p >= 50 ? t.working : t.muted; // color only when it means something
    const reset = resetIn(w?.resets_at);
    return h_flex().id(`u-${key}`).flex_none().gap(4).items_center()
      .when(!showReset && Boolean(reset), (el) => el.tooltip(`${label} window · ${p}% used · resets in ${reset}`))
      .child(div().text_size(SIZE.micro).text_color(t.dim).child(label))
      .child(h_flex().w(28).h(4).rounded(2).overflow_hidden().bg(t.border)
        .child(div().h_full().rounded(2).flex_basis(0).flex_grow(p / 100).bg(color))
        .child(div().h_full().flex_basis(0).flex_grow(1 - p / 100)))
      .child(div().w(28).flex_none().text_right().text_size(SIZE.meta).text_color(p >= 50 ? color : t.muted).child(`${p}%`)) // fixed: digits never shift
      .when(showReset && Boolean(reset), (el) => el.child(div().text_size(SIZE.micro).text_color(t.dim).child(reset)));
  }

  // The tool's icon in its color (name in the tooltip); its name only if the icon isn't known.
  mark(t, k, name) {
    // always one flat 12px line glyph in the tool's color (the program table's icons are full-color art,
    // louder than everything around them); a tintable table icon for any other tool
    const a = this.icons[k], color = agentColor(t, k);
    const icon = OWN[k] ?? (a?.tint ? a.icon : null);
    if (!icon) return div().text_size(SIZE.micro).font_medium().text_color(color).child(name);
    return div().id(`mark-${k}`).flex_none().tooltip(name).accessibility_label(name)
      .child(svg(icon).size(12).text_color(color));
  }

  render() {
    const t = theme();
    const shown = TOOLS.filter(([k]) => this.limits?.[k]);
    const both = shown.length > 1;
    const sep = () => div().w(1).h(14).flex_none().bg(t.border);
    const bar = h_flex().id("agent-usage").size_full().min_h(0).px(12).gap(12).items_center().justify_end().bg(t.chrome);
    return bar.children(shown.flatMap(([k, name], i) => {
      const l = this.limits[k];
      return [
        ...(i ? [sep()] : []),
        h_flex().id(`tool-${k}`).flex_none().gap(8).items_center()
          .when(both, (el) => el.child(this.mark(t, k, name)))
          .child(this.meter(t, `${k}-5h`, "5h", l.five_hour, !both))
          .child(this.meter(t, `${k}-7d`, "7d", l.seven_day, !both)),
      ];
    }));
  }
}
