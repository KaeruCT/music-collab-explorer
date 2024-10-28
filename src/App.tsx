import { DataSet, Network } from "vis-network/standalone";
import React, { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "../api/router.ts";
import type { Artist } from "../api/data.ts";
import { generateColor } from "./colors.ts";
import { fetchArtistImage } from "./img.ts";

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
  if (visu) return visu;

  const nodes = new DataSet<Node>([]);
  const edges = new DataSet<EdgeWithId>([]);

  const network = new Network(container, { nodes, edges }, {
    interaction: { hideEdgesOnDrag: true },
    nodes: { shape: "dot", size: 16 },
    physics: { forceAtlas2Based: { gravitationalConstant: -26, centralGravity: 0.005, springLength: 230, springConstant: 0.18 }, maxVelocity: 146, solver: "forceAtlas2Based", timestep: 0.35, stabilization: false },
    layout: { improvedLayout: false }
  });

  visu = { network, nodes, edges };
  return visu;
}

type CollabTracks = { title: string, tracks: string[] };

export default function App() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<CollabTracks[]>([]);
  const [searching, setSearching] = useState<boolean | undefined>(undefined);

  const selectedArtistIds = new Set(selectedArtists.map(artist => artist.gid));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visuRef = useRef<Visu | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    visuRef.current = initVisu(containerRef.current);
    visuRef.current?.network.on("click", handleEdgeClick);

    return () => {
      visuRef.current?.network.off("click");
    };
  }, []);

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery) {
      setSearchResults([]);
      setSearching(undefined);
      return;
    }

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
      const nodesToAdd = data.nodes.filter(node => !nodes.get(node.id)).map(node => ({
        ...node,
        color: generateColor(String(node.id))
      }));
      nodes.add(nodesToAdd);

      nodesToAdd.forEach((node) => {
        fetchArtistImage(node.label).then((imageUrl) => {
          if (imageUrl) {
            nodes.update({
              id: node.id,
              shape: "circularImage",
              image: imageUrl
            });
          }
        });
      });

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

  const handleEdgeClick = (params: { nodes: string[], edges: string[] }) => {
    if (!visuRef.current) return;
    const { edges } = visuRef.current;
    let artist: Node | null | undefined;
    if (params.nodes.length === 1) {
      artist = visu?.nodes.get(params.nodes[0]);
    }
    if (!artist) {
      setTracks([]);
      return;
    }
    if (params.edges.length !== 0) {
      const groupedTracks = params.edges.map(id => {
        const edge = edges.get(id);
        if (!edge) {
          return;
        }
        const artist1 = visu?.nodes.get(edge.from);
        const artist2 = visu?.nodes.get(edge.to);
        let artistA: Node | null | undefined;
        let artistB: Node | null | undefined;

        if (artist.label === artist1?.label) {
          artistA = artist1;
          artistB = artist2;
        } else {
          artistA = artist2;
          artistB = artist1;
        }
        const title = `${artistA?.label} + ${artistB?.label}`;
        return { title, tracks: edge.tracks.map(track => track.name) };
      }).filter((track): track is CollabTracks => track !== undefined);

      if (groupedTracks) {
        setTracks(groupedTracks as CollabTracks[]);
      }
    }
  };

  const scrollToArtist = (artistId: string | number) => {
    const node = visuRef.current?.nodes.get(artistId);
    if (node) {
      visuRef.current?.network.focus(artistId, { scale: 1.5 });
    }
  };

  const handleRemoveArtist = (artist: Artist) => {
    setSelectedArtists(prev => prev.filter(a => a.gid !== artist.gid));
    if (visuRef.current) {
      const { nodes, edges } = visuRef.current;
      nodes.remove(artist.gid);
      const edgesToRemove = edges.get({
        filter: edge => edge.from === artist.gid || edge.to === artist.gid
      });
      edges.remove(edgesToRemove.map(edge => edge.id));
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div className="sidebar" style={{ left: 0 }}>
        <form id="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search for artist"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button type="submit">Search</button>
        </form>

        <div className="search-results">
          {searching === true && <div>Searching...</div>}
          {searching === false && searchResults.length > 0 && searchResults.map((result) => (
            <div
              key={result.gid}
              onClick={() => handleSelectArtist(result)}
              style={{
                cursor: selectedArtistIds.has(result.gid) ? "not-allowed" : "pointer",
                opacity: selectedArtistIds.has(result.gid) ? 0.6 : 1,
              }}
            >
              {result.name}{result.comment ? ` (${result.comment})` : ""}
            </div>
          ))}
          {searching === false && searchResults.length === 0 && <div>No results</div>}
        </div>

        {selectedArtists.length > 0 && (
          <div className="artist-list">
            {selectedArtists.map((artist) => (
              <div key={artist.gid} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <div className="artist-icon" style={{ backgroundColor: generateColor(artist.gid) }}></div>
                {artist.name}
                <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => handleRemoveArtist(artist)}>✕</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={containerRef} style={{ flexGrow: 1, position: "relative", height: "100%" }}></div>

      <div className="sidebar" style={{ right: 0, display: tracks.length > 0 ? "flex" : "none" }}>
        <div className="track-list">
          {tracks.map((group, idx) => (
            <div key={idx}>
              <h4>{group.title}</h4>
              {group.tracks.map((track, tIdx) => <div key={tIdx}>{track}</div>)}
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div
          style={{
            position: "fixed",
            top: "10px",
            left: "290px",
            zIndex: 10
          }}
        >
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}
