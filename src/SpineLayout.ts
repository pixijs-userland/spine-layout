import {
    AtlasAttachmentLoader,
    SkeletonBinary,
    SkeletonJson,
    SpineTexture,
    TextureAtlas,
    Spine,
    type BoneData,
    type Slot,
    type SlotData,
} from '@esotericsoftware/spine-pixi-v8';
import type {
    SkeletonSource,
    SpineID,
    SpineLayoutOptions,
    SpineInstanceData,
    TextsJson,
} from './config/types';
import {
    Assets,
    type AssetsManifest,
    BitmapText,
    Container,
    Text,
    Texture,
    type Point,
} from 'pixi.js';
import { LOG } from './config/logs';
import { log } from './utils/Log';
import { ManifestParser, type SpineAssetData } from './utils/ManifestParser';
import { planMultipleInstances, spinePointerBases } from './utils/multiInstance';
import { AnimationsController } from './controllers/Animations.controller';
import { SkinsController } from './controllers/Skins.controller';
import { TextsController } from './controllers/Texts.controller';
import { SceneController } from './controllers/Scene.controller';
import { SpineController } from './controllers/Spine.controller';
import { PointerController } from './controllers/Pointer.controller';
import { sounds } from './controllers/Sounds.controller';

/** The spine the scene is built from, unless the options name another. */
const DEFAULT_ROOT = 'root';

/**
 * How one loaded skeleton is turned into an instance — retained per id, so a spine the tree
 * never asked for can still be built later ({@link SpineLayout.createInstance}), and so a
 * template's clones are read from the skeleton rather than copied off the template.
 */
type SpineSource = {
    create: () => Spine;
    /** What the source knows about a fresh instance once it is registered: its skins. */
    registered?: (spineID: SpineID, spine: Spine) => void;
};

export class SpineLayout extends Container {
    #spines: Map<SpineID, Spine> = new Map();
    /** Every skeleton that was loaded, built or not, by the id it would be registered under. */
    #sources: Map<SpineID, SpineSource> = new Map();
    /** Ids of spines created as multiple instances (e.g. `counter_1`). */
    #multipleInstanceIDs: Set<string> = new Set();
    #animations: AnimationsController;
    #skins: SkinsController;
    #texts: TextsController;
    #spine: SpineController;
    #scene: SceneController;
    #pointer: PointerController;

