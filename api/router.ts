import { Router, RouterContext } from "@oak/oak";
import { readCache, writeCache } from "./cache.ts";
import { Artist, getArtist, getCollabs, searchArtists } from "./data.ts";
import pool from "./db/client.ts";
import { rateLimit } from "./rateLimit.ts";
export interface Node {
  id: string | number;
  label: string;
}

export interface Edge {
  from: string | number;
  to: string | number;
  value: number;
  tracks: Track[];
}

export const router = new Router();
router.use(rateLimit);

type ArtistSearchContext = RouterContext<"/api/artists", { q?: string }>;

router.get("/api/artists", async (ctx: ArtistSearchContext) => {
  const query = ctx.request.url.searchParams.get("q") || "";

  if (!query) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Query parameter 'q' is required." };
    return;
  }

  const key = `artists_search_${query}`;
  const cachedData = await readCache(key);

  if (cachedData) {
    ctx.response.body = cachedData;
    return;
  }
  const client = await pool.connect();
  try {
    const artists = await searchArtists(client, query);
    await writeCache(key, artists);
    ctx.response.body = artists;
  } finally {
    client.release();
  }
});

type Track = { gid: string; name: string };
type ArtistCollabsContext = RouterContext<"/api/artists/:gid/collabs", { gid: string }>;
router.get("/api/artists/:gid/collabs", async (ctx: ArtistCollabsContext) => {
  const { gid } = ctx.params;
  const artistIds = new Set<string>();

  const edgesMap = new Map<string, { count: number; tracks: Track[] }>();

  const key = `artists_collabs_${gid}`;
  const cachedData = await readCache(key);
  if (cachedData) {
    ctx.response.body = cachedData;
    return;
  }

  const client = await pool.connect();
  try {
    const startArtist = await getArtist(client, gid);
    const collabs = await getCollabs(client, startArtist.gid);
    client.release();

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const addArtist = (artist: Artist) => {
      if (!artistIds.has(artist.gid)) {
        nodes.push({
          id: artist.gid,
          label: artist.name,
        });
        artistIds.add(artist.gid);
      }
    };

    addArtist(startArtist);

    collabs.forEach(({ artist, track }) => {
      addArtist(artist);

      const edgeKey = `${startArtist.gid}|${artist.gid}`;
      if (!edgesMap.has(edgeKey)) {
        edgesMap.set(edgeKey, { count: 0, tracks: [] });
      }

      const edgeData = edgesMap.get(edgeKey)!;
      edgeData.count += 1;
      edgeData.tracks.push({ gid: track.gid, name: track.name });
    });

    edgesMap.forEach((data, key) => {
      const [to, from] = key.split("|");
      edges.push({
        from,
        to,
        value: data.count,
        tracks: data.tracks,
      });
    });

    const response = { nodes, edges };
    await writeCache(key, response);
    ctx.response.body = response;
  } finally {
    client.release();
  }
});

