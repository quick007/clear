export interface CheckoutAttempt {
  readonly amountCents: number;
  readonly itemCount: number;
  readonly requestId: string;
}

export interface CheckoutLock {
  current: boolean;
}

export const claimCheckout = (lock: CheckoutLock) => {
  if (lock.current) return false;
  lock.current = true;
  return true;
};

export const releaseCheckout = (lock: CheckoutLock) => {
  lock.current = false;
};

export const nextCheckoutAttempt = (
  current: CheckoutAttempt | null,
  order: Omit<CheckoutAttempt, "requestId">,
  createRequestId: () => string = () => crypto.randomUUID(),
) =>
  current?.amountCents === order.amountCents && current.itemCount === order.itemCount
    ? current
    : { ...order, requestId: createRequestId() };
