import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const ROOT_PACKAGE_PATH = path.join(REPO_ROOT, "package.json");
const CHANGELOG_PATH = path.join(REPO_ROOT, "CHANGELOG.md");
const TRACKING_DIR = path.join(REPO_ROOT, "release-tracking");
const TRACKING_LATEST_PATH = path.join(TRACKING_DIR, "latest.json");
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const BACKEND_APPS = [
  "api-gateway",
  "identity-service",
  "ledger-service",
  "expenses-service",
  "documents-service",
  "reporting-service",
  "invoicing-service",
];

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const [command = "track", ...rest] = argv;
  const options = {
    backendBump: "patch",
    changelog: command === "track",
    dryRun: false,
  };

  for (const arg of rest) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--changelog") {
      options.changelog = true;
      continue;
    }

    if (arg === "--no-changelog") {
      options.changelog = false;
      continue;
    }

    const [key, rawValue] = arg.split("=");
    const value = rawValue?.trim();

    if (!value) {
      continue;
    }

    if (key === "--base") {
      options.baseRef = value;
    } else if (key === "--backend-bump") {
      options.backendBump = value;
    } else if (key === "--date") {
      options.releaseDate = value;
    }
  }

  return { command, options };
}

export function resolveBaseRef({ explicitBaseRef, latestTag, latestReleaseRef, rootCommitRef }) {
  if (explicitBaseRef) {
    return explicitBaseRef;
  }

  if (latestTag) {
    return latestTag.split("\n")[0];
  }

  if (latestReleaseRef) {
    return latestReleaseRef;
  }

  return rootCommitRef || EMPTY_TREE_HASH;
}

export function bumpSemver(version, level = "patch") {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(`Expected a stable semver version, received "${version}".`);
  }

  const [, majorText, minorText, patchText] = match;
  let major = Number(majorText);
  let minor = Number(minorText);
  let patch = Number(patchText);

  if (level === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === "minor") {
    minor += 1;
    patch = 0;
  } else if (level === "patch") {
    patch += 1;
  } else {
    throw new Error(`Unsupported backend bump level "${level}".`);
  }

  return `${major}.${minor}.${patch}`;
}

export function formatCalver(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function getNextCalverVersion(existingTags, releaseDate) {
  const exactPattern = new RegExp(`^v?${releaseDate.replaceAll(".", "\\.")}(?:\\.(\\d+))?$`);
  let maxSuffix = null;

  for (const tag of existingTags) {
    const match = tag.match(exactPattern);

    if (!match) {
      continue;
    }

    const suffix = match[1] ? Number(match[1]) : 0;
    maxSuffix = maxSuffix === null ? suffix : Math.max(maxSuffix, suffix);
  }

  if (maxSuffix === null) {
    return releaseDate;
  }

  return `${releaseDate}.${maxSuffix + 1}`;
}

export function getBackendAppForPath(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");

  for (const appName of BACKEND_APPS) {
    if (normalizedPath.startsWith(`apps/${appName}/`)) {
      return appName;
    }
  }

  return null;
}

function getBaseRef(explicitBaseRef) {
  let latestTag = null;
  let latestReleaseRef = null;
  let rootCommitRef = null;

  try {
    latestTag = runGit(["tag", "--list", "v*", "--sort=-creatordate"]);
  } catch {}

  try {
    latestReleaseRef = runGit(["log", "-1", "--format=%H", "--", "release-tracking"]);
  } catch {}

  try {
    rootCommitRef = runGit(["rev-list", "--max-parents=0", "HEAD"]);
  } catch {}

  return resolveBaseRef({
    explicitBaseRef,
    latestTag,
    latestReleaseRef,
    rootCommitRef,
  });
}

function getExistingReleaseTags() {
  try {
    const output = runGit(["tag", "--list", "v*"]);
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseNameStatusOutput(output) {
  const fileStructure = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
  };

  if (!output) {
    return fileStructure;
  }

  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const parts = line.split("\t");
    const status = parts[0];

    if (status.startsWith("R")) {
      fileStructure.renamed.push({
        from: parts[1],
        to: parts[2],
      });
      continue;
    }

    const filePath = parts[1];

    if (status === "A") {
      fileStructure.added.push(filePath);
    } else if (status === "D") {
      fileStructure.deleted.push(filePath);
    } else {
      fileStructure.modified.push(filePath);
    }
  }

  return fileStructure;
}

function parseStatusOutput(output) {
  const fileStructure = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
  };

  if (!output) {
    return fileStructure;
  }

  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const status = line.slice(0, 2);
    const payload = line.slice(3).trim();

    if (status === "??") {
      fileStructure.added.push(payload);
      continue;
    }

    if (payload.includes(" -> ")) {
      const [from, to] = payload.split(" -> ");
      fileStructure.renamed.push({ from, to });
      continue;
    }

    if (status.includes("D")) {
      fileStructure.deleted.push(payload);
    } else if (status.includes("A")) {
      fileStructure.added.push(payload);
    } else {
      fileStructure.modified.push(payload);
    }
  }

  return fileStructure;
}

