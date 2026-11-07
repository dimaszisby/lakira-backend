import { readdirSync, readFileSync } from "fs";
import path from "path";

import type { Label } from "../../scripts/github/sync-labels.js";
import { planLabelSync } from "../../scripts/github/sync-labels.js";

/**
 * The issue tracker is defined in `.github/` (ADR-0084, kit tracker-as-code):
 * the labels a fork syncs, the issue forms that apply them, and the diff
 * `npm run labels:sync` runs. GitHub rejects a form naming an unknown label
 * only when someone opens it, and a label it cannot store only when the sync
 * writes it, so both are checked here. Adapted from lakira-frontend's test.
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (...segments: string[]) =>
  readFileSync(path.join(ROOT, ...segments), "utf-8");

const labels = JSON.parse(read(".github", "labels.json")) as Label[];
const names = labels.map((label) => label.name);

const TEMPLATE_DIR = path.join(".github", "ISSUE_TEMPLATE");
const forms = readdirSync(path.join(ROOT, TEMPLATE_DIR))
  .filter((file) => file.endsWith(".yml") && file !== "config.yml")
  .map((file) => ({ file, text: read(TEMPLATE_DIR, file) }));

/** A form's labels, written in flow style on one line: `labels: ["type:task"]`. */
const formLabels = (text: string): string[] => {
  const match = /^labels:\s*\[(.*)\]\s*$/m.exec(text);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
};

const packageName = (
  JSON.parse(read("package.json")) as {
    name: string;
  }
).name;

describe(".github/labels.json", () => {
  it("names each label once", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every label six hex digits and a description GitHub can store", () => {
    for (const label of labels) {
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
      expect(label.description.length).toBeGreaterThan(0);
      expect(label.description.length).toBeLessThanOrEqual(100);
    }
  });

  // The register's D-01 tiers, its severities and the states in its State
  // column, each one label (tracker-as-code D-02).
  it("holds every type, tier, severity and state the register uses", () => {
    expect([...names].sort()).toEqual(
      [
        "type:task",
        "type:bug",
        "type:decision",
        "tier:1",
        "tier:2",
        "tier:3",
        "tier:4",
        "tier:5",
        "sev:P1",
        "sev:P2",
        "sev:P3",
        "state:ready",
        "state:owner",
        "state:frontend",
        "state:upstream",
        "state:unexplained",
        "state:deferred",
      ].sort(),
    );
  });

  it("describes each tier as the register's D-01 does", () => {
    const tier = (n: number) =>
      labels.find((label) => label.name === `tier:${n}`)?.description;

    expect(tier(1)).toMatch(/audit caveat/);
    expect(tier(2)).toMatch(/owed to the frontend/);
    expect(tier(3)).toMatch(/P2 security/);
    expect(tier(4)).toMatch(/other P2/);
    expect(tier(5)).toMatch(/P3 and ungraded/);
  });
});

describe(".github/ISSUE_TEMPLATE", () => {
  it("has a form for a task, a bug and a decision", () => {
    expect(forms.map((form) => form.file).sort()).toEqual([
      "bug.yml",
      "decision.yml",
      "task.yml",
    ]);
  });

  it.each(forms.map((form) => [form.file, form.text]))(
    "gives %s a name, a description and a body",
    (_file, text) => {
      expect(text).toMatch(/^name: \S/m);
      expect(text).toMatch(/^description: \S/m);
      expect(text).toMatch(/^body:$/m);
    },
  );

  it.each(forms.map((form) => [form.file, form.text]))(
    "lets %s apply only labels that labels.json defines",
    (_file, text) => {
      const applied = formLabels(text);
      expect(applied.length).toBeGreaterThan(0);
      for (const name of applied) expect(names).toContain(name);
    },
  );

  it("files a decision as waiting on the owner", () => {
    const decision = forms.find((form) => form.file === "decision.yml");

    expect(formLabels(decision?.text ?? "")).toEqual([
      "type:decision",
      "state:owner",
    ]);
  });

  it("turns blank issues off", () => {
    expect(read(TEMPLATE_DIR, "config.yml")).toMatch(
      /^blank_issues_enabled: false$/m,
    );
  });

  // Bootstrap renames the repository here, so a fork's link is its own
  // (tracker-as-code D-04).
  it("sends a security problem to this repository's private reporting", () => {
    expect(read(TEMPLATE_DIR, "config.yml")).toContain(
      `/${packageName}/security/advisories/new`,
    );
  });
});

describe("planLabelSync", () => {
  const task: Label = {
    name: "type:task",
    color: "0e8a16",
    description: "A piece of work",
  };
  const bug: Label = {
    name: "type:bug",
    color: "d73a4a",
    description: "Something is wrong",
  };

  it("creates the labels the repository lacks", () => {
    expect(planLabelSync([task, bug], [task])).toEqual({
      create: [bug],
      update: [],
      remove: [],
    });
  });

  it("updates a label whose colour or description differs", () => {
    const stale = { ...task, color: "ffffff" };
    const reworded = { ...bug, description: "Old words" };

    expect(planLabelSync([task, bug], [stale, reworded])).toEqual({
      create: [],
      update: [task, bug],
      remove: [],
    });
  });

  it("matches colours case-insensitively, as GitHub stores them", () => {
    expect(planLabelSync([task], [{ ...task, color: "0E8A16" }])).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });

  it("removes the labels labels.json does not list", () => {
    const wontfix: Label = {
      name: "wontfix",
      color: "ffffff",
      description: "Not worked on",
    };

    expect(planLabelSync([task], [task, wontfix])).toEqual({
      create: [],
      update: [],
      remove: ["wontfix"],
    });
  });

  it("does nothing when the repository already matches", () => {
    expect(planLabelSync([task, bug], [bug, task])).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });
});
