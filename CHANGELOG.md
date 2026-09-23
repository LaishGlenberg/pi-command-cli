# Changelog

From commit `ce9f8e276b728acf4ad9363497535435f1a3083c` (2026-09-11 14:52:29 -0700)

**24 commit(s), 1 PR(s) matched**

## 7cd1e8b — chore: add tagging and release workflow + readme update

| Field | Value |
|-------|-------|
| **Hash** | `7cd1e8b6ee3175323bab4f4ddd0bccfed0bb87e2` |
| **Date** | Wed, 23 Sep 2026 10:24:37 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +67 / −14 |
| **Files** | `.github/workflows/release.yml`, `README.md` |
| **Refs** | HEAD -> main, origin/main |

---

---

## c473f59 — feat: replace -t tool allowlist with -bt built-in tool exclusion (#1)

| Field | Value |
|-------|-------|
| **Hash** | `c473f59ce4935134b6564ce3c23a86f100de0026` |
| **Date** | Wed, 23 Sep 2026 08:28:30 |
| **Author** | Laish Glenberg <140229909+LaishGlenberg@users.noreply.github.com> |
| **Lines** | +394 / −68 |
| **Files** | `AGENTS.md`, `README.md`, `src/arguments.js`, `src/constants.js`, `src/help.js`, `test/index.test.js`, `test/npm-install.test.js` |
| **Pull Request** | #1 |

### Commit Message

* feat: remove nbt from tools

---

### Pull Request Description

```
## Summary

Reworks how pi-cli handles tool selection. Previously `-t` / `--tools` was mapped to Pi's `--tools` allowlist and implied `-nbt`. That was wrong: Pi's `--tools` is a strict allowlist across **built-in, extension, and custom** tools, so it disabled the extension tools that `-e` loads — defeating pi-cli's main purpose.

This replaces it with `-bt` / `--built-in-tools`, which keeps only the named built-in tools by expanding to Pi's `--exclude-tools`, leaving extension tools intact.

## Behavior

```bash
pi-cli -e pi-intercom -bt bash,ls,grep
# → pi -ne --exclude-tools read,powershell,edit,write,find --extension <pi-intercom path>
```

- `exclude-tools = BUILTIN_TOOLS − allowlist`, where `BUILTIN_TOOLS = read, bash, powershell, edit, write, grep, find, ls`.
- Supports comma-separated, `--built-in-tools=`, attached `-btread,bash`, and repeated forms; values union on `--import`.
- Unknown names throw (`unknown built-in tool: ...`); missing/empty values throw.
- Naming all 8 built-ins emits no `--exclude-tools` flag.
- Extension tools are never named, so they survive (unlike `--tools`).

## Other changes

- `-t` / `--tools` typed by the user now passes straight through to Pi unchanged (pi-cli no longer intercepts it).
- `-n` / `--nothing` no longer emits `-nbt`; it is equivalent to `-ne -ns -nc -np`.
- `-nbt` still passes through to Pi untouched.
- Adds `AGENTS.md` (architecture, conventions, testing, graphify) and documents the new flag in `README.md` / `--help`.

## Caveat

`--exclude-tools` only removes tools; it never enables them. Pi enables only `read`, `bash`, `edit`, `write` by default, so `grep` / `find` / `ls` must first be enabled via the `defaultTools` setting in `settings.json` for `-bt` to keep them active. The denylist is always computed from the hardcoded built-in list, so it behaves as a strict allowlist regardless of `defaultTools`.

## Tests

- Unit coverage for parsing, expansion, validation, and composition (`-e`, `-n`, `--import`) in `test/index.test.js`.
- New `test/npm-install.test.js`: `npm pack` → global install into a throwaway prefix → run the installed `pi-cli` bin end to end, asserting the packaged file list and `bin` mapping. Skips when npm is unavailable; needs no network.
- `99 tests, 99 pass`.

## Breaking change

`-t` / `--tools` is no longer a pi-cli-managed allowlist — use `-bt` / `--built-in-tools` instead. Saved configs that use `-t` will now forward `--tools` to Pi verbatim.

```

---

## 282537f — 1.1.0

