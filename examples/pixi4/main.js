import { createPixi4Engine } from '../../src/pixi4.ts';
import { SpineLayoutCore } from '../../src/core.ts';

const RUNTIMES = {
    3.8: {
        script: '../../node_modules/pixi-spine-v4/dist/pixi-spine.js',
        skeleton: '../../tests/fixtures/contract-3.8.json',
    },
    3.7: {
        script: '../../node_modules/pixi-spine-v4-37/bin/pixi-spine.js',
        skeleton: '../../tests/engines/pixi4/contract-3.7.json',
    },
};

const ATLAS = `
contract.png
size: 64,64
format: RGBA8888
filter: Linear,Linear
repeat: none
square
  rotate: false
  xy: 2, 2
  size: 40, 20
  orig: 40, 20
  offset: 0, 0
  index: -1
`;

function atlasPage() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#4f9dde';
    context.fillRect(2, 2, 40, 20);
    context.fillStyle = '#ffffff';
    context.fillRect(2, 2, 8, 20);
    return PIXI.Texture.fromCanvas(canvas);
}

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
const runtime = RUNTIMES[minor];
if (!runtime) throw new Error(`No pixi-spine for Spine ${minor}: try ?spine=3.7 or ?spine=3.8`);
await loadScript(runtime.script);

const app = new PIXI.Application({ width: 480, height: 320, backgroundColor: 0x1d1f24 });
document.body.appendChild(app.view);

const engine = createPixi4Engine(PIXI, { renderer: app.renderer });
const skeleton = await fetch(runtime.skeleton).then((response) => response.json());

const layout = new SpineLayoutCore({ engine });
layout.createInstancesFromDataArray([
    { name: 'root', skeleton, atlasText: ATLAS, textures: { 'contract.png': atlasPage() } },
]);
layout.position.set(200, 180);
layout.scale.set(3);
app.stage.addChild(layout);

const spine = layout.spines.get('root');
spine.state.setAnimation(0, 'move', true);

const status = document.getElementById('status');
spine.state.addListener({
    event: (_, event) => (status.textContent = `event: ${event.data.name}`),
});
const [{ packageName, packageVersion }] = engine.spine.runtimes;
status.textContent = `PIXI ${PIXI.VERSION}, ${packageName} ${packageVersion}, export ${spine.spineData.version}`;

Object.assign(window, { app, engine, layout, spine });
