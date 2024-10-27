const { useState, useRef, useEffect } = React;

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState([]);

  const nodes = new vis.DataSet();
  const edges = new vis.DataSet();
  const selectedArtistIds = new Set();

  const containerRef = useRef(null);
  const networkRef = useRef(null);

  useEffect(() => {
    networkRef.current = new vis.Network(containerRef.current, { nodes, edges }, {
      interaction: { hideEdgesOnDrag: true },
      nodes: { shape: "dot", size: 16 },
      physics: { forceAtlas2Based: { gravitationalConstant: -26, centralGravity: 0.005, springLength: 230, springConstant: 0.18 }, maxVelocity: 146, solver: "forceAtlas2Based", timestep: 0.35, stabilization: false },
      layout: { improvedLayout: false }
    });
    networkRef.current.on("click", handleEdgeClick);
  }, []);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;

    setSearchResults(["Searching..."]);
    try {
      const response = await fetch(`/artists?q=${encodeURIComponent(searchQuery)}`);
      const artists = await response.json();
      setSearchResults(artists.length === 0 ? ["No results found"] : artists);
    } catch (error) {
      console.error("Error fetching search results:", error);
      setSearchResults(["Error fetching search results"]);
    }
  };

  const handleSelectArtist = async (artist) => {
    if (selectedArtistIds.has(artist.gid)) return;
    selectedArtistIds.add(artist.gid);
    setSelectedArtists((prev) => [...prev, artist]);
    await addArtistCollabs(artist.gid);
  };

  const addArtistCollabs = async (gid) => {
    setLoading(true);
    try {
      const response = await fetch(`/artists/${gid}/collabs`);
      const data = await response.json();
      if (!data.nodes.length && !data.edges.length) alert("No results found.");
      nodes.add(data.nodes.filter(node => !nodes.get(node.id)));
      edges.add(data.edges.filter(edge => !edges.get({ filter: item => item.from === edge.from && item.to === edge.to }).length));
    } catch (error) {
      console.error("Error fetching collaboration data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdgeClick = (params) => {
    if (params.edges.length) {
      const edge = edges.get(params.edges[0]);
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
          {Array.isArray(searchResults) && searchResults.map((result, idx) => (
            typeof result === "string" ? <div key={idx}>{result}</div> : (
              <div key={result.gid} onClick={() => handleSelectArtist(result)} style={{
                cursor: selectedArtistIds.has(result.gid) ? "not-allowed" : "pointer",
                opacity: selectedArtistIds.has(result.gid) ? 0.5 : 1,
                backgroundColor: "#34495e",
                padding: "8px",
                borderRadius: "4px",
                marginBottom: "5px"
              }}>{result.name}</div>
            )
          ))}
        </div>
        <div style={{ marginTop: "20px" }}>
          <h3>Selected Artists</h3>
          {selectedArtists.map(artist => (
            <div key={artist.gid} style={{ padding: "8px", backgroundColor: "#34495e", borderRadius: "4px", marginBottom: "5px" }}>{artist.name}</div>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{ flexGrow: 1, position: "relative" }}></div>
      <div style={{ width: "280px", padding: "10px", background: "#2c3e50", color: "#ecf0f1" }}>
        <h3>Track List</h3>
        {tracks.length > 0 ? tracks.map((track, idx) => <div key={idx}>{track}</div>) : "No tracks selected"}
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

// Render the React component into the DOM
ReactDOM.createRoot(document.getElementById('root')).render(<App />);