| Field | Value |
|-------|-------|
| **Hash** | `282537f47a45e3f5ed2f98af5d656b9243696382` |
| **Date** | Wed, 23 Sep 2026 01:14:17 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +1 / −1 |
| **Files** | `package.json` |

---

---

## 1c68b94 — fix: spawn pi through cmd.exe on Windows

| Field | Value |
|-------|-------|
| **Hash** | `1c68b945ddbf17e7cb4ca7402d2f1b6177d89f28` |
| **Date** | Wed, 23 Sep 2026 01:11:11 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +127 / −4 |
| **Files** | `README.md`, `package.json`, `src/cli.js`, `test/index.test.js` |

---

---

## 0dd23e5 — feat: graphify knowledge base

| Field | Value |
|-------|-------|
| **Hash** | `0dd23e5935e602cd0df27c53df54c2ce0162d88c` |
| **Date** | Sat, 19 Sep 2026 10:02:26 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +4610 / −0 |
| **Files** | `.gitignore`, `graphify-out/.graphify\_labels.json`, `graphify-out/GRAPH\_REPORT.md`, `graphify-out/graph.html`, `graphify-out/graph.json`, `graphify-out/manifest.json` |

---

---

## 42e1b9f — refactor: split pi-command-cli into modular file structure

| Field | Value |
|-------|-------|
| **Hash** | `42e1b9fd3d1e692fd64c51d1fa2270f3593b4f7b` |
| **Date** | Sat, 19 Sep 2026 09:39:21 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +796 / −716 |
| **Files** | `README.md`, `index.js`, `package.json`, `src/arguments.js`, `src/cli.js`, `src/config.js`, `src/constants.js`, `src/extensions.js`, `src/help.js`, `src/index.js`, `src/matching.js`, `src/packages.js`, `pi-help-msg.js => src/pi-help-msg.js`, `src/settings.js`, `src/skills.js`, `src/walk.js` |

---

---

## 825dcc9 — 1.0.3

| Field | Value |
|-------|-------|
| **Hash** | `825dcc93d8ebb3aa94ec823324722edbf0e3b42d` |
| **Date** | Thu, 17 Sep 2026 10:06:41 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +1 / −1 |
| **Files** | `package.json` |
| **Refs** | tag: v1.0.3 |

---

---

## 285fa96 — feat: add pi's help output as option

| Field | Value |
|-------|-------|
| **Hash** | `285fa96fa3925a8b3cf87272512efd214981202f` |
| **Date** | Thu, 17 Sep 2026 10:06:39 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +202 / −18 |
| **Files** | `README.md`, `index.js`, `pi-help-msg.js` |

---

---

## 52476a8 — 1.0.2

| Field | Value |
|-------|-------|
| **Hash** | `52476a821ace0243eb17b14102a7a2d71ddfbc2f` |
| **Date** | Thu, 17 Sep 2026 07:46:32 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +1 / −1 |
| **Files** | `package.json` |
| **Refs** | tag: v1.0.2 |

---

---

## 799bd97 — fix: remove auto -ne -ns on pi-cli

| Field | Value |
|-------|-------|
| **Hash** | `799bd97ef6883814046d937c06da06f49c55d806` |
| **Date** | Thu, 17 Sep 2026 07:16:02 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +35 / −16 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## 246b806 — 1.0.1

| Field | Value |
|-------|-------|
| **Hash** | `246b806773ca57f1b771f1bffb17e61704ab23cb` |
| **Date** | Thu, 17 Sep 2026 03:26:32 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +1 / −1 |
| **Files** | `package.json` |
| **Refs** | tag: v1.0.1 |

---

---

## d8d06fa — docs: update README for clarity on extension and skill handling

| Field | Value |
|-------|-------|
| **Hash** | `d8d06fa64addb5d57c78c1e36fb3b8eec4817975` |
| **Date** | Thu, 17 Sep 2026 03:26:21 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +9 / −28 |
| **Files** | `README.md` |

---

---

## 775105c — fix: scope discovery flags to their own resource type (-e implies only -ne, -s implies only -ns)

