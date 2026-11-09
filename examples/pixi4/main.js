import { createPixi4Engine, SpineLayoutCore } from '../../src/pixi4.ts';
import { loadExports, showStatus, SPINE_38 } from '../shared/exports.js';

const PIXI_SPINE = {
    3.8: '../../node_modules/pixi-spine-v4/dist/pixi-spine.js',
    3.7: '../../node_modules/pixi-spine-v4-37/bin/pixi-spine.js',
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.appendChild(script);
    });
}

const minor = new URLSearchParams(location.search).get('spine') ?? '3.8';
if (!PIXI_SPINE[minor]) throw new Error(`No pixi-spine for Spine ${minor}: try ?spine=3.7`);
if (minor === '3.7') document.getElementById('skin-hint').remove();
await loadScript(PIXI_SPINE[minor]);

const app = new PIXI.Application({ width: 960, height: 540, backgroundColor: 0x262a31 });
document.body.appendChild(app.view);

const engine = createPixi4Engine(PIXI, { renderer: app.renderer });

const layout = new SpineLayoutCore({ engine });
const data = await loadExports(engine, layout, SPINE_38);
if (minor === '3.7') {
    const response = await fetch('../../tests/fixtures/contract-3.7.json');
    data[0].skeleton = await response.json();
}
await layout.createInstancesFromDataArray(data);
layout.position.set(480, 280);
layout.scale.set(1.4);
app.stage.addChild(layout);

const root = layout.spines.get('root');
if (minor === '3.7') {
    root.state.setAnimation(0, 'move', true);
} else {
    layout.animations.playState('idle');
    layout.animations.addEventListener('play_click', () =>
        layout.skins.apply(root.skeleton.skin?.name === 'night' ? 'default' : 'night'),
    );
}

showStatus(PIXI.VERSION, engine, [layout]);

Object.assign(window, { app, engine, layout });
