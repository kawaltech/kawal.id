import { execFileSync } from "node:child_process";

// Print true unless the complete pushed range contains documentation changes only.
// Missing history or a new branch must not suppress deployment.
let deploy = true;
try {
  const [before, after] = process.argv.slice(2);
  const paths = execFileSync(
    "git",
    ["diff", "--no-renames", "--name-only", "-z", before, after, "--"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .split("\0")
    .filter(Boolean);
  deploy = !paths.every(
    (path) =>
      path.startsWith("docs/") ||
      (path.endsWith(".md") && !path.startsWith("apps/") && !path.startsWith("app/")),
  );
} catch {
  console.error("Cannot compare the complete range; require public deployment.");
}
console.log(deploy);
