import {
    AtlasAttachmentLoader,
    SkeletonJson,
    SpineTexture,
    TextureAtlas,
    Spine,
    type BoneData,
    type Slot,
    type SlotData,
} from '@esotericsoftware/spine-pixi-v8';
import type {
    SpineID,
    SpineLayoutOptions,
    SpineInstanceData,
    TextsJsonEntry,
} from './config/types';
import { type AssetsManifest, BitmapText, Container, Text, Texture, type Point } from 'pixi.js';
import { LOG } from './config/logs';
import { log } from './utils/Log';
import { parcePointers } from './config/parcePointers';
import { ManifestParser } from './utils/ManifestParser';
import { AnimationsController } from './controllers/Animations.controller';
import { SkinsController } from './controllers/Skins.controller';
import { TextsController } from './controllers/Texts.controller';
import { SceneController } from './controllers/Scene.controller';
import { SpineController } from './controllers/Spine.controller';

export class SpineLayout extends Container {
    #spines: Map<SpineID, Spine> = new Map();
    #animations: AnimationsController;
    #skins: SkinsController;
    #texts: TextsController;
    #spine: SpineController;
    #scene: SceneController;

    constructor(private options?: SpineLayoutOptions) {
        super();

        log.enabled = !!options?.debug;
        this.#animations = new AnimationsController(this.#spines);
        this.#skins = new SkinsController(this.#spines);
        this.#texts = new TextsController(this.#spines);
        this.#spine = new SpineController(this.#spines, this.#animations);
        this.#scene = new SceneController(
            this.#spines,
            this.#texts,
            this.#animations,
            this.#spine,
            options,
        );

