export const overviewContextFailure = <E>(overview: {
  readonly data: unknown;
  readonly error: E | null;
}) => overview.error;
