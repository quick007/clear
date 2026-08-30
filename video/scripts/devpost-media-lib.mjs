import { access, mkdir, rename, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderEditorial, validateEditorial } from "./devpost-editorial.mjs";
import { readManifestTree } from "./devpost-manifest-tree.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultManifestPath = resolve(scriptDirectory, "../../media/devpost/manifest.json");
const expectedAssets = new Map([
  ["homepage-thumbnail", [1800, 1200, "clear-devpost-thumbnail.jpg"]],
  ["devpost-hero", [1800, 1200, "clear-devpost-hero.png"]],
  ["board-reveal", [1920, 1080, "clear-board-reveal.png"]],
  ["agent-collaboration", [1920, 1080, "clear-agent-collaboration.png"]],
  ["trace-log-correlation", [1920, 1080, "clear-trace-log-correlation.png"]],
  ["deploy-recovery", [1920, 1080, "clear-deploy-recovery.png"]],
]);

const expectedSources = [
  "homepage",
  "boardReveal",
  "codexAgent",
  "boardAgent",
  "traceDetail",
  "logDetail",
  "recoveryBoard",
];

const fits = new Set(["cover", "contain"]);
const positions = new Set(["centre", "north", "south", "east", "west"]);
const hexColor = /^#[0-9a-f]{6}$/i;
const imageExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"]);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isNumberInRange = (value, minimum, maximum) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

const isSafeRelativePath = (value) => {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.split("/").includes("..");
};

const resolveContained = (directory, path, label, failures) => {
  if (!isSafeRelativePath(path)) {
    failures.push(`${label} must be a relative path without parent traversal`);
    return directory;
  }

  const resolved = resolve(directory, path);
  const relation = relative(directory, resolved);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    failures.push(`${label} escapes its configured directory`);
  }
  return resolved;
};

const validateStyle = (style, label, failures) => {
  if (style === undefined) return;
  if (!isRecord(style)) {
    failures.push(`${label}.style must be an object`);
    return;
  }
  if (style.opacity !== undefined && !isNumberInRange(style.opacity, Number.EPSILON, 1)) {
    failures.push(`${label}.style.opacity must be greater than 0 and at most 1`);
  }
  if (style.borderRadius !== undefined && !isNonNegativeInteger(style.borderRadius)) {
    failures.push(`${label}.style.borderRadius must be a non-negative integer`);
  }
  if (style.border !== undefined) {
    if (!isRecord(style.border)) {
      failures.push(`${label}.style.border must be an object`);
    } else {
      if (!isPositiveInteger(style.border.width)) {
        failures.push(`${label}.style.border.width must be a positive integer`);
      }
      if (!hexColor.test(style.border.color ?? "")) {
        failures.push(`${label}.style.border.color must be a six-digit hex color`);
      }
      if (!isNumberInRange(style.border.opacity, Number.EPSILON, 1)) {
        failures.push(`${label}.style.border.opacity must be greater than 0 and at most 1`);
      }
    }
  }
  if (style.shadow !== undefined) {
    if (!isRecord(style.shadow)) {
      failures.push(`${label}.style.shadow must be an object`);
    } else {
      if (!Number.isInteger(style.shadow.x) || !Number.isInteger(style.shadow.y)) {
        failures.push(`${label}.style.shadow offsets must be integers`);
      }
      if (!isNonNegativeInteger(style.shadow.blur) || !isNonNegativeInteger(style.shadow.spread)) {
        failures.push(`${label}.style.shadow blur and spread must be non-negative integers`);
      }
      if (!hexColor.test(style.shadow.color ?? "")) {
        failures.push(`${label}.style.shadow.color must be a six-digit hex color`);
      }
      if (!isNumberInRange(style.shadow.opacity, Number.EPSILON, 1)) {
        failures.push(`${label}.style.shadow.opacity must be greater than 0 and at most 1`);
      }
    }
  }
  if (style.modulate !== undefined) {
    if (!isRecord(style.modulate)) {
      failures.push(`${label}.style.modulate must be an object`);
    } else if (
      !isNumberInRange(style.modulate.brightness, 0.5, 1.5) ||
      !isNumberInRange(style.modulate.saturation, 0, 2)
    ) {
      failures.push(`${label}.style.modulate values fall outside the supported range`);
    }
  }
};

