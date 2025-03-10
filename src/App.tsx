import { DataSet, Network } from "vis-network/standalone";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateColor } from "./colors.ts";
import { fetchArtistImage } from "./img.ts";
import { TrackInfo } from "./TrackInfo.tsx";
import Sticky from "./Sticky.tsx";

// TODO: share types? vite will compile files even if only types are imported
interface Artist {
  id: number;
  gid: string;
  name: string;
  comment?: string;
}

interface Track {
  id: number;
  gid: string;
  name: string;
}

interface Node {
  id: string | number;
  label: string;
}

interface Edge {
  from: string | number;
  to: string | number;
  value: number;
  tracks: Track[];
}

type ArtistCollabsResult = {
  nodes: Node[];
  edges: Edge[];
}

type EdgeWithId = Edge & { id: string };

function get(path: string, init: RequestInit = {}) {
  return fetch(`${path}`, init);
}

type Visu = {
  network: Network;
  nodes: DataSet<Node & { shape?: string; image?: string; }>;
  edges: DataSet<EdgeWithId>;
}
let visu: Visu | undefined = undefined;

function initVisu(container: HTMLDivElement): Visu {
  if (visu) return visu;

  const nodes = new DataSet<Node>([]);
  const edges = new DataSet<EdgeWithId>([]);

  const network = new Network(container, { nodes, edges }, {
    interaction: { hideEdgesOnDrag: true },
    nodes: {
      shape: "dot",
      size: 16,
      font: {
        color: "#f0f0f0",
        size: 12,
      }
    },
    physics: {
      forceAtlas2Based: {
        gravitationalConstant: -26,
        centralGravity: 0.005,
        springLength: 230,
        springConstant: 0.18
      },
      maxVelocity: 146,
      solver: "forceAtlas2Based",
      timestep: 0.35,
      stabilization: false
    },
    layout: { improvedLayout: false }
  });

  visu = { network, nodes, edges };
  return visu;
}

type CollabTracks = { artistA: string, artistB: string, tracks: string[] };

type SelectedArtist = Pick<Artist, "gid" | "name">;

