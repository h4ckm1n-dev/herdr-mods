// What the Crew panel knew, folded into the agents list: per Claude/Codex agent, what it is doing now,
// model and context fill, its in-session subagents; plus the conflict radar.
// Data: scan.py (Claude transcripts) and codex_scan.py (Codex sessions), polled while the sidebar shows.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, terminals, exec, appHome, hc, run, notify } from "herdr";
import { ICON, SIZE, spinner } from "./kit.js";

const POLL_MS = 3000;
const COMPACT_AT = 0.8; // Claude Code auto-compacts around here: offer a /compact first
const WINDOW = { haiku: 200_000 }; // ponytail: static table; Opus 5.5 = 1M observed, the rest inferred
const windowOf = (m) => WINDOW[Object.keys(WINDOW).find((k) => (m ?? "").includes(k))] ?? 1_000_000;

export const isClaude = (a) => a.program?.key === "claude" || /claude/i.test(a.app ?? "");
export const isCodex = (a) => a.program?.key === "codex" || /codex/i.test(a.app ?? "");

const tok = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${n}`);
const total = (u) => (u ? u.in + u.out + u.read + u.write : 0);
// "claude-opus-5-5" → "Opus"; Codex models pass through
const modelShort = (m) => { const x = (m ?? "").replace(/^claude-/, "").split("-")[0]; return x ? x[0].toUpperCase() + x.slice(1) : ""; };
export const ctxFrac = (u) => (u?.turns ? Math.min(1, u.ctx / (u.window || windowOf(u.model))) : null);
const fillColor = (t, f) => (f >= 0.8 ? t.blocked : f >= 0.6 ? t.working : t.muted);

/** Files two or more live sessions wrote in the last 30 min (scan.py `touched`; Codex keeps none). */
export function conflictsOf(addrs, data) {
  const by = new Map();
  for (const addr of addrs) for (const f of data[addr]?.touched ?? []) by.set(f, [...(by.get(f) ?? []), addr]);
  return [...by].filter(([, w]) => w.length > 1).map(([file, agents]) => ({ file, agents }));
}

export function nextBlocked() {
  const b = agents().filter((a) => a.status === "blocked");
  if (!b.length) return notify({ title: "No agent is waiting for you", level: "info", timeout: 2000 });
  run("agent.focus", { terminal: b[(b.findIndex((a) => a.focused) + 1) % b.length].address });
}

export function startCrew(self, cx) {
  self.crew = {}; self.crewOpen = new Set();
  const scan = `${appHome()}/mods/agents-crew/scan.py`, codexScan = `${appHome()}/mods/agents-crew/codex_scan.py`;
  const tick = (cx) => {
    if (self.crewBusy) return;
    const byPane = new Map(panes().map((p) => [p.pane, p]));
    const pid = new Map(terminals().map((t) => [t.address, t.foreground?.pid ?? t.pid ?? ""]));
    const arg = (a) => `${a.address}|${pid.get(a.address) ?? ""}|${byPane.get(a.pane)?.cwd ?? ""}`;
    const list = agents(), claude = list.filter(isClaude).map(arg), codex = list.filter((a) => isCodex(a) && !isClaude(a)).map(arg);
    if (!claude.length && !codex.length) return;
    self.crewBusy = true;
    cx.spawn(async (cx) => {
      try {
        const runs = [[scan, claude], [codexScan, codex]].filter(([, a]) => a.length);
        // each scanner keeps its own agents' data: one failing never freezes the other's
        const out = await Promise.all(runs.map(([s, a]) => exec("python3", ["-I", s, ...a])
          .then((r) => (r.code === 0 ? { data: JSON.parse(r.stdout) } : { err: r.stderr.trim().split("\n").at(-1) }))
          .catch((e) => ({ err: String(e) }))));
        const next = Object.assign({}, self.crew, ...out.map((r) => r.data ?? {}));
        self.crewError = out.find((r) => r.err)?.err ?? null;
        const key = JSON.stringify(next);
        if (key !== self.crewKey) { self.crewKey = key; self.crew = next; cx.notify(); }
      } catch (e) { self.crewError = String(e); }
      self.crewBusy = false;
    });
  };
  cx.timer.every(POLL_MS, tick);
  tick(cx);
}

// One segment per in-session subagent: live ones breathe, finished ones are done/blocked.
const segments = (t, crew) => h_flex().flex_1().min_w(0).gap(2).children(crew.map((g) => {
  const seg = div().id(`seg-${g.id}`).flex_1().h(3).rounded(2);
  if (!g.finished) return seg.bg(t.working).loop("opacity", { from: 0.45, to: 1, period: 1000 });
  return seg.bg(g.lost || g.recent.at(-1)?.state === "err" ? t.blocked : t.done);
}));

// Progress of a delegated task (a subagent), from the best signal there is:
// its own step reports (done/total, rate-extrapolated), else how long its type usually takes, else elapsed only.
const GAP_S = 120; // must match scan.py
const dur = (s) => (s < 60 ? `${Math.max(1, Math.round(s))}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);
function progress(g, now) {
  const since = g.usage?.ts ? Math.min(GAP_S, Math.max(0, now / 1000 - g.usage.ts)) : 0;
  const spent = (g.usage?.active ?? 0) + since, typ = g.typical, st = g.usage?.step ?? g.step;
  if (st?.total > 0) {
    const left = st.done > 0 ? (spent / st.done) * (st.total - st.done) : typ ? typ.median - spent : null;
    return { frac: Math.min(1, st.done / st.total), label: left > 0 ? `~${dur(left)}` : `${st.done}/${st.total}` };
  }
  if (typ) {
    const goal = spent < typ.median ? typ.median : typ.p75;
    return spent < goal ? { frac: Math.min(0.95, spent / goal), label: `~${dur(goal - spent)}` } : { frac: 0.95, label: dur(spent), over: true };
  }
  return { frac: null, label: dur(spent) };
}

