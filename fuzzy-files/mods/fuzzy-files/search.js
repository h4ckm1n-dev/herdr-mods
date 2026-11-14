// A typed space stands for any separator, as in fzf: "src main" finds src/main.js, "a b" still not "ab".
const SEP = /[\s:.\-_/]/;
function find(text, ch, at) {
  if (!/\s/.test(ch)) return text.indexOf(ch, at);
  for (let i = at; i < text.length; i++) if (SEP.test(text[i])) return i;
  return -1;
}

// Same boundary/consecutive-character scoring as palette-crew.
export function fuzzy(query, path) {
  const text = path.toLowerCase();
  let score = 0, at = 0, run = 0;
  for (const ch of query.trim().replace(/\s+/g, " ").toLowerCase()) {
    const i = find(text, ch, at);
    if (i < 0) return null;
    const boundary = i === 0 || SEP.test(text[i - 1]);
    run = i === at && at > 0 ? run + 1 : 0;
    score += 1 + (boundary ? 6 : 0) + run * 3 - Math.min(i - at, 6) * 0.3;
    at = i + ch.length;
  }
  return score - path.length * 0.02;
}

/** Indices of path the query matched, the same greedy walk as fuzzy(): what a row lights up. */
export function hits(query, path) {
  const text = path.toLowerCase(), out = [];
  let at = 0;
  for (const ch of query.trim().replace(/\s+/g, " ").toLowerCase()) {
    const i = find(text, ch, at);
    if (i < 0) return [];
    if (!/\s/.test(ch)) out.push(i); // the separator a space matched stays unlit
    at = i + ch.length;
  }
  return out;
}

export const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** Home folder as ~, so the folder line keeps the part that names the project. */
export const tilde = path => path.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");

export function rank(files, query) {
  if (!query.trim()) return files;
  return files.map(path => ({ path, score: fuzzy(query, path) }))
    .filter(row => row.score !== null)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .map(row => row.path);
}

export function context(focus, spaces, panes) {
  const space = spaces.find(s => s.id === focus?.space) ?? spaces.find(s => s.active);
  const tab = focus?.tab ?? space?.tabs.find(t => t.active)?.id;
  const pane = panes.find(p => p.pane === focus?.pane && p.tab === tab);
  const terminalMachine = focus?.terminal?.includes("/") ? focus.terminal.split("/")[0] : null;
  const root = pane?.cwd || panes.find(p => p.tab === tab && p.cwd)?.cwd
    || (focus?.tab === tab && terminalMachine === (space?.machine ?? null) && focus?.cwd) || space?.folder;
  return { root, space: space?.id, on: space?.machine ?? null };
}

// Quitting nvim closes its tab, as in the Files panel: Herdr keeps a shell after the program ends, so a detached
// job ends the terminal once nvim is gone (killing from VimLeave itself hits nvim with SIGHUP).
export const QUIT_CLOSES_TAB = `autocmd VimLeave * if !empty($HC_TERMINAL_ID) | call jobstart(['sh', '-c', 'while ps -o stat= -p "$1" | grep -qv Z; do sleep 0.05; done; hc kill "$2"', 'sh', string(getpid()), $HC_TERMINAL_ID], {'detach': 1}) | endif`;

export function openArgs(location, relative) {
  return { space: location.space, folder: location.root,
    name: relative.split(/[\\/]/).at(-1), argv: ["nvim", "--cmd", QUIT_CLOSES_TAB, "--", relative] };
}
