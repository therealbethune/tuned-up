import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Netlify build output (gitignored). Minified function + static
    // bundles; linting them produced ~29k meaningless problems that
    // dwarfed the real source lint and slowed `lint`/preflight.
    ".netlify/**",
  ]),
]);

export default eslintConfig;
