export type Artist = {
  id: number;
  gid: string;
  name: string;
  comment?: string;
}

export type Track = {
  id: number;
  gid: string;
  name: string;
}

export type Node = {
  id: string | number;
  label: string;
  comment?: string;
  hidden?: boolean;
}

export type Edge = {
  from: string | number;
  to: string | number;
  value: number;
  tracks: Track[];
}

export interface ArtistCollabsResult {
  nodes: Node[];
  edges: Edge[];
}

export type EdgeWithId = Edge & { id: string };