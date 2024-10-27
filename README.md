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