#!/bin/sh
set -eu

node scripts/migrate.ts
node scripts/init-public.mjs
exec ./node_modules/.bin/react-router-serve ./build/server/index.js
