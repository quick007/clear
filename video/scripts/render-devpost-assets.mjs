import {
  inspectOutputs,
  inspectSources,
  loadManifest,
  parseArguments,
  renderAsset,
  selectAssets,
} from "./devpost-media-lib.mjs";

try {
  const options = parseArguments(process.argv.slice(2));
  const context = await loadManifest(options.manifestPath);
  const assets = selectAssets(context.manifest, options.only);
  const sourceMetadata = await inspectSources({ ...context, assets });

  for (const asset of assets) {
    const outputPath = await renderAsset({ ...context, asset, sourceMetadata });
    console.log(`Rendered ${asset.id}: ${outputPath}`);
  }

  await inspectOutputs({ ...context, assets });
  console.log(`Validated ${assets.length} rendered Devpost asset${assets.length === 1 ? "" : "s"}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
