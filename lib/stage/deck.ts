/* The deck every city starts with: the default wording, the steps
   of each scene, what the next press does in words, and the host's notes. A host adds, hides and reorders on the desk;
   the event scenes can be hidden, never deleted. At most twelve words on an intro scene. The wording says "your
   editor"; a city may set the tool's name in its deck data (`editor`). Pure. */

import type { SceneData, SceneKind, SceneRow } from './types';

/* the seven needs: what an app needs behind it, and what you would otherwise wire yourself */
export const NEEDS: [string, string][] = [
  ['Write the app', 'your editor'],
  ['Store your data', 'a database server, backups'],
  ['Store files and media', 'a bucket, a CDN, signed links'],
  ['Run backend logic', 'a server, deploys, cold starts'],
  ['Sign users in', 'an auth service, sessions, resets'],
  ['Search by meaning', 'a vector database'],
  ['Send live updates', 'a socket server'],
];
/* what the seven fold into: the project's parts, in the needs' order (the editor stays the editor) */
export const ONE: string[] = ['Postgres', 'Storage', 'Edge Functions', 'Auth', 'Vector', 'Realtime'];

/* the site's own rules (the entry checks hold them), and Supabase */
/* who may submit and who may vote, said the same way on every scene that says it, and never
   the same way as each other */
export const TO_SUBMIT = 'To submit, sign in with your Supabase account and get checked in by a host at the door. Then the Submit button works.';
export const TO_VOTE = 'Anyone can vote: give an email and confirm it once.';
export const RULES = ['Start a new public repository today.', 'Push as you go, not all at the end.', 'Build anything, as long as it uses Supabase.'];

const sc = (city: string, position: number, kind: SceneKind, title: string, notes: string, data: SceneData = {}, hidden = false): SceneRow =>
  ({ id: city + '-' + position, city, position, kind, title, data, notes, hidden });

/* The default deck. sample: the lab's speaker slides and hosts (made-up, marked as samples in the notes); the real
   deck starts with none and the host adds their own. */
export function defaultDeck(city: string, sample = false): SceneRow[] {
  let n = 0; const p = () => ++n;
  const deck: SceneRow[] = [
    sc(city, p(), 'doors', 'Doors', 'On while people arrive. Builders sign in with their Supabase account and a host checks them in at the door; that unlocks Submit. Someone not on the list is added on the desk first. Anyone signed in can vote.'),
    sc(city, p(), 'welcome', 'Welcome', 'Say who you are and who is helping tonight.', sample ? { hosts: ['Ana Costa', 'Femi Adeyemi'] } : {}),
  ];
  if (sample) {
    deck.push(sc(city, p(), 'speaker', 'Speaker: Ana Costa', 'Sample speaker slide. Hosts add their own on the desk.', { name: 'Ana Costa', role: 'Developer advocate, Supabase', line: 'Ship it before lunch.' }));
    deck.push(sc(city, p(), 'words', 'Tonight', 'Sample words slide: a heading and up to three lines.', { heading: 'Tonight', lines: ['A short talk', 'Time to build', 'Votes, then the top 3'] }));
  }
  deck.push(
    sc(city, p(), 'question', 'What is a backend?', 'Most of the room may never have coded. Ask, then let it sit.'),
    sc(city, p(), 'needs', 'A handful of things', 'One press per need. The last press folds them into one project.'),
    sc(city, p(), 'tour', 'Platform tour', 'Optional. Open the tour in the next tab; come back here and press Next.'),
    sc(city, p(), 'say', 'Say what you want', 'Nobody needs to know how it works.'),
    sc(city, p(), 'line', 'Prototype to Petabyte', 'Tonight is the prototype. The same backend goes all the way.'),
    sc(city, p(), 'deadline', 'The deadline', 'The second press turns the wall to the deadline. Nobody has been told yet.'),
    sc(city, p(), 'rules', 'The rules', 'One rule per press. The last press sets the two apart: submitting needs a place on the Luma list and a check-in at the door; voting is open to anyone signed in.'),
    sc(city, p(), 'prizes', 'The prizes', 'First the city prize, then the pick.'),
    sc(city, p(), 'submit', 'How to submit', 'Your editor first, then the web. Both need a check-in at the door before Submit works. Not on the list: a host adds them on the desk; they can vote meanwhile.'),
    sc(city, p(), 'questions', 'Questions?', 'Then go to Building and start the clock.'),
    sc(city, p(), 'building', 'Building', 'Start the clock from here. Add minutes if the room needs them. Show the ranking when the room is ready for it.'),
    sc(city, p(), 'voting', 'Voting', 'Voting runs from the start of building. Anyone can vote with an email, confirmed once. Read the top out now and then.'),
    sc(city, p(), 'showcase', 'What was built', 'Off by default. The entries in turn, one a board tick: picture, name, who built it, the pitch. Leave it on while people vote or eat.', {}, true),
    sc(city, p(), 'top3', 'The top 3', 'One press per place, third first. Start the talk timer as each one presents.'),
    sc(city, p(), 'tombola', 'Tombola', 'Off by default. A draw among everyone outside the top 3. Ask for a drum roll.', {}, true),
    sc(city, p(), 'final', 'The final', 'Where to watch the final. The ten cities fill in as they finish.'),
  );
  return deck;
}