const validateLayer = (layer, asset, index, sourceIds, failures) => {
  const label = `${asset.id}.layers[${index}]`;
  if (!isRecord(layer)) {
    failures.push(`${label} must be an object`);
    return;
  }
  if (!sourceIds.has(layer.source))
    failures.push(`${label} references unknown source ${layer.source}`);
  if (![layer.x, layer.y].every(isNonNegativeInteger)) {
    failures.push(`${label} x and y must be non-negative integers`);
  }
  if (![layer.width, layer.height].every(isPositiveInteger)) {
    failures.push(`${label} width and height must be positive integers`);
  }
  if (layer.x + layer.width > asset.canvas.width || layer.y + layer.height > asset.canvas.height) {
    failures.push(
      `${label} extends beyond the ${asset.canvas.width}x${asset.canvas.height} canvas`,
    );
  }
  if (!fits.has(layer.fit)) failures.push(`${label}.fit is not supported`);
  if (!positions.has(layer.position)) failures.push(`${label}.position is not supported`);
  if (layer.crop !== undefined) {
    if (!isRecord(layer.crop)) {
      failures.push(`${label}.crop must be an object`);
    } else if (
      ![layer.crop.left, layer.crop.top].every(isNonNegativeInteger) ||
      ![layer.crop.width, layer.crop.height].every(isPositiveInteger)
    ) {
      failures.push(`${label}.crop must contain non-negative offsets and positive dimensions`);
    }
  }
  validateStyle(layer.style, label, failures);
};

const validateManifest = (manifest, rawManifest) => {
  const failures = [];
  if (!isRecord(manifest)) return ["Manifest root must be an object"];
  if (manifest.version !== 1) failures.push("Manifest version must be 1");
  if (!isSafeRelativePath(manifest.sourceDirectory)) {
    failures.push("sourceDirectory must be a safe relative path");
  }
  if (!isSafeRelativePath(manifest.outputDirectory)) {
    failures.push("outputDirectory must be a safe relative path");
  }
  if (rawManifest.includes("\u2014")) failures.push("Manifest contains an em dash");

  const sources = isRecord(manifest.sources) ? manifest.sources : {};
  const sourceIds = new Set(Object.keys(sources));
  for (const sourceId of expectedSources) {
    if (!sourceIds.has(sourceId)) failures.push(`Required source slot ${sourceId} is missing`);
  }
  for (const [sourceId, source] of Object.entries(sources)) {
    const label = `sources.${sourceId}`;
    if (!isRecord(source)) {
      failures.push(`${label} must be an object`);
      continue;
    }
    if (
      !isSafeRelativePath(source.file) ||
      !imageExtensions.has(extname(source.file).toLowerCase())
    ) {
      failures.push(`${label}.file must be a supported relative image path`);
    }
    if (typeof source.description !== "string" || source.description.trim().length === 0) {
      failures.push(`${label}.description is required`);
    }
    if (!isRecord(source.capture) || !isRecord(source.capture.viewport)) {
      failures.push(`${label}.capture must describe a route, viewport, and state`);
    } else {
      if (typeof source.capture.route !== "string" || source.capture.route.trim().length === 0) {
        failures.push(`${label}.capture.route is required`);
      }
      if (typeof source.capture.state !== "string" || source.capture.state.trim().length === 0) {
        failures.push(`${label}.capture.state is required`);
      }
      if (
        ![source.capture.viewport.width, source.capture.viewport.height].every(isPositiveInteger)
      ) {
        failures.push(`${label}.capture.viewport must contain positive integer dimensions`);
      }
    }
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const assetIds = new Set();
  const outputNames = new Set();
  for (const asset of assets) {
    if (!isRecord(asset) || typeof asset.id !== "string") {
      failures.push("Every asset needs a string id");
      continue;
    }
    if (assetIds.has(asset.id)) failures.push(`Duplicate asset id ${asset.id}`);
    assetIds.add(asset.id);
    if (
      !isRecord(asset.canvas) ||
      ![asset.canvas.width, asset.canvas.height].every(isPositiveInteger)
    ) {
      failures.push(`${asset.id}.canvas must contain positive integer dimensions`);
      continue;
    }
    if (!hexColor.test(asset.canvas.background ?? "")) {
      failures.push(`${asset.id}.canvas.background must be a six-digit hex color`);
    }
    if (!isSafeRelativePath(asset.output))
      failures.push(`${asset.id}.output must be a safe relative path`);
    if (outputNames.has(asset.output)) failures.push(`Duplicate output path ${asset.output}`);
    outputNames.add(asset.output);
    if (!isRecord(asset.format) || !new Set(["jpeg", "png"]).has(asset.format.type)) {
      failures.push(`${asset.id}.format must be jpeg or png`);
    } else if (asset.format.type === "jpeg" && !isNumberInRange(asset.format.quality, 1, 100)) {
      failures.push(`${asset.id}.format.quality must be between 1 and 100`);
    } else if (
      asset.format.type === "png" &&
      !isNumberInRange(asset.format.compressionLevel, 0, 9)
    ) {
      failures.push(`${asset.id}.format.compressionLevel must be between 0 and 9`);
    }
    const expectedExtension =
      asset.format?.type === "jpeg" ? new Set([".jpg", ".jpeg"]) : new Set([".png"]);
    if (!expectedExtension.has(extname(asset.output ?? "").toLowerCase())) {
      failures.push(`${asset.id}.output extension does not match its format`);
    }
    if (!isPositiveInteger(asset.maxBytes)) failures.push(`${asset.id}.maxBytes must be positive`);
    if (!Array.isArray(asset.layers) || asset.layers.length === 0) {
      failures.push(`${asset.id}.layers must contain at least one source layer`);
    } else {
      asset.layers.forEach((layer, index) =>
        validateLayer(layer, asset, index, sourceIds, failures),
      );
    }
    validateEditorial(asset.editorial, asset.canvas, asset.id, failures);
  }

  for (const [assetId, [width, height, output]] of expectedAssets) {
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      failures.push(`Required asset ${assetId} is missing`);
    } else if (
      asset.canvas.width !== width ||
      asset.canvas.height !== height ||
      asset.output !== output
    ) {
      failures.push(`${assetId} must render ${output} at ${width}x${height}`);
    }
  }
  return failures;
};