        if (options?.manifest) {
            this.createInstancesFromManifest(options.manifest);
        }
    }

    // ─── setters / getters ───────────────────────────────────────────────────────

    get spines(): Map<SpineID, Spine> {
        return this.#spines;
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

    set textSettings(settings: Record<string, TextsJsonEntry>) {
        this.#texts.settings = settings;
    }
    get textSettings(): Record<string, TextsJsonEntry> | undefined {
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

    // ─── Instance creation ───────────────────────────────────────────────────────

    createInstancesFromManifest(manifest: AssetsManifest, folderName?: string) {
        log.open(LOG.SPINES);
        log.open(LOG.STATES);
        log.open(LOG.EVENTS);

        const singleAssets = [];
        const multipleAssets = [];

        for (const asset of ManifestParser.getSpineAssets(manifest)) {
            const spineID = asset.atlas.replace(/\.[^.]+$/, '');

            if (this.options?.multipleInstancesPatterns?.includes(spineID)) {
                multipleAssets.push(asset);
            } else {
                singleAssets.push(asset);
            }
        }

        // create single instances first to ensure all skins are registered for multiple instance spines
        singleAssets.forEach((asset) => {
            const spineID = asset.atlas.replace(/\.[^.]+$/, '');

            this.addSpineInstance(
                spineID,
                Spine.from({
                    skeleton: `${folderName}/${asset.skel}`,
                    atlas: `${folderName}/${asset.atlas}`,
                }),
            );
        });

        // create multiple instances after to ensure correct count and skin registration
        multipleAssets.forEach((asset) => {
            const spineID = asset.atlas.replace(/\.[^.]+$/, '');

            const bones = this.#spine.getBonesByNamePattern(
                `${parcePointers.slot.spine}${spineID}`,
            );
            const count = bones.length > 0 ? bones.length : 1;

            for (let i = 0; i < count; i++) {
                const id = `${spineID}${count > 1 ? i + 1 : ''}`;

                this.addSpineInstance(
                    id,
                    Spine.from({
                        skeleton: `${folderName}/${asset.skel}`,
                        atlas: `${folderName}/${asset.atlas}`,
                    }),
                );
            }
        });

        this.render();

        log.close(LOG.SPINES);
        log.close(LOG.STATES);
        log.close(LOG.EVENTS);
    }

    createInstancesFromDataArray(data: SpineInstanceData[]) {
        log.open(LOG.SPINES);
        log.open(LOG.STATES);
        log.open(LOG.EVENTS);

        data.forEach((item) => this.createInstanceFromData(item, true, true));
        data.forEach((item) => this.createInstanceFromData(item, true, false));

        this.render();

        log.close(LOG.SPINES);
        log.close(LOG.STATES);
        log.close(LOG.EVENTS);

        this.#animations.playState('init');
    }

    createInstanceFromData(
        data: SpineInstanceData,
        skipAttachBones = false,
        skipMultipleInstances = true,
    ) {
        const spineID = data.atlasText.split('.')[0];

        if (skipMultipleInstances && this.options?.multipleInstancesPatterns?.includes(spineID))
            return;

        const spineAtlas = new TextureAtlas(data.atlasText);

        for (const page of spineAtlas.pages) {
            const texture = data.textures[page.name];
            if (!texture) throw new Error(`Missing texture for page: ${page.name}`);
            page.setTexture(SpineTexture.from(texture.source));
        }

        const skeletonData = new SkeletonJson(
            new AtlasAttachmentLoader(spineAtlas),
        ).readSkeletonData(data.skeleton);
        const spineInstance = new Spine(skeletonData);

        if (this.options?.multipleInstancesPatterns?.includes(spineID) && !skipMultipleInstances) {
            const bones = this.#spine.getBonesByNamePattern(
                `${parcePointers.slot.spine}${spineID}`,
            );
            const count = bones.length > 0 ? bones.length : 1;

            for (let i = 0; i < count; i++) {
                const id = `${spineID}${count > 1 ? i + 1 : ''}`;
                this.addSpineInstance(id, spineInstance);
                data.skeleton.skins.forEach((skin) => {
                    const defaultSkin =
                        spineInstance.skeleton.data.findSkin('default') ??
                        spineInstance.skeleton.data.findSkin('basic');
                    if (defaultSkin) this.#skins.applyBySpineID(id, defaultSkin.name);
                    this.#skins.registerSkin(id, skin.name);
                });
            }
        } else if (skipMultipleInstances) {
            this.addSpineInstance(spineID, spineInstance);
            data.skeleton.skins.forEach((skin) => {
                const defaultSkin =
                    spineInstance.skeleton.data.findSkin('default') ??
                    spineInstance.skeleton.data.findSkin('basic');
                if (defaultSkin) this.#skins.applyBySpineID(spineID, defaultSkin.name);
                this.#skins.registerSkin(spineID, skin.name);
            });
        }

        if (!skipAttachBones) this.render();

        this.#animations.playState('init');
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onSpineRegistered(_spineID: string, _spine: Spine) {}

    private render() {
        this.#texts.loadSettings();
        this.#scene.attachBones((spine) => this.addChild(spine));
        this.#scene.attachTexts();
        this.#scene.activateButtonBones();
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    reset() {
        this.#texts.clear();
        this.#animations.clear();
        this.#skins.clear();
        this.#scene.clear();

        this.#spines.forEach((spine) => spine.destroy());
        this.#spines.clear();

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

    /** @deprecated Use `animations.getAall()` instead. */
    getAnimations(): string[] {
        return this.#animations.getAall();
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
    /** @deprecated Use `animations.playAnimationByName()` instead. */
    async playAnimationByName(animationName: string, playSolo = false, trackID?: number) {
        return this.#animations.playAnimationByName(animationName, playSolo, trackID);
    }
    /** @deprecated Use `animations.playInstanceAnimation()` instead. */
    async playInstanceAnimation(
        spineID: string,
        animation: string,
        playSolo = false,
        trackID?: number,
    ) {
        return this.#animations.playInstanceAnimation(spineID, animation, playSolo, trackID);
    }
    /** @deprecated Use `animations.playSolo()` instead. */
    async playSolo(animationName: string) {
        return this.#animations.playSolo(animationName);
    }
    /** @deprecated Use `animations.playInstanceAnimationLastFrame()` instead. */
    async playInstanceAnimationLastFrame(spineID: string, animation: string, playSolo = false) {
        return this.#animations.playInstanceAnimationLastFrame(spineID, animation, playSolo);
    }
    /** @deprecated Use `animations.stopAnimation()` instead. */
    stopAnimation(spineID: string, animation: string) {
        this.#animations.stopAnimation(spineID, animation);
    }
    /** @deprecated Use `animations.stopAll()` instead. */
    stopAll() {
        this.#animations.stopAll();
    }
    /** @deprecated Use `animations.stopAllBySpineID()` instead. */
    stopAllBySpineID(spineID: string) {
        this.#animations.stopAllBySpineID(spineID);
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
        this.#animations.pauseSpineByID(spineID);
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
    setSlotTextBySpineID(spineID: string, slotName: string, text: Text) {
        this.#texts.setBySpineID(spineID, slotName, text);
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
}
