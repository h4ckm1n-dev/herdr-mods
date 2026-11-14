// Small helpers for the CI Dash mod.

/** Runs an async mapper over a list with a bounded number of workers. */
export async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Artifact names are free text ("Notepad++.gcc.x86_64.Release"), so only a
// known extension counts as a file type; "Release" or "x86_64" do not.
const KNOWN_TYPES = new Set([
  "zip", "7z", "rar", "tar", "tar.gz", "tar.bz2", "tar.xz", "tar.zst", "tar.lz4", "tgz", "gz", "bz2", "xz", "zst",
  "exe", "msi", "msix", "msixbundle", "appx", "appxbundle", "dll", "pdb", "lib", "obj",
  "dmg", "pkg", "app", "dylib", "ipa",
  "deb", "rpm", "apk", "aab", "appimage", "flatpak", "snap", "so", "a",
  "jar", "war", "ear", "whl", "egg", "nupkg", "snupkg", "vsix", "crate", "gem",
  "iso", "img", "bin", "wasm", "elf",
  "pdf", "html", "htm", "json", "xml", "yml", "yaml", "toml", "txt", "log", "csv", "md", "sarif", "lcov", "trx",
  "xlsx", "docx", "pptx", "png", "jpg", "jpeg", "gif", "svg", "webp", "mp4", "mov", "webm",
  "sh", "ps1", "bat", "cmd", "py", "js", "ts",
]);

/** The file extension of an artifact name when it is a known type (`zip`, `exe`, `tar.gz`), else "". */
export function fileType(name) {
  const m = /\.(tar\.(?:gz|bz2|xz|zst|lz4)|[a-z0-9]+)$/.exec(String(name || "").toLowerCase());
  return m && KNOWN_TYPES.has(m[1]) ? m[1] : "";
}

export function bytes(n) {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * Maps a run, job or step to a state: "running", "queued", "success",
 * "failure", "warning" or "neutral". `done` is true when it can no longer change.
 */
export function stateOf(item) {
  const status = item?.status, conclusion = item?.conclusion;
  if (status === "in_progress") return { kind: "running", label: "running", done: false };
  if (status && status !== "completed") return { kind: "queued", label: String(status).replace(/_/g, " "), done: false };
  switch (conclusion) {
    case "success": return { kind: "success", label: "success", done: true };
    case "failure": return { kind: "failure", label: "failed", done: true };
    case "timed_out": return { kind: "failure", label: "timed out", done: true };
    case "startup_failure": return { kind: "failure", label: "startup failure", done: true };
    case "action_required": return { kind: "warning", label: "action required", done: true };
    case "cancelled": return { kind: "neutral", label: "cancelled", done: true };
    case "skipped": return { kind: "neutral", label: "skipped", done: true };
    case "neutral": return { kind: "neutral", label: "neutral", done: true };
    case "stale": return { kind: "neutral", label: "stale", done: true };
    default: return { kind: "neutral", label: conclusion || "completed", done: status === "completed" };
  }
}

export const GLYPH = { success: "✓", failure: "✕", warning: "!", neutral: "–", queued: "○", running: "●" };

/**
 * `gh run view --log-failed` as steps: its lines are "job<TAB>step<TAB>timestamp text". Each failed
 * step keeps the `tail` lines up to its last ##[error] (what follows is the runner cleaning up),
 * without timestamps or colour codes. gh names a step "UNKNOWN STEP" when it can't tell: shown as none.
 */
export function failedSteps(text, tail = 40, width = 300) {
  const steps = [];
  for (const raw of String(text || "").split("\n")) {
    const [job, named, ...rest] = raw.split("\t");
    if (!rest.length) continue;
    const step = named === "UNKNOWN STEP" ? "" : named;
    const line = rest.join("\t").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "").replace(/\s+$/, "");
    let s = steps[steps.length - 1];
    if (!s || s.job !== job || s.step !== step) steps.push(s = { job, step, lines: [] });
    if (line && !/^##\[(group|endgroup)\]/.test(line)) s.lines.push(line.replace(/^##\[error\]/, "error: ").slice(0, width));
  }
  return steps.filter((s) => s.lines.length).map((s) => {
    const end = s.lines.findLastIndex((l) => l.startsWith("error: ")) + 1 || s.lines.length;
    return { ...s, cut: Math.max(0, end - tail), lines: s.lines.slice(Math.max(0, end - tail), end) };
  });
}

/** What an agent gets about a failed run: which run, which step, and the end of its log. */
export function failureReport(run, steps) {
  const head = `CI run #${run.run_number} "${run.display_title || run.name}" failed on ${run.head_branch || "?"} (${run.name}): ${run.html_url || ""}`.trim();
  return [head, ...steps.flatMap((s) => ["", `${s.step ? `${s.job} › ${s.step}` : s.job}${s.cut ? ` (last ${s.lines.length} lines)` : ""}:`, ...s.lines])].join("\n") + "\n";
}
