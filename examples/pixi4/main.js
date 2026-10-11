import { createPixi4Engine } from '../../src/pixi4.ts';
import { SpineLayoutCore } from '../../src/core.ts';

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

const app = new PIXI.Application({ width: 480, height: 320, backgroundColor: 0x1d1f24 });
document.body.appendChild(app.view);

const engine = createPixi4Engine(PIXI, { renderer: app.renderer });
const skeleton = await fetch('../../tests/fixtures/contract-3.8.json').then((response) =>
    response.json(),
);

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
status.textContent = `PIXI ${PIXI.VERSION}, spine ${spine.spineData.version}`;

Object.assign(window, { app, engine, layout, spine });
