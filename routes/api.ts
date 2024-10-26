import { Router, RouterContext } from "oak";
import pool from "../db/client.ts";
import { getArtist, getCollabs } from "./data.ts";

interface Node {
  id: string | number;
  label: string;
  color: string;
}

interface Edge {
  from: string | number;
  to: string | number;
}

export const router = new Router();

type ArtistCollabsContext = RouterContext<"/artist/:gid/collabs", { gid: string }>;

router.get("/artist/:gid/collabs", async (ctx: ArtistCollabsContext) => {
  const { gid } = ctx.params;

  const client = await pool.connect();
  const artist = await getArtist(client, gid);
  const collabs = await getCollabs(client, artist.gid);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: artist.gid,
    label: artist.name,
    color: "#f66",
  });

  collabs.forEach((collab) => {
    // Track node
    nodes.push({
      id: collab.trackGid,
      label: collab.trackName,
      color: "#6f6",
    });

    // Collaborating artist node
    nodes.push({
      id: collab.artistGid,
      label: collab.artistName,
      color: "#f66",
    });

    edges.push({
      from: collab.trackGid,
      to: collab.artistGid,
    });
  });

  ctx.response.body = {
    nodes,
    edges,
  };
});
