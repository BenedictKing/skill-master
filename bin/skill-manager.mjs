#!/usr/bin/env node

import('../dist/cli.js').catch((err) => {
  console.error('Failed to load skill-manager:', err.message);
  process.exit(1);
});
