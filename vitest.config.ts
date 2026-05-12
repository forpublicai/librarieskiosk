import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    test: {
        environment: 'node',
    },
    resolve: {
        alias: [
            { find: /^@\/config\/(.*)$/, replacement: `${rootDir}config/$1` },
            { find: /^@\/(.*)$/, replacement: `${rootDir}src/$1` },
        ],
    },
});
