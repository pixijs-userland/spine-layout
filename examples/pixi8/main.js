import * as spine43 from '@esotericsoftware/spine-pixi-v8';
import { version as spine43Version } from '@esotericsoftware/spine-pixi-v8/package.json';
import { Application, VERSION } from 'pixi.js';
import { version as spine42Version } from 'spine-pixi-v8-42/package.json';
import { createPixi8Engine, SpineLayout } from '../../src/index.ts';
import { esotericRuntime } from '../../src/runtimes/index.ts';
import { loadExports, showStatus, SPINE_43 } from '../shared/exports.js';

// made before the renderer starts, so the renderer builds the pipe this reserves for the lazy 4.2
const engine = createPixi8Engine({
    runtimes: [
        esotericRuntime(spine43, spine43Version),
        {
            minor: '4.2',
            load: async () => esotericRuntime(await import('spine-pixi-v8-42'), spine42Version),
        },
    ],
});

const app = new Application();
await app.init({ width: 960, height: 540, background: '#262a31' });
document.body.appendChild(app.canvas);

const layout = new SpineLayout({ engine, root: 'popup' });
const data = await loadExports(engine, layout, {
    ...SPINE_43,
    skeletons: [...SPINE_43.skeletons, 'settingsButton'],
});
await layout.createInstancesFromDataArray(data);
layout.position.set(480, 290);
layout.scale.set(0.65);
app.stage.addChild(layout);

const settingsButton = layout.createInstance('settingsButton');
settingsButton.position.set(880, 80);
settingsButton.scale.set(0.6);
app.stage.addChild(settingsButton);

showStatus(VERSION, engine, [layout]);

Object.assign(window, { app, engine, layout });
