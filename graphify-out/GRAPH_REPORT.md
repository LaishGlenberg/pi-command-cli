# Graph Report - pi-command-cli  (2026-09-19)

## Corpus Check
- Corpus is ~7,433 words - fits in a single context window. You may not need a graph.

## Summary
- 98 nodes · 245 edges · 7 communities
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.8)
- Token cost: 970 input · 1,250 output

## Community Hubs (Navigation)
- Package Metadata
- Argument Building & Skill Resolution
- CLI Entry & Help Output
- Extension & Filesystem Discovery
- Config & Settings Persistence
- Documented Usage Concepts
- Test Suite

## God Nodes (most connected - your core abstractions)
1. `main()` - 14 edges
2. `resolveExtension()` - 14 edges
3. `@lglen/pi-command-cli README` - 14 edges
4. `saveConfig()` - 11 edges
5. `loadConfig()` - 11 edges
6. `resolveSkill()` - 11 edges
7. `buildPiArguments()` - 10 edges
8. `parseArguments()` - 9 edges
9. `addMatch()` - 8 edges
10. `walkEntries()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `-n / --nothing Clean Slate` --references--> `parseArguments()`  [INFERRED]
  README.md → src/arguments.js
- `--dry-run Command Inspection` --references--> `buildPiArguments()`  [INFERRED]
  README.md → src/arguments.js
- `Transparent Pass-Through` --references--> `main()`  [INFERRED]
  README.md → src/cli.js
- `Automatic Discovery-Flag Suppression` --references--> `buildPiArguments()`  [INFERRED]
  README.md → src/arguments.js
- `Extension Name Resolution` --references--> `resolveExtension()`  [INFERRED]
  README.md → src/extensions.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Name Resolution Flow** — readme_extension_name_resolution, readme_skill_name_resolution, readme_partial_name_matching [INFERRED 0.85]
- **Saved Configuration Lifecycle** — readme_saved_configurations, readme_settings_storage, readme_hand_editable_config_rationale [INFERRED 0.85]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Package Metadata"
Cohesion: 0.09
Nodes (22): author, bin, pi-cli, bugs, description, engines, node, files (+14 more)

### Community 1 - "Argument Building & Skill Resolution"
Cohesion: 0.31
Nodes (11): Modular File Split, buildPiArguments(), DEFAULT_AGENT_DIR, SKIPPED_DIRECTORIES, SOURCE_EXTENSIONS, addMatch(), addSkillMatch(), canonicalPath() (+3 more)

### Community 2 - "CLI Entry & Help Output"
Cohesion: 0.23
Nodes (11): modulePath, pi Alias and --helpi, ref_node_child_process, ref_node_url, mergeParsedArguments(), parseArguments(), stripSaveFlag(), main() (+3 more)

### Community 3 - "Extension & Filesystem Discovery"
Cohesion: 0.37
Nodes (11): ref_node_fs, ref_node_path, resolveExtension(), sourceNameMatches(), hasExtensionSource(), isPiPackage(), looksLikeExtensionDirectory(), packageNameMatches() (+3 more)

### Community 4 - "Config & Settings Persistence"
Cohesion: 0.35
Nodes (11): Hand-Editable Config Strings, Saved pi-cli Configurations, piCli Settings Storage, loadConfig(), saveConfig(), validateConfigName(), PI_CLI_KEY, SETTINGS_FILENAME (+3 more)

### Community 5 - "Documented Usage Concepts"
Cohesion: 0.24
Nodes (10): @lglen/pi-command-cli README, Automatic Discovery-Flag Suppression, --dry-run Command Inspection, Extension Name Resolution, -n / --nothing Clean Slate, Exact-then-Partial Name Matching, Why Per-Source Discovery Flags, PI_BIN Executable Override (+2 more)

### Community 6 - "Test Suite"
Cohesion: 0.29
Nodes (4): ref_node_assert_strict, ref_node_fs_promises, ref_node_os, ref_node_test

## Knowledge Gaps
- **19 isolated node(s):** `modulePath`, `name`, `version`, `description`, `license` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 26 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveExtension()` connect `Extension & Filesystem Discovery` to `Argument Building & Skill Resolution`, `CLI Entry & Help Output`, `Documented Usage Concepts`, `Test Suite`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `@lglen/pi-command-cli README` connect `Documented Usage Concepts` to `Argument Building & Skill Resolution`, `CLI Entry & Help Output`, `Config & Settings Persistence`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `main()` connect `CLI Entry & Help Output` to `Argument Building & Skill Resolution`, `Config & Settings Persistence`, `Documented Usage Concepts`, `Test Suite`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `main()` (e.g. with `Transparent Pass-Through` and `shellQuote()`) actually correct?**
  _`main()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `modulePath`, `name`, `version` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._