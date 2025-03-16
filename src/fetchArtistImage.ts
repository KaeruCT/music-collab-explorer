export async function fetchArtistImage(artistName: string, artistComment?: string): Promise<string | null> {
  const localStorageKey = `thumb|${artistName}|${artistComment || ''}`;
  const cachedThumbnail = localStorage.getItem(localStorageKey);
  if (cachedThumbnail) {
    return cachedThumbnail;
  }

  let thumbnail = await searchArtistThumbnail(artistName);
  if (!thumbnail && artistComment) {
    thumbnail = await searchArtistThumbnail(`${artistName} ${artistComment}`);
  }

  if (thumbnail) {
    localStorage.setItem(localStorageKey, thumbnail);
  }

  return thumbnail;
}

async function searchArtistThumbnail(searchQuery: string): Promise<string | null> {
  const searchResponse = await fetchWithRandomDelay(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&origin=*`
  );
  const searchData = await searchResponse.json();

  const firstResult = searchData.query?.search?.[0];
  if (!firstResult?.pageid) {
    return null;
  }

  return await fetchThumbnailByPageId(firstResult.pageid);
}

async function fetchThumbnailByPageId(pageId: number): Promise<string | null> {
  const imageResponse = await fetchWithRandomDelay(
    `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=pageimages&format=json&pithumbsize=250&origin=*`
  );
  const imageData = await imageResponse.json();

  return imageData.query.pages[pageId]?.thumbnail?.source || null;
}

async function fetchWithRandomDelay(url: string) {
  const delay = Math.floor(Math.random() * 500) + 250;
  await new Promise(resolve => setTimeout(resolve, delay));
  return fetch(url);
}
