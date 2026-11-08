// Whop: a compact band with 4 numbers summed across every Whop business the CLI can see —
// MRR, net revenue (30d), paid members, unique site visitors (30d). Source: the `whop` CLI (saved login), read-only.
// Polls every 5 minutes. Click opens the Whop dashboard.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE } from "./kit.js";
import { theme, exec, home } from "herdr";
import { METRICS, toDisplay } from "./map.js";

const POLL_MS = 5 * 60 * 1000;
const DAY = 864e5;
const ymd = (d) => d.toISOString().slice(0, 10);

export default class Whop extends View {
  init(_props, cx) {
    this.data = null;
    this.offline = false;
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  whop(args) {
    return exec(`${home()}/.local/bin/whop`, [...args, "--format", "json"]).then((r) => {
      const j = JSON.parse(r.stdout);
      if (r.code !== 0 || j?.code) throw new Error(j?.code ?? `whop exited ${r.code}`); // a 429/5xx must not read as $0
      return j;
    });
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      // No whop CLI on this machine: the band stays empty instead of nagging people who don't use Whop.
      if (this.missing === undefined) {
        try { this.missing = (await exec("test", ["-x", `${home()}/.local/bin/whop`])).code !== 0; } catch { this.missing = true; }
      }
      if (this.missing) return cx.notify();
      try {
        const ids = ((await this.whop(["accounts", "list"]))?.data ?? []).map((a) => a?.id).filter(Boolean);
        if (!ids.length) throw new Error("no businesses");
        const now = new Date(), from = ymd(new Date(now - 29 * DAY)), to = ymd(now);
        const byBiz = await Promise.all(ids.map(async (id) => Object.fromEntries(await Promise.all(
          Object.entries(METRICS).map(async ([k, m]) => [k, await this.whop(["stats", "get", m.key, "--account_id", id, "--from", from, "--to", to, "--interval", m.interval ?? "day"])]),
        ))));
        this.data = toDisplay(byBiz);
        this.offline = false;
      } catch {
        this.offline = true; // stale money is worse than none
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    if (this.missing) return div().id("whop").size_full().bg(t.chrome);
    const d = this.data;
    const bar = h_flex().id("whop").size_full().min_h(0).px(12).gap(12).items_center().bg(t.chrome)
      .text_color(t.foreground).text_size(SIZE.body).cursor_pointer()
      .tooltip("Open the Whop dashboard").accessibility_label("Open the Whop dashboard")
      .on_click(() => exec("open", ["https://whop.com/dashboard"]));
    if (this.offline || !d) {
      return bar.justify_end().gap(8)
        .child(svg("mods/whop/icons/whop.svg").size(12).flex_none().text_color(this.offline ? t.dim : t.ansi3))
        .child(div().min_w(0).truncate().text_size(SIZE.meta).text_color(t.dim).child(this.offline ? "Offline, run `whop login`" : "Loading…"))
        .child(div().w(1).h(14).flex_none().ml(4).bg(t.border));
    }
    // The quota bar's anatomy, so the two read as one strip: a theme-colored glyph, then dim micro labels
    // with muted figures (gap 8, no hairline inside the group); only a negative net takes a color.
    const fig = (id, label, tip, value, color) => h_flex().id(`whop-${id}`).flex_none().gap(4).items_center()
      .tooltip(tip).accessibility_label(`${tip} ${value}`)
      .child(div().text_size(SIZE.micro).text_color(t.dim).child(label))
      .child(div().text_size(SIZE.meta).text_color(color ?? t.muted).child(value));
    return bar.justify_end().gap(8)
      .child(div().id("whop-mark").flex_none().tooltip("Whop").child(svg("mods/whop/icons/whop.svg").size(12).text_color(t.ansi3)))
      .child(fig("mrr", "MRR", "Monthly recurring revenue", d.mrr))
      .child(fig("net", "Net", "Net revenue, last 30 days", d.net, d.netNegative ? t.blocked : undefined))
      .child(fig("members", "Members", "Paid members", d.members))
      .child(fig("visits", "Visitors", "Unique visitors, last 30 days", d.visits))
      .child(div().w(1).h(14).flex_none().ml(4).bg(t.border)); // the hairline between tools, as in the quota bar
  }
}
