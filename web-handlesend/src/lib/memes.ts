import { objectTagFrom } from '@/shared/domain';

/**
 * Showcase objects: real, textured 3D models of meme-famous everyday things. Mesh numbers (vertices, edges, triangles,
 * proportions) are measured from each model file, so every figure shown next to them is true for that model.
 */
export interface MemeExhibit { id: string; url: string; points: string; image: string; coin: string; spin: string; name: string; catalog: string; ticker: string; nod: string; caption: string; triangles: number; vertices: number; edges: number; dims: [number, number, number]; kind: string; colors: string[]; materials: string[]; }

type Spec = Omit<MemeExhibit, 'id' | 'url' | 'points' | 'image' | 'coin' | 'spin'>;
const exhibit = (id: string, rest: Spec): MemeExhibit => ({ id, url: `/models/memes/${id}.glb`, points: `/models/points/${id}.json`, image: `/assets/objects/${id}.webp`, coin: `/assets/objects/coin-${id}.webp`, spin: `/assets/objects/spin2/${id}.webp`, ...rest });

export const MEMES: MemeExhibit[] = [
  exhibit('duck', { name: 'Rubber Duck', catalog: 'Yellow Vinyl Bath Duck', ticker: 'QUACK', nod: 'Debugging legend', caption: 'Every developer’s first rubber duck, now a coin.', triangles: 98240, vertices: 60298, edges: 157546, dims: [0.7, 0.84, 1], kind: 'Toy', colors: ['#F8C33B', '#F28C28', '#1B1D22'], materials: ['vinyl'] }),
  exhibit('wojak', { name: 'Wojak Bust', catalog: 'Resin Wojak Desk Bust', ticker: 'WOJAK', nod: 'Bought the top', caption: 'He sold the bottom. You can scan him instead.', triangles: 101672, vertices: 63810, edges: 164293, dims: [0.69, 1, 0.56], kind: 'Meme bust', colors: ['#D8D4CC', '#F0D0D0', '#9A948A'], materials: ['resin'] }),
  exhibit('pepe', { name: 'Smug Frog', catalog: 'Smug Green Frog Vinyl Figure', ticker: 'PEPE', nod: 'Feels good, man', caption: 'The most famous frog on the internet, as a real desk figure.', triangles: 93462, vertices: 70138, edges: 160367, dims: [0.55, 1, 0.47], kind: 'Meme figure', colors: ['#709050', '#1050B0', '#303030'], materials: ['vinyl', 'paint'] }),
  exhibit('bull', { name: 'Laser Bull', catalog: 'Gold Charging Bull With Laser Eyes', ticker: 'LASER', nod: 'Laser eyes until 100k', caption: 'Wall Street’s bull, laser eyes on. Only ever up.', triangles: 88627, vertices: 63095, edges: 149256, dims: [0.32, 0.52, 1], kind: 'Desk sculpture', colors: ['#D0B070', '#101010', '#D8322E'], materials: ['metal', 'marble'] }),
  exhibit('fine', { name: 'This Is Fine', catalog: 'Hat Dog With Coffee In Flames', ticker: 'FINE', nod: 'Every red candle ever', caption: 'Portfolio on fire, coffee still warm. Now tokenized.', triangles: 112064, vertices: 82071, edges: 190573, dims: [0.92, 1, 0.96], kind: 'Meme figure', colors: ['#F0B050', '#B05010', '#503010'], materials: ['vinyl', 'paint'] }),
  exhibit('beanie', { name: 'Pink Beanie', catalog: 'Pink Knitted Wool Beanie', ticker: 'HAT', nod: 'Dog not included', caption: 'One pink beanie on one good dog started a cycle.', triangles: 73635, vertices: 102857, edges: 218754, dims: [1, 0.92, 1], kind: 'Clothing', colors: ['#D28493', '#E7B5C0', '#F4D9DF'], materials: ['wool', 'knit'] }),
  exhibit('frog', { name: 'Vinyl Frog', catalog: 'Green Vinyl Frog Figurine', ticker: 'FROG', nod: 'Feels good, man', caption: 'The internet’s favourite frog, as a real toy.', triangles: 40164, vertices: 35874, edges: 106415, dims: [1, 0.89, 0.75], kind: 'Collectible', colors: ['#758C57', '#A9C08A', '#F1EEE4'], materials: ['vinyl'] }),
  exhibit('rock', { name: 'Pet Rock', catalog: 'Grey River Stone With Red Scarf', ticker: 'ROCK', nod: 'Never sells', caption: 'The original diamond hands. Now wearing a scarf.', triangles: 93175, vertices: 154564, edges: 215980, dims: [0.97, 1, 0.84], kind: 'Oddity', colors: ['#9A9A96', '#D8322E', '#F4F4F2'], materials: ['stone', 'wool'] }),
  exhibit('sneaker', { name: 'Retro Kicks', catalog: 'White Leather High-Top Sneaker', ticker: 'KICKS', nod: 'Grail energy', caption: 'Every sneakerhead has one pair they’d never sell.', triangles: 92058, vertices: 94780, edges: 178591, dims: [1, 0.6, 0.36], kind: 'Footwear', colors: ['#EDEDEA', '#B9B6AE', '#A0703F'], materials: ['leather', 'suede', 'rubber'] }),
  exhibit('console', { name: 'Handheld 89', catalog: 'Grey Retro Handheld Console', ticker: 'BOOT', nod: 'Press start', caption: 'A childhood in grey plastic. Scan yours.', triangles: 109786, vertices: 87415, edges: 191755, dims: [0.57, 1, 0.12], kind: 'Electronics', colors: ['#C9C7C2', '#9BB54A', '#D8322E'], materials: ['plastic', 'glass'] }),
  exhibit('mug', { name: 'GM Mug', catalog: 'White Ceramic GM Mug', ticker: 'GM', nod: 'gm', caption: 'Said it every morning. Now it’s on-chain.', triangles: 90384, vertices: 64099, edges: 151797, dims: [1, 0.83, 0.72], kind: 'Kitchen', colors: ['#F4F4F2', '#1B1D22', '#5A3A22'], materials: ['ceramic', 'glaze'] }),
  exhibit('card', { name: 'Graded Slab', catalog: 'Holographic Card In Acrylic Slab', ticker: 'SLAB', nod: 'Gem mint', caption: 'The collectible that started it all, sealed and scanned.', triangles: 85865, vertices: 80654, edges: 159464, dims: [0.65, 1, 0.08], kind: 'Collectible', colors: ['#E36A1E', '#1B1D22', '#EDEFF3'], materials: ['acrylic', 'card'] }),
  exhibit('squirrel', { name: 'Peanut Squirrel', catalog: 'Carved Wooden Squirrel Figurine', ticker: 'NUTS', nod: 'Justice for the squirrel', caption: 'A squirrel with a peanut became a movement.', triangles: 35338, vertices: 38152, edges: 105998, dims: [0.46, 1, 0.93], kind: 'Figurine', colors: ['#796860', '#A68B69', '#D9CFC2'], materials: ['wood', 'paint'] }),
  exhibit('pizza', { name: 'Pizza Day', catalog: 'Pepperoni Pizza In Cardboard Box', ticker: 'PIZZA', nod: '10,000 BTC energy', caption: 'Two pizzas once cost 10,000 BTC. This launch costs $0.', triangles: 39139, vertices: 51111, edges: 117410, dims: [0.97, 0.7, 1], kind: 'Food', colors: ['#C8412E', '#E9B866', '#A28161'], materials: ['cardboard', 'dough'] }),
  exhibit('shiba', { name: 'Ceramic Shiba', catalog: 'Glazed Ceramic Shiba Figurine', ticker: 'MUCH', nod: 'Much scan. Very onchain.', caption: 'The side-eye that launched a thousand coins.', triangles: 42504, vertices: 31800, edges: 114120, dims: [0.52, 1, 0.84], kind: 'Ceramic', colors: ['#BA722F', '#EFE4D3', '#2B2522'], materials: ['ceramic', 'glaze'] }),
  exhibit('banana', { name: 'Taped Banana', catalog: 'Duct-Taped Ripe Banana', ticker: 'TAPE', nod: 'Art or breakfast?', caption: 'Tape yours to the blockchain instead of a wall.', triangles: 43190, vertices: 51922, edges: 129559, dims: [0.84, 1, 0.32], kind: 'Art', colors: ['#E6BB2F', '#FACC35', '#9A9A9A'], materials: ['fruit', 'tape'] }),
  exhibit('hippo', { name: 'Baby Hippo', catalog: 'Pygmy Hippo Resin Figurine', ticker: 'HIPPO', nod: 'Bouncy. Slippery. Viral.', caption: 'The zoo’s most famous baby hippo, desk size.', triangles: 47861, vertices: 42580, edges: 127185, dims: [0.56, 0.62, 1], kind: 'Figurine', colors: ['#514643', '#8E7B76', '#D9B8B4'], materials: ['resin'] }),
  exhibit('penguin', { name: 'Plush Penguin', catalog: 'Plush Blue Penguin Toy', ticker: 'PLUSH', nod: 'Chubby & huggable', caption: 'Chubby penguins took over the timeline.', triangles: 39652, vertices: 37680, edges: 118945, dims: [1, 0.96, 0.66], kind: 'Toy', colors: ['#7F93A7', '#F2F2EE', '#F2A33A'], materials: ['plush', 'felt'] }),
];
export const exhibitById = (id: string): MemeExhibit | undefined => MEMES.find(m => m.id === id);

