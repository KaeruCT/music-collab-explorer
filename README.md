## dev run
```sh
deno task dev
```

## build
```sh
deno task build
```

## run
```sh
deno task start
```
## populate database

1. Download MusicBrainz Database dump and import locally
```sh
cd setup/
./init_db.sh

1. (Optional) Remove superuser from musicbrainz user
```sql
ALTER USER musicbrainz WITH NOSUPERUSER;
```