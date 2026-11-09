import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PointerEventLike, SpineRuntimeInfo } from '../../../src/engine/Engine';
import {
    createLegacyPorts,
    type LegacyBitmapText,
    type LegacyContainer,
    type LegacyPorts,
    type LegacySpine,
    type SpineShapes,
} from '../../../src/engines/legacy';
import { layoutBitmapText } from '../../../src/engines/legacy/bitmapFont';
import { NO_FONT } from '../../../src/engines/legacy/text.port';
import {
    canvasTexture,
    loadPixi,
    updateTransforms,
    withParticles,
    type LegacyMajor,
    type LoadedPixi,
    type ParticlesLibrary,
} from './loadLegacyPixi';

export const FNT = `info face="TestFont" size=32 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1
common lineHeight=40 base=30 scaleW=128 scaleH=64 pages=1 packed=0
page id=0 file="test.png"
chars count=4
char id=65 x=0 y=0 width=20 height=30 xoffset=1 yoffset=2 xadvance=22 page=0 chnl=15
char id=66 x=20 y=0 width=18 height=28 xoffset=0 yoffset=4 xadvance=20 page=0 chnl=15
char id=67 x=40 y=0 width=25 height=25 xoffset=3 yoffset=6 xadvance=24 page=0 chnl=15
char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=10 page=0 chnl=15
kernings count=1
kerning first=65 second=66 amount=-3
`;

const fontNamed = (family: string) => FNT.replace('face="TestFont"', `face="${family}"`);

const LOOPING_PARTICLES = {
    alpha: { start: 1, end: 0 },
    scale: { start: 0.1, end: 0.05 },
    color: { start: '#ffffff', end: '#ff0000' },
    speed: { start: 100, end: 50 },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.5, max: 0.5 },
    blendMode: 'normal',
    frequency: 0.1,
    emitterLifetime: -1,
    maxParticles: 100,
    pos: { x: 0, y: 0 },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: { x: 0, y: 0, r: 10 },
    particlesPerWave: 5,
};

export interface LegacyCase {
    major: LegacyMajor;
    particles: ParticlesLibrary[];
}

type Box = { height: number; centre: { x: number; y: number } };
type Glyph = { x: number; y: number; width: number; height: number };

const rounded = (box: Box | undefined) =>
    box && {
        height: +box.height.toFixed(3),
        centre: { x: +box.centre.x.toFixed(3), y: +box.centre.y.toFixed(3) },
    };

const inked = (glyphs: Glyph[]) =>
    glyphs
        .filter(({ width, height }) => !(width <= 0 || height <= 0))
        .map((glyph) => ({
            x: +glyph.x.toFixed(3),
            y: +glyph.y.toFixed(3),
            width: +glyph.width.toFixed(3),
            height: +glyph.height.toFixed(3),
        }));

const finite = (glyphs: Glyph[]) =>
    glyphs.every((glyph) => Object.values(glyph).every(Number.isFinite));

/** The glyphs PIXI laid out last, as they stand: sprites up to 5.2, a quad each in the page meshes from 5.3. */
function drawnGlyphs(node: LoadedPixi): Glyph[] {
    if (node._glyphs) {
        return inked(
            node._glyphs
                .filter((glyph: LoadedPixi) => glyph.parent === node)
                .map((glyph: LoadedPixi) => ({
                    x: glyph.x,
                    y: glyph.y,
                    width: glyph.texture.frame.width * glyph.scale.x,
                    height: glyph.texture.frame.height * glyph.scale.y,
                })),
        );
    }

    return inked(
        node._activePagesMeshData.flatMap((page: LoadedPixi) =>
            Array.from({ length: page.total }, (_, i) => {
                const [x0, y0, , , x1, y1] = page.vertices.subarray(i * 8, i * 8 + 6);
                return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
            }),
        ),
    );
}

