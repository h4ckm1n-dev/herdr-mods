#!/bin/bash
# Build patched Herdr and install OhMyHerdr mods through the existing installer.
set -euo pipefail

die() { echo "build: $*" >&2; exit 1; }
case "${1:-}" in
  -h|--help)
    echo 'Usage: ./native/window-opacity/build.sh'
    echo 'Builds .build/herdr-opacity/Herdr.app on macOS and installs OhMyHerdr mods and the Crew layout.'
    exit 0 ;;
  '') ;;
  *) die 'No arguments supported; see --help.' ;;
esac
[[ $(uname -s) == Darwin ]] || die 'This builder requires macOS.'
for tool in git rustup zig xcrun codesign python3; do
  command -v "$tool" >/dev/null || die "Missing $tool; see native/window-opacity/README.md."
done
xcrun --find clang >/dev/null || die 'Install Xcode Command Line Tools: xcode-select --install'
[[ $(zig version) == 0.16.0 ]] || die 'Zig 0.16.0 is required (the pinned upstream build uses it).'
rustup run 1.95.0 rustc --version >/dev/null || die 'Install Rust: rustup toolchain install 1.95.0 --profile minimal'

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
work="$root/.build/herdr-opacity"
source="$work/source"
base=b67715e8985e6097f83f8120fc9b9e52e6596f50
patch="$here/window-opacity.patch"
mkdir -p "$work"
if [[ ! -d "$source/.git" ]]; then
  [[ ! -e "$source" ]] || die "Source path already exists: $source (move it aside to retry)."
  git init -q "$source"
  git -C "$source" remote add origin https://github.com/herdrdev/herdr-app.git
fi
[[ $(git -C "$source" remote get-url origin) == https://github.com/herdrdev/herdr-app.git ]] || die 'Unexpected source remote.'
if ! git -C "$source" rev-parse --verify HEAD >/dev/null 2>&1; then
  git -C "$source" fetch --depth 1 origin "$base"
  git -C "$source" checkout --detach "$base"
fi
[[ $(git -C "$source" rev-parse HEAD) == "$base" ]] || die "Unexpected source revision in $source."
if [[ -z $(git -C "$source" status --porcelain) ]]; then
  git -C "$source" apply --check "$patch"
  git -C "$source" apply "$patch"
else
  # Keep the checkout for incremental builds; never reset a user's edits.
  git -C "$source" diff --binary HEAD | cmp -s - "$patch" || die "Source was edited; move $source aside to rebuild."
  [[ -z $(git -C "$source" ls-files --others --exclude-standard) ]] || die "Untracked files in $source; move it aside to rebuild."
fi
git -C "$source" submodule update --init --recursive --depth 1
cd "$source"
# A source build must not opt into the official app's replacement updater.
env -u HERDR_APP_RELEASE -u CARGO_TARGET_DIR rustup run 1.95.0 cargo build --release --locked

stage=$(mktemp -d "$work/package.XXXXXX")
trap 'rm -rf "$stage"' EXIT
app="$stage/Herdr.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp target/release/herdr-app "$app/Contents/MacOS/Herdr"
cp assets/icons/Herdr.icns "$app/Contents/Resources/"
cp LICENSE THIRD-PARTY-NOTICES "$app/Contents/Resources/"
python3 - "$app/Contents/Info.plist" <<'PY'
import pathlib, plistlib, re, sys
version = re.search(r'^version = "([^"]+)"', pathlib.Path('Cargo.toml').read_text(), re.M)[1]
info = dict(
    CFBundleExecutable='Herdr', CFBundleIdentifier='dev.herdr.app',
    CFBundleName='Herdr', CFBundleDisplayName='Herdr', CFBundleIconFile='Herdr',
    CFBundlePackageType='APPL', CFBundleShortVersionString=version, CFBundleVersion=version,
    NSPrincipalClass='NSApplication', NSHighResolutionCapable=True,
    NSMicrophoneUsageDescription='Terminal programs running in Herdr can use the microphone, for example for voice input.',
    NSCameraUsageDescription='Terminal programs running in Herdr can use the camera.',
    NSAppleEventsUsageDescription='Terminal programs running in Herdr can use AppleScript to control other apps.',
)
with open(sys.argv[1], 'wb') as output:
    plistlib.dump(info, output)
PY
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
if [[ -e "$work/Herdr.app" ]]; then
  backup=$(mktemp -d "$work/previous.XXXXXX")
  mv "$work/Herdr.app" "$backup/Herdr.app"
fi
mv "$app" "$work/Herdr.app"
echo "Built: $work/Herdr.app"
mkdir -p "${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
bash "$root/install.sh" --all
echo 'Quit Herdr, back up your installed Herdr.app, then replace it with this bundle.'
