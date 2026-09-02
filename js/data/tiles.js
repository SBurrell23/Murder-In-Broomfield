// Scene tiles. Every tile carries exactly 6 options; the Forensic Scientist
// places one bullet marker per tile in play.
//
//   kind: 'cause'  - Cause of Death    (crimson, always in play)
//   kind: 'place'  - Location of Crime (steel blue, always in play)
//   kind: 'scene'  - Scene Tile        (orange, four in play, two get replaced)
//
// WHAT MAKES A GOOD SCENE TILE
//
// The Scientist cannot speak. A tile earns its place only if its six options
// let them *point at something* about the weapon or the evidence sitting face
// up on the table. So every tile here turns on an observable property - what a
// thing is made of, what it did, how big it is, where it was kept, what it left
// behind - rather than on an abstraction.
//
// Tiles that fail that test are duds: they eat a slot on the board and give the
// table nothing to reason with. Three original tiles were cut for exactly this
// reason and are worth remembering as the shape of the mistake:
//
//   "The Murderer's State of Mind"  Panicked / Methodical / Enraged / ...
//        No weapon is euphoric. Nothing on the table connects to it.
//   "Witness Account"               Contradictory / Retracted / Anonymous / ...
//        Describes the investigation rather than the crime.
//   "Who Else Was There"            Acted Alone / One Accomplice / ...
//        No link to the cards, and it collides with the real Accomplice role.
//
// Keep option text short - roughly 24 characters - or it wraps badly on the
// narrow tiles. tools/tiles.html renders the whole deck for review, and
// tests/check-data.mjs enforces the structural rules.

export const CAUSE_OF_DEATH = [
  { id: 'CD1', kind: 'cause', title: 'Cause of Death', options:
    ['Suffocation', 'Severe Injury', 'Blood Loss', 'Illness/Disease', 'Poisoning', 'Accident'] }
];

export const LOCATIONS = [
  { id: 'LC1', kind: 'place', title: 'Location of Crime', subtitle: 'Old Town Broomfield', options:
    ['The Depot Plaza', 'Clock Tower Landing', 'Rooftop Parking Deck', 'Behind the Loading Dock', 'The Storm Drain', 'Midway Down the Alley'] },
  { id: 'LC2', kind: 'place', title: 'Location of Crime', subtitle: 'A Private Residence', options:
    ['The Front Porch', 'The Cellar Steps', 'The Attic Crawlspace', 'The Garden Shed', 'The Garage', 'The Back Fence'] },
  { id: 'LC3', kind: 'place', title: 'Location of Crime', subtitle: 'The Outskirts', options:
    ['The Reservoir Bank', 'The Prairie Trail', 'Inside the Grain Silo', 'The Highway Underpass', 'The Quarry Rim', 'The Abandoned Farmhouse'] },
  { id: 'LC4', kind: 'place', title: 'Location of Crime', subtitle: 'Public Grounds', options:
    ['The Library Stacks', 'The Community Pool', 'The Church Vestry', 'The School Boiler Room', 'The Cemetery Path', 'The Bandshell Stage'] },
  { id: 'LC5', kind: 'place', title: 'Location of Crime', subtitle: 'Places of Business', options:
    ["The Butcher's Freezer", 'Motel Room Twelve', 'The Diner Kitchen', 'The Bank Vault', 'The Barber Shop', 'The Warehouse Catwalk'] },
  { id: 'LC6', kind: 'place', title: 'Location of Crime', subtitle: 'The Rail Yard', options:
    ['The Signal Box', 'Between Two Freight Cars', 'The Turntable Pit', 'The Water Tower Ladder', 'The Coal Hopper', 'The Last Carriage'] },
  { id: 'LC7', kind: 'place', title: 'Location of Crime', subtitle: 'After Hours', options:
    ['The Theatre Fly Loft', 'The Bowling Lanes', 'Behind the Cinema Screen', 'The Dance Hall Cloakroom', 'The Skating Rink', 'The Arcade Back Room'] },
  { id: 'LC8', kind: 'place', title: 'Location of Crime', subtitle: 'The Medical District', options:
    ['The Dispensary', 'The X-Ray Room', 'The Morgue Drawer', 'The Ambulance Bay', 'The Records Basement', "The Nurses' Stair"] },
  { id: 'LC9', kind: 'place', title: 'Location of Crime', subtitle: 'Water and Weather', options:
    ['The Boathouse', 'Under the Footbridge', 'The Flooded Basement', 'The Ice House', 'The Culvert Mouth', 'The Rain Barrel Yard'] },
  { id: 'LC10', kind: 'place', title: 'Location of Crime', subtitle: 'The Grand House', options:
    ["The Servants' Stair", 'The Wine Cellar', 'The Conservatory', 'The Long Gallery', 'The Nursery', 'The Gun Room'] }
];

