# CI runs

GitHub Actions runs, manual dispatch and artifacts for the focused terminal's repository, styled with Crew's panel frame, headers, controls and type scale.

Requires an authenticated GitHub CLI (`gh auth login`). Install `mods/ci-dash` into `~/.config/herdr-app/mods/`, then run `herdr-app check ~/.config/herdr-app/mods/ci-dash`.

The local Crew layout uses a `ci` block in its `panel-body` stack, pointing to `ci-dash`. Its toolbar button sits beside Git and toggles that panel. The panel uses Crew's rounded frame in both side-panel and standalone use.

Runs shows the latest 30 runs with filters, jobs and steps. Dispatch retains workflow, branch, inputs and explicit review before starting a run. Artifacts downloads into `<repo>/.ci-dash/artifacts/`; add `.ci-dash/` to the repository's ignore rules if you use downloads. Rerun, Cancel and Dispatch change real GitHub runs only when clicked.

GitHub calls use the existing `gh` login; no credentials are stored by the mod. The mod runs local programs and uses network access through `gh`. Large downloads may exceed its 30-second command timeout.

UI polish follows unslop by Damir Sokolovsky (@heydamir), CC BY 4.0, adapted to the existing Crew design. See [RECIPE.md](RECIPE.md) for behavior and implementation details.
