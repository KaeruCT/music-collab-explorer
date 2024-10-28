import { PoolClient } from "postgres";

export interface Artist {
  id: number;
  gid: string;
  name: string;
  comment?: string;
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
    WITH filtered_artist AS (
      SELECT id, gid, name, comment, last_updated
      FROM artist
      WHERE LOWER(name) LIKE '%' || LOWER($1) || '%'
    ),
    filtered_acn AS (
      SELECT artist, name
      FROM artist_credit_name
      WHERE LOWER(name) LIKE '%' || LOWER($1) || '%'
    )

    SELECT *
    FROM (
      SELECT a.id, a.gid, a.name, a.comment, a.last_updated,
        CASE 
          WHEN LOWER(a.name) = LOWER($1) THEN 1
          WHEN LOWER(acn.name) = LOWER($1) THEN 2
          WHEN LOWER(a.name) LIKE '%' || LOWER($1) || '%' THEN 3
          WHEN LOWER(acn.name) LIKE '%' || LOWER($1) || '%' THEN 4
          ELSE 5
        END AS relevance
      FROM filtered_artist a
      LEFT JOIN filtered_acn acn ON acn.artist = a.id
      GROUP BY a.id, a.gid, a.name, a.comment, a.last_updated, relevance
    ) AS grouped_artists
    ORDER BY relevance, LENGTH(name) ASC, last_updated DESC
    LIMIT 100;
    `,
    [query]
  );

  return result.rows;
}

export async function getArtist(client: PoolClient, artistGid: string): Promise<Artist> {
  const q = `
    SELECT id, gid, name, comment
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
    comment: row.comment,
  };
}

export async function getCollabs(client: PoolClient, gid: string): Promise<ArtistCollab[]> {
  const q = `
    SELECT artist_id, artist_gid, artist_name, artist_comment, track_id, track_gid, track_name
    FROM (
      SELECT 
        a2.id AS artist_id,
        a2.gid AS artist_gid,
        a2.name AS artist_name,
        a2.comment AS artist_comment,
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
    artist_comment?: string;
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
      comment: row.artist_comment,
    },
    track: {
      id: row.track_id,
      gid: row.track_gid,
      name: row.track_name,
    }
  }));
}

