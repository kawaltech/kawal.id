import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

export function dataPaths(directory = process.env.DATA_DIR ?? ".data") {
  const root = resolve(directory);
  return {
    root,
    database: join(root, "db", "kawal.sqlite"),
    originals: join(root, "private", "originals"),
    public: join(root, "public"),
    backups: join(root, "backups"),
  };
}

export function prepareStorage(directory?: string) {
  const paths = dataPaths(directory);
  for (const path of [join(paths.root, "db"), paths.originals, paths.backups]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  mkdirSync(paths.public, { recursive: true });
  return paths;
}
