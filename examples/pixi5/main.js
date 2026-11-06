import { version } from 'pixi-spine-v5-38/package.json';
import { createPixi5Engine, SpineLayoutCore } from '../../src/pixi5.ts';
import { pixiSpineLegacy } from '../../src/runtimes/index.ts';
import { loadExports, showStatus, SPINE_38 } from '../shared/exports.js';

const app = new PIXI.Application({ width: 960, height: 540, backgroundColor: 0x262a31 });
document.body.appendChild(app.view);

const engine = createPixi5Engine(PIXI, {
    runtime: pixiSpineLegacy(PIXI.spine, { packageVersion: version }),
    renderer: app.renderer,
});

const layout = new SpineLayoutCore({ engine });
await layout.createInstancesFromDataArray(await loadExports(engine, layout, SPINE_38));
layout.position.set(480, 280);
layout.scale.set(1.4);
app.stage.addChild(layout);

const root = layout.spines.get('root');
layout.animations.playState('idle');
layout.animations.addEventListener('play_click', () =>
    layout.skins.apply(root.skeleton.skin?.name === 'night' ? 'default' : 'night'),
);

showStatus(PIXI.VERSION, engine, [layout]);

Object.assign(window, { app, engine, layout });
