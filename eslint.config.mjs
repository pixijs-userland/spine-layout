import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Pixi and Spine runtimes, under their own names and the npm aliases the tests and the editor use. */
const RENDERING_STACK = [
    'pixi.js',
    'pixi.js/*',
    'pixi.js-v*',
    '@pixi/*',
    'pixi-spine',
    'pixi-spine/*',
    'pixi-spine-v*',
    '@pixi-spine/*',
    '@pixi-spine-v*/*',
    '@esotericsoftware/*',
    'spine-pixi-v*',
    'pixi-particles',
    'pixi-particles/*',
];

export default tseslint.config(
    { ignores: ['**/dist'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { tsconfigRootDir: import.meta.dirname },
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
                            group: RENDERING_STACK,
                            message:
                                'The layout core reaches the rendering stack through `Engine` only.',
                        },
                        {
                            group: ['**/engines/**', '**/runtimes', '**/runtimes/**'],
                            message: 'The layout core is handed its engine; it never imports one.',
                        },
                    ],
                },
            ],
        },
    },
    {
        // Every engine but pixi8 is handed its PIXI and its Spine runtimes by its caller, so it
        // may name their types, never load them.
        files: [
            'src/engines/pixi4/**/*.ts',
            'src/engines/pixi5/**/*.ts',
            'src/engines/pixi6/**/*.ts',
            'src/engines/pixi7/**/*.ts',
            'src/engines/legacy/**/*.ts',
            'src/engines/pixiSpine/**/*.ts',
            'src/engines/esoteric/**/*.ts',
            'src/engines/shared/**/*.ts',
            'src/runtimes/**/*.ts',
            'src/pixi4.ts',
            'src/pixi5.ts',
            'src/pixi6.ts',
            'src/pixi7.ts',
            'src/pixi8.ts',
        ],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: RENDERING_STACK,
                            allowTypeImports: true,
                            message:
                                'This engine receives its PIXI and Spine runtimes from its caller: import their types only.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/engines/pixi8/**/*.ts', 'src/index.ts'],
        rules: {
            'no-restricted-globals': [
                'error',
                {
                    name: 'PIXI',
                    message: 'pixi8 imports pixi.js; the global namespace is the v4 stack.',
                },
            ],
        },
    },
);
