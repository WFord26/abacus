import assert from "node:assert/strict";
import test from "node:test";

import {
  bumpSemver,
  formatCalver,
  getBackendAppForPath,
  getNextCalverVersion,
  promoteChangelogRelease,
  resolveBaseRef,
  resolveReleaseVersion,
} from "./release-manager.mjs";

test("bumpSemver increments patch, minor, and major versions", () => {
  assert.equal(bumpSemver("0.1.0", "patch"), "0.1.1");
  assert.equal(bumpSemver("0.1.0", "minor"), "0.2.0");
  assert.equal(bumpSemver("0.1.0", "major"), "1.0.0");
});

test("formatCalver returns a zero-padded calendar version", () => {
  const date = new Date("2026-03-25T12:00:00.000Z");
  assert.equal(formatCalver(date), "2026.03.25");
});

test("getNextCalverVersion adds a build suffix when the date already exists", () => {
  const tags = ["v2026.03.25", "v2026.03.25.1", "v2026.03.24"];
  assert.equal(getNextCalverVersion(tags, "2026.03.25"), "2026.03.25.2");
  assert.equal(getNextCalverVersion(tags, "2026.03.26"), "2026.03.26");
});

test("getBackendAppForPath identifies backend service paths only", () => {
  assert.equal(getBackendAppForPath("apps/ledger-service/src/main.ts"), "ledger-service");
  assert.equal(getBackendAppForPath("apps/web/app/page.tsx"), null);
});

test("resolveBaseRef prefers explicit base, then tag, then release tracking commit", () => {
  assert.equal(
    resolveBaseRef({
      explicitBaseRef: "feature-base",
      latestTag: "v2026.03.25",
      latestReleaseRef: "release-commit",
      rootCommitRef: "root-commit",
    }),
    "feature-base"
  );

  assert.equal(
    resolveBaseRef({
      latestTag: "v2026.03.25\nv2026.03.24",
      latestReleaseRef: "release-commit",
      rootCommitRef: "root-commit",
    }),
    "v2026.03.25"
  );

  assert.equal(
    resolveBaseRef({
      latestReleaseRef: "release-commit",
      rootCommitRef: "root-commit",
    }),
    "release-commit"
  );

  assert.equal(
    resolveBaseRef({
      rootCommitRef: "root-commit",
    }),
    "root-commit"
  );
});

test("resolveReleaseVersion reuses the tracked release version when the base matches", () => {
  assert.equal(
    resolveReleaseVersion({
      existingTags: ["v2026.03.25"],
      releaseDate: "2026.03.26",
      baseRef: "release-commit",
      currentRootVersion: "2026.03.25",
      latestTrackingData: {
        baseRef: "release-commit",
        release: {
          rootVersionAfter: "2026.03.26",
        },
      },
    }),
    "2026.03.26"
  );

  assert.equal(
    resolveReleaseVersion({
      existingTags: ["v2026.03.25"],
      releaseDate: "2026.03.26",
      baseRef: "different-commit",
      currentRootVersion: "2026.03.25",
      latestTrackingData: {
        baseRef: "release-commit",
        release: {
          rootVersionAfter: "2026.03.26",
        },
      },
    }),
    "2026.03.26"
  );

  assert.equal(
    resolveReleaseVersion({
      existingTags: ["v2026.03.26"],
      releaseDate: "2026.03.26",
      baseRef: "release-commit",
      currentRootVersion: "2026.03.26",
      latestTrackingData: {
        baseRef: "release-commit",
        release: {
          rootVersionAfter: "2026.03.26",
        },
      },
      explicitReleaseDate: true,
    }),
    "2026.03.26.1"
  );

  assert.equal(
    resolveReleaseVersion({
      existingTags: [],
      releaseDate: "2026.03.25",
      baseRef: "release-commit",
      currentRootVersion: "2026.03.25",
      latestTrackingData: null,
    }),
    "2026.03.25.1"
  );
});

test("promoteChangelogRelease moves unreleased entries into a dated section", () => {
  const changelog = `# Changelog

All notable changes to Abacus are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: CalVer YYYY.MM.DD

## [Unreleased]

### Added
- Example feature
`;

  const updated = promoteChangelogRelease(changelog, "2026.03.25");

  assert.match(updated, /## \[Unreleased\]/);
  assert.match(updated, /## \[2026\.03\.25\]/);
  assert.match(updated, /- Example feature/);
});
