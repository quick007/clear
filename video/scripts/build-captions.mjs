import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const videoDirectory = resolve(scriptDirectory, "..");
const timelinePath = resolve(videoDirectory, "timeline.json");
const outputPath = resolve(videoDirectory, "captions.srt");

const timestamp = (seconds) => {
  const milliseconds = Math.round(seconds * 1_000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;

  return [hours, minutes, wholeSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":")
    .concat(",", String(remainder).padStart(3, "0"));
};

const timeline = JSON.parse(await readFile(timelinePath, "utf8"));
const splitLongSentence = (sentence) => {
  if (sentence.split(/\s+/).length <= 18 || !sentence.includes(", ")) return [sentence];

  return sentence.split(/(?<=,)\s+/).reduce((segments, clause) => {
    const current = segments.at(-1);
    if (!current || `${current} ${clause}`.split(/\s+/).length > 14) {
      segments.push(clause);
    } else {
      segments[segments.length - 1] = `${current} ${clause}`;
    }
    return segments;
  }, []);
};

const splitNarration = (narration) => narration.split(/(?<=[.!?])\s+/).flatMap(splitLongSentence);

const cues = timeline.shots.flatMap((shot) => {
  const segments = splitNarration(shot.narration);
  const weight = segments.reduce((total, segment) => total + segment.length, 0);
  let cursor = shot.start;

  return segments.map((segment, index) => {
    const end =
      index === segments.length - 1
        ? shot.end
        : cursor + ((shot.end - shot.start) * segment.length) / weight;
    const cue = { end, start: cursor, text: segment };
    cursor = end;
    return cue;
  });
});

const captions = cues
  .map(
    (cue, index) =>
      `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`,
  )
  .join("\n");

await writeFile(outputPath, captions, "utf8");
console.log(`Wrote ${cues.length} captions to ${outputPath}`);