function boxOf(glyphs: Glyph[]): Box | undefined {
    if (!glyphs.length) return undefined;

    const left = Math.min(...glyphs.map(({ x }) => x));
    const top = Math.min(...glyphs.map(({ y }) => y));
    const right = Math.max(...glyphs.map(({ x, width }) => x + width));
    const bottom = Math.max(...glyphs.map(({ y, height }) => y + height));
    return rounded({
        height: bottom - top,
        centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
    });
}

/** The ink box PIXI lays the node out to now. */
function drawnInk(node: LoadedPixi): Box | undefined {
    node.updateText();
    return boxOf(drawnGlyphs(node));
}

/** A PIXI interaction manager (v4–v6) or event system (v7) on a canvas, fed real DOM pointer events. */
function pointerInput(PIXI: LoadedPixi, major: LegacyMajor, stage: LegacyContainer) {
    const view = document.createElement('canvas');
    view.width = view.height = 200;
    view.getBoundingClientRect = () =>
        ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 200,
            height: 200,
            right: 200,
            bottom: 200,
        }) as DOMRect;
    document.body.appendChild(view);

    const renderer = {
        view,
        resolution: 1,
        _lastObjectRendered: stage,
        lastObjectRendered: stage,
        plugins: {},
    };
    const Manager =
        major === 7 ? undefined : (PIXI.InteractionManager ?? PIXI.interaction.InteractionManager);
    const manager = Manager ? new Manager(renderer) : new PIXI.EventSystem(renderer);
    if (!Manager) manager.init({});

    const fire = (type: string, x: number, y: number, target: EventTarget) =>
        target.dispatchEvent(
            new PointerEvent(type, {
                clientX: x,
                clientY: y,
                pointerType: 'mouse',
                pointerId: 1,
                isPrimary: true,
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: type === 'pointerup' ? 0 : 1,
            }),
        );

    return {
        manager,
        click(x: number, y: number) {
            fire('pointerdown', x, y, view);
            fire('pointerup', x, y, window);
        },
        move: (x: number, y: number) => fire('pointermove', x, y, document),
        hitTest(x: number, y: number): unknown {
            updateTransforms(PIXI, stage);
            if (Manager) return manager.hitTest(new PIXI.Point(x, y), stage);
            return new PIXI.EventBoundary(stage).hitTest(x, y);
        },
        destroy() {
            manager.destroy();
            view.remove();
        },
    };
}

export const describeLegacyPorts = ({ major, particles }: LegacyCase) =>
    describe(`legacy ports on Pixi ${major}`, () => suite(major, particles));

