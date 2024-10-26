import { PoolClient } from "postgres";

interface Artist {
  id: number;
  gid: string;
  name: string;
}

interface ArtistCollab {
  artistGid: string;
  artistId: number;
  artistName: string;
  trackGid: string;
  trackId: number;
  trackName: string;
}

export async function getArtist(client: PoolClient, artistGid: string): Promise<Artist> {
  const q = `
    SELECT id, gid, name
    FROM musicbrainz.artist
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
    SELECT a2.id as artist_id, a2.gid as artist_gid, a2.name as artist_name, t.id as track_id, t.gid as track_gid, t.name as track_name
    FROM musicbrainz.artist a
    RIGHT JOIN musicbrainz.artist_credit_name acn ON acn.artist = a.id
    RIGHT JOIN musicbrainz.artist_credit ac ON acn.artist_credit = ac.id
    RIGHT JOIN musicbrainz.artist_credit_name acn2 ON acn2.artist_credit = ac.id AND acn2.artist <> a.id
    RIGHT JOIN musicbrainz.artist a2 ON a2.id = acn2.artist
    RIGHT JOIN musicbrainz.track t ON t.artist_credit = ac.id
    WHERE a.gid = $1::uuid
    GROUP BY a2.id, a2.name, t.id, t.name`;

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
    artistId: row.artist_id,
    artistGid: row.artist_gid,
    artistName: row.artist_name,
    trackId: row.track_id,
    trackGid: row.track_gid,
    trackName: row.track_name,
  }));
}

