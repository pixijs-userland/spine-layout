// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../../fixtures/contract-3.8.json';
import { createPixi4Engine, type Pixi4Engine } from '../../../src/engines/pixi4';
import type { Pixi4Container, Pixi4Texture } from '../../../src/engines/pixi4/pixi4.types';
import { canvasTexture, loadPixi4, updateTransforms, type LoadedPixi4 } from './loadPixi4';

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
square_turned
  rotate: true
  xy: 2, 24
  size: 40, 20
  orig: 40, 20
  offset: 0, 0
  index: -1
`;

const FNT = `info face="TestFont" size=32 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1
common lineHeight=40 base=30 scaleW=128 scaleH=128 pages=1 packed=0
page id=0 file="test.png"
chars count=3
char id=65 x=0 y=0 width=20 height=30 xoffset=1 yoffset=2 xadvance=22 page=0 chnl=15
char id=66 x=20 y=0 width=18 height=28 xoffset=0 yoffset=4 xadvance=20 page=0 chnl=15
char id=32 x=40 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=10 page=0 chnl=15
kernings count=1
kerning first=65 second=66 amount=-3
`;

let PIXI: LoadedPixi4;
let engine: Pixi4Engine;
let page: Pixi4Texture;

const skeleton = () => structuredClone(fixture);

function spineOf() {
    const data = engine.spine.readSkeleton(skeleton(), ATLAS, { 'contract.png': page });
    const spine = engine.spine.create(data);
    spine.autoUpdate = false;
    return spine;
}

beforeAll(() => {
    PIXI = loadPixi4();
    engine = createPixi4Engine(PIXI);
    page = canvasTexture(PIXI, 64, 64);
});

describe('readSkeleton', () => {
    it('reads a 3.8 JSON export against a one-page atlas', () => {
        const data = engine.spine.readSkeleton(skeleton(), ATLAS, { 'contract.png': page });

        expect(data.bones.map((bone) => bone.name)).toEqual(['root', 'bone_a']);
        expect(data.slots.map((slot) => slot.name)).toEqual(['slot_a', 'slot_b']);
        expect(data.findAnimation('move')?.duration).toBe(1);
        expect(data.events.map((event) => event.name)).toEqual(['hit']);
    });

    it('reads a skeleton with no images against empty atlas text', () => {
        const bare = skeleton() as Record<string, unknown>;
        delete bare.skins;
        (bare.slots as Record<string, unknown>[]).forEach((slot) => delete slot.attachment);
        delete (bare.animations as Record<string, Record<string, unknown>>).move.slots;

        const data = engine.spine.readSkeleton(bare, '', {});

        expect(data.bones).toHaveLength(2);
        expect(engine.spine.create(data).skeleton.slots).toHaveLength(2);
    });

    it('names the page it has no texture for', () => {
        expect(() => engine.spine.readSkeleton(skeleton(), ATLAS, {})).toThrow('contract.png');
    });

    it('reads from PIXI.loader resources, or from the registry', () => {
        engine.assets.set('contract.json', skeleton());
        engine.assets.set('contract.atlas', ATLAS);
        engine.assets.set('contract.png', page);

        const data = engine.spine.readSkeletonFromAssets('contract.json', 'contract.atlas');
        expect(data.findSlot('slot_b')).toBeTruthy();

        PIXI.loader!.resources.ready = { spineData: data } as never;
        expect(engine.spine.readSkeletonFromAssets('ready')).toBe(data);
        delete PIXI.loader!.resources.ready;
    });

    it('answers a skeleton added under a bare name by the extension the manifest lists it with', () => {
        const data = engine.spine.readSkeleton(skeleton(), ATLAS, { 'contract.png': page });
        PIXI.loader!.resources.hero = { url: 'assets/hero.json', spineData: data } as never;
        PIXI.loader!.resources.plain = { url: 'assets/plain.json', data: {} } as never;

        expect(engine.spine.readSkeletonFromAssets('hero.json', 'hero.atlas')).toBe(data);
        expect(engine.spine.readSkeletonFromAssets('hero.skel')).toBe(data);
        expect(engine.assets.has('plain.json')).toBe(false);

        delete PIXI.loader!.resources.hero;
        delete PIXI.loader!.resources.plain;
    });
});

describe('claimOf', () => {
    it('sorts the timelines by what they pose', () => {
        const spine = spineOf();
        const claims = engine.spine.claimOf(spine.skeleton.data.findAnimation('move')!);
        const kinds = claims.map((claim) =>
            'index' in claim ? `${claim.kind}:${claim.index}` : claim.kind,
        );

        expect(kinds.sort()).toEqual(['bone:1', 'drawOrder', 'event', 'slot:1']);
        claims.forEach((claim) => {
            if (claim.kind !== 'event') expect(claim.id).toMatch(/^\d+$/);
        });
    });

    it('lets two-color compete with color, and keeps deform ids apart by slot and attachment', () => {
        const { core } = PIXI.spine;
        const slotTimeline = <T extends object>(timeline: T, slotIndex: number, extra = {}) =>
            Object.assign(timeline, { slotIndex, ...extra });
        const ids = (...timelines: object[]) =>
            engine.spine
                .claimOf(new core.Animation('probe', timelines, 1))
                .map((claim) => ('id' in claim ? claim.id : claim.kind));

        const color = ids(slotTimeline(new core.ColorTimeline(1), 1));
        const twoColor = ids(slotTimeline(new core.TwoColorTimeline(1), 1));
        expect(twoColor).toEqual(expect.arrayContaining(color));
        expect(twoColor).toHaveLength(2);

        const deformA = ids(slotTimeline(new core.DeformTimeline(1), 0, { attachment: { id: 2 } }));
        const deformB = ids(slotTimeline(new core.DeformTimeline(1), 1, { attachment: { id: 1 } }));
        expect(deformA).toEqual(['deform|0|2']);
        expect(deformB).toEqual(['deform|1|1']);
    });
});

describe('poses', () => {
    it('resets each scope; slots take the draw order with them, as in 4.3', () => {
        const spine = spineOf();
        const { skeleton: target } = spine;
        const [slotA, slotB] = target.slots;

        spine.state.setAnimation(0, 'move', false);
        engine.spine.update(spine, 0.75);

        expect(engine.spine.drawOrder(target).map((slot) => slot.data.name)).toEqual([
            'slot_b',
            'slot_a',
        ]);
        expect(engine.spine.slotAttachment(slotB)).toBeNull();
        expect(engine.spine.bonePose(target.bones[1]).x).toBeCloseTo(10 + 22.5);

        engine.spine.setupPose(target, 'drawOrder');
        expect(engine.spine.drawOrder(target)).toEqual([slotA, slotB]);
        expect(engine.spine.slotAttachment(slotB)).toBeNull();

        target.drawOrder.reverse();
        engine.spine.setupPose(target, 'slots');
        expect(engine.spine.drawOrder(target)).toEqual([slotA, slotB]);
        expect(engine.spine.slotAttachment(slotB)).not.toBeNull();
        expect(engine.spine.bonePose(target.bones[1]).x).toBeCloseTo(32.5);

        engine.spine.setupPose(target, 'bones');
        expect(engine.spine.bonePose(target.bones[1]).x).toBe(10);
        expect(engine.spine.boneSetup(target.bones[1])).toMatchObject({ x: 10, y: 20 });
    });

    it('converts skeleton space into a bone parent space', () => {
        const spine = spineOf();
        const bone = spine.skeleton.findBone('bone_a')!;
        engine.spine.updateWorldTransform(spine.skeleton);

        const pose = engine.spine.bonePose(bone);
        expect(pose.worldX).toBeCloseTo(10);
        expect(pose.worldY).toBeCloseTo(-20);

        pose.x = 15;
        engine.spine.updateWorldTransform(spine.skeleton);
        expect(pose.worldX).toBeCloseTo(15);
        const local = pose.worldToParent({ x: 15, y: -20 }, spine.skeleton);
        expect(local.x).toBeCloseTo(15);
        expect(local.y).toBeCloseTo(20);
    });

    it('runs a hook after the animations apply and before world transforms', () => {
        const spine = spineOf();
        const bone = spine.skeleton.findBone('bone_a')!;
        spine.state.setAnimation(0, 'move', false);

        const restore = engine.spine.beforeWorldTransforms(spine, () => {
            engine.spine.bonePose(bone).y = 0;
        });
        engine.spine.update(spine, 0.5);
        expect(engine.spine.bonePose(bone).worldY).toBeCloseTo(0);

        restore();
        engine.spine.update(spine, 0.1);
        expect(engine.spine.bonePose(bone).worldY).toBeCloseTo(-20);
    });
});

describe('attachments', () => {
    it('outlines a region as the four corners an object on its slot sees', () => {
        const spine = spineOf();
        const slot = spine.skeleton.findSlot('slot_a')!;
        const warn = vi.spyOn(console, 'warn');

        expect(engine.spine.hitPolygon(slot, engine.spine.slotAttachment(slot))).toEqual([
            -20, 10, -20, -10, 20, -10, 20, 10,
        ]);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();

        const atlas = new PIXI.spine.core.TextureAtlas(
            ATLAS,
            (_path: string, load: (base: unknown) => void) => load(page.baseTexture),
        );
        const loader = new PIXI.spine.core.AtlasAttachmentLoader(atlas);
        const turned = loader.newRegionAttachment(
            new PIXI.spine.core.Skin('t'),
            'square',
            'square',
        );
        Object.assign(turned, {
            x: 3,
            y: -4,
            rotation: 30,
            scaleX: 2,
            scaleY: 0.5,
            width: 40,
            height: 20,
        });

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        turned.updateOffset();
        vi.restoreAllMocks();
        const own = Array.from(turned.offset as ArrayLike<number>);

        engine.spine.hitPolygon(slot, turned)!.forEach((value, i) => {
            expect(value).toBeCloseTo(i % 2 ? -own[i] : own[i]);
        });
        expect(engine.spine.hitPolygon(slot, null)).toBeUndefined();
    });

    it('finds a region on its page, and cuts the same texture back out', () => {
        const atlas = new PIXI.spine.core.TextureAtlas(
            ATLAS,
            (_path: string, load: (base: unknown) => void) => load(page.baseTexture),
        );
        const loader = new PIXI.spine.core.AtlasAttachmentLoader(atlas);
        const skin = new PIXI.spine.core.Skin('test');

        const straight = loader.newRegionAttachment(skin, 'square', 'square');
        expect(engine.spine.regionTexture(straight)).toMatchObject({
            x: 2,
            y: 2,
            width: 40,
            height: 20,
            rotate: 0,
            resolution: 1,
        });

        const turned = loader.newRegionAttachment(skin, 'square_turned', 'square_turned');
        const info = engine.spine.regionTexture(turned)!;
        expect(info).toMatchObject({ x: 2, y: 24, width: 40, height: 20, rotate: 90 });
        expect(info.page.baseTexture).toBe(page.baseTexture);

        const cut = engine.display.subTexture(
            info.page,
            { x: info.x, y: info.y, width: info.height, height: info.width },
            info.rotate,
        );
        const own = turned.region.texture as Pixi4Texture;
        expect(cut.rotate).toBe(own.rotate);
        expect([cut.frame.x, cut.frame.y, cut.frame.width, cut.frame.height]).toEqual([
            own.frame.x,
            own.frame.y,
            own.frame.width,
            own.frame.height,
        ]);
        expect([cut.orig.width, cut.orig.height]).toEqual([own.orig.width, own.orig.height]);
    });

    it('cuts frames in page pixels off a scaled page', () => {
        const half = canvasTexture(PIXI, 64, 64, 0.5);
        const cut = engine.display.subTexture(half, { x: 2, y: 2, width: 40, height: 20 }, 0);

        expect([cut.frame.x, cut.frame.width]).toEqual([4, 80]);
    });
});

describe('slot objects', () => {
    it('follows the bone upright, the slot alpha, and stays put while the slot is empty', () => {
        const spine = spineOf();
        const child = engine.display.container({ label: 'child' });
        const stage = new PIXI.Container();
        stage.addChild(spine);

        engine.spine.attachSlotObject(spine, 'slot_b', child);
        expect(engine.spine.getSlotObject(spine, 'slot_b')).toBe(child);

        engine.spine.update(spine, 0);
        updateTransforms(PIXI, stage);
        const origin = child.toGlobal(new PIXI.Point(0, 0));
        expect(origin.x).toBeCloseTo(10);
        expect(origin.y).toBeCloseTo(-20);
        expect(child.toGlobal(new PIXI.Point(0, 5)).y).toBeCloseTo(-15);

        spine.skeleton.slots[1].color.a = 0.5;
        engine.spine.update(spine, 0);
        updateTransforms(PIXI, stage);
        expect(child.alpha).toBe(0.5);
        expect((child as unknown as { worldAlpha: number }).worldAlpha).toBeCloseTo(0.5);

        spine.skeleton.slots[1].color.a = 1;
        spine.state.setAnimation(0, 'move', false);
        engine.spine.update(spine, 1);
        updateTransforms(PIXI, stage);

        const slotSprite = spine.slotContainers[1].children.find((view) => view !== child.parent)!;
        expect(engine.spine.slotAttachment(spine.skeleton.slots[1])).toBeNull();
        expect(child.visible).toBe(true);
        expect(slotSprite.visible).toBe(false);
        expect(child.toGlobal(new PIXI.Point(0, 0)).x).toBeCloseTo(40);

        spine.skeleton.slots[1].color.a = 0;
        engine.spine.update(spine, 0);
        expect(child.visible).toBe(false);

        spine.state.clearTracks();
        engine.spine.setupPose(spine.skeleton, 'all');
        engine.spine.update(spine, 0);
        expect(slotSprite.visible).toBe(true);
        expect(child.visible).toBe(true);
    });

    it('shows again once a slot that faded out empties', () => {
        const spine = spineOf();
        const child = engine.display.container();
        const stage = new PIXI.Container();
        stage.addChild(spine);
        const slot = spine.skeleton.slots[1];

        engine.spine.attachSlotObject(spine, 'slot_b', child);
        slot.color.a = 0;
        engine.spine.update(spine, 0);

        slot.attachment = null;
        slot.color.a = 1;
        engine.spine.update(spine, 0);
        updateTransforms(PIXI, stage);

        expect((child as unknown as { worldAlpha: number }).worldAlpha).toBe(1);
    });

    it('hangs off the slot container, so pixi-spine orders it by draw order', () => {
        const spine = spineOf();
        const child = engine.display.container();

        engine.spine.attachSlotObject(spine, 'slot_a', child);
        spine.state.setAnimation(0, 'move', false);
        engine.spine.update(spine, 0.75);

        const order = spine.children.indexOf(spine.slotContainers[0]);
        expect(order).toBe(1);
        expect(child.parent?.parent).toBe(spine.slotContainers[0]);
    });

    it('detaches by slot name or by child, and moves a child to its new slot', () => {
        const spine = spineOf();
        const child = engine.display.container();

        engine.spine.attachSlotObject(spine, 'slot_a', child);
        engine.spine.attachSlotObject(spine, 'slot_b', child);
        expect(engine.spine.getSlotObject(spine, 'slot_a')).toBeUndefined();
        expect(engine.spine.getSlotObject(spine, 'slot_b')).toBe(child);

        engine.spine.detachSlotObject(spine, child);
        expect(child.parent).toBeNull();
        expect(engine.spine.getSlotObject(spine, 'slot_b')).toBeUndefined();

        engine.spine.attachSlotObject(spine, 'slot_a', child);
        engine.spine.detachSlotObject(spine, 'slot_a');
        expect(child.parent).toBeNull();

        expect(() => engine.spine.attachSlotObject(spine, 'nope', child)).toThrow('nope');
    });
});

describe('hit-testing', () => {
    function interactionManager() {
        const view = document.createElement('canvas');
        return new PIXI.interaction.InteractionManager({ view, resolution: 1 });
    }

    it('keeps a skeleton in front of a button from answering for it, sprites made later too', () => {
        const manager = interactionManager();
        const stage = new PIXI.Container();
        const button = new PIXI.Sprite(PIXI.Texture.WHITE);
        button.width = button.height = 200;
        button.position.set(-100, -100);
        button.interactive = true;

        const layer = new PIXI.Container();
        layer.interactive = true;
        const spine = spineOf();
        layer.addChild(spine);
        stage.addChild(button, layer);

        engine.spine.update(spine, 0);
        updateTransforms(PIXI, stage);
        expect(manager.hitTest(new PIXI.Point(0, 0), stage)).toBe(layer);

        engine.display.shieldFromHitTesting(spine);
        expect(manager.hitTest(new PIXI.Point(0, 0), stage)).toBe(button);

        const fresh = spine.newSprite(PIXI.Texture.WHITE) as Pixi4Container;
        expect(fresh.containsPoint?.(new PIXI.Point(0, 0))).toBe(false);

        engine.display.exposeToHitTesting(spine);
        expect(Object.hasOwn(spine, 'newSprite')).toBe(false);
        expect(manager.hitTest(new PIXI.Point(0, 0), stage)).toBe(layer);

        manager.destroy();
    });

    it('leaves slot objects hittable on a shielded skeleton', () => {
        const manager = interactionManager();
        const spine = spineOf();
        const button = new PIXI.Sprite(PIXI.Texture.WHITE);
        button.interactive = true;
        button.anchor.set(0.5);
        button.width = button.height = 4;

        engine.spine.attachSlotObject(spine, 'slot_a', button);
        engine.display.shieldFromHitTesting(spine);
        engine.spine.update(spine, 0);
        updateTransforms(PIXI, spine);

        expect(manager.hitTest(new PIXI.Point(0, 0), spine)).toBe(button);
        manager.destroy();
    });

    it('reports every move through the renderer, or through an empty interactive child', () => {
        const interaction = new PIXI.utils.EventEmitter();
        const withRenderer = createPixi4Engine(PIXI, { renderer: { plugins: { interaction } } });
        const moves: number[] = [];

        const stop = withRenderer.display.onGlobalPointerMove(new PIXI.Container(), (global) =>
            moves.push(global.x),
        );
        interaction.emit('pointermove', { data: { global: { x: 7, y: 0 } } });
        stop();
        interaction.emit('pointermove', { data: { global: { x: 8, y: 0 } } });
        expect(moves).toEqual([7]);

        const manager = interactionManager();
        const root = new PIXI.Container();
        const stopRoot = engine.display.onGlobalPointerMove(root, (global) => moves.push(global.x));
        const event = new PIXI.interaction.InteractionEvent();
        event.data = new PIXI.interaction.InteractionData();
        event.data.global.set(500, 500);
        updateTransforms(PIXI, root);

        manager.processInteractive(event, root, manager.processPointerMove, true);
        expect(moves).toEqual([7, 500]);
        expect(root.interactive).toBe(false);

        stopRoot();
        expect(root.children).toHaveLength(0);
        manager.destroy();
    });

    it('wraps pointer events into the contract shape and unsubscribes them', () => {
        const view = engine.display.container({ interactive: 'static' });
        const seen: unknown[] = [];
        const listener = (event: unknown) => seen.push(event);

        engine.display.on(view, 'pointerdown', listener);
        view.emit('pointerdown', { data: { global: { x: 1, y: 2 }, pointerType: 'mouse' } });
        engine.display.off(view, 'pointerdown', listener);
        view.emit('pointerdown', { data: { global: { x: 3, y: 4 } } });

        expect(seen).toEqual([{ global: { x: 1, y: 2 }, pointerType: 'mouse' }]);
        expect([view.interactive, view.interactiveChildren]).toEqual([true, true]);
    });

    it('pins a property against later writes', () => {
        const view = engine.display.container();
        engine.display.pin(view, 'alpha', 0);
        view.alpha = 1;
        expect(view.alpha).toBe(0);
    });
});

describe('text', () => {
    it('maps a texts.json entry onto a v4 TextStyle', () => {
        const text = engine.text.createText();

        engine.text.applyEntry(text, {
            type: 'text',
            value: 'ignored',
            fill: '#ff0000',
            fontFamily: 'Arial',
            fontSize: 30,
            align: 'justify',
            stroke: { color: '#000000', width: 4 },
            dropShadow: { color: '#111111', alpha: 0.5, blur: 2, angle: 1, distance: 6 },
        });

        expect(engine.text.getStyle(text)).toMatchObject({
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

        engine.text.mergeStyle(text, { fontSize: 12 });
        expect(engine.text.getStyle(text)).toMatchObject({ fontSize: 12, fill: '#ff0000' });

        engine.text.setWordWrapWidth(text, 120);
        expect(engine.text.getStyle(text)).toMatchObject({ wordWrap: true, wordWrapWidth: 120 });
    });

    it("leaves v4's defaults for the fields a stroke or drop shadow leaves out", () => {
        const text = engine.text.createText();
        const defaults = new PIXI.TextStyle();

        engine.text.applyEntry(text, {
            type: 'text',
            stroke: { color: '#000000' },
            dropShadow: { color: '#111111' },
        });

        expect(engine.text.getStyle(text)).toMatchObject({
            stroke: '#000000',
            strokeThickness: defaults.strokeThickness,
            dropShadow: true,
            dropShadowColor: '#111111',
            dropShadowAlpha: defaults.dropShadowAlpha,
            dropShadowAngle: defaults.dropShadowAngle,
            dropShadowBlur: defaults.dropShadowBlur,
            dropShadowDistance: defaults.dropShadowDistance,
        });
    });

    describe('bitmap', () => {
        beforeAll(() => {
            expect(
                engine.text.registerBitmapFont(FNT, { 'test.png': canvasTexture(PIXI, 128, 128) }),
            ).toBe('TestFont');
        });

        function bitmap(value: string, style: Record<string, unknown> = {}) {
            const node = engine.text.createBitmapText();
            engine.text.applyStyle(node, { fontFamily: 'TestFont', fontSize: 64, ...style });
            node.text = value;
            return node;
        }

        /** The box the glyph sprites v4 actually laid out cover. */
        function spriteBox(node: ReturnType<typeof bitmap>) {
            node.updateText();
            const glyphs = node.children.filter(
                (glyph) => (glyph as Pixi4Container & { width: number }).width > 0,
            ) as (Pixi4Container & {
                width: number;
                height: number;
            })[];
            const top = Math.min(...glyphs.map((glyph) => glyph.y));
            const bottom = Math.max(...glyphs.map((glyph) => glyph.y + glyph.height));
            const left = Math.min(...glyphs.map((glyph) => glyph.x));
            const right = Math.max(...glyphs.map((glyph) => glyph.x + glyph.width));
            return {
                height: bottom - top,
                centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
            };
        }

        it('registers an AngelCode text .fnt', () => {
            expect(engine.text.hasBitmapFont('TestFont')).toBe(true);
            expect(engine.text.hasBitmapFont('Missing')).toBe(false);
            expect(PIXI.extras.BitmapText.fonts.TestFont?.chars[66].kerning[65]).toBe(-3);
        });

        it('measures glyph ink with kerning and the font scale', () => {
            const node = bitmap('AB');

            expect(engine.text.measureBitmap(node)).toEqual({
                height: 60,
                centre: { x: 38, y: 34 },
            });
            expect(engine.text.bitmapLineHeight(node)).toBe(60);
            expect(engine.text.bitmapLineCount(node)).toBe(1);
        });

        it.each([
            ['an anchor', 'AB', {}, 0.5],
            ['lines aligned to the centre', 'AB\nA', { align: 'center' }, 0],
            ['a wrap', 'AB AB AB', { wordWrap: true, wordWrapWidth: 200 }, 0.5],
            ['a per-node line height', 'A\nB', { lineHeight: 100 }, 0],
        ])('measures where v4 draws, with %s', (_, value, style, anchor) => {
            const node = bitmap(value, style);
            node.anchor.set(anchor);

            const measured = engine.text.measureBitmap(node)!;
            const drawn = spriteBox(node);
            expect(measured.height).toBeCloseTo(drawn.height);
            expect(measured.centre.x).toBeCloseTo(drawn.centre.x);
            expect(measured.centre.y).toBeCloseTo(drawn.centre.y);
        });

        it('counts the lines a wrap makes, and spaces them by a per-node line height', () => {
            expect(
                engine.text.bitmapLineCount(
                    bitmap('AB AB AB', { wordWrap: true, wordWrapWidth: 200 }),
                ),
            ).toBe(2);

            const spaced = bitmap('A\nA', { lineHeight: 100 });
            expect(spriteBox(spaced).height).toBe(100 + 60);
        });

        it('lays a node out as nothing until its family is registered', () => {
            const node = engine.text.createBitmapText();
            engine.text.applyStyle(node, { fontFamily: 'NotYet', fontSize: 20 });
            node.text = 'AB';

            expect(() => node.updateText()).not.toThrow();
            expect(engine.text.measureBitmap(node)).toBeUndefined();
            expect(engine.text.isBitmapText(node)).toBe(true);
            expect(engine.text.isBitmapText(engine.text.createText())).toBe(false);
        });

        it('reads an XML .fnt too', () => {
            const xml = `<?xml version="1.0"?><font><info face="XmlFont" size="32"/><common lineHeight="40" base="30"/><pages><page id="0" file="x.png"/></pages><chars count="1"><char id="65" x="0" y="0" width="20" height="30" xoffset="1" yoffset="2" xadvance="22" page="0"/></chars></font>`;

            expect(
                engine.text.registerBitmapFont(xml, { 'x.png': canvasTexture(PIXI, 32, 32) }),
            ).toBe('XmlFont');
            expect(PIXI.extras.BitmapText.fonts.XmlFont?.chars[65].xAdvance).toBe(22);

            const quoted = xml.replace(/"/g, "'").replace('XmlFont', 'QuotedFont');
            expect(
                engine.text.registerBitmapFont(quoted, { 'x.png': canvasTexture(PIXI, 32, 32) }),
            ).toBe('QuotedFont');
            expect(PIXI.extras.BitmapText.fonts.QuotedFont?.chars[65].xAdvance).toBe(22);
        });

        it("spaces letters by letterSpacing in the node's pixels, drawn and measured alike", () => {
            const node = bitmap('BB', { fontSize: 16, letterSpacing: 4 });
            node.updateText();
            const [first, second] = node.children;

            expect(second.x - first.x).toBeCloseTo(20 * 0.5 + 4);
            expect(engine.text.getStyle(node).letterSpacing).toBe(4);

            const measured = engine.text.measureBitmap(node)!;
            const drawn = spriteBox(node);
            expect(measured.centre.x).toBeCloseTo(drawn.centre.x);
        });
    });
});

describe('particles', () => {
    it('drives a pixi-particles emitter by hand', () => {
        const parent = new PIXI.Container();
        const emitter = engine.particles!.createEmitter(parent, [PIXI.Texture.WHITE], {
            alpha: { start: 1, end: 0 },
            scale: { start: 1, end: 1 },
            color: { start: 'ffffff', end: 'ffffff' },
            speed: { start: 100, end: 100 },
            startRotation: { min: 0, max: 360 },
            rotationSpeed: { min: 0, max: 0 },
            lifetime: { min: 1, max: 1 },
            frequency: 0.1,
            emitterLifetime: 0.35,
            maxParticles: 100,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            spawnType: 'point',
            autoUpdate: true,
        });

        expect((emitter as unknown as { autoUpdate: boolean }).autoUpdate).toBe(false);
        emitter.emit = false;
        emitter.update(0.5);
        expect(parent.children).toHaveLength(0);

        emitter.playOnce();
        emitter.update(0.5);
        expect(parent.children.length).toBeGreaterThan(0);
        expect(emitter.emit).toBe(false);

        emitter.destroy();
    });

    it('is absent when pixi-particles is not loaded', () => {
        const { particles: _, ...withoutParticles } = PIXI;
        expect(createPixi4Engine(withoutParticles as LoadedPixi4).particles).toBeUndefined();
    });
});

describe('assets', () => {
    it('finds a spritesheet frame in the texture cache', () => {
        const frame = canvasTexture(PIXI, 8, 8);
        PIXI.utils.TextureCache['spark.png'] = frame;

        expect(engine.assets.has('spark.png')).toBe(true);
        expect(engine.assets.get('spark.png')).toBe(frame);
        expect(engine.assets.pageTexture('spark.png')).toBe(frame);

        delete PIXI.utils.TextureCache['spark.png'];
        expect(engine.assets.has('spark.png')).toBe(false);
    });
});

describe('createPixi4Engine', () => {
    it('gives v4 points the copyFrom the core uses', () => {
        const view = engine.display.container();
        view.position.copyFrom({ x: 3, y: 4 });
        view.scale.copyFrom({ x: 2, y: 2 });
        expect([view.x, view.y, view.scale.x]).toEqual([3, 4, 2]);
    });
});
