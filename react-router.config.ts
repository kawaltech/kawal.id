import type { Config } from "@react-router/dev/config";

export default {
  // Public navigation must not require a live route-manifest endpoint.
  routeDiscovery: { mode: "initial" },
  async prerender() {
    return ["/", "/rancangan", "/rancangan/a", "/rancangan/b", "/rancangan/c"];
  },
} satisfies Config;