/* the steps of a scene: step 0 is what the wall shows on arrival; each press moves one on */
export function stepsOf(s: SceneRow): number {
  switch (s.kind) {
    case 'needs': return NEEDS.length + 2; /* the heading alone, the seven, the fold */
    case 'line': return 4;                 /* Prototype alone, the line to Petabyte, the captions, the heading */
    case 'deadline': return 2;
    case 'rules': return RULES.length + 1;
    case 'prizes': return 2;
    case 'submit': return 2;
    case 'top3': return 4;                 /* three closed places, then third, second, first */
    case 'tombola': return 2;              /* ready, then the spin */
    case 'words': return 1;
    default: return 1;
  }
}

export const visible = (deck: SceneRow[]) => deck.filter((s) => !s.hidden).sort((a, b) => a.position - b.position);
export const editorOf = (s: SceneRow | undefined) => (s?.data.editor ? s.data.editor : 'your editor');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* what the wall shows at a step, in a few words, for the remote's "Next:" line */
function stepWords(s: SceneRow, step: number): string {
  switch (s.kind) {
    case 'needs': return step === 0 ? 'The heading' : step <= NEEDS.length ? NEEDS[step - 1][0] : 'Fold them into one project';
    case 'line': return ['Prototype', 'The line to Petabyte', 'A weekend project, a public company', 'Same experience, every stage'][step] ?? '';
    case 'deadline': return step ? 'Flip to the deadline' : 'You have the minutes';
    case 'rules': return step < RULES.length ? 'Rule ' + (step + 1) + ': ' + RULES[step].replace(/\.$/, '') : 'Who submits, who votes';
    case 'prizes': return step ? 'The pick' : 'The city prize';
    case 'submit': return step ? 'On the web' : 'From ' + editorOf(s);
    case 'top3': return step === 0 ? 'Three closed places' : ['', 'Reveal third', 'Reveal second', 'Reveal first'][step];
    case 'tombola': return step ? 'Spin' : 'Ready to draw';
    default: return s.title;
  }
}

/* the label of the next press, in words ("Next: Store your data") */
export function nextWords(deck: SceneRow[], id: string, step: number, started: boolean): string {
  const v = visible(deck), i = v.findIndex((s) => s.id === id), s = v[i];
  if (!s) return v[0] ? v[0].title : '';
  if (s.kind === 'building' && !started) return 'Start the clock';
  if (step + 1 < stepsOf(s)) return cap(stepWords(s, step + 1));
  const n = v[i + 1];
  return n ? n.title : 'End of the deck';
}
