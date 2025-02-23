// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */

// Fetch the artist's image from Wikimedia. Should probably add more sources but it's hard to find a good one.
export async function fetchArtistImage(artistName: string): Promise<string | null> {
  const response = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(artistName)}&prop=pageimages&format=json&pithumbsize=500&origin=*`
  );
  const data = await response.json();

  const pages = data.query.pages;
  const page = Object.values(pages)[0] as any;
  return page.thumbnail?.source || null;
}