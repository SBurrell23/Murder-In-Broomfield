// Scene tiles. Every tile carries exactly 6 options; the Forensic Scientist
// places one bullet marker per tile in play.
//
//   kind: 'cause'  - Cause of Death    (crimson, always in play)
//   kind: 'place'  - Location of Crime (steel blue, always in play)
//   kind: 'scene'  - Scene Tile        (orange, four in play, two get replaced)

// The Cause of Death tile is fixed: the same six options in every game, so the
// table learns to read it the way they would a real board.
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
    ["The Butcher's Freezer", 'Motel Room Twelve', 'The Diner Kitchen', 'The Bank Vault', 'The Barber Shop', 'The Warehouse Catwalk'] }
];

export const SCENE_TILES = [
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
  { id: 'ST11', kind: 'scene', title: 'Witness Account', options:
    ['Contradictory', 'Fragmentary', 'Flatly Refused', 'Anonymous', 'Later Retracted', 'None Was Given'] },
  { id: 'ST12', kind: 'scene', title: 'How They Got In', options:
    ['Through the Front Door', 'Through a Back Window', 'Up the Fire Escape', 'Down the Cellar Hatch', 'They Were Already Inside', 'They Never Went In'] },
  { id: 'ST13', kind: 'scene', title: 'How They Got Out', options:
    ['On Foot', 'By Car', 'By Bicycle', 'Into the Crowd', 'Along the Creek', 'They Never Left'] },
  { id: 'ST14', kind: 'scene', title: 'Duration of the Crime', options:
    ['A Few Seconds', 'Under a Minute', 'Several Minutes', 'Half an Hour', 'Most of the Night', 'Days of Work'] },
  { id: 'ST15', kind: 'scene', title: 'Who Else Was There', options:
    ['They Acted Alone', 'One Accomplice', 'Two Accomplices', 'A Whole Crowd', 'The Household Slept Nearby', 'Impossible to Tell'] },
  { id: 'ST16', kind: 'scene', title: 'Body Discovered By', options:
    ['A Child', 'A Passing Stranger', 'The Landlord', 'A Coworker', 'The Postman', 'The Murderer'] },
  { id: 'ST17', kind: 'scene', title: 'Position of the Body', options:
    ['Seated Upright', 'Face Down', 'Face Up', 'Slumped Against a Wall', 'Suspended', 'Deliberately Concealed'] },
  { id: 'ST18', kind: 'scene', title: "The Murderer's Mistake", options:
    ['Left a Print Behind', 'Was Seen in Passing', 'Dropped Something', 'Chose the Wrong Victim', 'Made Far Too Much Noise', 'Made No Mistake'] },
  { id: 'ST19', kind: 'scene', title: 'Marks on the Victim', options:
    ['Wedding Band Missing', 'A Fresh Tattoo', 'An Old Scar', 'Bruised Knuckles', 'Torn Fingernails', 'Hands Perfectly Clean'] },
  { id: 'ST20', kind: 'scene', title: "The Murderer's State of Mind", options:
    ['Panicked', 'Methodical', 'Enraged', 'Remorseful', 'Utterly Detached', 'Euphoric'] }
];

export const ALL_TILES = [...CAUSE_OF_DEATH, ...LOCATIONS, ...SCENE_TILES];
