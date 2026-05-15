import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
    title: 'spine-layout',
    tagline: 'Compose Pixi.js scenes from Spine skeletons',
    favicon: 'img/favicon.ico',

    url: 'https://pixijs-userland.github.io',
    baseUrl: '/spine-layout/',
    organizationName: 'pixijs-userland',
    projectName: 'spine-layout',
    trailingSlash: false,

    onBrokenLinks: 'throw',
    markdown: {
        hooks: {
            onBrokenMarkdownLinks: 'warn',
        },
    },

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    presets: [
        [
            'classic',
            {
                docs: {
                    routeBasePath: '/',
                    sidebarPath: './sidebars.ts',
                },
                blog: false,
                theme: {
                    customCss: './src/css/custom.css',
                },
            } satisfies Preset.Options,
        ],
    ],

    plugins: [
        [
            '@easyops-cn/docusaurus-search-local',
            {
                hashed: true,
                docsRouteBasePath: '/',
            },
        ],
    ],

    themeConfig: {
        colorMode: {
            defaultMode: 'dark',
            disableSwitch: true,
            respectPrefersColorScheme: false,
        },
        navbar: {
            title: 'spine-layout',
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'guides',
                    position: 'left',
                    label: 'Guide',
                },
                {
                    type: 'docSidebar',
                    sidebarId: 'api',
                    position: 'left',
                    label: 'API',
                },
                {
                    href: 'https://github.com/pixijs-userland/spine-layout',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            copyright: `Copyright © ${new Date().getFullYear()} spine-layout`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
            additionalLanguages: ['typescript', 'bash', 'json'],
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
