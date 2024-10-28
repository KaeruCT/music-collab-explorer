import { DataSet, Network } from "vis-network/standalone";
import React, { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "../api/router.ts";
import type { Artist } from "../api/data.ts";

type ArtistCollabsResult = {
  nodes: Node[];
  edges: Edge[];
}

type EdgeWithId = Edge & { id: string };

function get(path: string) {
  return fetch(`${path}`);
}

type Visu = {
  network: Network;
  nodes: DataSet<Node>;
  edges: DataSet<EdgeWithId>;
}
let visu: Visu | undefined = undefined;
function initVisu(container: HTMLDivElement): Visu {
  if (visu) {
    return visu;
  }

  const nodes = new DataSet<Node>([]);
  const edges = new DataSet<EdgeWithId>([]);

  const network = new Network(container, { nodes, edges }, {
    interaction: { hideEdgesOnDrag: true },
    nodes: { shape: "dot", size: 16 },
    physics: { forceAtlas2Based: { gravitationalConstant: -26, centralGravity: 0.005, springLength: 230, springConstant: 0.18 }, maxVelocity: 146, solver: "forceAtlas2Based", timestep: 0.35, stabilization: false },
    layout: { improvedLayout: false }
  });
  visu = {
    network,
    nodes,
    edges
  };
  return visu;
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const selectedArtistIds = new Set(selectedArtists.map(artist => artist.gid));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visuRef = useRef<Visu | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    visuRef.current = initVisu(containerRef.current);
    visuRef.current?.network.on("click", handleEdgeClick);

    return () => {
      visuRef.current?.network.off("click");
    };
  }, []);

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery) return;

    setSearching(true);
    try {
      const response = await get(`/api/artists?q=${encodeURIComponent(searchQuery)}`);
      const artists: Artist[] = await response.json();
      setSearchResults(artists);
    } catch (error) {
      console.error("Error fetching search results:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectArtist = async (artist: Artist) => {
    if (selectedArtistIds.has(artist.gid)) return;
    selectedArtistIds.add(artist.gid);
    setSelectedArtists((prev) => [...prev, artist]);
    await addArtistCollabs(artist.gid);
  };

  const addArtistCollabs = async (gid: string) => {
    if (!visuRef.current) return;
    const { nodes, edges } = visuRef.current;
    setLoading(true);
    try {
      const response = await get(`/api/artists/${gid}/collabs`);
      const data: ArtistCollabsResult = await response.json();
      const nodesToAdd = data.nodes.filter(node => !nodes.get(node.id));
      nodes.add(nodesToAdd);
      const edgesToAdd = data.edges.filter(
        edge => edges.get({
          filter: item => item.from === edge.from && item.to === edge.to
        }).length === 0
      );
      edges.add(edgesToAdd as EdgeWithId[]);
    } catch (error) {
      console.error("Error fetching collaboration data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdgeClick = (params: { nodes: Node[], edges: EdgeWithId[] }) => {
    if (!visuRef.current) return;
    const { edges } = visuRef.current;
    if (params.edges.length !== 0) {
      const tracks = params.edges.flatMap(edge => edges.get(edge).tracks.map(track => track.name));
      setTracks(tracks);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div
        className="sidebar"
        style={{ left: 0 }}
      >
        <form id="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search for artist"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit">
            Search
          </button>
        </form>
        <div className="search-results">
          {searching && <div>Searching...</div>}
          {searchResults.map((result) => (
            <div
              key={result.gid}
              onClick={() => handleSelectArtist(result)}
              style={{
                cursor: selectedArtistIds.has(result.gid) ? "not-allowed" : "pointer",
                opacity: selectedArtistIds.has(result.gid) ? 0.5 : 1,
              }}
            >
              {result.name}
            </div>
          ))}
        </div>
        <div className="artist-list">
          {selectedArtists.map((artist) => (
            <div key={artist.gid}>
              {artist.name}
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} style={{ flexGrow: 1, position: "relative", height: "100%" }}></div>

      <div
        className="sidebar"
        style={{ right: 0, display: tracks.length > 0 ? "flex" : "none" }}>
        <h3>Tracks</h3>
        <div style={{ overflow: "auto" }}>
          {tracks.map((track, idx) => <div key={idx}>{track}</div>)}
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10
          }}
        >
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}
