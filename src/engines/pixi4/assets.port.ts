import type { AssetsPort } from '../../engine/Engine';
import type { Pixi4LoaderResource, Pixi4Namespace, Pixi4Texture } from './pixi4.types';

export interface Pixi4AssetsPort extends AssetsPort {
    /** Holds `value` under `alias` for a page with no `PIXI.loader` behind it — the editor. */
    set(alias: string, value: unknown): void;
    delete(alias: string): void;
}

export interface AssetsRegistry extends Pixi4AssetsPort {
    resource(alias: string): Pixi4LoaderResource | undefined;
    /** An atlas page's texture, looked up by its file name the ways a game's loader keys it. */
    pageTexture(page: string, atlasAlias?: string): Pixi4Texture | undefined;
}

const folderOf = (path: string | undefined) => path?.slice(0, path.lastIndexOf('/') + 1) ?? '';

const asTexture = (value: unknown) =>
    value && typeof value === 'object' && 'baseTexture' in value
        ? (value as Pixi4Texture)
        : undefined;

export function createAssetsPort(PIXI: Pixi4Namespace): AssetsRegistry {
    const registry = new Map<string, unknown>();
    const resource = (alias: string) => PIXI.loader?.resources[alias];

    function textureAt(alias: string): Pixi4Texture | undefined {
        return resource(alias)?.texture ?? asTexture(registry.get(alias));
    }

    return {
        get<A = unknown>(alias: string): A | undefined {
            const loaded = resource(alias);
            if (loaded) return (loaded.texture ?? loaded.data) as A;

            return registry.get(alias) as A | undefined;
        },
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

            const byUrl = Object.values(PIXI.loader?.resources ?? {}).find(
                (entry) =>
                    entry?.texture && (entry.url === page || entry.url?.endsWith(`/${page}`)),
            );

            return byUrl?.texture;
        },
    };
}
