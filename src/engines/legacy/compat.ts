import { fontDocumentOf } from './bitmapFont';
import type {
    DescriptorBitmapText,
    LegacyAssetsCache,
    LegacyBitmapFontData,
    LegacyBitmapText,
    LegacyBitmapTextClass,
    LegacyLoader,
    LegacyMajor,
    LegacyNamespace,
    LegacyTexture,
    LegacyTransform,
    NamedBitmapText,
} from './legacy.types';

/**
 * Where a BitmapText line ends, as each major lays it out: at the pen (≤ 5.3), at the last
 * glyph's ink (v6), or there with every glyph position rounded (v7).
 */
export type BitmapLayoutRule = 'pen' | 'ink' | 'ink-rounded';

/** Everything PIXI 4.8 to 7.x disagree on that the legacy ports use, read off one namespace. */
export interface LegacyCompat {
    readonly version: string;
    readonly major: LegacyMajor;
    /** `interaction`: InteractionManager and `interactive` (v4–v6); `federated`: `eventMode` (7.2+). */
    readonly events: 'interaction' | 'federated';
    /** v5+ load an ImageBitmap as it is; v4's BaseTexture waits for an `onload` it never fires. */
    readonly imageBitmaps: boolean;
    readonly BitmapText: LegacyBitmapTextClass;
    /** A slot object holder's: v4's TransformBase takes `localTransform` as written; v5+ `setFromMatrix`. */
    readonly Transform: new () => LegacyTransform;
    /** `registerFont` with an XML document (v4–5.2), or `BitmapFont.install` (5.3+). */
    readonly fontApi: 'registerFont' | 'install';
    readonly fonts: Record<string, LegacyBitmapFontData | undefined>;
    readonly layoutRule: BitmapLayoutRule;
    /** BitmapText lays out `align: 'justify'` from v6; canvas Text never does before v8. */
    readonly bitmapJustify: boolean;
    readonly particles: 'pixi-particles' | 'particle-emitter' | undefined;

    installFont(fnt: string, pages: Record<string, LegacyTexture>): string;
    /** A node on `family`, which must be installed: 5.3+ throws on one that is not. */
    createBitmapText(family: string): LegacyBitmapText;
    fontName(node: LegacyBitmapText): string | null;
    fontSize(node: LegacyBitmapText): number;
    setFontName(node: LegacyBitmapText, family: string): void;
    setFontSize(node: LegacyBitmapText, size: number): void;

    /** The loader every game shares: `PIXI.loader` (v4), `PIXI.Loader.shared` (v5, v6). */
    sharedLoader(): LegacyLoader | undefined;
    assetsCache(): LegacyAssetsCache | undefined;
}

const majorOf = (version: string): LegacyMajor => {
    const major = parseInt(version, 10);
    if (major === 4 || major === 5 || major === 6 || major === 7) return major;
    throw new Error(`spine-layout's legacy ports run Pixi 4 to 7, not ${version}`);
};

function bitmapTextClass(PIXI: LegacyNamespace, major: LegacyMajor) {
    // the other spelling is a getter that warns: `PIXI.BitmapText` on v4, `PIXI.extras` on v5
    const BitmapText = major === 4 ? PIXI.extras?.BitmapText : PIXI.BitmapText;
    if (!BitmapText) throw new Error(`Pixi ${PIXI.VERSION} has no BitmapText`);
    return BitmapText;
}

function transformClass(PIXI: LegacyNamespace, major: LegacyMajor) {
    const Transform = major === 4 ? PIXI.TransformBase : PIXI.Transform;
    if (!Transform) throw new Error(`Pixi ${PIXI.VERSION} has no Transform`);
    return Transform;
}

function eventsOf(PIXI: LegacyNamespace, major: LegacyMajor): LegacyCompat['events'] {
    if (major < 7) return 'interaction';
    if ('eventMode' in new PIXI.Container()) return 'federated';
    throw new Error(
        `Pixi ${PIXI.VERSION} has federated events without eventMode or globalpointermove: spine-layout needs 7.2 or later`,
    );
}

const descriptor = (node: LegacyBitmapText) => (node as DescriptorBitmapText).font;
const named = (node: LegacyBitmapText) => node as NamedBitmapText;

export function legacyCompat(PIXI: LegacyNamespace): LegacyCompat {
    const major = majorOf(PIXI.VERSION);
    const BitmapText = bitmapTextClass(PIXI, major);
    const { BitmapFont } = PIXI;
    const installs = typeof BitmapFont?.install === 'function';
    const particles = PIXI.particles?.Emitter
        ? typeof PIXI.particles.upgradeConfig === 'function'
            ? 'particle-emitter'
            : 'pixi-particles'
        : undefined;

    const shared = {
        version: PIXI.VERSION,
        major,
        events: eventsOf(PIXI, major),
        imageBitmaps: major >= 5,
        BitmapText,
        Transform: transformClass(PIXI, major),
        layoutRule: major >= 7 ? 'ink-rounded' : major === 6 ? 'ink' : 'pen',
        bitmapJustify: major >= 6,
        particles,
        sharedLoader: () => (PIXI.Loader ? PIXI.Loader.shared : PIXI.loader),
        assetsCache: () => PIXI.Assets?.cache,
    } as const;

    if (installs) {
        return {
            ...shared,
            fontApi: 'install',
            fonts: BitmapFont.available,
            installFont: (fnt, pages) => BitmapFont.install(fnt, pages).font,
            createBitmapText: (family) => new BitmapText('', { fontName: family, fontSize: 1 }),
            fontName: (node) => named(node).fontName,
            fontSize: (node) => named(node).fontSize,
            setFontName: (node, family) => void (named(node).fontName = family),
            setFontSize: (node, size) => void (named(node).fontSize = size),
        };
    }

    const { fonts, registerFont } = BitmapText;
    if (!fonts || !registerFont)
        throw new Error(`Pixi ${PIXI.VERSION} has no bitmap font registry`);

    return {
        ...shared,
        fontApi: 'registerFont',
        fonts,
        installFont: (fnt, pages) => registerFont.call(BitmapText, fontDocumentOf(fnt), pages).font,
        createBitmapText: (family) => new BitmapText('', { font: { name: family, size: 1 } }),
        fontName: (node) => descriptor(node).name,
        fontSize: (node) => descriptor(node).size,
        setFontName(node, family) {
            (node as DescriptorBitmapText).font = { name: family, size: descriptor(node).size };
        },
        setFontSize(node, size) {
            (node as DescriptorBitmapText).font = { name: descriptor(node).name, size };
        },
    };
}
