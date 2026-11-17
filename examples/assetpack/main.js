import { SpineLayout } from '@pixijs-userland/spine-layout';
import { Application, Assets } from 'pixi.js';

const BUNDLE = 'game';

const app = new Application();
await app.init({ resizeTo: window, background: '#262a31', autoDensity: true });
document.body.appendChild(app.canvas);

const manifest = await fetch('assets/manifest.json').then((response) => response.json());

await Assets.init({
    manifest,
    basePath: 'assets',
    texturePreference: {
        resolution: Math.min(window.screen.width, window.screen.height) < 600 ? 0.5 : 1,
        format: ['avif', 'webp', 'png'],
    },
});
await Assets.loadBundle(BUNDLE);

const layout = new SpineLayout();
await layout.createInstancesFromManifest(manifest, BUNDLE);
app.stage.addChild(layout);

const fit = () => {
    const scale = Math.min(app.screen.width / 1600, app.screen.height / 986);
    layout.scale.set(scale);
    layout.position.set(app.screen.width / 2, app.screen.height / 2);
};
app.renderer.on('resize', fit);
fit();

app.canvas.addEventListener('pointerdown', () => layout.playAnimationByName('jump'));

Object.assign(window, { app, layout, manifest });