/** True when the agent shows a task list (so its row offers the fold chevron even without sub-terminals). */
export function hasTasks(self, a, now = Date.now()) {
  const s = self.crew?.[a.address], u = s?.main?.usage, fl = u?.flow;
  if (!s || !(isClaude(a) || isCodex(a)) || !(a.status === "working" || a.status === "blocked" || a.focused)) return false;
  return (u?.todos?.length ?? 0) + (s.agents?.length ?? 0) > 0 || Boolean(fl && (!fl.finished || now - Date.parse(fl.at ?? "") < FLOW_KEEP_MS));
}

/**
 * Under a Claude/Codex row: what it does now, then — unfolded — how the work is cut up and how far each piece is.
 *   folded:   activity · tasks done/total · Jev mark · context %  ›            (one 20px line)
 *   unfolded: a progress line (the savvy flow's title, or "Tasks") with the overall bar, then one 20px line per
 *             task: status glyph · title · its own bar and figure. Tasks = the session's plan (TodoWrite /
 *             TaskCreate) and the subagents it delegated to. Flat lines on the name's edge, no card.
 */
export function crewLines(self, t, a, now) {
  const s = self.crew?.[a.address];
  if (!s || !(isClaude(a) || isCodex(a))) return [];
  const u = s.main?.usage, last = s.main?.recent?.at(-1), f = ctxFrac(u);
  const live = a.status === "working" || a.status === "blocked";
  if (!live && !a.focused) return [];
  const MC = MODEL_COLOR(t);
  const micro = (text, color) => div().flex_none().text_size(SIZE.micro).text_color(color ?? t.dim).child(text);
  const j = s.jev, jOn = j && j.enabled !== false && j.reason !== "no-key", jFresh = j && now - (j.at ?? 0) < JEV_FRESH_MS;
  const jRoute = jOn ? (j.route === "session" ? u?.model || j.model : j.route) : null;

  // the decomposition: the plan first, then what was delegated
  const plan = (u?.todos ?? []).map((x) => ({ id: `td-${x.id}`, title: x.status === "in_progress" && x.doing ? x.doing : x.title,
    state: x.status === "completed" ? "done" : x.status === "in_progress" ? "run" : "todo" }));
  const subs = (s.agents ?? []).map((g) => {
    const err = g.lost || g.recent.at(-1)?.state === "err";
    return { id: `sa-${g.id}`, title: g.name, state: !g.finished ? "run" : err ? "fail" : "done", p: !g.finished ? progress(g, now) : null,
      note: !g.finished ? g.recent.at(-1)?.line : null };
  });
  const tasks = [...plan, ...subs], done = tasks.filter((x) => x.state === "done").length;
  const fl = u?.flow, flowOn = fl && (!fl.finished || now - Date.parse(fl.at ?? "") < FLOW_KEEP_MS);
  // one fold per agent, the row's chevron (main.js self.folded): it hides the task list and the sub-terminals together
  const open = !self.folded.has(a.address) && (tasks.length > 0 || flowOn);

  const summary = h_flex().id(`sum-${a.address}`).ml(32).pr(8).h(20).gap(6).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(SIZE.meta).text_color(last?.state === "err" ? t.blocked : live ? t.muted : t.dim).child(last?.line ?? "No activity yet"))
    // unfolded, the Tasks head carries the count
    .when(!open && (tasks.length > 0 || (flowOn && fl.total)), (el) => el.child(micro(flowOn && fl.total ? `${fl.done}/${fl.total}` : `${done}/${tasks.length}`,
      tasks.some((x) => x.state === "run") ? t.working : t.dim)))
    .when(Boolean(jRoute), (el) => el.child(div().id(`jm-${a.address}`).size(6).flex_none().rounded(1).bg(MC[familyOf(jRoute)] ?? t.muted)
      .tooltip(`Jev → ${modelShort(jRoute)} · ${jevWhy(j, u?.model)}`).when(jFresh, (m) => m.loop("opacity", { from: 0.35, to: 1, period: 900 }))))
    .when(f != null, (el) => el.child(div().id(`cx-${a.address}`).flex_none().text_size(SIZE.micro).text_color(f >= 0.6 ? fillColor(t, f) : t.dim)
      .tooltip(`Context ${tok(u.ctx)} / ${tok(u.window || windowOf(u.model))}${f >= COMPACT_AT ? " · click to type /compact" : ""}`)
      .when(f >= COMPACT_AT && a.status !== "blocked", (el2) => el2.cursor_pointer().on_click((_e, cx) => {
        cx.stop_propagation(); hc(["keys", a.address, ..."/compact"]).catch(() => {}); run("agent.focus", { terminal: a.address });
      }))
      .child(`${Math.round(f * 100)}%`)));
  if (!open) return [summary];

  const bar = (id, frac, color, w) => h_flex().id(id).flex_none().w(w).h(3).rounded(2).overflow_hidden().bg(t.border)
    .child(div().h_full().rounded(2).flex_basis(0).flex_grow(frac).bg(color)).child(div().h_full().flex_basis(0).flex_grow(1 - frac));
  const glyph = (x) => x.state === "run" ? spinner(t.working, 10)
    : x.state === "done" ? svg(ICON("circle-check")).size(10).flex_none().text_color(t.done)
    : x.state === "fail" ? svg(ICON("x")).size(10).flex_none().text_color(t.blocked)
    : div().size(8).flex_none().rounded(4).border_1().border_color(t.input); // to do: an empty ring

  // overall: the savvy flow names the work when there is one
  const total = Math.max(1, tasks.length), overall = flowOn && fl.total ? Math.min(1, fl.done / fl.total) : done / total;
  // the head names the work and carries the overall progress as a 2px rule across the full width
  const head = v_flex().id(`tk-${a.address}`).ml(32).mr(8).pt(4).pb(4).gap(4)
    .child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(SIZE.micro).text_color(t.muted).child(flowOn ? fl.title : "Tasks"))
      .child(micro(flowOn ? flowLabel(fl, subs.filter((x) => x.state === "run").length) : `${done}/${tasks.length}`, t.muted)))
    .child(h_flex().h(2).rounded(1).overflow_hidden().bg(t.border)
      .child(div().h_full().flex_basis(0).flex_grow(overall).bg(overall >= 1 ? t.done : t.working))
      .child(div().h_full().flex_basis(0).flex_grow(1 - overall)));

  const MAX = 8, shown = tasks.length > MAX ? [...tasks.filter((x) => x.state === "run"), ...tasks.filter((x) => x.state !== "run")].slice(0, MAX) : tasks;
  // a running delegated task takes a second line: its own bar across the width, then the figure; the name keeps line one
  const row = (x) => v_flex().id(`${x.id}-${a.address}`).ml(32).mr(8)
    .tooltip(x.note ? `${x.title}\n${x.note}` : x.title)
    .child(h_flex().h(20).gap(6).items_center()
      .child(div().w(10).flex_none().flex().justify_center().child(glyph(x)))
      .child(div().flex_1().min_w(0).truncate().text_size(SIZE.meta).text_color(x.state === "run" ? t.foreground : x.state === "todo" ? t.muted : t.dim).child(x.title)))
    .when(Boolean(x.p), (el) => el.child(h_flex().pl(16).h(12).gap(8).items_center()
      .when(x.p.frac != null, (e2) => e2.child(h_flex().id(`tp-${x.id}`).flex_1().min_w(24).h(3).rounded(2).overflow_hidden().bg(t.border)
        .child(div().h_full().rounded(2).flex_basis(0).flex_grow(x.p.frac).bg(x.p.over ? t.blocked : t.working))
        .child(div().h_full().flex_basis(0).flex_grow(1 - x.p.frac))))
      .when(x.p.frac == null, (e2) => e2.child(div().flex_1()))
      .child(div().flex_none().w(28).text_right().text_size(SIZE.micro).text_color(x.p.over ? t.blocked : t.dim).child(x.p.label)))); // fixed: every bar ends on one line
  // the plan, then what was delegated, under a quiet label when both are there
  const planRows = shown.filter((x) => x.id.startsWith("td-")).map(row), subRows = shown.filter((x) => x.id.startsWith("sa-")).map(row);
  const rows = [...planRows,
    ...(planRows.length && subRows.length ? [div().ml(48).mt(4).h(16).text_size(SIZE.micro).text_color(t.dim).child("Delegated")] : []), ...subRows];
  return [summary, head, ...rows, ...(tasks.length > MAX ? [div().ml(48).h(16).text_size(SIZE.micro).text_color(t.dim).child(`+${tasks.length - MAX} more`)] : [])];
}

