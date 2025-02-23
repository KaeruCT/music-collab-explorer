# Music Collab Explorer

![Preview screenshot of the app](./music-collab-screenshot.png)

The **Music Collab Explorer** is a web app for discovering collabs between musical artists.

Using data from the excellent [MusicBrainz](https://musicbrainz.org/) project, you can search for any artist and visualize their collabs in a dynamic graph.

## Features
- Search for an artist and view all their collabs.
- Double-click on any artist in the graph to view their collabs.
- All artists who have collabed are connected.
- Click on any graph node or edge to view more information.
  - Clicking a node will list all the collab songs of that artist.
  - Clicking an edge will list all the collab songs between the artists connected by the edge.

## Getting Started

## Prerequisites
- [Deno](https://deno.land/) installed.
- A PostgreSQL database v16.1 or greater (a script is provided to help populate it with a dump from the MusicBrainz database).

## Installation

Clone the repository:
```sh
git clone git@github.com:KaeruCT/music-collab-explorer.git
cd music-collab-explorer
```

Set up env vars:
```sh
cp .env.example .env
```
Modify `.env` as needed to configure database credentials.

## Running the Application
### Development Mode
```sh
deno task dev
```

### Building for Production
```sh
deno task build
```

### Starting the Server
```sh
deno task start
```

# Database Setup
This application requires a local copy of the MusicBrainz database.

1. Navigate to the `setup/` directory:
   ```sh
   cd setup/
   ```
2. Run the database initialization script. The credentials must be edited in the script if they differ.
   ```sh
   ./init_db.sh
   ```
3. (Optional) Remove superuser privileges from the MusicBrainz user:
   ```sql
   ALTER USER musicbrainz WITH NOSUPERUSER;
   ```

# Future Improvements
- Improve artist images by using additional sources, only Wikimedia is used at the moment and it's missing many artists.
- Allow to play tracks within the visualization. Currently, the tracks are only Youtube search links.

# Acknowledgments
- **MusicBrainz** for providing open music metadata. This project would be impossible without them. [Please contribute!](https://musicbrainz.org/doc/How_to_Contribute)
- **vis-network** for the excellente graph visualization.
