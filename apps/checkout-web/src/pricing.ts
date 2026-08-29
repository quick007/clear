export const UNIT_PRICE_CENTS = 14_800;
export const TAX_RATE = 0.0825;

export const calculateOrder = (quantity: number) => {
  const subtotalCents = UNIT_PRICE_CENTS * quantity;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
};

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
