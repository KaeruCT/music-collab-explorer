import { PoolClient } from "postgres";

export interface Artist {
  id: number;
  gid: string;
  name: string;
}

export interface Track {
  id: number;
  gid: string;
  name: string;
}

export interface ArtistCollab {
  artist: Artist;
  track: Track;
}

export async function searchArtists(client: PoolClient, query: string): Promise<Artist[]> {
  const result = await client.queryObject<Artist>(
    `
    SELECT *
    FROM (
      SELECT a.id, a.gid, a.name,
        CASE 
          WHEN a.name ILIKE $1 THEN 1
          WHEN acn.name ILIKE $1 THEN 2
          WHEN a.name ILIKE '%' || $1 || '%' THEN 3
          WHEN acn.name ILIKE '%' || $1 || '%' THEN 4
          ELSE 5
        END AS relevance
      FROM artist a
      LEFT JOIN artist_credit_name acn ON acn.artist = a.id
      WHERE a.name ILIKE '%' || $1 || '%' OR acn.name ILIKE '%' || $1 || '%'
      GROUP BY a.id, a.gid, a.name, relevance
    ) AS grouped_artists
    ORDER BY relevance, LENGTH(name) ASC
    LIMIT 100;
    `,
    [query]
  );

  return result.rows;
}

export async function getArtist(client: PoolClient, artistGid: string): Promise<Artist> {
  const q = `
    SELECT id, gid, name
    FROM artist
    WHERE gid = $1::uuid
    LIMIT 1;
  `;

  const res = await client.queryObject<Artist>(q, [artistGid]);

  if (res.rows.length === 0) {
    throw new Error(`Artist not found: ${artistGid}`);
  }

  const row = res.rows[0];
  return {
    id: row.id,
    gid: row.gid,
    name: row.name,
  };
}

export async function getCollabs(client: PoolClient, gid: string): Promise<ArtistCollab[]> {
  const q = `
    SELECT artist_id, artist_gid, artist_name, track_id, track_gid, track_name
    FROM (
      SELECT 
        a2.id AS artist_id,
        a2.gid AS artist_gid,
        a2.name AS artist_name,
        t.id AS track_id,
        t.gid AS track_gid,
        t.name AS track_name,
        ROW_NUMBER() OVER (PARTITION BY t.name ORDER BY t.id) AS row_num
      FROM artist a
      RIGHT JOIN artist_credit_name acn ON acn.artist = a.id
      RIGHT JOIN artist_credit ac ON acn.artist_credit = ac.id
      RIGHT JOIN artist_credit_name acn2 ON acn2.artist_credit = ac.id AND acn2.artist <> a.id
      RIGHT JOIN artist a2 ON a2.id = acn2.artist
      RIGHT JOIN track t ON t.artist_credit = ac.id
      WHERE
        a.gid = $1::uuid
        AND LENGTH(t.name) <= 50 -- there are some weird songs with long-ass names
      GROUP BY a2.id, a2.name, t.id, t.name
    ) AS unique_tracks
    WHERE row_num = 1;
    `;

  type ArtistResult = {
    artist_id: number;
    artist_gid: string;
    artist_name: string;
    track_id: number;
    track_gid: string;
    track_name: string;
  };

  const res = await client.queryObject<ArtistResult>(q, [gid]);
  return res.rows.map(row => ({
    artist: {
      id: row.artist_id,
      gid: row.artist_gid,
      name: row.artist_name,
    },
    track: {
      id: row.track_id,
      gid: row.track_gid,
      name: row.track_name,
    }
  }));
}

