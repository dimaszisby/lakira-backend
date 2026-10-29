/**
 * sync-labels.ts — make the repository's GitHub labels match .github/labels.json.
 *
 * Usage:
 *   npm run labels:sync                         # dry run: print the plan, write nothing
 *   npm run labels:sync -- --apply              # create, update and delete
 *   npm run labels:sync -- --repo owner/name    # another repository; default is gh's current one
 *
 * labels.json is the whole set: a label it does not list is deleted, which also
 * removes it from every issue and pull request carrying it (ADR-0084). Needs the
 * GitHub CLI, signed in with the `repo` scope. Taken from lakira-frontend's
 * script of the same name (its ADR-0042).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export type Label = { name: string; color: string; description: string };

export type LabelPlan = { create: Label[]; update: Label[]; remove: string[] };

const sameLabel = (a: Label, b: Label) =>
  a.color.toLowerCase() === b.color.toLowerCase() &&
  a.description === b.description;

/** What turns `current` into `desired`. Names match exactly; colours ignore case, as GitHub's do. */
export const planLabelSync = (
  desired: Label[],
  current: Label[],
): LabelPlan => {
  const currentByName = new Map(current.map((label) => [label.name, label]));
  const desiredNames = new Set(desired.map((label) => label.name));

  return {
    create: desired.filter((label) => !currentByName.has(label.name)),
    update: desired.filter((label) => {
      const existing = currentByName.get(label.name);
      return existing !== undefined && !sameLabel(existing, label);
    }),
    remove: current
      .filter((label) => !desiredNames.has(label.name))
      .map((label) => label.name),
  };
};

const print = (line: string) => process.stdout.write(`${line}\n`);

const gh = (args: string[], repo: string | undefined) =>
  execFileSync("gh", repo ? [...args, "--repo", repo] : args, {
    encoding: "utf8",
  });

const main = (argv: string[]) => {
  const apply = argv.includes("--apply");
  const repoIndex = argv.indexOf("--repo");
  const repo = repoIndex === -1 ? undefined : argv[repoIndex + 1];
  if (repoIndex !== -1 && !repo) throw new Error("--repo needs owner/name");

  const desired = JSON.parse(
    readFileSync(path.join(process.cwd(), ".github", "labels.json"), "utf8"),
  ) as Label[];
  const current = JSON.parse(
    gh(
      ["label", "list", "--json", "name,color,description", "--limit", "200"],
      repo,
    ),
  ) as Label[];

  const plan = planLabelSync(desired, current);
  for (const label of plan.create) print(`create  ${label.name}`);
  for (const label of plan.update) print(`update  ${label.name}`);
  for (const name of plan.remove) print(`delete  ${name}`);
  print(
    `${plan.create.length} to create, ${plan.update.length} to update, ${plan.remove.length} to delete`,
  );

  if (!apply) {
    print("Dry run: nothing was written. Pass --apply to write.");
    return;
  }

  for (const label of plan.create) {
    gh(
      [
        "label",
        "create",
        label.name,
        "--color",
        label.color,
        "--description",
        label.description,
      ],
      repo,
    );
  }
  for (const label of plan.update) {
    gh(
      [
        "label",
        "edit",
        label.name,
        "--color",
        label.color,
        "--description",
        label.description,
      ],
      repo,
    );
  }
  for (const name of plan.remove) gh(["label", "delete", name, "--yes"], repo);
  print("Applied.");
};

// Run only as the entry point, so the unit test can import planLabelSync.
if (process.argv[1]?.endsWith(path.join("github", "sync-labels.ts"))) {
  main(process.argv.slice(2));
}
