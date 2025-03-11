interface TrackInfoProps {
  title: string;
  artistA: string;
  artistB: string;

}
export function TrackInfo(props: TrackInfoProps) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <a target="_blank" href={generateYouTubeSearchLink(props)} style={{ width: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{props.title}</a>
    </div>
  );
}

function generateYouTubeSearchLink({ title, artistA, artistB }: TrackInfoProps) {
  const query = encodeURIComponent(`${title} ${artistA} ${artistB}`);
  return `https://www.youtube.com/results?search_query=${query}`;
};