// The savvy-flow orchestrator's counter (mcp__savvy-progress__progress, via scan.py), as its band words it.
const FLOW_KEEP_MS = 30 * 60_000; // a finished flow stays shown this long
function flowLabel(f, busy) {
  if (f.finished) return "Done";
  if (f.phase === "plan") return "Planning";
  if (f.phase === "design") return "Design";
  return `${f.phase === "review" ? "Review" : "Tasks"} ${f.total ? `${f.done}/${f.total}` : `${busy} busy`}`;
}

// ---- Jev router -------------------------------------------------------------------------------------------
// The jev-router Claude Code mod picks a model per prompt; scan.py hands us its last call (s.jev).
// The moment of the card is the distribution: one stacked bar, a segment per class in its model's color,
// the chosen class solid and the rest faint, so "how close was it" reads at a glance.
const JEV_FRESH_MS = 12_000; // just routed: the card lights up (amber edge, breathing mark), then goes quiet
const JEV_GATE = 60_000; // keep in sync with MAX_DOWNSHIFT_TOKENS in the router's register.ts
const CORAL = "#D97757";
const MODEL_COLOR = (t) => ({ opus: CORAL, sonnet: t.ansi4, haiku: t.ansi2, fable: t.ansi5 });
const familyOf = (m) => ["opus", "sonnet", "haiku", "fable"].find((k) => (m ?? "").toLowerCase().includes(k)) ?? null;
const CLASSES = ["haiku", "sonnet", "hard", "continue"];

