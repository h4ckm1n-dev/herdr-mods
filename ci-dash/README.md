<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/mod-ci-dash.png" width="100%" alt="Kai Finds · OhMyHerdr module: CI runs">

# CI runs

[![Maintained by Kai Finds](https://img.shields.io/badge/maintained%20by-Kai%20Finds-00E5FF?style=flat-square&labelColor=0B0F14)](https://github.com/Kai-Finds)

GitHub Actions runs, manual dispatch and artifacts for the focused terminal's repository, styled with Crew's panel frame, headers, controls and type scale.

<a id="worth-it-or-skip-it"></a>
<img src="https://raw.githubusercontent.com/Kai-Finds/OhMyHerdr/main/.github/kaifinds/worth-it.png" width="100%" alt="Worth it, or skip it?">

**✅ Worth it if**
- your work runs on GitHub Actions and you want runs, reruns, dispatch and artifacts next to the terminal
- you already use the GitHub CLI

**❌ Skip it if**
- you don't use GitHub Actions or `gh`
- you pull large artifacts: commands time out after 30 seconds

Requires an authenticated GitHub CLI (`gh auth login`). Install it with `./install.sh ci-dash`; the Crew layout brings it along.

The Crew layout has a `ci` block in its `panel-body` stack, pointing to `ci-dash`. Its toolbar button sits beside Git and toggles that panel. The panel uses Crew's rounded frame in both side-panel and standalone use.

Runs shows the latest 30 runs with filters, jobs and steps. Dispatch retains workflow, branch, inputs and explicit review before starting a run. Artifacts downloads into `<repo>/.ci-dash/artifacts/`, which ignores itself in git (`.ci-dash/.gitignore`). A failed run shows the end of each failed step's log under its jobs, with **Copy** and **Send to agent**, which pastes the run, the step and that log into the agent of the shown tab. Rerun, Cancel and Dispatch change real GitHub runs only when clicked.

GitHub calls use the existing `gh` login; no credentials are stored by the mod. The mod runs local programs and uses network access through `gh`. Large downloads may exceed its 30-second command timeout.

UI polish follows unslop by Damir Sokolovsky (@heydamir), CC BY 4.0, adapted to the existing Crew design. See [RECIPE.md](RECIPE.md) for behavior and implementation details.

---

<sub><b>Kai Finds</b> · Do more with AI · <a href="https://github.com/Kai-Finds">github.com/Kai-Finds</a> · <a href="https://kaifinds.sabaidev.la">kaifinds.sabaidev.la</a></sub>
