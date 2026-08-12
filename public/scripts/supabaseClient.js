// Loaded from a CDN, not vendored from node_modules like fuse.js is -
// @supabase/supabase-js has its own internal dependency graph (not a single
// bundleable file), so vendoring it would need a real bundler. This project
// deliberately has none (BUILD_BRIEF.md), so it's loaded as a single ESM
// import instead, same as any other browser-native `import`. Revisit if
// the CDN dependency ever becomes a real problem (uptime, versioning).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/scripts/config.js';

// null when a build ran without SUPABASE_URL/SUPABASE_ANON_KEY set (see
// scripts/build.mjs) - every consumer must handle that case rather than
// assume this exists, so the site stays usable (anonymous tier only) even
// when the account tier isn't configured.
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
