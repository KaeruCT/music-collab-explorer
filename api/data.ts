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
        SELECT id, gid, name, comment, last_updated,
               similarity(immutable_unaccent(LOWER(name)), immutable_unaccent($1)) AS similarity_score
        FROM artist
        WHERE immutable_unaccent(LOWER(name)) % immutable_unaccent($1) -- Trigram fuzzy match
           OR LOWER(name) ILIKE '%' || $1 || '%'
    ),
    filtered_acn AS (
        SELECT artist, STRING_AGG(name, ', ') AS credit_names
        FROM artist_credit_name
        WHERE immutable_unaccent(LOWER(name)) % immutable_unaccent($1)
           OR LOWER(name) ILIKE '%' || $1 || '%'
        GROUP BY artist
    )
    SELECT *
    FROM (
        SELECT a.id, a.gid, a.name, a.comment, a.last_updated,
            COALESCE(acn.credit_names, '') AS credit_names,
            a.similarity_score,
            CASE 
                WHEN immutable_unaccent(LOWER(a.name)) = immutable_unaccent($1) THEN 1
                WHEN acn.credit_names IS NOT NULL AND immutable_unaccent(LOWER(acn.credit_names)) % immutable_unaccent($1) THEN 2
                WHEN immutable_unaccent(LOWER(a.name)) % immutable_unaccent($1) THEN 3
                ELSE 4
            END AS relevance
        FROM filtered_artist a
        LEFT JOIN filtered_acn acn ON acn.artist = a.id
        GROUP BY a.id, a.gid, a.name, a.comment, a.last_updated, a.similarity_score, acn.credit_names
    ) AS grouped_artists
    ORDER BY relevance, similarity_score DESC, LENGTH(name) ASC, last_updated DESC
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
    WITH track_collaborations AS (
      SELECT 
        a2.id AS artist_id,
        a2.gid AS artist_gid,
        a2.name AS artist_name,
        a2.comment AS artist_comment,
        t.id AS track_id,
        t.gid AS track_gid,
        t.name AS track_name,
        COUNT(DISTINCT acn2.artist) AS collaborator_count
      FROM 
        artist a
      RIGHT JOIN 
        artist_credit_name acn ON acn.artist = a.id
      RIGHT JOIN 
        artist_credit ac ON acn.artist_credit = ac.id
      RIGHT JOIN 
        artist_credit_name acn2 ON acn2.artist_credit = ac.id AND acn2.artist <> a.id
      RIGHT JOIN 
        artist a2 ON a2.id = acn2.artist
      RIGHT JOIN 
        track t ON t.artist_credit = ac.id
      WHERE 
        a.gid = $1::uuid
      GROUP BY 
        a2.id, a2.gid, a2.name, a2.comment, t.id, t.gid, t.name
    )
    SELECT 
      artist_id, 
      artist_gid, 
      artist_name, 
      artist_comment, 
      track_id, 
      track_gid, 
      track_name
    FROM (
      SELECT 
        artist_id, 
        artist_gid, 
        artist_name, 
        artist_comment, 
        track_id, 
        track_gid, 
        track_name,
        ROW_NUMBER() OVER (PARTITION BY artist_gid, track_name ORDER BY collaborator_count DESC) AS row_num
      FROM 
        track_collaborations
    ) AS ranked_tracks
    WHERE 
      row_num = 1
    ORDER BY 
      track_name, artist_name;
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
  return res.rows.filter(row => {
    // there are some weird tracks with long-ass names
    // filter here because in the query it might affect performance (?)
    return row.track_name.length <= 50;
  }).map(row => ({
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

