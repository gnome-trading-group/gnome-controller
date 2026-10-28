import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import postCSSPresetMantine from 'postcss-preset-mantine'
import postCSSSimpleVars from 'postcss-simple-vars'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        postCSSPresetMantine(),
        postCSSSimpleVars({
          variables: {
            'mantine-breakpoint-xs': '36em',
            'mantine-breakpoint-sm': '48em',
            'mantine-breakpoint-md': '62em',
            'mantine-breakpoint-lg': '75em',
            'mantine-breakpoint-xl': '88em',
          },
        })
      ]
    }
  },
  test: {
    // cdk/ is its own package, tested with jest (`cd cdk && npx jest`).
    exclude: [...configDefaults.exclude, 'cdk/**'],
  },
  resolve: {
    alias: {
      // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
})
