import type { Group, Knob } from '@/components/admin/kit';

/* the text globe's knobs, as /lab/globe shows them too */
export const GLOBE_KNOBS: Knob[] = [
  { k: 'globeFps', kind: 'range', label: 'Steps / s' }, { k: 'globeSweep', kind: 'range', label: 'Arrival steps' }, { k: 'globeWake', kind: 'range', label: 'Wake steps' },
  { k: 'globeHold', kind: 'range', label: 'Hold steps' }, { k: 'globeBlinks', kind: 'range', label: 'Blinks' }, { k: 'globeThinSteps', kind: 'range', label: 'Thinning steps' },
  { k: 'globeNight', kind: 'range', label: 'Night to dots' }, { k: 'globeGrid', kind: 'range', label: 'Grid ink' }, { k: 'globeMarkInk', kind: 'range', label: 'Other cities ink' },
  { k: 'globeTag', kind: 'range', label: 'Tag size' }, { k: 'globeMid', kind: 'range', label: 'Mid from (px)' }, { k: 'globeLarge', kind: 'range', label: 'Large from (px)' },
  { k: 'globeDots', kind: 'range', label: 'Dots across (small)' }, { k: 'globeSeed', kind: 'range', label: 'Seed' },
  { k: 'globeLeader', kind: 'toggle', label: 'Leader to the limb' }, { k: 'globeThin', kind: 'toggle', label: 'Thin toward the limb' }, { k: 'globeStudy', kind: 'toggle', label: "Study's frames (large)" },
];

/* the pick's prize, as /lab/globe shows it */
export const PRIZE_KNOBS: Knob[] = [
  { k: 'prize', kind: 'select', label: 'Prize' }, { k: 'prizeOverlap', kind: 'select', label: 'Overlap' }, { k: 'prizeCell', kind: 'select', label: 'Digit cells' },
  { k: 'prizeBand', kind: 'select', label: 'Band' }, { k: 'prizeTurn', kind: 'select', label: 'Turn' },
  { k: 'prizeSize', kind: 'range', label: 'Globe / digits' }, { k: 'prizeY', kind: 'range', label: 'Globe lower' }, { k: 'prizeCover', kind: 'range', label: 'Cover' }, { k: 'prizeBandRows', kind: 'range', label: 'Band rows' },
  { k: 'prizePhone', kind: 'select', label: 'On a phone' }, { k: 'prizeWeight', kind: 'range', label: 'Land weight' },
];

