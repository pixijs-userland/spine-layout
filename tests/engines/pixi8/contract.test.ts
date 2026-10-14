import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { Assets, type Texture } from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import type { Engine } from '../../../src/engine/Engine';
import { createPixi8Engine as createDefaultEngine } from '../../../src/index';
import { createPixi8Engine } from '../../../src/pixi8';
import { esotericRuntime } from '../../../src/runtimes';
import {
    contractFixture,
    engineContract,
    twoRuntimesContract,
    type CacheContractExport,
} from '../../engine-contract/contract';

// left in the node environment, as the suite reads its fixtures off disk

function once(build: () => Engine | Promise<Engine>): () => Promise<Engine> {
    let engine: Promise<Engine> | undefined;
    return () => (engine ??= Promise.resolve(build()));
}

const only43 = once(() => createPixi8Engine({ runtimes: [esotericRuntime(SP43, '4.3.7')] }));
const only42 = once(() => createPixi8Engine({ runtimes: [esotericRuntime(SP42, '4.2.120')] }));
const both = once(() =>
    createPixi8Engine({ runtimes: [esotericRuntime(SP43), esotericRuntime(SP42)] }),
);
const lazy42 = once(async () => {
    const engine = createPixi8Engine({
        runtimes: [esotericRuntime(SP43), { minor: '4.2', load: () => import('spine-pixi-v8-42') }],
    });
    await engine.spine.prepare!(['4.2']);
    return engine;
});
const defaultPlus42 = once(() => createDefaultEngine({ runtimes: [esotericRuntime(SP42)] }));

/** What spine-pixi-v8's loaders leave in pixi's asset cache: the JSON as is, the atlas parsed by 4.3. */
const cache: CacheContractExport = (engine, minor) => {
    const { skeleton, atlasText } = contractFixture(minor);
    const atlas = new SP43.TextureAtlas(atlasText);
    const page = (engine.display.whiteTexture as Texture).source;
    atlas.pages.forEach((each) => each.setTexture(SP43.SpineTexture.from(page)));

    const aliases = { skeleton: `two-${minor}.json`, atlas: `two-${minor}.atlas` };
    Object.values(aliases).forEach((alias) => {
        if (Assets.cache.has(alias)) Assets.cache.remove(alias);
    });
    Assets.cache.set(aliases.skeleton, skeleton);
    Assets.cache.set(aliases.atlas, atlas);

    return aliases;
};

engineContract('createPixi8Engine over spine-pixi-v8 4.3 alone', only43);
engineContract('createPixi8Engine over spine-pixi-v8 4.2 alone', only42);

twoRuntimesContract('createPixi8Engine over 4.3 and 4.2', both, ['4.2', '4.3'], {
    cache,
});
engineContract('createPixi8Engine over 4.3 and 4.2, a 4.2 export', both, '4.2');
engineContract('createPixi8Engine over 4.3 and 4.2, a 4.3 export', both, '4.3');

twoRuntimesContract('createPixi8Engine over 4.3 and a lazy 4.2', lazy42, ['4.2', '4.3'], {
    cache,
});
engineContract('createPixi8Engine over 4.3 and a lazy 4.2, a 4.2 export', lazy42, '4.2');

twoRuntimesContract('the "." engine with 4.2 added to its own 4.3', defaultPlus42, ['4.2', '4.3'], {
    cache,
});
