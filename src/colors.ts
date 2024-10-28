const colorPalette = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#FF8F33", "#33FFF0", "#A833FF", "#FFC733", "#33A1FF", "#8FFF33",
  "#FF3333", "#33FF99", "#FF5733", "#FF33FF", "#FFCC33", "#33FFC4", "#A1FF33", "#33A1FF", "#FFA833", "#57FF33",
  "#FF3399", "#FF8333", "#3399FF", "#FF33C7", "#57FF57", "#FFC433", "#33C4FF", "#C433FF", "#8F33FF", "#33FFC7",
  "#33FFA1", "#FFA133"
];

const colorCache: Record<string, string> = {};

let colorIndex = 0;

export function generateColor(id: string): string {
  if (colorCache[id]) return colorCache[id];

  const color = colorPalette[colorIndex];
  colorIndex = (colorIndex + 1) % colorPalette.length;
  colorCache[id] = color;

  return color;
}
