import { Router, RouterContext } from "oak";
import pool from "../db/client.ts";
import { Artist, getArtist, getCollabs, searchArtists } from "./data.ts";

interface Node {
  id: string | number;
  label: string;
  color: string;
}

interface Edge {
  from: string | number;
  to: string | number;
  value: number;
  tracks: Track[];
}

export const router = new Router();

type ArtistSearchContext = RouterContext<"/artists", { q?: string }>;

router.get("/artists", async (ctx: ArtistSearchContext) => {
  const query = ctx.request.url.searchParams.get("q") || "";

  if (!query) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Query parameter 'q' is required." };
    return;
  }

  const client = await pool.connect();
  try {
    const artists = await searchArtists(client, query);
    ctx.response.body = artists;
  } finally {
    client.release();
  }
});

function generateColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;

  return `hsl(${hue}, 70%, 50%)`;
}

type Track = { gid: string; name: string };
type ArtistCollabsContext = RouterContext<"/artists/:gid/collabs", { gid: string }>;
router.get("/artists/:gid/collabs", async (ctx: ArtistCollabsContext) => {
  const { gid } = ctx.params;
  const artistIds = new Set<string>();

  const edgesMap = new Map<string, { count: number; tracks: Track[] }>();

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
          color: generateColor(artist.gid),
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
      const [from, to] = key.split("|");
      edges.push({
        from,
        to,
        value: data.count,
        tracks: data.tracks,
      });
    });

    ctx.response.body = {
      nodes,
      edges,
    };
  } finally {
    client.release();
  }
});

