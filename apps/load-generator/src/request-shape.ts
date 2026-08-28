import { CheckoutRequest } from "./contracts.js";

const hash = (input: string) => {
  let value = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }
  return value >>> 0;
};

export const requestFor = (index: number, seed: string, uniqueUsers: number): CheckoutRequest => {
  const userNumber = index % uniqueUsers;
  const requestHash = hash(`${seed}:${index}`);
  return CheckoutRequest.make({
    amountCents: 1_500 + (requestHash % 18_500),
    itemCount: 1 + (requestHash % 4),
    requestId: `${seed}-${index.toString().padStart(8, "0")}`,
    userId: `user-${userNumber.toString().padStart(4, "0")}`,
  });
};
