import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/dist'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
    },
    {
        // The core renders through `Engine` alone; a rendering stack is an engine's business.
        files: ['src/core/**/*.ts', 'src/engine/**/*.ts', 'src/core.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['pixi.js', 'pixi.js/*', '@esotericsoftware/*', 'pixi-spine', 'pixi-spine/*', 'pixi-particles', 'pixi-particles/*'],
                            message: 'The layout core reaches the rendering stack through `Engine` only.',
                        },
                        {
                            group: ['**/engines/**'],
                            message: 'The layout core is handed its engine; it never imports one.',
                        },
                    ],
                },
            ],
        },
    },
);
