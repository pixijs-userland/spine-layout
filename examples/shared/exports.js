const status = document.getElementById('status');

addEventListener('error', ({ message }) => (status.textContent = message));
addEventListener('unhandledrejection', ({ reason }) => (status.textContent = String(reason)));

export const SPINE_38 = {
    folder: '../assets/spine-3.8/',
    skeletons: ['root'],
    fonts: ['digits.fnt'],
    texts: 'texts.json',
    particles: 'particles.json',
};

export const SPINE_43 = {
    folder: '../assets/spine-4.3/',
    skeletons: ['popup', 'okButton', 'coin'],
    texts: 'texts.json',
};

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    return response.text();
}

const fetchJson = async (url) => JSON.parse(await fetchText(url));

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${url}`));
        image.src = url;
    });
}

const atlasPages = (atlasText) =>
    atlasText
        .split(/\r?\n/)
        .filter((line, i, lines) => line.trim() && !lines[i - 1]?.trim())
        .map((line) => line.trim());

const fontPages = (fnt) => [...fnt.matchAll(/file="([^"]+)"/g)].map(([, file]) => file);

const particleTextures = (settings) =>
    Object.values(settings).flatMap((entries) =>
        Object.values(entries).flatMap((entry) => entry.textures ?? []),
    );

/**
 * Reads a folder of exports into `createInstancesFromDataArray` data, registers its bitmap fonts
 * with the engine, and hands its texts and particles settings to the layout.
 */
export async function loadExports(
    engine,
    layout,
    { folder, skeletons, fonts = [], texts, particles },
) {
    const base = new URL(folder, location.href);
    const url = (file) => new URL(file, base).href;
    const pages = new Map();
    const texture = (file) => {
        if (!pages.has(file)) {
            pages.set(
                file,
                loadImage(url(file)).then((image) => engine.display.textureFromImage(image)),
            );
        }
        return pages.get(file);
    };
    const textures = async (files) =>
        Object.fromEntries(
            await Promise.all(files.map(async (file) => [file, await texture(file)])),
        );

    const data = await Promise.all(
        skeletons.map(async (name) => {
            const [skeleton, atlasText] = await Promise.all([
                fetchJson(url(`${name}.json`)),
                fetchText(url(`${name}.atlas`)),
            ]);
            return { name, skeleton, atlasText, textures: await textures(atlasPages(atlasText)) };
        }),
    );

    for (const font of fonts) {
        const fnt = await fetchText(url(font));
        engine.text.registerBitmapFont(fnt, await textures(fontPages(fnt)));
    }

    if (texts) layout.textSettings = await fetchJson(url(texts));

    if (particles) {
        const settings = await fetchJson(url(particles));
        const loaded = await textures(particleTextures(settings));
        Object.entries(loaded).forEach(([alias, page]) => engine.assets.set(alias, page));
        layout.particleSettings = settings;
    }

    return data;
}

/** Pixi's version, each Spine runtime of the engine with the spines it read, and their exports. */
export function showStatus(pixiVersion, engine, layouts) {
    const spines = layouts.flatMap((layout) => [...layout.spines]);
    const readBy = (runtime) =>
        spines
            .filter(([, spine]) => engine.spine.runtimeOf(spine)?.minor === runtime.minor)
            .map(([id]) => id);

    const lines = [
        `Pixi ${pixiVersion}`,
        ...engine.spine.runtimes.map(
            (runtime) =>
                `${runtime.packageName} ${runtime.packageVersion} (Spine ${runtime.minor}): ` +
                (readBy(runtime).join(', ') || 'nothing'),
        ),
        `exports: ${spines.map(([id, spine]) => `${id} ${spine.skeleton.data.version}`).join(', ')}`,
    ];

    status.replaceChildren(
        ...lines.map((line) => Object.assign(document.createElement('div'), { textContent: line })),
    );
}
