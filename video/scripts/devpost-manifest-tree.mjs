import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const parseJson = (path, raw) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${error.message}`);
  }
};

const resolveInclude = (rootDirectory, file) => {
  if (typeof file !== "string" || file.length === 0 || isAbsolute(file)) {
    throw new Error("Every assetFiles entry must be a relative path");
  }
  const normalized = file.replaceAll("\\", "/");
  if (normalized.split("/").includes("..")) {
    throw new Error(`Asset manifest include cannot traverse parent directories: ${file}`);
  }
  const resolved = resolve(rootDirectory, file);
  const relation = relative(rootDirectory, resolved);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Asset manifest include escapes the media directory: ${file}`);
  }
  return resolved;
};

export const readManifestTree = async (absoluteManifestPath) => {
  const rawRoot = await readFile(absoluteManifestPath, "utf8");
  const root = parseJson(absoluteManifestPath, rawRoot);
  if (root.assetFiles === undefined) return { manifest: root, rawManifest: rawRoot };
  if (!Array.isArray(root.assetFiles) || root.assetFiles.length === 0) {
    throw new Error("assetFiles must contain at least one relative manifest path");
  }

  const rootDirectory = dirname(absoluteManifestPath);
  const assets = Array.isArray(root.assets) ? [...root.assets] : [];
  const rawDocuments = [rawRoot];
  for (const file of root.assetFiles) {
    const includedPath = resolveInclude(rootDirectory, file);
    const rawIncluded = await readFile(includedPath, "utf8");
    const included = parseJson(includedPath, rawIncluded);
    if (!Array.isArray(included)) throw new Error(`${includedPath} must contain an asset array`);
    assets.push(...included);
    rawDocuments.push(rawIncluded);
  }

  const { assetFiles: _, ...manifest } = root;
  return { manifest: { ...manifest, assets }, rawManifest: rawDocuments.join("\n") };
};
