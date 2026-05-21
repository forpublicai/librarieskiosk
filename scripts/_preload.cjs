// Preload for verification scripts that import @/lib/* directly outside Next.
// 1) Loads .env (and .env.local if present) so DATABASE_URL / CRON_SECRET / etc.
//    reach process.env without requiring an --env-file flag.
// 2) Substitutes an empty module for `server-only`, which throws on import
//    outside the Next bundler.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '..');
for (const file of ['.env', '.env.local']) {
    const full = path.join(repoRoot, file);
    if (fs.existsSync(full)) process.loadEnvFile(full);
}

const STUB = path.join(__dirname, '_server-only-stub.cjs');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'server-only') return STUB;
    return originalResolve.call(this, request, ...rest);
};
