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

export const hostedReturnPath = (returnPath: string) => {
  const localPath = isSafeReturnPath(returnPath) ? returnPath : "/board";
  const url = new URL(localPath, "https://clear.invalid");
  url.searchParams.set("hosted", "true");
  return `${url.pathname}${url.search}${url.hash}`;
};

export const signInHref = (returnPath: string) => {
  const search = new URLSearchParams({
    returnPath: hostedReturnPath(returnPath),
  });
  return `${signInPath}?${search}`;
};
