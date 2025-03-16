import { DataSet } from "vis-network";
import { fetchArtistImage } from "./fetchArtistImage.ts";
import { Node } from "./types.ts";

export async function fetchArtistImagesInBatches(nodesToAdd: Node[], nodes: DataSet<Node & { shape?: string; image?: string; }>, batchSize: number = 10) {
  for (let i = 0; i < nodesToAdd.length; i += batchSize) {
    const batch = nodesToAdd.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (node) => {
        const imageUrl = await fetchArtistImage(node.label, node.comment);
        if (imageUrl) {
          nodes.update({
            id: node.id,
            shape: "circularImage",
            image: imageUrl
          });
        }
      })
    );
  }
}
