import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // Design review pages with synthetic data. Remove them before release.
  ...prefix("rancangan", [
    index("routes/rancangan/index.tsx"),
    route("a", "routes/rancangan/a.tsx"),
    route("b", "routes/rancangan/b.tsx"),
    route("c", "routes/rancangan/c.tsx"),
  ]),
  route("editor/healthz", "routes/editor-health.ts"),
] satisfies RouteConfig;
