// A found repository whose .git/config runs programs is detected without running them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RISKY, riskyKeys, syncOf } from "../repos.js";

assert.deepEqual(riskyKeys("local\tfilter.lfs.clean git-lfs clean -- %f\nlocal\tfilter.lfs.clean x\nworktree\tcore.sshcommand ssh -i k\n"), ["filter.lfs.clean", "core.sshcommand"]);
assert.deepEqual(riskyKeys("global\tfilter.lfs.clean git-lfs clean\nsystem\tcredential.helper osxkeychain\n"), [], "the person's own config is not the repo's");
assert.deepEqual(riskyKeys("local\tcore.fsmonitor true\nlocal\tcore.fsmonitor ./evil\nlocal\tremote.origin.uploadpack sh -c x\n"), ["core.fsmonitor", "remote.origin.uploadpack"]);
assert.deepEqual(riskyKeys(""), []);
assert.deepEqual(syncOf({ untrusted: ["filter.x.clean"] }), { kind: "untrusted", text: "not read" });

const dir = mkdtempSync(join(tmpdir(), "git-trust-")), pwned = join(dir, "PWNED");
const git = (...a) => execFileSync("git", a, { cwd: dir }).toString();
git("init", "-q"); writeFileSync(join(dir, "f"), "a"); git("add", "f");
git("-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "i");
git("config", "filter.evil.clean", `touch ${pwned}; cat`);
writeFileSync(join(dir, ".gitattributes"), "* filter=evil\n"); writeFileSync(join(dir, "f"), "b");
utimesSync(join(dir, "f"), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
assert.deepEqual(riskyKeys(execFileSync("git", RISKY, { cwd: dir }).toString()), ["filter.evil.clean"]);
assert.equal(existsSync(pwned), false, "reading the config must not run the filter");

// A plain repository has none of its own.
const clean = mkdtempSync(join(tmpdir(), "git-trust-")); execFileSync("git", ["init", "-q"], { cwd: clean });
let out = ""; try { out = execFileSync("git", RISKY, { cwd: clean, stdio: "pipe" }).toString(); } catch {}
assert.deepEqual(riskyKeys(out), []);
// A key reached through a local include counts.
const inc = mkdtempSync(join(tmpdir(), "git-trust-")); execFileSync("git", ["init", "-q"], { cwd: inc });
writeFileSync(join(inc, "x.cfg"), "[remote \"o\"]\n\tuploadpack = sh -c id\n");
execFileSync("git", ["config", "include.path", join(inc, "x.cfg")], { cwd: inc });
assert.ok(riskyKeys(execFileSync("git", RISKY, { cwd: inc }).toString()).includes("include.path"));
console.log("trust: ok");
