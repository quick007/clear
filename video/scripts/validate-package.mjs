import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const videoDirectory = resolve(scriptDirectory, "..");
const timeline = JSON.parse(await readFile(resolve(videoDirectory, "timeline.json"), "utf8"));
const failures = [];

if (timeline.durationSeconds >= 180) {
  failures.push(`Timeline is ${timeline.durationSeconds}s, submission must stay under 180s`);
}

timeline.shots.forEach((shot, index) => {
  const previous = timeline.shots[index - 1];
  if (shot.end <= shot.start) failures.push(`${shot.id} has a non-positive duration`);
  if (!shot.caption.trim()) failures.push(`${shot.id} has no caption`);
  if (!shot.narration.trim()) failures.push(`${shot.id} has no narration`);
  if (previous && shot.start !== previous.end) {
    failures.push(`${previous.id} and ${shot.id} leave a gap or overlap`);
  }
});

const lastShot = timeline.shots.at(-1);
if (!lastShot || lastShot.end !== timeline.durationSeconds) {
  failures.push("Final shot does not end at the declared duration");
}

const packagePaths = [
  resolve(videoDirectory, "README.md"),
  resolve(videoDirectory, "timeline.json"),
  resolve(videoDirectory, "../docs/video-runbook.md"),
  resolve(videoDirectory, "../docs/video-shot-list.md"),
];

for (const path of packagePaths) {
  const contents = await readFile(path, "utf8");
  if (contents.includes("\u2014")) failures.push(`${path} contains an em dash`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Video package is valid at ${timeline.durationSeconds}s`);
}
