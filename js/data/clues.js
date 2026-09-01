// Key Evidence deck - 100 cards.
// `img` is the basename looked up in assets/images/clues/<img>.jpg|png|webp.
// If no file is present the procedural noir renderer draws the card instead.
const RAW_CLUES = [
  ['Pocket Watch', 'time'], ['Wedding Ring', 'jewel'], ['Silver Locket', 'jewel'],
  ['Cufflinks', 'jewel'], ['Tie Clip', 'jewel'], ['Signet Ring', 'jewel'],
  ['Pearl Earring', 'jewel'], ['Charm Bracelet', 'jewel'], ['Mourning Brooch', 'jewel'],
  ['Hairpin', 'groom'], ['Tortoiseshell Comb', 'groom'], ['Lipstick', 'groom'],
  ['Compact Mirror', 'groom'], ['Perfume Bottle', 'groom'], ['Nail File', 'groom'],
  ['Shaving Brush', 'groom'], ['Toothbrush', 'groom'], ['Reading Glasses', 'optic'],
  ['Monocle', 'optic'], ['Magnifying Glass', 'optic'], ['Fountain Pen', 'paper'],
  ['Ink Bottle', 'paper'], ['Broken Wax Seal', 'paper'], ['Foreign Postage Stamp', 'paper'],
  ['Torn Envelope', 'paper'], ['Love Letter', 'paper'], ['Ransom Note', 'paper'],
  ['Telegram', 'paper'], ['Newspaper Clipping', 'paper'], ['Train Ticket', 'ticket'],
  ['Theatre Stub', 'ticket'], ['Boarding Pass', 'ticket'], ['Passport', 'ticket'],
  ['Library Card', 'ticket'], ['Business Card', 'ticket'], ['Parking Ticket', 'ticket'],
  ['Pawn Slip', 'ticket'], ['Crumpled Receipt', 'paper'], ['Bank Ledger', 'paper'],
  ['Cheque Book', 'paper'], ['Coin Purse', 'money'], ['Money Clip', 'money'],
  ['Poker Chip', 'game'], ['Playing Card', 'game'], ['Pair of Dice', 'game'],
  ['Chess Piece', 'game'], ['Domino', 'game'], ['Glass Marble', 'game'],
  ['Dollhouse Key', 'key'], ['Skeleton Key', 'key'], ['Brass Padlock', 'key'],
  ['Key Ring', 'key'], ['Safe Deposit Box', 'box'], ['Jewelry Box', 'box'],
  ['Cigar Box', 'box'], ['Matchbox', 'box'], ['Cigarette Case', 'smoke'],
  ['Cut Glass Ashtray', 'smoke'], ['Briar Pipe', 'smoke'], ['Brass Lighter', 'smoke'],
  ['Hip Flask', 'drink'], ['Wine Cork', 'drink'], ['Champagne Glass', 'drink'],
  ['Porcelain Teacup', 'drink'], ['Sugar Bowl', 'drink'], ['Silver Spoon', 'drink'],
  ['Napkin Ring', 'dine'], ['Dinner Menu', 'dine'], ['Recipe Card', 'dine'],
  ['Grocery List', 'dine'], ['Umbrella Stand', 'cloth'], ['Bowler Hat', 'cloth'],
  ['Grey Fedora', 'cloth'], ['Leather Glove', 'cloth'], ['Silk Handkerchief', 'cloth'],
  ['Wool Overcoat', 'cloth'], ['Bow Tie', 'cloth'], ['Shoehorn', 'cloth'],
  ['Muddy Boot', 'cloth'], ['Shoelace', 'cloth'], ['Suitcase', 'bag'],
  ['Steamer Trunk', 'bag'], ["Doctor's Bag", 'bag'], ['Briefcase', 'bag'],
  ['Coat Check Tag', 'ticket'], ['Luggage Tag', 'ticket'], ['Folded Map', 'nav'],
  ['Brass Compass', 'nav'], ['Field Notebook', 'book'], ['Locked Diary', 'book'],
  ['Address Book', 'book'], ['Faded Photograph', 'image'], ['Folding Camera', 'image'],
  ['Film Reel', 'image'], ['Phonograph Record', 'music'], ['Sheet Music', 'music'],
  ['Violin Bow', 'music'], ['Music Box', 'music'], ['Taxidermy Owl', 'curio'],
  ['Empty Birdcage', 'curio']
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const CLUES = RAW_CLUES.map(([name, motif], i) => ({
  id: 'C' + String(i + 1).padStart(3, '0'),
  name,
  motif,
  img: slugify(name)
}));
