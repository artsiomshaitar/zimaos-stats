//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    // generated component code (shadcn + animate-ui registries)
    ignores: [
      "eslint.config.js",
      ".prettierrc",
      "src/components/ui/**",
      "src/components/animate-ui/**",
      "src/hooks/use-is-in-view.tsx",
    ],
  },
]
