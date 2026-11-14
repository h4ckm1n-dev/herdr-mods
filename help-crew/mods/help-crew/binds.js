// keys.json bindings as the Keybinds sheet lists them: one entry per action, named for people.
// Pure (no Herdr imports), so `node tests/binds.test.mjs` checks it.

const GROUPS = [["Spaces", /^space\./], ["Tabs", /^tab\./], ["Panes", /^pane\./], ["Agents", /^agent\./],
  ["Terminal", /^terminal\.|^send:/], ["Layout", /^layout\./], ["App", /^(app|window|overlay)\./]];

// readline sequences the terminal keybinds send, by what they do
const SEND = { "\u0017": "Delete word", "\u0015": "Delete line", "\u0001": "Line start", "\u0005": "Line end",
  "\u001bb": "Word left", "\u001bf": "Word right", "\u001b\u007f": "Delete word" };

// OhMyHerdr's own actions, said as what they do; any other mod gets a name made from its id.
const NAMES = {
  "mod.open:picker-crew": "Go to a tab, space or agent", "mod.open:picker": "Go to a tab or space",
  "mod.open:help-crew": "Keybinds", "mod.open:fuzzy-files": "Find files", "mod.open:session-recap": "Session recap",
  "mod.open:mod-manager": "OhMyHerdr Mods", "mod.open:claude-manager": "Claude Manager", "mod.open:theme-gallery": "Theme Gallery",
  "mod.open:palette-crew": "Command palette", "mod.open:settings-crew": "Settings",
  "tabs-crew.files": "Files panel", "tabs-crew.graph": "Git panel", "tabs-crew.ci": "CI runs panel", "tabs-crew.cost": "Cost panel",
  "tabs-crew.next-blocked": "Next agent that needs you", "agents-crew.focus": "Keyboard to the Agents list", "spaces-crew.focus": "Keyboard to the Spaces list",
};
const words = (s) => s.replace(/-crew$/, "").replace(/[-_]/g, " ");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The group an action belongs to: Herdr's own by its noun, everything else is a mod's. */
export const groupOf = (action) => (action.startsWith("mod.open:") ? "Mods" : GROUPS.find(([, re]) => re.test(action))?.[0] ?? "Mods");

/** "tab.new" → "New tab", "pane.split:right" → "Split pane right", "tabs-crew.graph" → "Git panel". */
export function label(action) {
  if (NAMES[action]) return NAMES[action];
  if (action.startsWith("send:")) return SEND[action.slice(5)] ?? `Type ${JSON.stringify(action.slice(5))}`;
  const at = action.indexOf(":"), name = at < 0 ? action : action.slice(0, at), arg = at < 0 ? "" : action.slice(at + 1);
  if (name === "mod.open") return `Open ${words(arg)}`;
  const [noun, ...rest] = name.split(".");
  if (groupOf(action) === "Mods") return `${cap(words(noun))}: ${words(rest.join(" "))}`;
  const said = [...rest.join(" ").split("_"), noun === "app" ? "" : noun].filter(Boolean).join(" ");
  return cap(arg ? `${said} ${arg}` : said);
}

const whereOf = (section) => (section === "global" ? "" : section.startsWith("layout:") ? `${section.slice(7)} layout` : `in ${section}`);

/**
 * Bindings → entries { id, action, label, group, section, where, keys: [spec] }, in group order.
 * An action bound twice is one entry with both keys; a numbered run ("tab.select:1" … ":9" on
 * "cmd-1" … "cmd-9") is one entry, "Select tab 1–9", with the key drawn as a range.
 */
export function entries(bound) {
  const out = new Map();
  const runs = new Map(); // section|base|key prefix → the digits bound
  for (const b of bound) {
    const m = /^(.+):([1-9])$/.exec(b.action);
    if (!m || !b.keys.endsWith(m[2])) continue;
    const k = `${b.section}|${m[1]}|${b.keys.slice(0, -1)}`;
    runs.set(k, [...(runs.get(k) ?? []), Number(m[2])]);
  }
  for (const b of bound) {
    const m = /^(.+):([1-9])$/.exec(b.action);
    const run = m && b.keys.endsWith(m[2]) ? runs.get(`${b.section}|${m[1]}|${b.keys.slice(0, -1)}`) : null;
    if (run && run.length >= 3) {
      const span = `${Math.min(...run)}–${Math.max(...run)}`, id = `${b.section}|${m[1]}:${span}`;
      const e = out.get(id) ?? { id, action: `${m[1]}:${span}`, label: `${label(m[1])} ${span}`, group: groupOf(m[1]), section: b.section, where: whereOf(b.section), keys: [], range: true };
      const key = `${b.keys.slice(0, -1)}${span}`;
      if (!e.keys.includes(key)) e.keys.push(key);
      out.set(id, e);
      continue;
    }
    const id = `${b.section}|${b.action}`;
    const e = out.get(id) ?? { id, action: b.action, label: label(b.action), group: groupOf(b.action), section: b.section, where: whereOf(b.section), keys: [] };
    e.keys.push(b.keys);
    out.set(id, e);
  }
  const order = [...GROUPS.map(([g]) => g), "Mods"];
  return [...out.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

// Never run from the sheet: a click there is a look, and these close, quit or reset something.
const NEVER = /^(app\.(reset|quit|update|update_core|hide|hide_others)|window\.\w+|\w+\.(close|kill))(:|$)/;

/**
 * The action as run() takes it ("pane.split:right": Herdr parses name:value the way keys.json does),
 * or null when a key press is the only way: typed sequences, a 1–9 run, anything destructive (NEVER),
 * a command that needs an argument the binding doesn't give. known: commands().
 */
export function runnable(entry, known = []) {
  const a = entry.action;
  if (entry.range || a.startsWith("send:") || NEVER.test(a)) return null;
  const at = a.indexOf(":"), name = at < 0 ? a : a.slice(0, at);
  if (name === "mod.open") return at < 0 ? null : a;
  const cmd = known.find((c) => c.name === name);
  if (!cmd) return at < 0 && groupOf(a) === "Mods" ? a : null; // "<mod>.<command>"
  if (at < 0) return cmd.args.some((x) => x.required) ? null : a;
  return cmd.args.length ? a : null;
}