function mergeFileStructure(left, right) {
  const renamedKeys = new Set();
  const renamed = [];

  for (const entry of [...left.renamed, ...right.renamed]) {
    const key = `${entry.from}::${entry.to}`;
    if (renamedKeys.has(key)) {
      continue;
    }

    renamedKeys.add(key);
    renamed.push(entry);
  }

  return {
    added: [...new Set([...left.added, ...right.added])].sort(),
    modified: [...new Set([...left.modified, ...right.modified])].sort(),
    deleted: [...new Set([...left.deleted, ...right.deleted])].sort(),
    renamed,
  };
}

function getChangedFileStructure(baseRef) {
  const diffOutput = runGit(["diff", "--name-status", baseRef, "--", "."]);
  const statusOutput = runGit(["status", "--porcelain", "--untracked-files=all"]);
  return mergeFileStructure(parseNameStatusOutput(diffOutput), parseStatusOutput(statusOutput));
}

function getChangedPaths(fileStructure) {
  return [
    ...fileStructure.added,
    ...fileStructure.modified,
    ...fileStructure.deleted,
    ...fileStructure.renamed.flatMap((entry) => [entry.from, entry.to]),
  ];
}

function tryReadFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

function tryReadGitFile(baseRef, repoRelativePath) {
  try {
    return runGit(["show", `${baseRef}:${repoRelativePath}`]);
  } catch {
    return null;
  }
}

function collectWorkflowCommands(content) {
  const commands = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)run:\s*(.*)$/);

    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const rawValue = match[2].trim();

    if (rawValue && !["|", ">", "|-", ">-"].includes(rawValue)) {
      commands.push(rawValue);
      continue;
    }

    const block = [];

    for (index += 1; index < lines.length; index += 1) {
      const blockLine = lines[index];
      const currentIndent = blockLine.match(/^(\s*)/)?.[1].length ?? 0;

      if (blockLine.trim() && currentIndent <= indent) {
        index -= 1;
        break;
      }

      if (blockLine.trim()) {
        block.push(blockLine.trim());
      }
    }

    if (block.length > 0) {
      commands.push(block.join("\n"));
    }
  }

  return commands;
}

function collectComposeCommands(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("command:") || line.startsWith("test: [") || line.startsWith("test:")
    );
}

