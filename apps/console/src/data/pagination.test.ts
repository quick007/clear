import { describe, expect, it } from "vite-plus/test";

import { nextPageCursor, uniquePageItems } from "./pagination";

describe("uniquePageItems", () => {
  it("keeps page order while removing cursor-boundary duplicates", () => {
    const pages = [
      { items: [{ id: "newest" }, { id: "boundary" }] },
      { items: [{ id: "boundary" }, { id: "oldest" }] },
    ];

    expect(
      uniquePageItems(
        pages,
        (page) => page.items,
        (item) => item.id,
      ),
    ).toEqual([{ id: "newest" }, { id: "boundary" }, { id: "oldest" }]);
  });

  it("does not mutate the source pages", () => {
    const pages = [{ items: [{ id: "a" }] }, { items: [{ id: "b" }] }];

    uniquePageItems(
      pages,
      (page) => page.items,
      (item) => item.id,
    );

    expect(pages).toEqual([{ items: [{ id: "a" }] }, { items: [{ id: "b" }] }]);
  });

  it("preserves repeated records returned within one page", () => {
    const repeated = { id: "same-page" };

    expect(
      uniquePageItems(
        [{ items: [repeated, repeated] }],
        (page) => page.items,
        (item) => item.id,
      ),
    ).toEqual([repeated, repeated]);
  });
});

describe("nextPageCursor", () => {
  it("continues only when the API reports another page and provides its cursor", () => {
    expect(nextPageCursor({ hasMore: true, nextCursor: "older" })).toBe("older");
    expect(nextPageCursor({ hasMore: false, nextCursor: "ignored" })).toBeUndefined();
    expect(nextPageCursor({ hasMore: true, nextCursor: null })).toBeUndefined();
  });
});
