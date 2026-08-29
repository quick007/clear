const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

const hash32 = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const avalanche = (value: number) => {
  let output = value >>> 0;
  output ^= output >>> 16;
  output = Math.imul(output, 0x7feb352d);
  output ^= output >>> 15;
  output = Math.imul(output, 0x846ca68b);
  output ^= output >>> 16;
  return output >>> 0;
};

export const sample = (seed: string, bucket: number, channel: string, index = 0) => {
  const input = `${seed}:${bucket}:${channel}:${index}`;
  return avalanche(hash32(input)) / UINT32_MAX_PLUS_ONE;
};

export const integer = (
  seed: string,
  bucket: number,
  channel: string,
  minimum: number,
  maximum: number,
  index = 0,
) => {
  const width = maximum - minimum + 1;
  return minimum + Math.floor(sample(seed, bucket, channel, index) * width);
};

export const jitter = (seed: string, bucket: number, channel: string, spread: number) =>
  1 + (sample(seed, bucket, channel) * 2 - 1) * spread;

export const deterministicHex = (
  seed: string,
  bucket: number,
  channel: string,
  length: number,
  index = 0,
) => {
  let output = "";
  let block = 0;
  while (output.length < length) {
    const value = avalanche(hash32(`${seed}:${bucket}:${channel}:${index}:${block}`));
    output += value.toString(16).padStart(8, "0");
    block += 1;
  }
  return output.slice(0, length);
};