export const SCENE_TILES = [
  // --- the scene as found ------------------------------------------------
  { id: 'ST01', kind: 'scene', title: 'Time of Day', options:
    ['Dawn', 'Mid-Morning', 'High Noon', 'Dusk', 'Midnight', 'The Small Hours'] },
  { id: 'ST02', kind: 'scene', title: 'Weather That Night', options:
    ['Clear and Cold', 'Heavy Rain', 'Snowfall', 'Dense Fog', 'High Wind', 'Thunderstorm'] },
  { id: 'ST03', kind: 'scene', title: "Victim's Occupation", options:
    ['Physician', 'Banker', 'Journalist', 'Schoolteacher', 'Private Detective', 'Undertaker'] },
  { id: 'ST04', kind: 'scene', title: "Victim's Condition", options:
    ['Intoxicated', 'Sedated', 'Already Injured', 'Exhausted', 'Terrified', 'Perfectly Calm'] },
  { id: 'ST05', kind: 'scene', title: 'Motive', options:
    ['Money', 'Revenge', 'Jealousy', 'To Keep a Secret', 'Fear', 'Mercy'] },
  { id: 'ST06', kind: 'scene', title: 'Relationship to Victim', options:
    ['A Total Stranger', 'A Neighbor', 'A Colleague', 'A Relative', 'A Former Lover', 'An Old Friend'] },
  { id: 'ST07', kind: 'scene', title: 'State of the Scene', options:
    ['Ransacked', 'Immaculate', 'Carefully Staged', 'Blood-Soaked', 'Partly Burned', 'Waterlogged'] },
  { id: 'ST08', kind: 'scene', title: 'Trace Evidence', options:
    ['Fingerprints', 'A Single Hair', 'Fabric Fibers', 'A Boot Print', 'Tire Tread', 'Cigarette Ash'] },
  { id: 'ST09', kind: 'scene', title: 'Sound Heard', options:
    ['A Scream', 'Breaking Glass', 'A Gunshot', 'A Car Engine', 'A Dog Barking', 'Absolute Silence'] },
  { id: 'ST10', kind: 'scene', title: 'Missing From the Scene', options:
    ['Cash', 'Jewelry', 'Documents', 'A Weapon', 'An Article of Clothing', 'Nothing At All'] },
  { id: 'ST11', kind: 'scene', title: 'The Smell in the Room', options:
    ['Smoke', 'Chemicals', 'Damp and Rot', 'Perfume', 'Blood', 'Nothing Out of Place'] },
  { id: 'ST12', kind: 'scene', title: 'How They Got In', options:
    ['Through the Front Door', 'Through a Back Window', 'Up the Fire Escape', 'Down the Cellar Hatch', 'They Were Already Inside', 'They Never Went In'] },
  { id: 'ST13', kind: 'scene', title: 'How They Got Out', options:
    ['On Foot', 'By Car', 'By Bicycle', 'Into the Crowd', 'Along the Creek', 'They Never Left'] },
  { id: 'ST14', kind: 'scene', title: 'Duration of the Crime', options:
    ['A Few Seconds', 'Under a Minute', 'Several Minutes', 'Half an Hour', 'Most of the Night', 'Days of Work'] },
  { id: 'ST15', kind: 'scene', title: 'What the Neighbours Saw', options:
    ['A Light Left Burning', 'A Door Left Open', 'An Unfamiliar Car', 'A Stranger Waiting', 'Curtains Drawn Early', 'Nothing Whatever'] },
  { id: 'ST16', kind: 'scene', title: 'Body Discovered By', options:
    ['A Child', 'A Passing Stranger', 'The Landlord', 'A Coworker', 'The Postman', 'The Murderer'] },
  { id: 'ST17', kind: 'scene', title: 'Position of the Body', options:
    ['Seated Upright', 'Face Down', 'Face Up', 'Slumped Against a Wall', 'Suspended', 'Deliberately Concealed'] },
  { id: 'ST18', kind: 'scene', title: "The Murderer's Mistake", options:
    ['Left a Print Behind', 'Was Seen in Passing', 'Dropped Something', 'Chose the Wrong Victim', 'Made Far Too Much Noise', 'Made No Mistake'] },
  { id: 'ST19', kind: 'scene', title: 'Marks on the Victim', options:
    ['Wedding Band Missing', 'A Fresh Tattoo', 'An Old Scar', 'Bruised Knuckles', 'Torn Fingernails', 'Hands Perfectly Clean'] },
  { id: 'ST20', kind: 'scene', title: 'What the Hands Showed', options:
    ['Defensive Cuts', 'Chemical Burns', 'Rope Marks', 'Powder Residue', 'Soil Under the Nails', 'Nothing At All'] },

  // --- the weapon itself -------------------------------------------------
  { id: 'ST21', kind: 'scene', title: 'What the Weapon Was Made Of', options:
    ['Steel or Iron', 'Glass or Ceramic', 'Wood', 'Rope or Cloth', 'Stone or Earth', 'Nothing Solid'] },
  { id: 'ST22', kind: 'scene', title: 'Size of the Weapon', options:
    ['Palm-Sized', 'As Long as an Arm', 'Needed Both Hands', 'Bigger Than a Man', 'Part of the Building', 'Not an Object at All'] },
  { id: 'ST23', kind: 'scene', title: 'Where the Weapon Was Kept', options:
    ['In the Kitchen', 'In the Workshop', 'In the Medicine Chest', 'In the Garden', 'On Their Person', 'It Belonged to That Room'] },
  { id: 'ST24', kind: 'scene', title: 'What the Weapon Did', options:
    ['Cut or Pierced', 'Crushed or Struck', 'Choked or Smothered', 'Burned or Scalded', 'Poisoned or Sickened', 'Drowned or Froze'] },
  { id: 'ST25', kind: 'scene', title: 'The Weapon Afterwards', options:
    ['Carried Away', 'Left Where It Fell', 'Wiped Clean', 'Washed or Soaked', 'Burned', 'Put Neatly Back'] },
  { id: 'ST26', kind: 'scene', title: 'The Wound Itself', options:
    ['A Clean Edge', 'A Ragged Tear', 'A Deep Bruise', 'A Small Puncture', 'A Burn', 'No Wound to Find'] },
  { id: 'ST27', kind: 'scene', title: 'How the Weapon Was Used', options:
    ['Swung', 'Thrust', 'Pulled Tight', 'Poured or Tipped', 'Simply Dropped', 'Never Touched by Hand'] },

  // --- the evidence ------------------------------------------------------
  { id: 'ST28', kind: 'scene', title: 'What the Evidence Is Made Of', options:
    ['Paper or Card', 'Metal', 'Cloth or Leather', 'Glass or Porcelain', 'Wood or Bone', 'Something Once Alive'] },
  { id: 'ST29', kind: 'scene', title: 'What the Evidence Was For', options:
    ['Proving Who You Are', 'Money', 'Writing or Sending', 'Grooming or Dress', 'Amusement', 'Travel'] },
  { id: 'ST30', kind: 'scene', title: 'Where the Evidence Was Kept', options:
    ['A Coat Pocket', 'A Bag or Case', 'Worn on the Body', 'A Drawer at Home', 'Hidden on Purpose', 'Left in the Open'] },
  { id: 'ST31', kind: 'scene', title: 'The State of the Evidence', options:
    ['Brand New', 'Worn With Use', 'Broken', 'Stained', 'Torn or Cut', 'Mended Once Already'] },
  { id: 'ST32', kind: 'scene', title: 'What the Evidence Was Worth', options:
    ['Nothing At All', 'Sentiment Only', 'Pocket Change', "A Month's Wages", 'A Small Fortune', 'Beyond Price'] },
  { id: 'ST33', kind: 'scene', title: 'Whose Evidence It Was', options:
    ["The Victim's", "The Murderer's", 'Shared Between Them', "A Stranger's", 'It Came With the House', 'Nobody Can Say'] },

  // --- the act -----------------------------------------------------------
  { id: 'ST34', kind: 'scene', title: 'The First Blow', options:
    ['From Behind', 'Face to Face', 'From Above', 'From Below', 'While They Slept', 'There Was No Blow'] },
  { id: 'ST35', kind: 'scene', title: 'Where It Ended', options:
    ['Where It Started', 'One Room Away', 'At the Foot of a Stair', 'Just Outside the Door', 'In Water', 'They Never Moved'] },
  // Replaced "How Long It Was Planned" (On the Spot / For a Week / ...): pure
  // time spans with nothing physical to point at, and it duplicated the axis
  // Duration of the Crime already covers. Temperature reaches the fire, ice and
  // water weapons instead.
  { id: 'ST36', kind: 'scene', title: 'Temperature at the Scene', options:
    ['Bitter Cold', 'Cold and Damp', 'Mild', 'Close and Warm', 'Sweltering', 'Something Was Burning'] },
  { id: 'ST37', kind: 'scene', title: 'What the Murderer Brought', options:
    ['Everything Needed', 'Only the Weapon', 'Only Gloves', 'Something to Carry It', 'Something to Clean Up', 'Nothing At All'] },

  // --- the aftermath -----------------------------------------------------
  { id: 'ST38', kind: 'scene', title: 'What Was Cleaned Up', options:
    ['The Weapon', 'The Floor', 'Their Own Hands', 'A Set of Prints', 'Far Too Much', 'Nothing Was Cleaned'] },
  { id: 'ST39', kind: 'scene', title: 'Left Behind on Purpose', options:
    ['A Written Message', 'Something Not Theirs', 'A Door Unlocked', 'The Body in Plain View', 'A False Trail', 'Nothing Deliberate'] },
  { id: 'ST40', kind: 'scene', title: 'What the Victim Wore', options:
    ['Working Clothes', 'Night Clothes', 'Their Sunday Best', 'A Coat, as if Leaving', 'Almost Nothing', "Someone Else's Clothes"] }
];

export const ALL_TILES = [...CAUSE_OF_DEATH, ...LOCATIONS, ...SCENE_TILES];