    constructor(private options?: SpineLayoutOptions) {
        super();

        log.enabled = !!options?.debug;
        this.#animations = new AnimationsController(this.#spines);
        this.#skins = new SkinsController(this.#spines);
        this.#texts = new TextsController(
            this.#spines,
            this.#multipleInstanceIDs,
            this.#animations,
        );
        this.#spine = new SpineController(this.#spines, this.#animations);
        this.#scene = new SceneController(
            this.#spines,
            this.#texts,
            this.#animations,
            this.#spine,
            options,
        );
        this.#pointer = new PointerController(this.#spines, this);

        if (options?.manifest) {
            this.createInstancesFromManifest(options.manifest);
        }
    }

    // ─── setters / getters ───────────────────────────────────────────────────────

    get spines(): Map<SpineID, Spine> {
        return this.#spines;
    }
    /** Ids of spines created as multiple instances (e.g. `counter_1`, `counter_2`). */
    get multipleInstanceIds(): string[] {
        return [...this.#multipleInstanceIDs];
    }
    get animations(): AnimationsController {
        return this.#animations;
    }
    get skins(): SkinsController {
        return this.#skins;
    }
    get scene(): SceneController {
        return this.#scene;
    }
    get texts(): TextsController {
        return this.#texts;
    }
    get spine(): SpineController {
        return this.#spine;
    }
    get pointer(): PointerController {
        return this.#pointer;
    }

    set textSettings(settings: TextsJson) {
        this.#texts.settings = settings;
    }
    get textSettings(): TextsJson | undefined {
        return this.#texts.settings;
    }

    // TODO: UI
    // get ui(): PixiUI {}

    set debug(value: boolean) {
        if (this.options) this.options.debug = value;
        log.enabled = value;
    }

    get debug(): boolean {
        return log.enabled;
    }

    set speed(value: number) {
        this.#animations.speed = value;
    }
    get speed(): number {
        return this.#animations.speed;
    }

    /**
     * Runs one spine faster or slower than the rest of the layout — a multiplier on
     * {@link speed}. See {@link AnimationsController.setSpineSpeed}.
     */
    setSpineSpeed(spineID: SpineID, value: number) {
        this.#animations.setSpineSpeed(spineID, value);
    }

    // ─── Instance creation ───────────────────────────────────────────────────────

    createInstancesFromManifest(manifest: AssetsManifest, folderName?: string) {
        this.openRegistryLogs();

        const sources = new Map<SpineID, SpineSource>();

        ManifestParser.getSpineAssets(manifest).forEach((asset) => {
            const spineID = asset.skel.replace(/\.[^.]+$/, '');

            sources.set(spineID, { create: () => this.spineFromAsset(asset, folderName) });
        });

        const rootID = this.build(sources);

        this.closeRegistryLogs();

        this.render(rootID);

        sounds.init(manifest);

        this.#animations.playState('init');
        this.#animations.playByName('init');
    }

    createInstancesFromDataArray(data: SpineInstanceData[]) {
        this.openRegistryLogs();

        const sources = new Map<SpineID, SpineSource>();

        data.forEach((item) => {
            sources.set(item.name, {
                create: () => spineFromData(item),
                registered: (spineID, spine) => this.registerDataSkins(spineID, spine, item),
            });
        });

        const rootID = this.build(sources);

        this.closeRegistryLogs();

        this.render(rootID);

        this.#animations.playState('init');
        this.#animations.playByName('init');
    }

    /**
     * Creates a spine the tree does not reach, and everything that one embeds in turn.
     *
     * Building starts at the root and follows the `spine_<id>` slots down, so a skeleton that
     * was loaded but is embedded nowhere is never instanced. This is the way to one anyway: a
     * spine positioned by the game rather than by a slot, a popup the layout never names. It is
     * registered and wired like any other — nested children, texts, buttons — but it is given
     * no place on screen, since nothing named one: attach it with `scene.addSlotChild()`, or
     * `addChild()` it into the layout. Nor is anything played — the tree's `init` ran when the
     * tree was built — so pose it with `animations.play(spineID, 'init')` if it needs it.
     *
     * @returns the instance, already-built ones included, or `undefined` when no skeleton by
     * that name was loaded.
     */
    createInstance(spineID: SpineID): Spine | undefined {
        const existing = this.#spines.get(spineID);

        if (existing) return existing;

        if (!this.#sources.has(spineID)) {
            console.error(
                `[SpineLayout] Cannot create "${spineID}": no skeleton by that name was loaded`,
            );
            return undefined;
        }

        this.openRegistryLogs();

        const built = this.multiplyInstances(this.buildTree(spineID));

        this.closeRegistryLogs();

        this.#texts.loadSettings();
        this.#scene.attachBones(built);
        this.#scene.attachTexts(built);
        this.#scene.activateButtonBones(built);
        this.#scene.syncSlotObjectsWithDrawOrder(built);
        this.#pointer.attach();

        return this.#spines.get(spineID);
    }

    /**
     * Builds the scene from its root: the root spine itself, then every spine a `spine_<id>`
     * slot beneath it asks for, down the whole tree. What no slot points at stays unbuilt.
     *
     * With no root to start from there is no tree either, so every loaded skeleton is built and
     * each one nothing embedded is rooted in the layout — what the layout did before it had a
     * root, kept for a project whose entry point is not named yet.
     *
     * @returns the id the scene is rooted at, or `undefined` when there was no root to build.
     */
    private build(sources: Map<SpineID, SpineSource>): SpineID | undefined {
        this.#sources = sources;

        const rootID = this.options?.root ?? DEFAULT_ROOT;

        if (sources.has(rootID)) {
            this.multiplyInstances(this.buildTree(rootID));
            return rootID;
        }

        console.warn(
            `[SpineLayout] No root spine "${rootID}" among ${[...sources.keys()].join(', ')} — ` +
                'building every skeleton instead. Name the entry point in the layout options ' +
                '(`{ root: "…" }`) to build only what it embeds.',
        );

        sources.forEach((_, spineID) => this.instantiate(spineID));
        this.multiplyInstances();

        return undefined;
    }

    /**
     * Builds `rootID` and everything the tree beneath it embeds, breadth-first: a spine's slots
     * are read once it exists, and each `spine_<id>` among them names the next spine to build.
     *
     * A pointer at a pool (`spine_symbol0`) builds the template it is cloned from; the clones
     * themselves are {@link multiplyInstances}' work, once the tree is known and the parents
     * carrying those slots are all final.
     *
     * Nothing already built is built again — which only comes up for a tree grown later
     * ({@link createInstance}), where a spine that is already standing in the scene keeps its
     * place and the newcomer pointing at it gets a copy of its own.
     *
     * @returns the ids built, `rootID` included.
     */
    private buildTree(rootID: SpineID): Set<SpineID> {
        const built = new Set<SpineID>();
        const queue: { spineID: SpineID; baseID: SpineID }[] = [
            { spineID: rootID, baseID: rootID },
        ];

        while (queue.length) {
            const { spineID, baseID } = queue.shift()!;

            if (built.has(spineID)) continue;
            built.add(spineID);

            const spine = this.instantiate(spineID, baseID);
            if (!spine) continue;

            spine.state.data.skeletonData.slots.forEach((slot) => {
                spinePointerBases(slot.name, (id) => this.#sources.has(id)).forEach((base) => {
                    // A spine can only live in one slot, so a pointer at one that is already
                    // embedded gets an instance of its own — under the `<child>_<parent>` name
                    // a child shared by several parents is given anyway.
                    const shared = !!this.#spines.get(base)?.parent;
                    const childID = shared ? `${base}_${spineID}` : base;

                    if (built.has(childID) || this.#spines.has(childID)) return;
                    if (shared) this.#multipleInstanceIDs.add(childID);

                    queue.push({ spineID: childID, baseID: base });
                });
            });
        }

        return built;
    }

    /** Builds one instance from its source and registers it under `spineID`. */
    private instantiate(spineID: SpineID, baseID: SpineID = spineID): Spine | undefined {
        const source = this.#sources.get(baseID);

        if (!source) return undefined;

        try {
            const spine = source.create();

            this.addSpineInstance(spineID, spine);
            source.registered?.(spineID, spine);

            return spine;
        } catch (e) {
            console.error(`[SpineLayout] Error loading spine "${spineID}":`, e);
            return undefined;
        }
    }

    /** Registers the skins a raw-data skeleton exported, and applies its default one. */
    private registerDataSkins(spineID: SpineID, spine: Spine, data: SpineInstanceData) {
        skinsOf(data.skeleton).forEach((skin) => {
            const defaultSkin =
                spine.skeleton.data.findSkin('default') ?? spine.skeleton.data.findSkin('basic');
            if (defaultSkin) this.#skins.applyBySpineID(spineID, defaultSkin.name);
            this.#skins.registerSkin(spineID, skin.name);
        });
    }

    /** Creates a Spine instance from a manifest asset entry. */
    private spineFromAsset(asset: SpineAssetData, folderName?: string): Spine {
        const skeleton = alias(asset.skel, folderName);

        // A skeleton with no atlas is read with an empty one. `Spine.from` cannot: it looks the
        // atlas up in the asset cache, so a missing one is a warning and then a null attachment
        // loader, rather than the skeleton of bones and animations that was exported.
        if (!asset.atlas) return spineFromSkeleton(Assets.get(skeleton), new TextureAtlas(''));

        return Spine.from({ skeleton, atlas: alias(asset.atlas, folderName) });
    }

    /**
     * Expands spines that act as multiple-instance templates into their full instance set (see
     * {@link planMultipleInstances} for the supported pointer conventions). Each planned base is
     * removed and replaced by its instances, which are tracked in {@link #multipleInstanceIDs}
     * and built from the base's own source.
     *
     * @param built the ids to plan over — the spines a build just produced. Omit for the whole
     * registry.
     * @returns those ids as the registry now holds them: an expanded base swapped for its
     * instances.
     */
    private multiplyInstances(built?: Set<SpineID>): Set<SpineID> {
        const ids = built ?? new Set(this.#spines.keys());
        const bases = [...this.#spines.entries()]
            .filter(([id]) => ids.has(id))
            .map(([id, spine]) => ({
                id,
                slots: spine.state.data.skeletonData.slots.map((slot) => slot.name),
            }));

        planMultipleInstances(bases).forEach(({ baseID, instanceIDs }) => {
            if (!this.#sources.has(baseID)) return;

            this.removeSpineInstance(baseID);
            ids.delete(baseID);

            instanceIDs.forEach((instanceID) => {
                this.#multipleInstanceIDs.add(instanceID);
                ids.add(instanceID);
                this.instantiate(instanceID, baseID);
            });
        });

        return ids;
    }

    private addSpineInstance(spineID: string, spine: Spine) {
        if (this.#spines.has(spineID)) {
            this.#spines.get(spineID)?.destroy();
            this.#spines.delete(spineID);
        }

        this.#spines.set(spineID, spine);
        this.#animations.registerSpine(spineID, spine);
        this.onSpineRegistered(spineID, spine);
    }

    private removeSpineInstance(spineID: string) {
        const spine = this.#spines.get(spineID);
        if (!spine) return;

        spine.destroy();
        this.#spines.delete(spineID);
        this.#animations.unregisterSpine(spineID);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onSpineRegistered(_spineID: string, _spine: Spine) { }

    /**
     * Registration is done — flush its tables before anything is played, so the console reads in
     * load order (what was registered, then what `init` did with it) instead of showing
     * `Play State [init]` above the registries it was built from.
     */
    private openRegistryLogs() {
        log.open(LOG.SPINES);
        log.open(LOG.STATES);
        log.open(LOG.EVENTS);
        log.open(LOG.SPINE_EVENTS);
    }

    private closeRegistryLogs() {
        log.close(LOG.SPINES);
        log.close(LOG.STATES);
        log.close(LOG.EVENTS);
        log.close(LOG.SPINE_EVENTS);
    }

    private render(rootID?: SpineID) {
        this.#texts.loadSettings();
        this.#scene.attachBones();
        this.layoutChildren(rootID).forEach((spine) => this.addChild(spine));
        this.#scene.attachTexts();
        this.#scene.activateButtonBones();
        this.#scene.syncSlotObjectsWithDrawOrder();
        this.#pointer.attach();
    }

    /**
     * What the layout container itself holds: the root, the one spine the scene hangs from.
     *
     * A spine the tree embeds is a child of the spine embedding it, not of the layout — even
     * one whose slot `skipAttachingSpinesPatterns` held back, which is built and left for the
     * game to place. Without a root, every spine nothing embedded is one.
     */
    private layoutChildren(rootID?: SpineID): Spine[] {
        if (!rootID) return [...this.#spines.values()].filter((spine) => !spine.parent);

        const root = this.#spines.get(rootID);

        return root ? [root] : [];
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    reset() {
        this.#texts.clear();
        this.#animations.clear();
        this.#skins.clear();
        this.#scene.clear();
        this.#pointer.clear();

        this.#spines.forEach((spine) => spine.destroy());
        this.#spines.clear();
        this.#sources.clear();
        this.#multipleInstanceIDs.clear();

        this.removeChildren();
    }

    destroy() {
        this.reset();
        super.destroy();
    }

    // ─── deprecated methods ──────────────────────────────────────────────────────

    // ─── Spine registry ──────────────────────────────────────────────────────────

    getSpines(): Map<SpineID, Spine> {
        return this.#spines;
    }
    getSpine(spineID: string): Spine | undefined {
        return this.#spines.get(spineID);
    }
    getSpineByID(spineID: string): Spine | undefined {
        return this.#spines.get(spineID);
    }
    getSpinesByNamePattern(pattern: string, options?: { not?: string[] }): Map<string, Spine> {
        return this.#spine.getSpinesByNamePattern(pattern, options);
    }

    // ─── Animation queries ───────────────────────────────────────────────────────

    /** @deprecated Use `animations.getAll()` instead. */
    getAnimations(): string[] {
        return this.#animations.getAll();
    }
    /** @deprecated Use `animations.getStates()` instead. */
    getAnimationsStates(): string[] {
        return this.#animations.getStates();
    }
    /** @deprecated Use `animations.getEvents()` instead. */
    getAnimationsEvents(): string[] {
        return this.#animations.getEvents();
    }
    /** @deprecated Use `animations.getActive()` instead. */
    getActiveAnimations(): string[] {
        return this.#animations.getActive();
    }
    /** @deprecated Use `animations.getLooping()` instead. */
    getLoopingAnimations(): string[] {
        return this.#animations.getLooping();
    }

    // ─── Animation playback ──────────────────────────────────────────────────────

    /** @deprecated Use `animations.playState()` instead. */
    async playState(stateName: string) {
        return this.#animations.playState(stateName);
    }
    /** @deprecated Use `animations.playEvent()` instead. */
    async playEvent(eventName: string, spineID: string) {
        return this.#animations.playEvent(eventName, spineID);
    }
    /** @deprecated Use `animations.playByName()` instead. */
    async playAnimationByName(animationName: string, playSolo = false) {
        return this.#animations.playByName(animationName, playSolo);
    }
    /** @deprecated Use `animations.play()` instead. */
    async playInstanceAnimation(spineID: string, animation: string, playSolo = false) {
        return this.#animations.play(spineID, animation, playSolo);
    }
    /** @deprecated Use `animations.playSolo()` instead. */
    async playSolo(animationName: string) {
        return this.#animations.playSolo(animationName);
    }
    /** @deprecated Use `animations.playInstanceAnimationLastFrame()` instead. */
    async playInstanceAnimationLastFrame(spineID: string, animation: string, playSolo = false) {
        return this.#animations.playLastFrame(spineID, animation, playSolo);
    }
    /** @deprecated Use `animations.stopAnimation()` instead. */
    stopAnimation(spineID: string, animation: string) {
        this.#animations.stop(spineID, animation);
    }
    /** @deprecated Use `animations.stopAll()` instead. */
    stopAll() {
        this.#animations.stopAll();
    }
    /** @deprecated Use `animations.stopAllBySpineID()` instead. */
    stopAllBySpineID(spineID: string) {
        this.#animations.stopAllForSpine(spineID);
    }
    /** @deprecated Use `animations.pauseState()` instead. */
    pauseState(stateName: string) {
        this.#animations.pauseState(stateName);
    }
    /** @deprecated Use `animations.stopState()` instead. */
    stopState(stateName: string, resetPose = true) {
        this.#animations.stopState(stateName, resetPose);
    }
    /** @deprecated Use `animations.pauseSpineByID()` instead. */
    pauseSpineByID(spineID: string) {
        this.#animations.pauseBySpineID(spineID);
    }
    /** @deprecated Use `animations.pauseAnimation()` instead. */
    pauseAnimation(spineID: string, animation: string) {
        this.#animations.pause(spineID, animation);
    }
    /** @deprecated Use `animations.resetAnimation()` instead. */
    resetAnimation(spineID: string, animation: string) {
        this.#animations.reset(spineID, animation);
    }
    /** @deprecated Use `animations.addEventListener()` instead. */
    addEventListener(event: string, fn: (event: unknown) => void) {
        this.#animations.addEventListener(event, fn);
    }

    // ─── Skin management ─────────────────────────────────────────────────────────

    /** @deprecated Use `skins.getAll()` instead. */
    getAllSkins(): Set<string> {
        return this.#skins.getAll();
    }
    /** @deprecated Use `skins.apply()` instead. */
    applySkin(skin: string) {
        this.#skins.apply(skin);
    }
    /** @deprecated Use `skins.applyBySpineID()` instead. */
    applySpineSkin(spineID: string, skinName: string) {
        this.#skins.applyBySpineID(spineID, skinName);
    }
    /** @deprecated Use `skins.getSpineSkinsBySkinID()` instead. */
    getSpineSkins(skinID: string): string[] {
        return this.#skins.getSpineSkinsBySkinID(skinID);
    }

    // ─── Text management ─────────────────────────────────────────────────────────

    /** @deprecated Use `texts.getInstances()` instead. */
    getTextInstances(): Map<SpineID, Text | BitmapText> {
        return this.#texts.getInstances();
    }
    /** @deprecated Use `texts.getBitmapInstances()` instead. */
    getBitmapTextInstances(): Map<SpineID, BitmapText> {
        return this.#texts.getBitmapInstances();
    }
    /** @deprecated Use `texts.getBySpine()` instead. */
    getTextsBySpine(): Map<string, string[]> {
        return this.#texts.getBySpine();
    }
    /** @deprecated Use `texts.getVal()` instead. */
    getTextVal(textID: string): string | undefined {
        return this.#texts.getVal(textID);
    }
    /** @deprecated Use `texts.set()` instead. */
    async setText(boneName: string, text: string, animate = false, duration = 0) {
        await this.#texts.set(boneName, text, animate, duration);
    }
    /** @deprecated Use `texts.setOffset()` instead. */
    setTextOffset(boneName: string, offset: { x: number; y: number }) {
        this.#texts.setOffset(boneName, offset);
    }
    /** @deprecated Use `texts.setMaxWidth()` instead. */
    setTextMaxWidth(boneName: string, maxWidth: number) {
        this.#texts.setMaxWidth(boneName, maxWidth);
    }
    /** @deprecated Use `texts.setStyle()` instead. */
    setTextStyle(boneName: string, style: Partial<Text['style']>) {
        this.#texts.setStyle(boneName, style);
    }
    /** @deprecated Use `texts.setBySpineID()` instead. */
    setSlotTextBySpineID(spineID: string, slotName: string, text: Text | BitmapText) {
        this.#texts.addTextToSlot(spineID, slotName, text);
    }

    // ─── Spine management ─────────────────────────────────────────────────────────

    /** @deprecated Use `SpineController.getBonesByNamePattern()` directly instead. */
    getBonesByNamePattern(pattern: string): BoneData[] {
        return this.#spine.getBonesByNamePattern(pattern);
    }
    /** @deprecated Use `SpineController.getSlotsByNamePattern()` directly instead. */
    getSlotsByNamePattern(pattern: string): SlotData[] {
        return this.#spine.getSlotsByNamePattern(pattern);
    }
    /** @deprecated Use `SpineController.getSlotByName()` directly instead. */
    getSlotByName(name: string): Slot | undefined {
        return this.#spine.getSlotByName(name);
    }
    /** @deprecated Use `SpineController.getBoneGlobalPosition()` directly instead. */
    getSpineBoneGlobalPosition(spineID: string, boneName: string): Point | undefined {
        return this.#spine.getBoneGlobalPosition(spineID, boneName);
    }
    /** @deprecated Use `SpineController.getBonesGlobalPositionsByNamePattern()` directly instead. */
    getBonesGlobalPositionsByNamePattern(pattern: string): Record<string, Point> {
        return this.#spine.getBonesGlobalPositionsByNamePattern(pattern);
    }
    /** @deprecated Use `SpineController.getSlotsGlobalPositionsByNamePattern()` directly instead. */
    getSlotsGlobalPositionsByNamePattern(pattern: string): Record<string, Point> {
        return this.#spine.getSlotsGlobalPositionsByNamePattern(pattern);
    }
    /** @deprecated Use `SpineController.getSlotTexture()` directly instead. */
    getSpineSlotTexture(spineName: string, slotName: string): Texture | null {
        return this.#spine.getSlotTexture(spineName, slotName);
    }

    // ─── Manual slot/child wiring ────────────────────────────────────────────────

    /** @deprecated Use `scene.addSlotChild()` instead. */
    addSlotChild(spineID: string, slotName: string, child: Container) {
        this.#scene.addSlotChild(spineID, slotName, child);
    }

    /** @deprecated Use `spine.clone()` instead. */
    cloneSpine(spine: Spine, newSpineID: string): Spine {
        return this.#spine.clone(spine, newSpineID);
    }

    /** Removes attached children from a spine slot (or all slots if a container is given). */
    removeSlotAttachments(spineID: string, slotOrContainer: number | string | Slot | Container) {
        const spine = this.#spines.get(spineID);
        if (!spine) {
            console.error(`Spine ${spineID} not found`);
            return;
        }
        spine.removeSlotObject(slotOrContainer);
    }
}

/** Builds a Spine from raw data: its atlas read from the text, its pages given the textures. */
function spineFromData(data: SpineInstanceData): Spine {
    const atlas = new TextureAtlas(data.atlasText);

    for (const page of atlas.pages) {
        const texture = data.textures[page.name];
        if (!texture) throw new Error(`Missing texture for page: ${page.name}`);
        page.setTexture(SpineTexture.from(texture.source));
    }

    return spineFromSkeleton(data.skeleton, atlas);
}

/**
 * Reads a skeleton — a parsed `.json` or the bytes of a `.skel` — against an atlas.
 *
 * The atlas may hold no pages: an attachment is what reaches into it, so a skeleton of nothing
 * but bones, slots and animations never looks a region up.
 */
function spineFromSkeleton(skeleton: SkeletonSource, atlas: TextureAtlas): Spine {
    const loader = new AtlasAttachmentLoader(atlas);

    return new Spine(
        isBinarySkeleton(skeleton)
            ? new SkeletonBinary(loader).readSkeletonData(skeleton)
            : new SkeletonJson(loader).readSkeletonData(skeleton),
    );
}

/** The skins a skeleton exported. A skeleton that attaches no image carries no `skins` key. */
function skinsOf(skeleton: SkeletonSource): { name: string }[] {
    return isBinarySkeleton(skeleton) ? [] : skeleton.skins ?? [];
}

function isBinarySkeleton(skeleton: SkeletonSource): skeleton is ArrayBuffer | Uint8Array {
    return skeleton instanceof Uint8Array || skeleton instanceof ArrayBuffer;
}

function alias(filename: string, folderName?: string): string {
    return folderName ? `${folderName}/${filename}` : filename;
}
