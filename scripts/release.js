/**
 * @file Bumps the version and tags a dist-only build commit; run by the Release workflow
 */

import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_PATH = resolve(ROOT, "package.json");
const CHANGELOG_PATH = resolve(ROOT, "CHANGELOG.md");
const BUMP_TYPES = ["patch", "minor", "major"];
/** What a tag ships: the build, the manifest, and the license and readme. */
const PACKAGE_FILES = ["dist", "package.json", "LICENSE", "README.md"];

/**
 * Runs a shell command in the repo root.
 * @param {string} command - command line to run
 * @param {NodeJS.ProcessEnv} [env] - environment for the command; defaults to this process's
 * @returns trimmed stdout
 */
function run(command, env = process.env) {
  return execSync(command, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

/**
 * Runs a shell command in the repo root, streaming its output.
 * @param {string} command - command line to run
 */
function runVisible(command) {
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

/**
 * Computes the next semver version.
 * @param {string} version - current version, e.g. "1.2.3"
 * @param {string} bumpType - "patch", "minor", or "major"
 * @returns the bumped version
 */
function bumpVersion(version, bumpType) {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  if (bumpType === "major") return `${major + 1}.0.0`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Stops the release unless the tree is clean and on main.
 */
function assertReleasable() {
  if (run("git status --porcelain")) throw new Error("Working tree is not clean");
  if (run("git branch --show-current") !== "main") throw new Error("Release from main only");
}

/**
 * Promotes the `## [Unreleased]` changelog section to a dated version header.
 * @param {string} version - version being released
 */
function promoteChangelog(version) {
  const changelog = readFileSync(CHANGELOG_PATH, "utf8");
  const unreleased = changelog.split("## [Unreleased]")[1]?.split(/\n## \[/)[0] ?? "";
  if (!/^- /m.test(unreleased)) throw new Error("CHANGELOG.md has no Unreleased entries");

  const date = new Date().toISOString().slice(0, 10);
  const promoted = changelog.replace(
    "## [Unreleased]",
    `## [Unreleased]\n\n## [${version}] - ${date}`,
  );
  writeFileSync(CHANGELOG_PATH, promoted);
}

/**
 * Reads package.json.
 * @returns {Record<string, unknown>} the parsed manifest
 */
function readPackage() {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("package.json is not a JSON object");
  }
  return { ...parsed };
}

/**
 * Writes the new version into package.json.
 * @param {string} version - version being released
 */
function writeVersion(version) {
  const pkg = readPackage();
  pkg.version = version;
  writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * Builds dist/ and tags a commit holding only {@link PACKAGE_FILES}, parented on the release commit.
 * @param {string} tag - tag name, e.g. "v1.2.3"
 */
function tagBuild(tag) {
  runVisible("bun run build");
  const indexPath = run("git rev-parse --git-path release-index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  rmSync(indexPath, { force: true });
  try {
    run(`git add --force -- ${PACKAGE_FILES.join(" ")}`, env);
    const tree = run("git write-tree", env);
    const commit = run(`git commit-tree ${tree} -p HEAD -m "Build ${tag}"`);
    runVisible(`git tag --annotate ${tag} ${commit} -m "${tag}"`);
  } finally {
    rmSync(indexPath, { force: true });
  }
}

const bumpType = process.argv[2] ?? "patch";
if (!BUMP_TYPES.includes(bumpType)) {
  throw new Error(`Bump type must be one of: ${BUMP_TYPES.join(", ")}`);
}

assertReleasable();
runVisible("bun run validate");

const currentVersion = readPackage().version;
if (typeof currentVersion !== "string") throw new Error("package.json has no version");
const version = bumpVersion(currentVersion, bumpType);
const tag = `v${version}`;

writeVersion(version);
promoteChangelog(version);
runVisible("git add package.json CHANGELOG.md");
runVisible(`git commit --quiet -m "Release ${tag}"`);
tagBuild(tag);

console.log(`\nTagged ${tag}.`);