/** Words for the hero sub-line: everyday things anyone can scan. */
export const TOKENIZABLE = ['rubber duck', 'Pepe figure', 'apple', 'grail kicks', 'GM mug', 'Game Boy', 'pet rock', 'graded card', 'lucky hoodie', 'cold pizza', 'desk bull'];

/** Deterministic hex string per seed (for showcase tags and fingerprints). */
export function demoHash(seed: string, length = 40): string {
  let h = 2166136261; let out = '';
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = 0; out.length < length; i++) { h ^= (h >>> 13) + i + 0x9e37; h = Math.imul(h, 16777619) >>> 0; out += h.toString(16).padStart(8, '0'); }
  return out.slice(0, length);
}
/** ObjectPad tag for a showcase object, derived the same way real tags are. */
export const demoTag = (exhibit: MemeExhibit): string => objectTagFrom(demoHash(`${exhibit.catalog}|demo`, 16));
/** The spec string written into launch transactions, e.g. `tris=73635;verts=102857;dims=1.00x0.92x1.00;mat=wool`. */
export const exhibitSpecs = (e: MemeExhibit): string => `tris=${e.triangles};verts=${e.vertices};edges=${e.edges};dims=${e.dims.map(d => d.toFixed(2)).join('x')};mat=${e.materials.join('+')};views=6`;
