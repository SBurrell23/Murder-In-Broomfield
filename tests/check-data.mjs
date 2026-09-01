import { MEANS } from '../js/data/means.js';
import { CLUES } from '../js/data/clues.js';
import { CAUSE_OF_DEATH, LOCATIONS, SCENE_TILES } from '../js/data/tiles.js';

function report(label, arr, keyFn) {
  const keys = arr.map(keyFn);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  console.log(`${label}: ${arr.length} entries, ${new Set(keys).size} unique` +
    (dupes.length ? `  DUPES: ${[...new Set(dupes)].join(', ')}` : '  OK'));
}
report('MEANS         ', MEANS, x => x.name);
report('MEANS ids     ', MEANS, x => x.id);
report('MEANS imgs    ', MEANS, x => x.img);
report('CLUES         ', CLUES, x => x.name);
report('CLUES ids     ', CLUES, x => x.id);
report('CLUES imgs    ', CLUES, x => x.img);
report('CAUSE_OF_DEATH', CAUSE_OF_DEATH, x => x.id);
report('LOCATIONS     ', LOCATIONS, x => x.id);
report('SCENE_TILES   ', SCENE_TILES, x => x.id);

const allTiles = [...CAUSE_OF_DEATH, ...LOCATIONS, ...SCENE_TILES];
const bad = allTiles.filter(t => !Array.isArray(t.options) || t.options.length !== 6);
console.log(bad.length ? `TILES WITH != 6 OPTIONS: ${bad.map(t => t.id + '(' + t.options.length + ')')}` : 'All tiles have exactly 6 options  OK');
console.log('sample means:', JSON.stringify(MEANS[0]), JSON.stringify(MEANS.at(-1)));
console.log('sample clue :', JSON.stringify(CLUES[0]), JSON.stringify(CLUES.at(-1)));
console.log('sample tile :', JSON.stringify(SCENE_TILES[0]));