| Field | Value |
|-------|-------|
| **Hash** | `775105c48d13235fcd0684ff3ca31c43fc4c77f8` |
| **Date** | Wed, 16 Sep 2026 14:39:50 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +37 / −12 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## fa97e22 — chore: scope package as @lglen/pi-command-cli with public publishConfig

| Field | Value |
|-------|-------|
| **Hash** | `fa97e2283f09c303a5445aaf64fa7b6fe6a430f9` |
| **Date** | Wed, 16 Sep 2026 14:32:53 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +10 / −4 |
| **Files** | `README.md`, `package.json` |

---

---

## 15e27d8 — chore: prepare npm release (files, repo metadata, LICENSE, README install/release docs)

| Field | Value |
|-------|-------|
| **Hash** | `15e27d8eeeebce43245d28e67776652075127355` |
| **Date** | Wed, 16 Sep 2026 14:32:14 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +72 / −1 |
| **Files** | `.gitignore`, `LICENSE`, `README.md`, `package.json` |

---

---

## e1df9d8 — Refactor tests to use settings.json for saving and loading configurations

| Field | Value |
|-------|-------|
| **Hash** | `e1df9d890bcae115b03eadfd4732557613e2b8fa` |
| **Date** | Mon, 14 Sep 2026 00:45:19 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +312 / −451 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

### Commit Message

- Introduced a new key `piCli` in settings.json to store command strings.

---

---

## cc11acb — fix: correct regex for validating config names to handle path separators

| Field | Value |
|-------|-------|
| **Hash** | `cc11acbae20b9c1fce004e7e76c862e3e9db4caf` |
| **Date** | Sun, 13 Sep 2026 21:35:09 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +658 / −21 |
| **Files** | `index.js`, `test/index.test.js` |

---

---

## ff9c5c5 — feat: update argument parsing to include -nbt flag with --nothing option and adjust tests

| Field | Value |
|-------|-------|
| **Hash** | `ff9c5c58de9a402425e3754fcb176d1f8e9dfe52` |
| **Date** | Sun, 13 Sep 2026 21:34:57 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +37 / −5 |
| **Files** | `index.js`, `test/index.test.js` |

---

---

## 9ea8eb2 — feat: add --nothing option to reset state and suppress defaults + set matching logic to handle nothing

| Field | Value |
|-------|-------|
| **Hash** | `9ea8eb2aebf93ecb90d837416fc8379e950cfa6c` |
| **Date** | Sun, 13 Sep 2026 19:50:54 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +91 / −17 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## efb607d — feat: support splitting comma-separated extensions and skills in argument parsing

| Field | Value |
|-------|-------|
| **Hash** | `efb607dcd95505d20e45e1cd8d53a0e2929a3646` |
| **Date** | Sun, 13 Sep 2026 19:33:44 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +71 / −10 |
| **Files** | `index.js`, `test/index.test.js` |

---

---

## 5ed6ee3 — feat: add tool allowlist support with -t flag and update tests

| Field | Value |
|-------|-------|
| **Hash** | `5ed6ee3709867101dcf445bf12a1b4e79886637d` |
| **Date** | Sun, 13 Sep 2026 14:17:04 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +71 / −2 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## e496010 — feat: add configuration saving and loading functionality

| Field | Value |
|-------|-------|
| **Hash** | `e49601054d1b91fdc455ac7b5efa2837ebdce2b2` |
| **Date** | Sat, 12 Sep 2026 03:07:25 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +201 / −4 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## 90f58a1 — feat: add skill support to pi-cli and update README with examples

| Field | Value |
|-------|-------|
| **Hash** | `90f58a1e20f019114ef78c67388e966c5a2515e8` |
| **Date** | Fri, 11 Sep 2026 22:07:58 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +182 / −14 |
| **Files** | `README.md`, `index.js`, `test/index.test.js` |

---

---

## ce9f8e2 — feat: initial commit

| Field | Value |
|-------|-------|
| **Hash** | `ce9f8e276b728acf4ad9363497535435f1a3083c` |
| **Date** | Fri, 11 Sep 2026 21:52:29 |
| **Author** | LaishGlenberg <lglenbe1@asu.edu> |
| **Lines** | +473 / −0 |
| **Files** | `README.md`, `index.js`, `package.json`, `test/index.test.js` |

---

---
