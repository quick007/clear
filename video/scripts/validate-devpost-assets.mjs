import {
  inspectOutputs,
  inspectSources,
  loadManifest,
  parseArguments,
  selectAssets,
} from "./devpost-media-lib.mjs";

try {
  const options = parseArguments(process.argv.slice(2), { allowManifestOnly: true });
  const context = await loadManifest(options.manifestPath);
  const assets = selectAssets(context.manifest, options.only);

  if (options.manifestOnly) {
    console.log(`Devpost manifest is valid with ${context.manifest.assets.length} required assets`);
  } else {
    await inspectSources({ ...context, assets });
    await inspectOutputs({ ...context, assets });
    console.log(`Validated ${assets.length} Devpost asset${assets.length === 1 ? "" : "s"}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