function collectShellCommands(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function collectPackageScriptMap(content) {
  const json = JSON.parse(content);
  return json.scripts ?? {};
}

function buildCommandChange(file, kind, beforeCommands, afterCommands) {
  const beforeSet = new Set(beforeCommands);
  const afterSet = new Set(afterCommands);
  const added = afterCommands.filter((command) => !beforeSet.has(command));
  const removed = beforeCommands.filter((command) => !afterSet.has(command));

  if (added.length === 0 && removed.length === 0) {
    return null;
  }

  return {
    file,
    kind,
    added,
    removed,
  };
}

function buildPackageScriptChange(file, beforeScripts, afterScripts) {
  const keys = new Set([...Object.keys(beforeScripts), ...Object.keys(afterScripts)]);
  const added = [];
  const changed = [];
  const removed = [];

  for (const key of [...keys].sort()) {
    if (!(key in beforeScripts)) {
      added.push({ name: key, command: afterScripts[key] });
      continue;
    }

    if (!(key in afterScripts)) {
      removed.push({ name: key, command: beforeScripts[key] });
      continue;
    }

    if (beforeScripts[key] !== afterScripts[key]) {
      changed.push({
        name: key,
        before: beforeScripts[key],
        after: afterScripts[key],
      });
    }
  }

  if (added.length === 0 && changed.length === 0 && removed.length === 0) {
    return null;
  }

  return {
    file,
    kind: "package-scripts",
    added,
    changed,
    removed,
  };
}

function collectCommandChanges(baseRef, fileStructure) {
  const relevantFiles = [...new Set(getChangedPaths(fileStructure))].filter(Boolean);
  const changes = [];

  for (const repoRelativePath of relevantFiles) {
    if (
      !repoRelativePath.endsWith("package.json") &&
      !repoRelativePath.startsWith(".github/workflows/") &&
      repoRelativePath !== "infrastructure/docker/docker-compose.yml" &&
      !repoRelativePath.startsWith(".husky/")
    ) {
      continue;
    }

    const currentPath = path.join(REPO_ROOT, repoRelativePath);
    const beforeContent = tryReadGitFile(baseRef, repoRelativePath);
    const afterContent = tryReadFile(currentPath);

    if (repoRelativePath.endsWith("package.json")) {
      const beforeScripts = beforeContent ? collectPackageScriptMap(beforeContent) : {};
      const afterScripts = afterContent ? collectPackageScriptMap(afterContent) : {};
      const change = buildPackageScriptChange(repoRelativePath, beforeScripts, afterScripts);

      if (change) {
        changes.push(change);
      }

      continue;
    }

    if (repoRelativePath.startsWith(".github/workflows/")) {
      const change = buildCommandChange(
        repoRelativePath,
        "workflow-run",
        beforeContent ? collectWorkflowCommands(beforeContent) : [],
        afterContent ? collectWorkflowCommands(afterContent) : []
      );

      if (change) {
        changes.push(change);
      }

      continue;
    }

    if (repoRelativePath === "infrastructure/docker/docker-compose.yml") {
      const change = buildCommandChange(
        repoRelativePath,
        "compose-command",
        beforeContent ? collectComposeCommands(beforeContent) : [],
        afterContent ? collectComposeCommands(afterContent) : []
      );

      if (change) {
        changes.push(change);
      }

      continue;
    }

    if (repoRelativePath.startsWith(".husky/")) {
      const change = buildCommandChange(
        repoRelativePath,
        "hook-command",
        beforeContent ? collectShellCommands(beforeContent) : [],
        afterContent ? collectShellCommands(afterContent) : []
      );

      if (change) {
        changes.push(change);
      }
    }
  }

  return changes;
}

function getBackendBumps(fileStructure, level) {
  const changedApps = [
    ...new Set(getChangedPaths(fileStructure).map(getBackendAppForPath).filter(Boolean)),
  ];

  return changedApps
    .map((appName) => {
      const packagePath = path.join(REPO_ROOT, "apps", appName, "package.json");
      const packageJson = readJson(packagePath);
      const nextVersion = bumpSemver(packageJson.version, level);

      return {
        appName,
        packageName: packageJson.name,
        path: `apps/${appName}/package.json`,
        previousVersion: packageJson.version,
        nextVersion,
      };
    })
    .sort((left, right) => left.appName.localeCompare(right.appName));
}

function ensureTrackingDir() {
  mkdirSync(TRACKING_DIR, { recursive: true });
}

function readTrackingData(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

export function resolveReleaseVersion({
  existingTags,
  releaseDate,
  baseRef,
  currentRootVersion,
  latestTrackingData,
  explicitReleaseDate = false,
}) {
  const trackedVersion = latestTrackingData?.release?.rootVersionAfter;
  const hasMatchingTrackedBase = latestTrackingData?.baseRef === baseRef;

  if (!explicitReleaseDate && trackedVersion && hasMatchingTrackedBase) {
    return trackedVersion;
  }

  const knownVersions = [...existingTags];

  if (currentRootVersion) {
    knownVersions.push(currentRootVersion);
  }

  if (trackedVersion && hasMatchingTrackedBase) {
    knownVersions.push(trackedVersion);
  }

  return getNextCalverVersion(knownVersions, releaseDate);
}

function getPlannedRelease(baseRef, options = {}) {
  const existingTags = getExistingReleaseTags();
  const releaseDate = options.releaseDate ?? formatCalver();
  const latestTrackingData = readTrackingData(TRACKING_LATEST_PATH);
  const currentRootVersion = readJson(ROOT_PACKAGE_PATH).version;
  const nextRootVersion = resolveReleaseVersion({
    existingTags,
    releaseDate,
    baseRef,
    currentRootVersion,
    latestTrackingData,
    explicitReleaseDate: Boolean(options.releaseDate),
  });

  return {
    currentRootVersion,
    releaseDate,
    nextRootVersion,
  };
}

function buildTrackingData(baseRef, options = {}) {
  const fileStructure = getChangedFileStructure(baseRef);
  const backendBumps = getBackendBumps(fileStructure, options.backendBump ?? "patch");

  return {
    generatedAt: new Date().toISOString(),
    baseRef,
    rootVersion: readJson(ROOT_PACKAGE_PATH).version,
    backendBumpLevel: options.backendBump ?? "patch",
    fileStructure,
    backendBumps,
    commandChanges: collectCommandChanges(baseRef, fileStructure),
  };
}

function updateRootVersion(nextVersion, dryRun) {
  const rootPackage = readJson(ROOT_PACKAGE_PATH);
  rootPackage.version = nextVersion;

  if (!dryRun) {
    writeJson(ROOT_PACKAGE_PATH, rootPackage);
  }

  return rootPackage;
}

function applyBackendBumps(backendBumps, dryRun) {
  for (const bump of backendBumps) {
    const packagePath = path.join(REPO_ROOT, bump.path);
    const packageJson = readJson(packagePath);
    packageJson.version = bump.nextVersion;

    if (!dryRun) {
      writeJson(packagePath, packageJson);
    }
  }
}

function normalizeUnreleasedTemplate() {
  return [
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "### Changed",
    "",
    "### Fixed",
    "",
    "### Removed",
    "",
  ].join("\n");
}

export function promoteChangelogRelease(changelogContent, version) {
  const unreleasedHeader = "## [Unreleased]";
  const unreleasedIndex = changelogContent.indexOf(unreleasedHeader);

  if (unreleasedIndex === -1) {
    return changelogContent;
  }

  const afterUnreleasedHeader = unreleasedIndex + unreleasedHeader.length;
  const nextSectionIndex = changelogContent.indexOf("\n## [", afterUnreleasedHeader);
  const unreleasedBody = changelogContent
    .slice(
      afterUnreleasedHeader,
      nextSectionIndex === -1 ? changelogContent.length : nextSectionIndex
    )
    .trim();

  const releaseBody =
    unreleasedBody.length > 0
      ? unreleasedBody
      : ["### Added", "", "### Changed", "", "### Fixed", "", "### Removed"].join("\n");

  const prefix = changelogContent.slice(0, unreleasedIndex).trimEnd();
  const suffix =
    nextSectionIndex === -1 ? "" : changelogContent.slice(nextSectionIndex).trimStart();

  return `${prefix}\n\n${normalizeUnreleasedTemplate()}\n## [${version}]\n\n${releaseBody}${suffix ? `\n\n${suffix}` : ""}\n`;
}

function updateChangelog(version, dryRun) {
  const currentContent = readFileSync(CHANGELOG_PATH, "utf8");
  const nextContent = promoteChangelogRelease(currentContent, version);

  if (!dryRun) {
    writeFileSync(CHANGELOG_PATH, nextContent);
  }
}

function writeTrackingFile(trackingData, versionLabel, dryRun) {
  ensureTrackingDir();
  const fileName = versionLabel ? `${versionLabel}.json` : "latest.json";
  const outputPath = path.join(TRACKING_DIR, fileName);

  if (!dryRun) {
    writeJson(outputPath, trackingData);

    if (outputPath !== TRACKING_LATEST_PATH) {
      writeJson(TRACKING_LATEST_PATH, trackingData);
    }
  }

  return outputPath;
}

function runTrack(options) {
  const baseRef = getBaseRef(options.baseRef);
  const plannedRelease = getPlannedRelease(baseRef, options);
  const trackingData = buildTrackingData(baseRef, options);

  trackingData.release = {
    rootVersionBefore: plannedRelease.currentRootVersion,
    rootVersionAfter: plannedRelease.nextRootVersion,
  };

  if (options.changelog) {
    updateChangelog(plannedRelease.nextRootVersion, options.dryRun);
  }

  const outputPath = writeTrackingFile(trackingData, null, options.dryRun);

  return { outputPath, trackingData };
}

function runRelease(options) {
  const baseRef = getBaseRef(options.baseRef);
  const plannedRelease = getPlannedRelease(baseRef, options);
  const trackingData = buildTrackingData(baseRef, options);

  trackingData.release = {
    rootVersionBefore: plannedRelease.currentRootVersion,
    rootVersionAfter: plannedRelease.nextRootVersion,
  };

  updateRootVersion(plannedRelease.nextRootVersion, options.dryRun);
  applyBackendBumps(trackingData.backendBumps, options.dryRun);
  const outputPath = writeTrackingFile(
    trackingData,
    plannedRelease.nextRootVersion,
    options.dryRun
  );

  return { outputPath, trackingData };
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  const result =
    command === "release"
      ? runRelease(options)
      : command === "track"
        ? runTrack(options)
        : (() => {
            throw new Error(`Unknown command "${command}". Use "track" or "release".`);
          })();

  const output = {
    command,
    dryRun: options.dryRun,
    trackingFile: path.relative(REPO_ROOT, result.outputPath),
    rootVersion: result.trackingData.release?.rootVersionAfter ?? result.trackingData.rootVersion,
    backendBumps: result.trackingData.backendBumps,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] === __filename) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