export default function App() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<SelectedArtist[]>([]);
  const restoredFromStorage = useRef(false);
  const [initDone, setInitDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<CollabTracks[]>([]);
  const [searching, setSearching] = useState<boolean | undefined>(undefined);
  const searchAbortController = useRef<AbortController | null>(null);

  const selectedArtistIds = useMemo(() => new Set(selectedArtists.map(artist => artist.gid)), [selectedArtists]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visuRef = useRef<Visu | null>(null);

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearching(undefined);
    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery) {
      setSearchResults([]);
      setSearching(undefined);
      return;
    }

    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }
    searchAbortController.current = new AbortController();
    const { signal } = searchAbortController.current;

    setSearching(true);
    try {
      const response = await get(`/api/artists?q=${encodeURIComponent(searchQuery)}`, { signal });
      const artists: Artist[] = await response.json();
      setSearchResults(artists);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error fetching search results:", error);
      }
    } finally {
      if (!signal.aborted) {
        setSearching(false);
      }
    }
  };

  const handleSelectArtist = useCallback(async (artist: Pick<Artist, "gid" | "name">) => {
    setSelectedArtists((prevSelectedArtists) => {
      if (prevSelectedArtists.some((a) => a.gid === artist.gid)) return prevSelectedArtists;
      return [...prevSelectedArtists, artist];
    });
    await addArtistCollabs(artist.gid);
  }, []);

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

  const handleDoubleClick = useCallback((params: { nodes: string[] }) => {
    if (params.nodes.length === 1) {
      const artistNode: Node | undefined | null = visuRef.current?.nodes.get(params.nodes[0]);
      if (artistNode) {
        handleSelectArtist({
          gid: String(artistNode.id),
          name: artistNode.label,
        });
      }
    }
  }, [handleSelectArtist]);

  const handleClick = (params: { nodes: string[], edges: string[] }) => {
    if (!visuRef.current) return;
    const { edges } = visuRef.current;
    const artist = visu?.nodes.get(params.nodes[0]);
    if (params.nodes.length === 0 && params.edges.length === 0) {
      setTracks([]);
      return;
    }

    const groupedTracks = params.edges.map(id => {
      const edge = edges.get(id);
      if (!edge) {
        return;
      }
      const artist1 = visu?.nodes.get(edge.from);
      const artist2 = visu?.nodes.get(edge.to);
      let artistA: Node | null | undefined;
      let artistB: Node | null | undefined;

      if (artist?.label === artist1?.label) {
        artistA = artist1;
        artistB = artist2;
      } else {
        artistA = artist2;
        artistB = artist1;
      }
      return {
        artistA: artistA?.label ?? "",
        artistB: artistB?.label ?? "",
        tracks: edge.tracks.map(track => track.name)
      };
    }).filter((track): track is CollabTracks => track !== undefined);

    if (groupedTracks) {
      setTracks(groupedTracks as CollabTracks[]);
    }
  };

  const scrollToArtist = (artistId: string | number) => {
    const node = visuRef.current?.nodes.get(artistId);
    if (node) {
      visuRef.current?.network.focus(artistId, { scale: 1.5, animation: true });
    }
  };

  const handleRemoveArtist = (artist: Pick<Artist, "name" | "gid">) => {
    setSelectedArtists((prev) => prev.filter((a) => a.gid !== artist.gid));

    if (visuRef.current) {
      const { nodes, edges } = visuRef.current;

      nodes.remove(artist.gid);

      // Find and remove all edges connected to the artist
      const edgesToRemove = edges.get({
        filter: (edge) => edge.from === artist.gid || edge.to === artist.gid,
      });
      edges.remove(edgesToRemove.map((edge) => edge.id));

      // Check for nodes with no remaining edges and remove them
      const disconnectedNodes = nodes.get().filter((node) => {
        const connectedEdges = edges.get({
          filter: (edge) => edge.from === node.id || edge.to === node.id,
        });
        return connectedEdges.length === 0;
      });
      nodes.remove(disconnectedNodes.map((node) => node.id));
    }
  };


  useEffect(() => {
    if (!initDone) return;
    localStorage.setItem("selectedArtists", JSON.stringify(selectedArtists));
  }, [initDone, selectedArtists, selectedArtists.length]);

  useEffect(() => {
    if (!containerRef.current) return;
    visuRef.current = initVisu(containerRef.current);
    visuRef.current?.network.on("click", handleClick);
    visuRef.current?.network.on("doubleClick", handleDoubleClick);

    if (restoredFromStorage.current || initDone) return;

    setInitDone(true);

    async function restoreFromLocalStorage() {
      const selectedArtists: SelectedArtist[] = JSON.parse(localStorage.getItem("selectedArtists") || "[]");
      setSelectedArtists(selectedArtists);
      for (const artist of selectedArtists) {
        await addArtistCollabs(artist.gid);
      }
      setTimeout(() => {
        if (!visuRef.current) return;
        visuRef.current.network.fit();
        const position = visuRef.current.network.getViewPosition();
        const sidebarWith = 200;
        visuRef.current.network.moveTo({ position: { x: position.x - sidebarWith, y: position.y } });
      }, 500);
    }

    // Only call restoreFromLocalStorage if it hasn't been called before
    if (!restoredFromStorage.current) {
      restoreFromLocalStorage();
      restoredFromStorage.current = true;
    }

    return () => {
      visuRef.current?.network.off("click");
      visuRef.current?.network.off("doubleClick");
    };
  }, [initDone, selectedArtists, handleDoubleClick]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div className="sidebar" style={{ left: 0 }}>
        <form className="search-form" id="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            placeholder="Search for artist"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              className="clear-search"
              type="button"
              onClick={handleClearSearch}
            >
              ✕
            </button>
          )}
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
              <div key={artist.gid} style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => scrollToArtist(artist.gid)}>
                <div className="artist-icon" style={{ backgroundColor: generateColor(artist.gid) }}></div>
                {artist.name}
                <span style={{ marginLeft: "auto", cursor: "pointer" }} onClick={() => handleRemoveArtist(artist)}>✕</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={containerRef} style={{ height: "100%" }}></div>

      <div className="sidebar" style={{ right: 0, display: tracks.length > 0 ? "flex" : "none" }}>
        <div className="track-list">
          {tracks.map((trackList, idx) => (
            <div key={idx}>
              <Sticky><h4>{`${trackList.artistA} & ${trackList.artistB}`}</h4></Sticky>
              {trackList.tracks.map((track, tIdx) => (
                <TrackInfo key={tIdx} title={track} artistA={trackList.artistA} artistB={trackList.artistB} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {(loading || !initDone) && (
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