// Cost: Claude Code spend, from the transcripts (~/.claude/projects), summarised by cost.py,
// plus Codex usage in tokens (~/.codex/sessions; no per-token price on a ChatGPT plan).
// Today / last 7 days, by model, main session vs subagents, top projects, against a daily budget.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, appHome, theme, nextCommand } from "herdr";
import { panel, header, list, section, bar, tag, empty, errorBand, liveStatus, trackTerminal, navKey, keyHints, CORAL, SIZE, panelFocusAsked, agentColor } from "./kit.js";

// ponytail: daily budget in USD, a constant on purpose; raise it when your normal day changes.
const DAILY_BUDGET = 150;
const POLL_MS = 60_000;

// one format everywhere: whole dollars, thousands grouped; spend under a dollar is "<$1"
const usd = (v) => (v > 0 && v < 1 ? "<$1" : `$${String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, ",")}`);
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : `${m}m ago`; };
const MODELS = (t) => ({ opus: ["Opus", CORAL], sonnet: ["Sonnet", t.ansi4], haiku: ["Haiku", t.ansi2], fable: ["Fable", t.ansi5], mythos: ["Mythos", t.ansi5], other: ["Other", t.muted] });
const tok = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const weekday = (iso) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso + "T12:00:00").getDay()];

export default class Cost extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.kb = cx.focus_handle();
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") { this.kb.focus(); cx.notify(); }
      }
    });
    this.script = `${appHome()}/mods/cost/cost.py`;
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.busy) return;
    // render() stamps this; a panel hidden behind another stops costing a python run per minute
    if (this.data && Date.now() - (this.shown ?? 0) > 3 * POLL_MS) return cx.notify();
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", this.script]);
        if (r.code === 0) { this.data = JSON.parse(r.stdout); this.error = null; this.at = Date.now(); }
        else this.error = r.stderr.trim().split("\n").at(-1) || "cost.py failed";
      } catch (e) {
        this.error = String(e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  // label .... bar .... value, one line (bar is a true fraction of the group's max)
  meter(t, id, label, frac, color, value, sub, labelW = 56) {
    return h_flex().id(id).px(12).h(24).gap(8).items_center().text_size(SIZE.body)
      .child(div().flex_none().w(labelW).truncate().text_color(t.muted).child(label))
      .child(bar(t, id + "-bar", frac, color))
      .child(div().flex_none().w(52).text_right().child(value))
      .when(Boolean(sub), (el) => el.child(div().flex_none().w(40).text_right().text_size(SIZE.micro).text_color(t.dim).child(sub)));
  }

  card(t, id, ...children) {
    return v_flex().id(id).flex_none().rounded(8).bg(t.surface).border_1().border_color(t.border).py(8).children(children);
  }

  render(cx) {
    if (panelFocusAsked(this, "cost")) cx.timer.after(0, () => this.kb.focus()); // focus() can't run during render
    const t = theme();
    this.shown = Date.now();
    trackTerminal();
    const d = this.data;
    const kb = this.kb.is_focused();
    const over = d && d.today > DAILY_BUDGET;
    const accent = over ? t.blocked : t.accent; // coral stays for live Claude states (DESIGN.md)

    const head = header(t, {
      glyph: svg("mods/cost/cost.svg").size(14).flex_none().text_color(t.muted),
      title: "Cost",
      count: d ? "API equiv." : undefined,
      status: this.busy && !d ? liveStatus(t, "scanning", CORAL)
        : d ? div().text_size(SIZE.meta).text_color(t.dim).child(ago(this.at ?? Date.now()))
        : "idle",
    });

    let body;
    if (!d) {
      body = this.error ? v_flex().flex_1().child(errorBand(t, this.error))
        : empty(t, { title: "Reading transcripts…", hint: "The first scan reads every recent session once" });
    } else {
      const M = MODELS(t);
      const maxDay = Math.max(DAILY_BUDGET, ...d.days.map((x) => x[1]));
      const modelsRows = Object.entries(d.models).sort((a, b) => b[1][1] - a[1][1]);
      const maxModel = Math.max(0.0001, ...modelsRows.map(([, v]) => v[1]));
      const splitTot = d.split.main[1] + d.split.sub[1];
      const maxProj = Math.max(0.0001, ...d.projects.map((p) => p[2]));
      body = list("cost-list").children([
        this.card(t, "c-today",
          h_flex().px(12).gap(8).items_baseline()
            .child(div().text_size(22).font_semibold().text_color(over ? t.blocked : t.foreground).child(usd(d.today)))
            .child(div().text_size(SIZE.meta).text_color(t.muted).child(`of ${usd(DAILY_BUDGET)} today`))
            .child(div().flex_1())
            .child(tag(t, over ? `+${usd(d.today - DAILY_BUDGET)} over` : `${Math.round((d.today / DAILY_BUDGET) * 100)}%`, over ? t.blocked : undefined)),
          h_flex().px(12).pt(8).pb(4).child(bar(t, "c-budget", d.today / DAILY_BUDGET, accent)),
          div().px(12).text_size(SIZE.meta).text_color(t.dim).child(`Avg ${usd(d.week / 7)} a day over 7 days`)),
        section(t, "s-week", "Last 7 days", usd(d.week), { icon: "mods/cost/icons/calendar.svg" }),
        this.card(t, "c-week", ...d.days.map(([day, v], i) =>
          this.meter(t, `w-${day}`, i === d.days.length - 1 ? "Today" : weekday(day), v / maxDay, i === d.days.length - 1 ? accent : t.muted, usd(v)))),
        section(t, "s-models", "By model", "today · 7 days", { icon: "mods/cost/icons/cpu.svg" }),
        this.card(t, "c-models", ...(modelsRows.length ? modelsRows.map(([k, v]) =>
          this.meter(t, `m-${k}`, h_flex().gap(6).items_center().child(div().size(6).flex_none().rounded(3).bg(M[k]?.[1] ?? t.muted)).child(M[k]?.[0] ?? k), v[1] / maxModel, M[k]?.[1] ?? t.muted, usd(v[0]), usd(v[1]))) : [div().px(12).text_color(t.dim).child("No usage yet")])),
        section(t, "s-split", "Main vs subagents", "7 days", { icon: "mods/cost/icons/split.svg" }),
        this.card(t, "c-split",
          this.meter(t, "p-main", "Main", splitTot ? d.split.main[1] / splitTot : 0, t.muted, usd(d.split.main[0]), usd(d.split.main[1]), 88),
          this.meter(t, "p-sub", "Subagents", splitTot ? d.split.sub[1] / splitTot : 0, t.muted, usd(d.split.sub[0]), usd(d.split.sub[1]), 88),
          d.subagents.length ? div().px(12).pt(4).text_size(SIZE.meta).text_color(t.dim).truncate()
            .child("Runs today: " + d.subagents.map(([a, n]) => `${a.replace(/^.*:/, "")} ${n}`).join(" · ")) : div()),
        // Codex: tokens, not dollars (it runs on a ChatGPT plan); only when it was used this week
        ...(d.codex?.week ? [
          section(t, "s-codex", "Codex", `${tok(d.codex.week)} tokens · 7 days`, { icon: "mods/cost/icons/cpu.svg" }),
          this.card(t, "c-codex", ...d.codex.days.map(([day, v], i) =>
            this.meter(t, `x-${day}`, i === d.codex.days.length - 1 ? "Today" : weekday(day), v / Math.max(1, ...d.codex.days.map((x) => x[1])), agentColor(t, "codex"), tok(v)))),
        ] : []),
        section(t, "s-proj", "Top projects", "today · 7 days", { icon: "folder" }),
        this.card(t, "c-proj", ...(d.projects.length ? d.projects.map(([name, today, week]) =>
          this.meter(t, `j-${name}`, name, week / maxProj, t.muted, usd(today), usd(week), 88)) : [div().px(12).text_color(t.dim).child("No usage yet")])),
      ]);
    }

    return panel(t, "cost", { keyboard: kb })
      .track_focus(this.kb)
      .on_key_down((e, cx) => { navKey(e, cx, {}); })
      .child(head)
      .when(Boolean(this.error && d), (el) => el.child(errorBand(t, this.error)))
      .child(body)
      .when(kb, (el) => el.child(keyHints(t, "cost-keys", [["Esc", "terminal"]])));
  }
}
