export const signInPath = "/sign-in";

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

export const isSafeReturnPath = (value: string) =>
  value.length >= 1 &&
  value.length <= 512 &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !hasControlCharacter(value);

export const signInHref = (returnPath: string) => {
  const search = new URLSearchParams({
    returnPath: isSafeReturnPath(returnPath) ? returnPath : "/board",
  });
  return `${signInPath}?${search}`;
};