export function jevWhy(j, sessionModel) {
  const r = j.reason ?? "";
  if (j.enabled === false) return "Off · /jev on";
  if (r === "no-key") return "No API key";
  if (r.startsWith("cache-gate")) return `Held · cache ${tok(j.ctx ?? 0)}`;
  if (r.startsWith("low-confidence")) return `Held · under ${Math.round((j.threshold ?? 0) * 100)}%`;
  if (r === "continue") return "Kept the last route";
  if (r === "secret-skip") return "Secret · not sent";
  if (r === "jev-unavailable") return "Unreachable";
  return j.route === "session" ? `Hard · kept ${modelShort(sessionModel || j.model) || "session"}` : `Down to ${modelShort(j.route)}`;
}

/** Quiet band under the header: files two sessions wrote lately, and who. */
export function conflictBand(self, t) {
  const live = agents().filter((a) => isClaude(a) || isCodex(a));
  const clash = conflictsOf(live.map((a) => a.address), self.crew ?? {});
  if (!clash.length) return null;
  const name = (addr) => { const a = live.find((x) => x.address === addr); return a?.space_name || a?.address || addr; };
  return v_flex().id("conflicts").flex_none().mx(8).mb(4).px(8).py(6).gap(2).rounded(8).bg(t.blocked + "14")
    .children(clash.slice(0, 3).map(({ file, agents: who }, i) => h_flex().id(`clash-${i}`).gap(6).items_center().text_size(SIZE.meta)
      .tooltip(`${file}: written by ${who.map(name).join(", ")} in the last 30 min`)
      .child(svg(ICON("git-compare")).size(11).flex_none().text_color(t.blocked))
      .child(div().flex_shrink(1).min_w(0).truncate().text_color(t.blocked).child(file.split("/").at(-1)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(who.map(name).join(" · ")))))
    .when(clash.length > 3, (el) => el.child(div().pl(17).text_size(SIZE.micro).text_color(t.dim).child(`+${clash.length - 3} more files`)));
}