export const loadManifest = async (manifestPath) => {
  const absoluteManifestPath = resolve(manifestPath);
  const { manifest, rawManifest } = await readManifestTree(absoluteManifestPath);
  const failures = validateManifest(manifest, rawManifest);
  if (failures.length > 0) throw new Error(`Invalid media manifest:\n${formatFailures(failures)}`);
  const rootDirectory = dirname(absoluteManifestPath);
  const pathFailures = [];
  const sourceDirectory = resolveContained(
    rootDirectory,
    manifest.sourceDirectory,
    "sourceDirectory",
    pathFailures,
  );
  const outputDirectory = resolveContained(
    rootDirectory,
    manifest.outputDirectory,
    "outputDirectory",
    pathFailures,
  );
  if (pathFailures.length > 0) throw new Error(formatFailures(pathFailures));
  return { absoluteManifestPath, manifest, outputDirectory, sourceDirectory };
};

export const selectAssets = (manifest, only) => {
  if (only.length === 0) return manifest.assets;
  const requested = new Set(only);
  const selected = manifest.assets.filter((asset) => requested.has(asset.id));
  const missing = [...requested].filter((id) => !selected.some((asset) => asset.id === id));
  if (missing.length > 0)
    throw new Error(`Unknown asset id${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  return selected;
};

const sourceIdsFor = (assets) =>
  new Set(assets.flatMap((asset) => asset.layers.map((layer) => layer.source)));

export const inspectSources = async ({ assets, manifest, sourceDirectory }) => {
  const failures = [];
  const metadata = new Map();
  for (const sourceId of sourceIdsFor(assets)) {
    const source = manifest.sources[sourceId];
    const sourcePath = resolveContained(
      sourceDirectory,
      source.file,
      `sources.${sourceId}.file`,
      failures,
    );
    try {
      await access(sourcePath);
      const imageMetadata = await sharp(sourcePath, { failOn: "warning" }).metadata();
      if (!imageMetadata.width || !imageMetadata.height || !imageMetadata.format) {
        failures.push(`${sourceId}: ${sourcePath} is not a readable image`);
      } else {
        metadata.set(sourceId, { ...imageMetadata, path: sourcePath });
        if (
          imageMetadata.width !== source.capture.viewport.width ||
          imageMetadata.height !== source.capture.viewport.height
        ) {
          failures.push(
            `${sourceId}: expected ${source.capture.viewport.width}x${source.capture.viewport.height}, got ${imageMetadata.width}x${imageMetadata.height}`,
          );
        }
      }
    } catch {
      const capture = source.capture;
      failures.push(
        `${sourceId}: missing ${sourcePath}\n  Capture ${capture.route} at ${capture.viewport.width}x${capture.viewport.height}. ${capture.state}`,
      );
    }
  }
  for (const asset of assets) {
    asset.layers.forEach((layer, index) => {
      if (!layer.crop || !metadata.has(layer.source)) return;
      const source = metadata.get(layer.source);
      if (
        layer.crop.left + layer.crop.width > source.width ||
        layer.crop.top + layer.crop.height > source.height
      ) {
        failures.push(`${asset.id}.layers[${index}].crop exceeds ${source.width}x${source.height}`);
      }
    });
  }
  if (failures.length > 0)
    throw new Error(`Source capture check failed:\n${formatFailures(failures)}`);
  return metadata;
};

const roundedMask = (width, height, radius, opacity) =>
  Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff" fill-opacity="${opacity}"/></svg>`,
  );

const shadowSvg = (canvas, layer) => {
  const shadow = layer.style.shadow;
  const spread = shadow.spread;
  const x = layer.x + shadow.x - spread;
  const y = layer.y + shadow.y - spread;
  const width = layer.width + spread * 2;
  const height = layer.height + spread * 2;
  const radius = (layer.style.borderRadius ?? 0) + spread;
  return Buffer.from(
    `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${shadow.blur}"/></filter></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${shadow.color}" fill-opacity="${shadow.opacity}" filter="url(#s)"/></svg>`,
  );
};

const borderSvg = (canvas, layer) => {
  const border = layer.style.border;
  const inset = border.width / 2;
  const radius = Math.max(0, (layer.style.borderRadius ?? 0) - inset);
  return Buffer.from(
    `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${layer.x + inset}" y="${layer.y + inset}" width="${layer.width - border.width}" height="${layer.height - border.width}" rx="${radius}" fill="none" stroke="${border.color}" stroke-opacity="${border.opacity}" stroke-width="${border.width}"/></svg>`,
  );
};

const renderLayer = async (layer, sourcePath) => {
  let pipeline = sharp(sourcePath, { failOn: "warning" });
  if (layer.crop) pipeline = pipeline.extract(layer.crop);
  pipeline = pipeline.resize({
    width: layer.width,
    height: layer.height,
    fit: layer.fit,
    position: layer.position,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (layer.style?.modulate) pipeline = pipeline.modulate(layer.style.modulate);
  let buffer = await pipeline.ensureAlpha().png().toBuffer();
  const radius = layer.style?.borderRadius ?? 0;
  const opacity = layer.style?.opacity ?? 1;
  if (radius > 0 || opacity < 1) {
    buffer = await sharp(buffer)
      .composite([
        { input: roundedMask(layer.width, layer.height, radius, opacity), blend: "dest-in" },
      ])
      .png()
      .toBuffer();
  }
  return buffer;
};

export const renderAsset = async ({ asset, outputDirectory, sourceMetadata }) => {
  const composites = [];
  for (const layer of asset.layers) {
    if (layer.style?.shadow)
      composites.push({ input: shadowSvg(asset.canvas, layer), left: 0, top: 0 });
    const image = await renderLayer(layer, sourceMetadata.get(layer.source).path);
    composites.push({ input: image, left: layer.x, top: layer.y });
    if (layer.style?.border)
      composites.push({ input: borderSvg(asset.canvas, layer), left: 0, top: 0 });
  }
  const editorial = renderEditorial(asset.canvas, asset.editorial);
  if (editorial) composites.push({ input: editorial, left: 0, top: 0 });

  const outputPath = resolve(outputDirectory, asset.output);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  let output = sharp({
    create: {
      width: asset.canvas.width,
      height: asset.canvas.height,
      channels: 4,
      background: asset.canvas.background,
    },
  }).composite(composites);
  output =
    asset.format.type === "jpeg"
      ? output.jpeg({ quality: asset.format.quality, chromaSubsampling: "4:4:4" })
      : output.png({ compressionLevel: asset.format.compressionLevel, adaptiveFiltering: true });
  await output.toFile(temporaryPath);
  await rename(temporaryPath, outputPath);
  return outputPath;
};

export const inspectOutputs = async ({ assets, outputDirectory }) => {
  const failures = [];
  for (const asset of assets) {
    const outputPath = resolveContained(
      outputDirectory,
      asset.output,
      `${asset.id}.output`,
      failures,
    );
    try {
      const [file, metadata] = await Promise.all([
        stat(outputPath),
        sharp(outputPath, { failOn: "warning" }).metadata(),
      ]);
      if (metadata.width !== asset.canvas.width || metadata.height !== asset.canvas.height) {
        failures.push(
          `${asset.id}: expected ${asset.canvas.width}x${asset.canvas.height}, got ${metadata.width}x${metadata.height}`,
        );
      }
      if (metadata.format !== asset.format.type) {
        failures.push(
          `${asset.id}: expected ${asset.format.type}, got ${metadata.format ?? "unknown"}`,
        );
      }
      if (file.size > asset.maxBytes) {
        failures.push(`${asset.id}: ${file.size} bytes exceeds the ${asset.maxBytes} byte limit`);
      }
    } catch {
      failures.push(
        `${asset.id}: missing output ${outputPath}. Run the render script after capturing sources.`,
      );
    }
  }
  if (failures.length > 0) throw new Error(`Output check failed:\n${formatFailures(failures)}`);
};

export const formatFailures = (failures) => failures.map((failure) => `- ${failure}`).join("\n");

export const parseArguments = (argv, { allowManifestOnly = false } = {}) => {
  const result = { manifestOnly: false, manifestPath: defaultManifestPath, only: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") {
      const value = argv[index + 1];
      if (!value) throw new Error("--manifest requires a path");
      result.manifestPath = resolve(value);
      index += 1;
    } else if (argument === "--only") {
      const value = argv[index + 1];
      if (!value) throw new Error("--only requires a comma-separated asset id list");
      result.only = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      index += 1;
    } else if (argument === "--manifest-only" && allowManifestOnly) {
      result.manifestOnly = true;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  return result;
};
