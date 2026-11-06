import { createPixi7Engine, SpineLayoutCore } from '../../src/pixi7.ts';
import { loadExports, showStatus, SPINE_38, SPINE_43 } from '../shared/exports.js';

const app = new PIXI.Application({ width: 960, height: 540, backgroundColor: 0x262a31 });
document.body.appendChild(app.view);

const engine = createPixi7Engine(PIXI);

const legacy = new SpineLayoutCore({ engine });
await legacy.createInstancesFromDataArray(await loadExports(engine, legacy, SPINE_38));
legacy.position.set(260, 280);
legacy.scale.set(1.4);
app.stage.addChild(legacy);

const popup = new SpineLayoutCore({ engine, root: 'popup' });
await popup.createInstancesFromDataArray(await loadExports(engine, popup, SPINE_43));
popup.position.set(680, 290);
popup.scale.set(0.5);
app.stage.addChild(popup);

const root = legacy.spines.get('root');
legacy.animations.playState('idle');
legacy.animations.addEventListener('play_click', () => {
    legacy.skins.apply(root.skeleton.skin?.name === 'night' ? 'default' : 'night');
    popup.animations.playEvent('settings_click');
});

showStatus(PIXI.VERSION, engine, [legacy, popup]);

Object.assign(window, { app, engine, legacy, popup });
