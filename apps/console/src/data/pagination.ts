export const uniquePageItems = <Page, Item>(
  pages: ReadonlyArray<Page>,
  selectItems: (page: Page) => ReadonlyArray<Item>,
  itemKey: (item: Item) => string,
) => {
  const seen = new Set<string>();
  const items: Array<Item> = [];

  for (const page of pages) {
    const pageKeys: Array<string> = [];
    for (const item of selectItems(page)) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      items.push(item);
      pageKeys.push(key);
    }
    for (const key of pageKeys) seen.add(key);
  }

  return items;
};

export const nextPageCursor = <Cursor>({
  hasMore,
  nextCursor,
}: {
  readonly hasMore: boolean;
  readonly nextCursor: Cursor | null;
}) => (hasMore ? (nextCursor ?? undefined) : undefined);
