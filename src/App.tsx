/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleEdgeClick = (params: any) => {
    if (!visuRef.current) return;
    const { edges } = visuRef.current;
    if (params.edges.length) {
      const edge = edges.get(params.edges[0]) as any as { tracks: Array<{ name: string }> };
      setTracks(edge.tracks.map(track => track.name));
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: "280px", padding: "10px", background: "#2c3e50", color: "#ecf0f1" }}>
        <form onSubmit={handleSearchSubmit}>
          <input type="text" placeholder="Search for artist" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: "8px", width: "100%", marginBottom: "10px", color: "#ecf0f1", backgroundColor: "#34495e" }} />
          <button type="submit" style={{ padding: "8px 16px", backgroundColor: "#1abc9c", color: "#fff" }}>Search</button>
        </form>
        <div>
          {searching && <div>Searching...</div>}
          {searchResults.map((result) => (
            <div key={result.gid} onClick={() => handleSelectArtist(result)} style={{
              cursor: selectedArtistIds.has(result.gid) ? "not-allowed" : "pointer",
              opacity: selectedArtistIds.has(result.gid) ? 0.5 : 1,
              backgroundColor: "#34495e",
              padding: "8px",
              borderRadius: "4px",
              marginBottom: "5px"
            }}>{result.name}</div>
          ))}
        </div>
        <div style={{ marginTop: "20px" }}>
          {selectedArtists.map(artist => (
            <div key={artist.gid} style={{ padding: "8px", backgroundColor: "#34495e", borderRadius: "4px", marginBottom: "5px" }}>{artist.name}</div>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{ flexGrow: 1, position: "relative" }}></div>
      <div style={{ width: "280px", padding: "10px", background: "#2c3e50", color: "#ecf0f1" }}>
        <h3>Tracks</h3>
        {tracks.length > 0 && tracks.map((track, idx) => <div key={idx}>{track}</div>)}
      </div>
      {loading && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(255, 255, 255, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10
        }}>
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}
