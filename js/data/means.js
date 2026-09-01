// Means of Murder deck - 100 cards.
// `img` is the basename looked up in assets/images/means/<img>.jpg|png|webp.
// If no file is present the procedural noir renderer draws the card instead.
const RAW_MEANS = [
  ['Butcher Knife', 'blade'], ['Straight Razor', 'blade'], ['Letter Opener', 'blade'],
  ['Ice Pick', 'spike'], ['Meat Cleaver', 'blade'], ['Hunting Knife', 'blade'],
  ['Broken Bottle', 'glass'], ['Shard of Glass', 'glass'], ['Scalpel', 'blade'],
  ['Sewing Scissors', 'blade'], ['Garden Shears', 'blade'], ['Hatchet', 'blade'],
  ['Fire Axe', 'blade'], ['Machete', 'blade'], ['Bayonet', 'spike'],
  ['Cavalry Sabre', 'blade'], ['Crossbow Bolt', 'spike'], ['Service Revolver', 'gun'],
  ['Derringer', 'gun'], ['Sawed-Off Shotgun', 'gun'], ['Hunting Rifle', 'gun'],
  ['Nail Gun', 'gun'], ['Flare Gun', 'gun'], ['Whaling Harpoon', 'spike'],
  ['Hemp Rope', 'cord'], ['Piano Wire', 'cord'], ['Silk Scarf', 'cord'],
  ['Leather Belt', 'cord'], ['Necktie', 'cord'], ['Bootlace', 'cord'],
  ['Iron Chain', 'cord'], ['Barbed Wire', 'cord'], ['Cast Iron Skillet', 'blunt'],
  ['Rolling Pin', 'blunt'], ['Marble Bust', 'blunt'], ['Brass Candlestick', 'blunt'],
  ['Fireplace Poker', 'blunt'], ['Crowbar', 'blunt'], ['Claw Hammer', 'blunt'],
  ['Sledgehammer', 'blunt'], ['Monkey Wrench', 'blunt'], ['Tire Iron', 'blunt'],
  ['Baseball Bat', 'blunt'], ['Golf Club', 'blunt'], ['Walking Cane', 'blunt'],
  ['Steel-Ribbed Umbrella', 'blunt'], ['Snow Globe', 'blunt'], ['Trophy Cup', 'blunt'],
  ['Iron Bookend', 'blunt'], ['Stone Paperweight', 'blunt'], ['Cyanide Capsule', 'poison'],
  ['Arsenic Powder', 'poison'], ['Strychnine Vial', 'poison'], ['Rat Poison', 'poison'],
  ['Antifreeze', 'poison'], ['Household Bleach', 'poison'], ['Drain Cleaner', 'poison'],
  ['Nightshade Berries', 'poison'], ['Hemlock', 'poison'], ['Oleander Leaves', 'poison'],
  ['Death Cap Mushroom', 'poison'], ['Insulin Syringe', 'poison'], ['Morphine Ampoule', 'poison'],
  ['Sleeping Pills', 'poison'], ['Digitalis Tablets', 'poison'], ['Chloroform Rag', 'poison'],
  ['Bottle of Ether', 'poison'], ['Snake Venom', 'beast'], ['Deathstalker Scorpion', 'beast'],
  ['Feral Dog', 'beast'], ['Goose Down Pillow', 'smother'], ['Plastic Bag', 'smother'],
  ['Duct Tape', 'smother'], ['Clawfoot Bathtub', 'water'], ['Frozen Lake', 'water'],
  ['Stone Well', 'water'], ['Space Heater', 'fire'], ['Gas Stove', 'fire'],
  ['Kerosene Lamp', 'fire'], ['Matchbook', 'fire'], ['Blowtorch', 'fire'],
  ['Live Wire', 'shock'], ['Toaster', 'shock'], ['Car Battery', 'shock'],
  ['Radiator Hose', 'machine'], ['Cut Brake Line', 'machine'], ['Locked Steering Wheel', 'machine'],
  ['Snowplow', 'machine'], ['Freight Elevator', 'machine'], ['Service Stairwell', 'fall'],
  ['Balcony Rail', 'fall'], ['Roof Icicle', 'spike'], ['Falling Chandelier', 'crush'],
  ['Toppled Bookcase', 'crush'], ['Grand Piano', 'crush'], ['Blacksmith Anvil', 'crush'],
  ['Mill Stone', 'crush'], ['Wine Press', 'crush'], ['Bear Trap', 'spike'],
  ['Grandfather Clock', 'crush']
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const MEANS = RAW_MEANS.map(([name, motif], i) => ({
  id: 'M' + String(i + 1).padStart(3, '0'),
  name,
  motif,
  img: slugify(name)
}));
