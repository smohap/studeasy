import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * supabase/tests holds a static lint over the pgTAP files. It is here
     * rather than in lib/ because it belongs beside what it checks, and it
     * earns its place: nothing in this project can execute SQL, so the only
     * feedback on those files is a human pasting an error back.
     */
    include: ['lib/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
  },
})
