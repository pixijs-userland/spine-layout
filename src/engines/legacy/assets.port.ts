import type { AssetsPort } from '../../engine/Engine';
import type { LegacyCompat } from './compat';
import type {
    LegacyLoader,
    LegacyLoaderResource,
    LegacyNamespace,
    LegacyTexture,
} from './legacy.types';

export interface LegacyAssetsPort extends AssetsPort {
    /** Holds `value` under `alias` for a page with no loader behind it — the editor. */
    set(alias: string, value: unknown): void;
    delete(alias: string): void;
}

export interface LegacyAssetsRegistry extends LegacyAssetsPort {
    /** What a v4–v6 loader holds under `alias`; nothing on v7, which has no loader resources. */
    resource(alias: string): LegacyLoaderResource | undefined;
    /** An atlas page's texture, looked up by its file name the ways a game's loader keys it. */
    pageTexture(page: string, atlasAlias?: string): LegacyTexture | undefined;
}

const folderOf = (path: string | undefined) => path?.slice(0, path.lastIndexOf('/') + 1) ?? '';

const asTexture = (value: unknown) =>
    value && typeof value === 'object' && 'baseTexture' in value
        ? (value as LegacyTexture)
        : undefined;

/**
 * Reads, in order: the loaders' resources (the shared one, then `loaders`: an `app.loader` is
 * its own instance on v4–v6), the registry, v7's `Assets` cache, and the texture cache.
 */
export function createAssetsPort(
    PIXI: LegacyNamespace,
    compat: LegacyCompat,
    loaders: readonly LegacyLoader[] = [],
): LegacyAssetsRegistry {
    const registry = new Map<string, unknown>();

    const allLoaders = () => {
        const shared = compat.sharedLoader();
        return shared ? [shared, ...loaders] : loaders;
    };

    function resourceIn(loader: LegacyLoader, alias: string) {
        const { resources } = loader;
        if (resources[alias]) return resources[alias];

        const bare = /^(.+)\.(?:json|skel)$/.exec(alias)?.[1];
        return bare && resources[bare]?.spineData ? resources[bare] : undefined;
    }

    function resource(alias: string): LegacyLoaderResource | undefined {
        for (const loader of allLoaders()) {
            const found = resourceIn(loader, alias);
            if (found) return found;
        }
        return undefined;
    }

    function inAssets(alias: string) {
        const cache = compat.assetsCache();
        return cache?.has(alias) ? cache.get(alias) : undefined;
    }

    const cached = (alias: string) => PIXI.utils?.TextureCache[alias];

    function textureAt(alias: string): LegacyTexture | undefined {
        return (
            resource(alias)?.texture ??
            asTexture(registry.get(alias)) ??
            asTexture(inAssets(alias)) ??
            cached(alias)
        );
    }

    return {
        get<A = unknown>(alias: string): A | undefined {
            const loaded = resource(alias);
            if (loaded) return (loaded.texture ?? loaded.data) as A;

            return (registry.get(alias) ?? inAssets(alias) ?? cached(alias)) as A | undefined;
        },
        has: (alias) =>
            !!resource(alias) ||
            registry.has(alias) ||
            !!compat.assetsCache()?.has(alias) ||
            !!cached(alias),
        set: (alias, value) => void registry.set(alias, value),
        delete: (alias) => void registry.delete(alias),
        resource,

        pageTexture(page, atlasAlias) {
            const atlas = atlasAlias ? resource(atlasAlias) : undefined;
            const candidates = [page, folderOf(atlasAlias) + page, folderOf(atlas?.url) + page];

            for (const alias of candidates) {
                const texture = textureAt(alias);
                if (texture) return texture;
            }

            for (const loader of allLoaders()) {
                const byUrl = Object.values(loader.resources).find(
                    (entry) =>
                        entry?.texture && (entry.url === page || entry.url?.endsWith(`/${page}`)),
                );
                if (byUrl) return byUrl.texture;
            }
            return undefined;
        },
    };
}
