export const traceSpanGeometry = (offsetRatio: number, widthRatio: number) => {
  const x = Math.min(100, Math.max(0, offsetRatio * 100));
  const width = Math.min(Math.max(0, widthRatio * 100), 100 - x);
  return { width, x };
};
