// The keyboard's place in the panel (crew-kit DESIGN.md "Keyboard"): what the cursor
// stands on, how it follows the data, and the keys each item takes. No "herdr"
// import, so node tests load it.

// Rows drawn per group; a bigger group says how many more there are.
export const MAX_ROWS = 500;

/** A discard of these files: tracked ones restored, untracked ones deleted (the dialog says which). */
export const discardOf = (files) => ({ type: "discard", tracked: files.filter((f) => !f.untracked).map((f) => f.path), untracked: files.filter((f) => f.untracked).map((f) => f.path) });

/** The changes list as the cursor walks it: each group's header, then its drawn files (none while folded). */
export function changeItems(groups, collapsed, max = MAX_ROWS) {
  const out = [];
  const add = (group, files) => {
    if (!files.length) return;
    out.push({ id: `h:${group}`, group, files });
    if (!collapsed[group]) for (const file of files.slice(0, max)) out.push({ id: `f:${group}:${file.path}`, group, file });
  };
  add("staged", groups.staged);
  add("changes", [...groups.conflicts, ...groups.changes]);
  return out;
}

/**
 * Where the cursor is now, from what it was ({ id, next, index }): the same item,
 * else the one that followed it (a staged file leaves the list), else the same place, clamped.
 */
export function follow(ids, { id, next, index = 0 } = {}) {
  if (!ids.length) return -1;
  let at = id == null ? -1 : ids.indexOf(id);
  if (at < 0 && next != null) at = ids.indexOf(next);
  return at >= 0 ? at : Math.max(0, Math.min(ids.length - 1, index));
}

/** The first item drawn so the cursor stays inside a view `rows` items tall (a plain scroll area can't be scrolled from code). */
export function windowTop(top, index, rows) {
  if (!(rows >= 1) || index < 0) return 0;
  if (index < top) return index;
  if (index >= top + rows) return index - rows + 1;
  return Math.max(0, top);
}

/**
 * The letters an item of the changes list takes, as its hover buttons do (same actions,
 * same confirms): [{ key, label, action }]; `action.type === "resolve"` is the conflict's +.
 */
export function changeKeys(item) {
  if (!item) return [];
  if (item.file) {
    const f = item.file;
    if (item.group === "staged") return [{ key: "u", label: "unstage", action: { type: "unstage", paths: [f.path] } }];
    if (f.status === "!") return [{ key: "s", label: "resolve", action: { type: "resolve", file: f } }];
    return [{ key: "s", label: "stage", action: { type: "stage", paths: [f.path] } }, { key: "d", label: f.untracked ? "delete" : "discard", action: discardOf([f]) }];
  }
  if (item.group === "staged") return [{ key: "u", label: "unstage all", action: { type: "unstage", paths: item.files.map((f) => f.path) } }];
  const changes = item.files.filter((f) => f.status !== "!");
  return changes.length ? [{ key: "s", label: "stage all", action: { type: "stage", paths: changes.map((f) => f.path) } },
    { key: "d", label: "discard all", action: discardOf(changes) }] : [];
}

/**
 * The key hints for what the keyboard can do right now.
 * region: "changes" | "graph" | "diff"; item: the changes cursor's; other: the region Tab goes to;
 * inner: Esc closes something before it gives the keyboard back.
 */
export function hintsFor({ typing = false, region, item, other, inner = false, hunks = null }) {
  if (typing) return [["⌘↵", "commit"], ["Esc", "list"]];
  const esc = ["Esc", inner ? "close" : "terminal"], tab = other ? [["Tab", other]] : [];
  if (region === "changes") {
    return [["↑↓", "move"], ...(item ? [["↵", item.file ? "diff" : "fold"]] : []), ...changeKeys(item).map((k) => [k.key, k.label]),
      ...(item ? [["Space", "fold"]] : []), ["c", "message"], ["m", "menu"], ...tab, esc];
  }
  if (region === "graph") return [["↑↓", "move"], ["↵", "details"], ["m", "menu"], ...tab, esc];
  // hunks: "stage" | "unstage" while the open diff has hunks to act on (discard only for unstaged ones)
  if (region === "diff") return [["↑↓", "file"], ...(hunks ? [["n p", "hunk"], ["s", hunks], ...(hunks === "stage" ? [["d", "discard"]] : [])] : []), ...tab, esc];
  return [esc];
}