function suite(major: LegacyMajor, particles: ParticlesLibrary[]) {
    let PIXI: LoadedPixi;
    let ports: LegacyPorts;
    const warnings: string[] = [];

    beforeAll(() => {
        const record = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
        vi.spyOn(console, 'warn').mockImplementation(record);
        vi.spyOn(console, 'groupCollapsed').mockImplementation(record);

        PIXI = loadPixi(major);
        ports = createLegacyPorts(withParticles(PIXI, particles[0]));
        expect(
            ports.text.registerBitmapFont(FNT, { 'test.png': canvasTexture(PIXI, 128, 64) }),
        ).toBe('TestFont');
    });

    afterAll(() => vi.restoreAllMocks());

    describe('compat', () => {
        it('reads the major and its APIs off the namespace', () => {
            const { compat } = ports;
            expect(compat.version.startsWith(`${major}.`)).toBe(true);
            expect(compat.major).toBe(major);
            expect(compat.events).toBe(major === 7 ? 'federated' : 'interaction');
            expect(compat.imageBitmaps).toBe(major >= 5);
            expect(compat.fontApi).toBe(major >= 5 ? 'install' : 'registerFont');
            expect(compat.layoutRule).toBe(
                { 4: 'pen', 5: 'pen', 6: 'ink', 7: 'ink-rounded' }[major],
            );
            expect(compat.bitmapJustify).toBe(major >= 6);
            expect(compat.particles).toBe(particles[0]);
            expect(compat.BitmapText).toBe(major === 4 ? PIXI.extras.BitmapText : PIXI.BitmapText);
            expect(compat.Transform).toBe(major === 4 ? PIXI.TransformBase : PIXI.Transform);
            expect(ports.containerClass).toBe(PIXI.Container);
        });

        it.skipIf(major === 7)(
            'keeps the interaction manager below 7 whatever else is loaded',
            () => {
                const withEvents = Object.create(PIXI, {
                    FederatedPointerEvent: { value: class {} },
                });
                expect(createLegacyPorts(withEvents).compat.events).toBe('interaction');
            },
        );

        it('turns down a namespace that is not Pixi 4 to 7', () => {
            expect(() =>
                createLegacyPorts(Object.create(PIXI, { VERSION: { value: '8.1.0' } })),
            ).toThrow(/4 to 7, not 8\.1\.0/);
        });

        it('gives points the copyFrom the core uses', () => {
            const view = ports.display.container();
            view.position.copyFrom({ x: 3, y: 4 });
            view.scale.copyFrom({ x: 2, y: 2 });
            expect([view.x, view.y, view.scale.x]).toEqual([3, 4, 2]);
        });
    });

    describe('display', () => {
        it('spells the interactive modes as the major does', () => {
            const view = ports.display.container({ label: 'button', interactive: 'static' });
            const flags = () =>
                major === 7
                    ? [view.eventMode, view.interactiveChildren]
                    : [view.interactive, view.interactiveChildren];

            expect(view.name).toBe('button');
            expect(flags()).toEqual([major === 7 ? 'static' : true, true]);

            ports.display.setInteractive(view, 'none');
            expect(flags()).toEqual([major === 7 ? 'none' : false, false]);
        });

        it('wraps pointer events from a real interaction manager into the contract shape', () => {
            const stage = ports.display.container();
            const button = ports.display.sprite(PIXI.Texture.WHITE);
            button.width = button.height = 100;
            ports.display.setInteractive(button, 'static');
            stage.addChild(button);
            updateTransforms(PIXI, stage);

            const input = pointerInput(PIXI, major, stage);
            const seen: unknown[] = [];
            const listener = (event: PointerEventLike) =>
                seen.push([event.global.x, event.global.y, event.pointerType]);

            ports.display.on(button, 'pointerdown', listener);
            input.click(40, 30);
            input.click(150, 150);
            ports.display.off(button, 'pointerdown', listener);
            input.click(40, 30);

            expect(seen).toEqual([[40, 30, 'mouse']]);
            input.destroy();
        });

        it('hears every move, over something or not, and stops when asked', () => {
            const stage = ports.display.container();
            const root = ports.display.container();
            const button = ports.display.sprite(PIXI.Texture.WHITE);
            button.width = button.height = 50;
            ports.display.setInteractive(button, 'static');
            stage.addChild(root);
            root.addChild(button);
            updateTransforms(PIXI, stage);

            const input = pointerInput(PIXI, major, stage);
            const moves: number[][] = [];
            const stop = ports.display.onGlobalPointerMove(root, (global) =>
                moves.push([global.x, global.y]),
            );

            input.move(20, 20);
            input.move(150, 160);
            stop();
            input.move(170, 170);

            expect(moves).toEqual([
                [20, 20],
                [150, 160],
            ]);
            expect(root.children).toHaveLength(1);
            expect(root.children[0]).toBe(button);
            input.destroy();
        });

        it.skipIf(major === 7)('hears moves through the renderer when it is given one', () => {
            const stage = ports.display.container();
            const input = pointerInput(PIXI, major, stage);
            const withRenderer = createLegacyPorts(PIXI, {
                renderer: { plugins: { interaction: input.manager } },
            });
            const moves: number[] = [];
            const root = withRenderer.display.container();

            const stop = withRenderer.display.onGlobalPointerMove(root, (global) =>
                moves.push(global.x),
            );
            input.move(120, 10);
            stop();
            input.move(130, 10);

            expect(moves).toEqual([120]);
            expect(root.children).toHaveLength(0);
            input.destroy();
        });

        it('shields a BitmapText in front of a button, its glyphs included', () => {
            const stage = ports.display.container();
            const button = ports.display.sprite(PIXI.Texture.WHITE);
            button.width = button.height = 100;
            ports.display.setInteractive(button, 'static');

            const layer = ports.display.container({ interactive: 'static' });
            const node = ports.text.createBitmapText();
            ports.text.applyStyle(node, { fontFamily: 'TestFont', fontSize: 128 });
            node.text = 'CC';
            node.updateText();
            layer.addChild(node);
            stage.addChild(button);
            stage.addChild(layer);

            const input = pointerInput(PIXI, major, stage);
            expect(input.hitTest(20, 30)).not.toBe(button);

            ports.display.shieldFromHitTesting(node);
            expect(input.hitTest(20, 30)).toBe(button);
            expect(node.interactiveChildren).toBe(false);

            ports.display.exposeToHitTesting(node);
            expect(input.hitTest(20, 30)).not.toBe(button);
            expect(node.interactiveChildren).toBe(true);
            input.destroy();
        });

        it('gives a BitmapText shielded twice its glyphs back at one expose', () => {
            const node = ports.text.createBitmapText();

            ports.display.shieldFromHitTesting(node);
            ports.display.shieldFromHitTesting(node);
            ports.display.exposeToHitTesting(node);

            expect(node.interactiveChildren).toBe(true);
        });

        it("hands a spine to its runtime's shields", () => {
            const spine = new PIXI.Container() as LegacySpine;
            const runtime: SpineRuntimeInfo = {
                minor: '3.8',
                family: 'pixi-spine-legacy',
                packageName: 'pixi-spine',
                packageVersion: '1.6.2',
            };
            const shapes: SpineShapes = {
                runtimeOf: (view) => (view === spine ? runtime : undefined),
                shieldShapes: vi.fn(),
                exposeShapes: vi.fn(),
            };
            const withSpine = createLegacyPorts(PIXI, { spine: () => shapes });
            const plain = withSpine.display.container();

            withSpine.display.shieldFromHitTesting(spine);
            withSpine.display.shieldFromHitTesting(plain);
            expect(shapes.shieldShapes).toHaveBeenCalledExactlyOnceWith(spine);
            expect(spine.containsPoint?.({ x: 0, y: 0 })).toBe(false);

            withSpine.display.exposeToHitTesting(spine);
            withSpine.display.exposeToHitTesting(plain);
            expect(shapes.exposeShapes).toHaveBeenCalledExactlyOnceWith(spine);
            expect(Object.hasOwn(spine, 'containsPoint')).toBe(false);
        });

        it('cuts a turned region out of a page in page pixels', () => {
            const page = canvasTexture(PIXI, 64, 64, 2);
            const texture = ports.display.subTexture(
                page,
                { x: 4, y: 8, width: 40, height: 16 },
                90,
            );

            expect([
                texture.frame.x,
                texture.frame.y,
                texture.frame.width,
                texture.frame.height,
            ]).toEqual([2, 4, 20, 8]);
            expect([texture.orig.width, texture.orig.height, texture.rotate]).toEqual([8, 20, 6]);
        });

        it('makes a texture of a canvas, and of an ImageBitmap as the major can load one', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 32;
            expect(ports.display.textureFromImage(canvas).width).toBe(64);

            const close = vi.fn();
            class ImageBitmap {
                width = 64;
                height = 32;
                close = close;
            }
            vi.stubGlobal('ImageBitmap', ImageBitmap);
            vi.stubGlobal('createImageBitmap', () => Promise.resolve(new ImageBitmap()));

            const texture = ports.display.textureFromImage(new ImageBitmap() as never);
            expect([texture.width, texture.height]).toEqual([64, 32]);
            expect(close).toHaveBeenCalledTimes(major === 4 ? 1 : 0);
            vi.unstubAllGlobals();
        });

        it('pins a property against later writes', () => {
            const view = ports.display.container();
            ports.display.pin(view, 'alpha', 0);
            view.alpha = 1;
            expect(view.alpha).toBe(0);
        });
    });

    describe('text', () => {
        it('maps a texts.json entry onto a TextStyle, v8 stroke and drop shadow flattened', () => {
            const text = ports.text.createText();

            ports.text.applyEntry(text, {
                type: 'text',
                value: 'ignored',
                fill: '#ff0000',
                fontFamily: 'Arial',
                fontSize: 30,
                align: 'justify',
                stroke: { color: '#000000', width: 4 },
                dropShadow: { color: '#111111', alpha: 0.5, blur: 2, angle: 1, distance: 6 },
            });

            expect(ports.text.getStyle(text)).toMatchObject({
                fill: '#ff0000',
                fontFamily: 'Arial',
                fontSize: 30,
                align: 'left',
                stroke: '#000000',
                strokeThickness: 4,
                dropShadow: true,
                dropShadowColor: '#111111',
                dropShadowAlpha: 0.5,
                dropShadowBlur: 2,
                dropShadowAngle: 1,
                dropShadowDistance: 6,
            });

            ports.text.mergeStyle(text, { fontSize: 12 });
            ports.text.setWordWrapWidth(text, 120);
            expect(ports.text.getStyle(text)).toMatchObject({
                fontSize: 12,
                fill: '#ff0000',
                wordWrap: true,
                wordWrapWidth: 120,
            });
        });

        it('justifies BitmapText where the major lays it out, and canvas Text nowhere', () => {
            const node = ports.text.createBitmapText();
            ports.text.applyStyle(node, { fontFamily: 'TestFont', align: 'justify' });

            expect(node.align).toBe(major >= 6 ? 'justify' : 'left');
            expect(ports.text.capabilities).toEqual({
                justify: false,
                maxHeight: true,
                byNode: {
                    text: { justify: false, maxHeight: true },
                    bitmapText: { justify: major >= 6, maxHeight: true },
                },
            });
        });

        describe('bitmap', () => {
            function bitmap(value: string, style: Record<string, unknown> = {}) {
                const node = ports.text.createBitmapText();
                ports.text.applyStyle(node, { fontFamily: 'TestFont', fontSize: 64, ...style });
                node.text = value;
                return node;
            }

            /** The mirror's glyphs for a node PIXI has just laid out with `style`, in the units it drew them in. */
            function mirroredGlyphs(
                node: LegacyBitmapText,
                style: Record<string, unknown>,
            ): Glyph[] {
                const { lineHeight } = style;
                const font = ports.compat.fonts[ports.compat.fontName(node)!]!;
                const size = ports.compat.fontSize(node);
                const layout = layoutBitmapText(
                    node,
                    font,
                    typeof lineHeight === 'number'
                        ? (lineHeight * font.size) / size
                        : font.lineHeight,
                    node._letterSpacing,
                    {
                        size,
                        align: node.align,
                        rule: ports.compat.layoutRule,
                        roundPixels: node._roundPixels === true,
                    },
                );
                return inked(
                    layout.glyphs.map(({ char, x, y }) => ({
                        x,
                        y,
                        width: char.texture.frame.width * layout.scale,
                        height: char.texture.frame.height * layout.scale,
                    })),
                );
            }

            it('registers an AngelCode text .fnt in the major registry', () => {
                expect(ports.text.hasBitmapFont('TestFont')).toBe(true);
                expect(ports.text.hasBitmapFont('Missing')).toBe(false);
                expect(ports.text.hasBitmapFont(NO_FONT)).toBe(false);

                const registry =
                    major >= 5 ? PIXI.BitmapFont.available : PIXI.extras.BitmapText.fonts;
                expect(registry.TestFont.chars[66].kerning[65]).toBe(-3);
            });

            it('reads an XML .fnt too', () => {
                const xml = `<?xml version="1.0"?><font><info face="XmlFont" size="32"/><common lineHeight="40" base="30" scaleW="32" scaleH="32" pages="1"/><pages><page id="0" file="x.png"/></pages><chars count="1"><char id="65" x="0" y="0" width="20" height="30" xoffset="1" yoffset="2" xadvance="22" page="0" chnl="15"/></chars></font>`;

                expect(
                    ports.text.registerBitmapFont(xml, { 'x.png': canvasTexture(PIXI, 32, 32) }),
                ).toBe('XmlFont');
                expect(ports.text.hasBitmapFont('XmlFont')).toBe(true);
                expect(ports.compat.fonts.XmlFont?.chars[65].xAdvance).toBe(22);
            });

            it('measures glyph ink with kerning and the font scale', () => {
                const node = bitmap('AB');

                expect(ports.text.measureBitmap(node)).toEqual({
                    height: 60,
                    centre: { x: 38, y: 34 },
                });
                expect(ports.text.bitmapLineHeight(node)).toBe(60);
                expect(ports.text.bitmapLineCount(node)).toBe(1);
            });

            it.each([
                ['left', 'ABCA', { align: 'left' }, [0, 0]],
                ['centred over two lines', 'AB C\nCA', { align: 'center' }, [0.5, 0.5]],
                [
                    'right with letter spacing',
                    'CAB\nB',
                    { align: 'right', letterSpacing: 3 },
                    [0.5, 1],
                ],
                [
                    'wrapped',
                    'AB AB CC A',
                    { align: 'center', wordWrap: true, wordWrapWidth: 120 },
                    [0.5, 0.5],
                ],
                ['a trailing space', 'AB \nC', { align: 'center' }, [0.5, 0]],
                [
                    'justified',
                    'A B C AB CA',
                    { align: 'justify', wordWrap: true, wordWrapWidth: 150 },
                    [0, 0],
                ],
                [
                    'justified, a wrapped line of one word among them',
                    'ABCAB A B C AB',
                    { align: 'justify', wordWrap: true, wordWrapWidth: 200 },
                    [0.5, 0.5],
                ],
                [
                    'a per-node line height',
                    'AB\nBA',
                    { align: 'left', lineHeight: 100 },
                    [0.5, 0.5],
                ],
            ])(
                'lays out and measures glyph by glyph where PIXI draws them, %s',
                (_, value, style, [x, y]) => {
                    const node = bitmap(value, style);
                    node.anchor.set(x, y);
                    node.updateText();
                    const drawn = drawnGlyphs(node);

                    expect(finite(drawn)).toBe(true);
                    expect(mirroredGlyphs(node, style)).toEqual(drawn);
                    expect(rounded(ports.text.measureBitmap(node))).toEqual(boxOf(drawn));
                },
            );

            it('justifies on 6+ as Pixi 8 does: spaces widened, a line without one left as it is', () => {
                const value = 'ABCAB A B C AB';
                const wrap = { wordWrap: true, wordWrapWidth: 200 };
                const left = bitmap(value, { align: 'left', ...wrap });
                const justified = bitmap(value, { align: 'justify', ...wrap });
                left.validate();
                justified.validate();

                const leftGlyphs = drawnGlyphs(left);
                const drawn = drawnGlyphs(justified);
                const moved = drawn.flatMap((glyph, i) => (glyph.x === leftGlyphs[i].x ? [] : [i]));

                expect(ports.text.bitmapLineCount(justified)).toBe(3);
                expect(finite(drawn)).toBe(true);
                expect(moved).toEqual(major >= 6 ? [6, 7] : []);
                expect(justified.dirty).toBe(false);
            });

            it('hands the core no ink box it cannot place', () => {
                expect(
                    ports.text.measureBitmap(bitmap('AB', { letterSpacing: NaN })),
                ).toBeUndefined();
            });

            it.skipIf(major === 4)('measures with rounded pixels as 5.3+ draws them', () => {
                const node = bitmap('AB', { fontSize: 50, letterSpacing: 1.3 });
                (node as LegacyBitmapText)._roundPixels = true;
                const drawn = drawnInk(node);
                expect(rounded(ports.text.measureBitmap(node))).toEqual(drawn);

                (node as LegacyBitmapText)._roundPixels = false;
                const unrounded = drawnInk(node);
                expect(rounded(ports.text.measureBitmap(node))).toEqual(unrounded);
                expect(JSON.stringify(unrounded) === JSON.stringify(drawn)).toBe(major === 7);
            });

            it('counts the lines a wrap makes, and spaces them by a per-node line height', () => {
                expect(
                    ports.text.bitmapLineCount(
                        bitmap('AB AB AB', { wordWrap: true, wordWrapWidth: 200 }),
                    ),
                ).toBe(2);
                expect(drawnInk(bitmap('A\nA', { lineHeight: 100 }))?.height).toBe(100 + 60);
            });

            it('waits on the placeholder font for a family that loads later', () => {
                const node = ports.text.createBitmapText();
                ports.text.applyStyle(node, { fontFamily: 'Late', fontSize: 64 });
                node.text = 'AB';

                expect(() => node.updateText()).not.toThrow();
                expect(ports.text.measureBitmap(node)).toBeUndefined();
                expect(ports.text.bitmapLineCount(node)).toBe(0);
                expect(ports.text.getStyle(node).fontFamily).toBe('Late');
                expect(ports.compat.fontName(node)).toBe(NO_FONT);

                ports.text.registerBitmapFont(fontNamed('Late'), {
                    'test.png': canvasTexture(PIXI, 128, 64),
                });

                expect(ports.compat.fontName(node)).toBe('Late');
                expect(node.dirty).toBe(true);
                expect(rounded(ports.text.measureBitmap(node))).toEqual(drawnInk(node));
                expect(ports.text.measureBitmap(node)?.height).toBe(60);
            });

            it("picks up a family the game's own loader installs at the next layout", () => {
                const node = ports.text.createBitmapText();
                ports.text.applyStyle(node, { fontFamily: 'GameLoaded', fontSize: 64 });
                node.text = 'AB';
                node.updateText();

                ports.compat.installFont(fontNamed('GameLoaded'), {
                    'test.png': canvasTexture(PIXI, 128, 64),
                });
                node.text = 'BA';

                expect(drawnInk(node)?.height).toBe(60);
                expect(ports.compat.fontName(node)).toBe('GameLoaded');
            });

            it('lays a node out again once its family is registered anew', () => {
                const pages = { 'test.png': canvasTexture(PIXI, 128, 64) };
                ports.text.registerBitmapFont(fontNamed('Reloaded'), pages);
                const node = bitmap('A\nA', { fontFamily: 'Reloaded' });
                node.validate();

                ports.text.registerBitmapFont(
                    fontNamed('Reloaded').replace('lineHeight=40', 'lineHeight=80'),
                    pages,
                );
                node.validate();

                expect(ports.text.measureBitmap(node)?.height).toBe(220);
                expect(boxOf(drawnGlyphs(node))).toEqual(rounded(ports.text.measureBitmap(node)));
            });

            it('lets go of a waiting node once it is destroyed', () => {
                const node = ports.text.createBitmapText();
                ports.text.applyStyle(node, { fontFamily: 'Gone', fontSize: 20 });
                node.destroy();

                ports.text.registerBitmapFont(fontNamed('Gone'), {
                    'test.png': canvasTexture(PIXI, 128, 64),
                });
                expect(ports.compat.fontName(node)).toBe(NO_FONT);
            });

            it("spaces letters by letterSpacing in the node's pixels, drawn and measured alike", () => {
                const spaced = bitmap('BB', { fontSize: 16, letterSpacing: 4 });
                const tight = bitmap('BB', { fontSize: 16 });

                expect(drawnInk(spaced)!.centre.x - drawnInk(tight)!.centre.x).toBeCloseTo(4);
                expect(ports.text.getStyle(spaced).letterSpacing).toBe(4);
                expect(rounded(ports.text.measureBitmap(spaced))).toEqual(drawnInk(spaced));
            });
        });
    });

    describe('assets', () => {
        it('reads the shared loader, or v7 Assets, then the texture cache and the registry', () => {
            const page = canvasTexture(PIXI, 8, 8);
            const json = { skeleton: { spine: '3.8.99' } };
            const spineData = { bones: [] };

            if (major === 7) {
                PIXI.Assets.cache.set('art/page.png', page);
                PIXI.Assets.cache.set('hero.json', json);
            } else {
                const { resources } = major === 4 ? PIXI.loader : PIXI.Loader.shared;
                resources['art/page.png'] = { url: 'art/page.png', texture: page };
                resources.hero = { url: 'art/hero.json', data: json, spineData };
                expect(ports.assets.resource('hero.json')?.spineData).toBe(spineData);
            }

            expect(ports.assets.has('hero.json')).toBe(true);
            expect(ports.assets.get('hero.json')).toBe(json);
            expect(ports.assets.has('art/page.png')).toBe(true);
            expect(ports.assets.get('art/page.png')).toBe(page);
            expect(ports.assets.pageTexture('page.png', 'art/hero.atlas')).toBe(page);
            expect(ports.assets.has('missing.png')).toBe(false);
            expect(ports.assets.get('missing.png')).toBeUndefined();

            const frame = canvasTexture(PIXI, 4, 4);
            PIXI.utils.TextureCache['spark.png'] = frame;
            expect(ports.assets.get('spark.png')).toBe(frame);
            expect(ports.assets.pageTexture('spark.png')).toBe(frame);
            delete PIXI.utils.TextureCache['spark.png'];
            expect(ports.assets.has('spark.png')).toBe(false);

            ports.assets.set('settings/texts.json', { a: 1 });
            expect(ports.assets.get('settings/texts.json')).toEqual({ a: 1 });
            ports.assets.delete('settings/texts.json');
            expect(ports.assets.has('settings/texts.json')).toBe(false);
        });

        it('reads the loaders it is handed besides the shared one, by file name as well', () => {
            const texture = canvasTexture(PIXI, 8, 8);
            const appLoader = { resources: { 'ui-page': { url: 'ui/ui-page.png', texture } } };
            const withLoader = createLegacyPorts(PIXI, { loaders: [appLoader] });

            expect(withLoader.assets.has('ui-page')).toBe(true);
            expect(withLoader.assets.resource('ui-page')?.texture).toBe(texture);
            expect(withLoader.assets.pageTexture('ui-page.png')).toBe(texture);
            expect(ports.assets.has('ui-page')).toBe(false);
        });
    });

    describe('particles', () => {
        it.each(particles)('bursts one wave of a looping %s config, driven by hand', (library) => {
            const port = createLegacyPorts(withParticles(PIXI, library)).particles!;
            const parent = new PIXI.Container();
            const emitter = port.createEmitter(parent, [PIXI.Texture.WHITE], LOOPING_PARTICLES);

            expect((emitter as unknown as { autoUpdate: boolean }).autoUpdate).toBe(false);
            emitter.emit = false;
            emitter.update(0.2);
            expect(parent.children).toHaveLength(0);

            emitter.playOnce();
            const counts = [0, 1, 2, 3].map(() => {
                emitter.update(0.05);
                return parent.children.length;
            });

            expect(counts).toEqual([5, 5, 5, 5]);
            expect(emitter.emit).toBe(false);
            emitter.destroy();
        });

        it('is absent without a particles library', () => {
            expect(createLegacyPorts(PIXI).particles).toBeUndefined();
        });
    });

    it('raises no deprecation warning from PIXI', () => {
        expect(warnings).toEqual([]);
    });
}
