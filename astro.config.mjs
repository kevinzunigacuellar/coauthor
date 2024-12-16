import { defineConfig, envField } from "astro/config";
import netlify from "@astrojs/netlify";

// https://astro.build/config
export default defineConfig({
  adapter: netlify(),
  env: {
    schema: {
      GH_TOKEN: envField.string({ context: "server", access: "secret" }),
    },
  },
});