/* Every knob of the wheel, the glass and the screen, as the wheel lab and the preview's admin panel show them. */
export const WHEEL_GROUPS: Group[] = [
  { name: 'Wheel', knobs: [{ k: 'step', kind: 'range', label: 'Angle step' }, { k: 'hubY', kind: 'range', label: 'Hub height' }, { k: 'hubOfHeight', kind: 'range', label: 'Radius / height' }, { k: 'hubOfWidth', kind: 'range', label: 'Radius / width' }] },
  { name: 'Phone', knobs: [{ k: 'phoneStep', kind: 'range', label: 'Angle step' }, { k: 'phoneHubY', kind: 'range', label: 'Hub height' }, { k: 'phoneEdgeFrom', kind: 'range', label: 'Glass edge from' }, { k: 'phoneEdgeTo', kind: 'range', label: 'Glass edge to' }, { k: 'phoneFadeFrom', kind: 'range', label: 'Fade from' }, { k: 'phoneFadeTo', kind: 'range', label: 'Gone at' }] },
  { name: 'Mode', knobs: [{ k: 'font', kind: 'select', label: 'Face' }, { k: 'mark', kind: 'select', label: 'Mark' }, { k: 'layout', kind: 'select', label: 'Layout' }, { k: 'globe', kind: 'select', label: 'Globe' }] },
  { name: 'Names', knobs: [ { k: 'labelSize', kind: 'range', label: 'Size' }, { k: 'labelFrom', kind: 'range', label: 'Start' }, { k: 'labelPush', kind: 'range', label: 'Active out' }, { k: 'track', kind: 'range', label: 'Tracking' }, { k: 'ink', kind: 'range', label: 'Ink' }, { k: 'dim', kind: 'range', label: 'Others' }, { k: 'fadeFrom', kind: 'range', label: 'Fade from' }, { k: 'fadeTo', kind: 'range', label: 'Gone at' }] },
  { name: 'Globe', knobs: [{ k: 'face', kind: 'range', label: 'City faces' }, { k: 'core', kind: 'range', label: 'Land ball' }, { k: 'glassSplit', kind: 'range', label: 'Colour split' }, { k: 'openScale', kind: 'range', label: 'Link hover' }, { k: 'globeFps', kind: 'range', label: 'Text frames / s' }, { k: 'globeEdge', kind: 'range', label: 'Text globe smear' }, { k: 'globeShift', kind: 'range', label: 'Text globe left' }, { k: 'bareShift', kind: 'range', label: 'No globe: hub right' }] },
  { name: 'Text globe', knobs: [{ k: 'globeArrive', kind: 'select', label: 'Arrives' }, { k: 'globeTurn', kind: 'select', label: 'Turns' }, { k: 'globeLand', kind: 'select', label: 'Comes to rest' }, { k: 'globeLight', kind: 'select', label: 'Light' }, { k: 'globeMarks', kind: 'select', label: 'Cities' }, { k: 'globePick', kind: 'select', label: 'Press a city' }, { k: 'globeRim', kind: 'select', label: 'Rim' }, { k: 'globeBlink', kind: 'select', label: 'Blink' }, { k: 'globeHandover', kind: 'select', label: 'To the header' }] },
  { name: 'Text globe knobs', knobs: GLOBE_KNOBS },
  { name: 'Prize', knobs: PRIZE_KNOBS },
  { name: 'Rings', knobs: [{ k: 'ringCount', kind: 'range', label: 'Rings' }, { k: 'ringLine', kind: 'range', label: 'Ring spacing' }, { k: 'ringHole', kind: 'range', label: 'Hole' }, { k: 'ringFlat', kind: 'range', label: 'Rim height' }, { k: 'ringStagger', kind: 'range', label: 'Stagger' }, { k: 'ringGap', kind: 'range', label: 'Name gap' }] },
  { name: 'Turning', knobs: [{ k: 'wheelPx', kind: 'range', label: 'Wheel px' }, { k: 'dragPx', kind: 'range', label: 'Drag px' }, { k: 'ease', kind: 'range', label: 'Names ease' }, { k: 'yawEase', kind: 'range', label: 'Globe ease' }, { k: 'openEase', kind: 'range', label: 'Hover ease' }] },
  { name: 'Smear', knobs: [{ k: 'ghosts', kind: 'range', label: 'Ghosts' }, { k: 'ghostAlpha', kind: 'range', label: 'Ghost alpha' }, { k: 'ghostGap', kind: 'range', label: 'Ghost gap' }, { k: 'ghostFrom', kind: 'range', label: 'From' }] },
  { name: 'At rest', knobs: [{ k: 'settleFrom', kind: 'range', label: 'Cells from' }, { k: 'settleTo', kind: 'range', label: 'Cells gone' }, { k: 'pulseLow', kind: 'range', label: 'Light low' }, { k: 'pulseRate', kind: 'range', label: 'Breath rate' }, { k: 'statusDelay', kind: 'range', label: 'Said after' }] },
  { name: 'Glass edge', knobs: [{ k: 'edgeFrom', kind: 'range', label: 'From' }, { k: 'edgeTo', kind: 'range', label: 'To' }, { k: 'edgeReach', kind: 'range', label: 'Reach' }, { k: 'edgeTaps', kind: 'range', label: 'Taps' }] },
  { name: 'Names in the glass', knobs: [{ k: 'mirrorStart', kind: 'range', label: 'Start' }, { k: 'mirrorSize', kind: 'range', label: 'Size' }, { k: 'mirrorTip', kind: 'range', label: 'Tip' }, { k: 'mirrorDepth', kind: 'range', label: 'Depth' }, { k: 'mirrorSqueeze', kind: 'range', label: 'Squeeze' }, { k: 'mirrorBlur', kind: 'range', label: 'Blur' }, { k: 'mirrorGlow', kind: 'range', label: 'Glow' }, { k: 'mirrorSplit', kind: 'range', label: 'Split' }, { k: 'mirrorStrength', kind: 'range', label: 'Strength' }] },
  { name: 'Screen', knobs: [{ k: 'paper', kind: 'range', label: 'Paper' }, { k: 'fringe', kind: 'range', label: 'Fringe' }, { k: 'grain', kind: 'range', label: 'Grain' }, { k: 'vignette', kind: 'range', label: 'Vignette' }, { k: 'lineAlpha', kind: 'range', label: 'Lines' }, { k: 'linePeriod', kind: 'range', label: 'Line pitch' }] },
  { name: 'Sound', knobs: [{ k: 'sound', kind: 'toggle', label: 'Clicks and notes' }, { k: 'volume', kind: 'range', label: 'Volume' }] },
];
export const WHEEL_LABELS: Record<string, string> = { study: 'Study (Helvetica Neue)', geist: 'Geist', hack: 'BUILD alone', both: 'With the Supabase mark', name: 'BUILD and the name', builder: 'Pixel globe and the name', spoke: 'Cells at the name', column: 'One column on the left', glass: 'Glass', ascii: 'Text frames', none: 'No globe', rings: 'City rings' };
/* the text globe's mode values, by key and value (several share a word with the wheel's own modes) */
export const GLOBE_LABELS: Record<string, string> = {
  'globeArrive:none': 'At once', 'globeArrive:sweep': 'Sweep', 'globeArrive:print': 'Print',
  'globeTurn:step': 'Step', 'globeTurn:wake': 'Wake', 'globeLand:plain': 'Plain', 'globeLand:hold': 'Hold',
  'globeLight:none': 'None', 'globeLight:morning': 'Morning', 'globeMarks:one': 'Chosen only', 'globeMarks:all': 'Every city', 'globeMarks:tags': 'Every city, tag pointed',
  'globePick:off': 'Off', 'globePick:on': 'On', 'globeRim:plain': 'Plain', 'globeRim:ticks': 'Latitudes',
  'prize:beside': 'Beside the amount', 'prize:lens': 'Lens over the last 0', 'prize:protected': 'Protected, no globe', 'prize:none': 'None, digits step in',
  'prizeOverlap:edge': 'Edge through the 0', 'prizeOverlap:whole': 'Whole 0 inside', 'prizeCell:gap': 'Cells, hairline', 'prizeCell:block': 'Cells, touching', 'prizeCell:char': 'Densest character',
  'prizeBand:off': 'None', 'prizeBand:hatch': 'Hatch', 'prizeBand:stars': 'Stars', 'prizeTurn:still': 'Still', 'prizeTurn:once': 'One turn in view', 'prizeTurn:loop': 'Keeps turning', 'prizePhone:raise': 'Raised into the 0', 'prizePhone:clear': 'Under, rim clear', 'prizePhone:lens': 'On the 0, as wide', 'prizePhone:none': 'No globe',
  'globeBlink:forever': 'Forever', 'globeBlink:few': 'A few, then holds', 'globeHandover:leave': 'Leave', 'globeHandover:thin': 'Thin out',
};
export function wheelLabel(k: string, v: string): string { return GLOBE_LABELS[k + ':' + v] ?? WHEEL_LABELS[v] ?? v; }
export const WHEEL_INT = new Set(['ink', 'wheelPx', 'dragPx', 'ghosts', 'edgeTaps', 'paper', 'linePeriod', 'statusDelay', 'globeFps', 'ringCount', 'globeBlinks', 'globeMid', 'globeLarge', 'globeSweep', 'globeWake', 'globeHold', 'globeThinSteps', 'globeDots', 'globeSeed', 'prizeBandRows', 'prizeWeight']);
