# steps to fill postgres database

1. Download https://musicbrainz.org/doc/MusicBrainz_Database/Download#mbdump.tar.bz2 and place in `setup/`
2. Create database locally
```sql
CREATE USER musicbrainz WITH PASSWORD 'musicbrainz';
CREATE DATABASE musicbrainz;
ALTER DATABASE musicbrainz OWNER TO musicbrainz;
ALTER USER musicbrainz WITH SUPERUSER; -- or GRANT rds_superuser TO musicbrainz; in AWS RDS
GRANT ALL PRIVILEGES ON DATABASE musicbrainz TO musicbrainz;
GRANT USAGE ON SCHEMA public TO musicbrainz;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO musicbrainz;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO musicbrainz;
```
3. Init:
```sh
cd setup/
./init_db.sh
```
4. (Optional) Remove superuser from musicbrainz user
```sql
ALTER USER musicbrainz WITH NOSUPERUSER;
```

# todos
- change each artist in the artist list to have a colored circle the same color as the result (the payload has a color as well for each artist). the node type is:
  - export interface Node {
    id: string | number;
    label: string;
    color: string;
  }
- click on artist in selected artists list: should scroll to it in the visualization
- update track list to group by artist pair (title: artist a + artist b, list: track names)
- change loading indicator to appear on the top right corner of the left sidebar, not blocking anything anymore