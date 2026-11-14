import os
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest


BUILDER = Path(__file__).resolve().parents[1]
FAKE_TOOL = r'''#!/usr/bin/env python3
import os, pathlib, sys
tool, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
if tool == 'uname':
    print(os.environ.get('TEST_OS', 'Darwin'))
elif tool == 'zig':
    print(os.environ.get('TEST_ZIG', '0.16.0'))
elif tool == 'xcrun':
    print('/usr/bin/clang')
elif tool == 'codesign':
    if os.environ.get('TEST_SIGN_FAIL'): sys.exit(1)
elif tool == 'herdr-app':
    assert args[0] == 'check', args
    assert pathlib.Path(args[1]).is_relative_to(os.environ['HERDR_APP_HOME'])
elif tool == 'rustup':
    assert args[:2] == ['run', '1.95.0'], args
    if args[2] == 'rustc': sys.exit(0)
    assert args[2:] == ['cargo', 'build', '--release', '--locked'], args
    assert 'HERDR_APP_RELEASE' not in os.environ
    assert 'CARGO_TARGET_DIR' not in os.environ
    if os.environ.get('TEST_BUILD_FAIL'): sys.exit(1)
    binary = pathlib.Path('target/release/herdr-app')
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_text('built locally')
    binary.chmod(0o755)
elif tool == 'git':
    if args[0] == 'init':
        pathlib.Path(args[-1], '.git').mkdir(parents=True)
        sys.exit(0)
    assert args[0] == '-C', args
    source, args = pathlib.Path(args[1]), args[2:]
    if args[:2] == ['remote', 'get-url']:
        print('https://github.com/herdrdev/herdr-app.git')
    elif args[0] == 'rev-parse':
        if not (source / 'Cargo.toml').exists(): sys.exit(1)
        print('b67715e8985e6097f83f8120fc9b9e52e6596f50')
    elif args[0] == 'checkout':
        for name, content in {
            'Cargo.toml': '[package]\nversion = "0.1.15"\n',
            'assets/icons/Herdr.icns': 'icon',
            'LICENSE': 'Apache license fixture',
            'THIRD-PARTY-NOTICES': 'notices fixture',
        }.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    elif args[0] == 'status':
        if (source / 'patched').exists(): print(' M src/settings.rs')
    elif args[0] == 'apply':
        if '--check' not in args: (source / 'patched').touch()
    elif args[0] == 'diff':
        if (source / 'edited').exists(): print('user edit')
        else: sys.stdout.write(pathlib.Path(os.environ['TEST_PATCH']).read_text())
    elif args[0] == 'ls-files':
        if (source / 'untracked').exists(): print('untracked')
    elif args[0] not in ('remote', 'fetch', 'submodule'):
        raise AssertionError(args)
'''


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name) / 'checkout with spaces'
        self.builder = root / 'native/window-opacity'
        self.builder.mkdir(parents=True)
        for name in ('build.sh', 'window-opacity.patch'):
            shutil.copy2(BUILDER / name, self.builder / name)
        for name in ('install.sh', 'install.py'):
            shutil.copy2(BUILDER.parents[1] / name, root / name)
        (root / 'mods.tsv').write_text('test-mod\tlayout\tFixture mod\n')
        mod = root / 'crew/mods/test-mod'
        mod.mkdir(parents=True)
        (mod / 'main.js').write_text('export default class Fixture {}\n')
        layouts = root / 'crew/layouts'
        layouts.mkdir()
        (layouts / 'OhMyHerdr.json').write_text('{"content":{"mod":"test-mod"}}')
        (root / 'crew/keys.json').write_text('{"global":{"cmd-t":"mod.open:test-mod"}}')
        self.home = root / 'herdr home'
        self.work = root / '.build/herdr-opacity'
        self.source = self.work / 'source'
        self.app = self.work / 'Herdr.app'
        tools = root / 'tools'
        tools.mkdir()
        for name in ('uname', 'git', 'zig', 'xcrun', 'rustup', 'codesign', 'herdr-app'):
            path = tools / name
            path.write_text(FAKE_TOOL)
            path.chmod(0o755)
        self.env = {
            **os.environ, 'PATH': f'{tools}:{os.environ["PATH"]}',
            'TEST_PATCH': str(self.builder / 'window-opacity.patch'),
            'HERDR_APP_RELEASE': '1', 'CARGO_TARGET_DIR': '/must/not/be/used',
            'HERDR_APP_HOME': str(self.home),
            'CLAUDE_CONFIG_DIR': str(root / 'unused-claude-home'),
        }

    def run_builder(self, *args, **env):
        return subprocess.run(['bash', str(self.builder / 'build.sh'), *args],
                              env={**self.env, **env}, stdin=subprocess.DEVNULL,
                              capture_output=True, text=True, timeout=20)

    def test_build_bundle_and_incremental_rebuild(self):
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        info = plistlib.loads((self.app / 'Contents/Info.plist').read_bytes())
        self.assertEqual(info['CFBundleShortVersionString'], '0.1.15')
        self.assertEqual(info['CFBundleIdentifier'], 'dev.herdr.app')
        self.assertTrue((self.app / 'Contents/Resources/THIRD-PARTY-NOTICES').is_file())
        self.assertEqual((self.home / 'mods/test-mod/main.js').read_text(),
                         'export default class Fixture {}\n')
        self.assertTrue((self.home / 'layouts/OhMyHerdr.json').is_file())
        self.assertEqual(json.loads((self.home / 'keys.json').read_text()),
                         {'global': {'cmd-t': 'mod.open:test-mod'}})
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(self.work.glob('previous.*/Herdr.app'))), 1)

    def test_rejects_source_edits_and_untracked_files(self):
        self.assertEqual(self.run_builder().returncode, 0)
        for marker in ('edited', 'untracked'):
            with self.subTest(marker=marker):
                path = self.source / marker
                path.write_text('keep this')
                self.assertNotEqual(self.run_builder().returncode, 0)
                self.assertEqual(path.read_text(), 'keep this')
                path.unlink()

    def test_build_or_signing_failure_preserves_previous_bundle(self):
        self.assertEqual(self.run_builder().returncode, 0)
        binary = self.app / 'Contents/MacOS/Herdr'
        binary.write_text('previous build')
        for failure in ('TEST_BUILD_FAIL', 'TEST_SIGN_FAIL'):
            with self.subTest(failure=failure):
                self.assertNotEqual(self.run_builder(**{failure: '1'}).returncode, 0)
                self.assertEqual(binary.read_text(), 'previous build')

    def test_help_and_prerequisite_failures_do_not_create_build(self):
        self.assertEqual(self.run_builder('--help').returncode, 0)
        self.assertNotEqual(self.run_builder(TEST_OS='Linux').returncode, 0)
        self.assertNotEqual(self.run_builder(TEST_ZIG='0.15.0').returncode, 0)
        self.assertFalse(self.work.exists())
        self.assertFalse(self.home.exists())

    def test_first_build_failure_does_not_install_mods(self):
        self.assertNotEqual(self.run_builder(TEST_BUILD_FAIL='1').returncode, 0)
        self.assertFalse(self.home.exists())

    def test_installer_preserves_conflicting_keys_and_backs_up_mods(self):
        old_mod = self.home / 'mods/test-mod'
        old_mod.mkdir(parents=True)
        (old_mod / 'main.js').write_text('personal mod')
        (self.home / 'keys.json').write_text('{"global":{"cmd-t":"personal.action"}}')
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.home / 'keys.json').read_text()),
                         {'global': {'cmd-t': 'personal.action'}})
        backups = list(self.home.glob('backup/*/mods/test-mod/main.js'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'personal mod')

    def test_installer_failure_is_reported_and_keeps_built_app(self):
        (self.builder.parents[1] / 'mods.tsv').unlink()
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.app / 'Contents/MacOS/Herdr').is_file())


if __name__ == '__main__':
    unittest.main()
