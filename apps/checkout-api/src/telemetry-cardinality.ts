const userBuckets = 8_192;

const hash = (value: string) => {
  let output = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 0x01000193);
  }

  output ^= output >>> 16;
  output = Math.imul(output, 0x85ebca6b);
  output ^= output >>> 13;
  output = Math.imul(output, 0xc2b2ae35);
  output ^= output >>> 16;
  return output >>> 0;
};

export const metricUserId = (userId: string) =>
  `user-bucket-${String(hash(userId) % userBuckets).padStart(4, "0")}`;

export const maximumUserMetricCardinality = userBuckets;
