// Text messages from the cast reacting to story progress + canned replies. Pure.

export interface TextMsg {
  out: boolean;
  text: string;
  time: number;
}

export interface Thread {
  with: string;
  msgs: TextMsg[];
  unread: number;
  /** Pending reply choices: [reply text, their response, relationship points]. */
  replies: [string, string, number][];
}

export interface TriggerState {
  completed: string[];
  day: number;
  hour: number;
  rel: Record<string, number>;
  stats: { fat: number; muscle: number; strength: number };
}

export interface TextTrigger {
  id: string;
  from: string;
  when: (s: TriggerState) => boolean;
  text: string;
  replies: [string, string, number][];
}

const done = (id: string) => (s: TriggerState) => s.completed.includes(id);

export const TRIGGERS: TextTrigger[] = [
  { id: 'welcome', from: 'carla', when: () => true, text: 'Hey stranger! Café con leche is on the house whenever you swing by Coral Café ☕', replies: [['Be there soon!', 'Yay! I\'ll save you a pastelito 🥐', 3], ['Make it a double.', 'Ha! Workaholic. Double it is.', 2]] },
  { id: 'm01', from: 'max', when: done('m01-welcome'), text: 'Good first day, kid. Get some rest — your apartment\'s in Old Town, near Carla\'s. Neon Bay doesn\'t sleep, but you should.', replies: [['Thanks boss.', 'Don\'t thank me yet. 😎', 2], ['Rest is for the weak.', 'Said every burned-out analyst ever. Sleep.', 1]] },
  { id: 'm02', from: 'carla', when: done('m02-phish'), text: 'My staff ALL got that fake invoice email. You saved us. I owe you big time 💕', replies: [['Just doing my job.', 'Humble AND cute. Stop by later!', 4], ['Free coffee for life?', 'Let\'s say… a month. 😂', 3]] },
  { id: 'm03', from: 'dex', when: done('m03-wire'), text: 'Wire was clean after your sweep. Nice work. Want to shoot hoops at the beach court sometime?', replies: [['You\'re on.', 'Bring your A game. I don\'t miss. 🏀', 3], ['I\'d destroy you.', 'Big talk. Beach court. Any night.', 2]] },
  { id: 'm04', from: 'tito', when: done('m04-walls'), text: 'Firewall\'s holding like a dam. Beers at Tiki Bytes? Pool table is calling.', replies: [['First round\'s on me.', 'Now THAT\'S a security posture I like. 🍺', 3], ['Rain check.', 'Your loss, hermano.', 0]] },
  { id: 'm05', from: 'max', when: done('m05-chase'), text: 'That chase was insane. Maybe stay off Ocean Drive for a day or two, hotshot.', replies: [['No promises.', 'That\'s what I was afraid of.', 1], ['Yes sir.', 'Good. 👍', 2]] },
  { id: 'm06', from: 'tito', when: done('m06-payload'), text: 'Found 3 more copies of that payload. You probably saved half the harbor. Fishing on the pier this weekend?', replies: [['Sounds perfect.', 'I\'ll bring the bait. You bring snacks. 🎣', 3], ['I hate fish.', 'You don\'t have to EAT them 😂', 1]] },
  { id: 'm07', from: 'lena', when: done('m07-footprints'), text: 'Your forensic timeline was textbook. I\'m using it in my lecture (anonymized). Coffee sometime?', replies: [['I\'d be honored.', 'Coral Café, then. I like their espresso.', 4], ['Do I get royalties?', 'You get my eternal academic respect. 😏', 2]] },
  { id: 'm08', from: 'priya', when: done('m08-cipher'), text: 'The Flamingo\'s cipher was SO elegant. Come by the Bazaar, I\'ll show you my lockpick collection 🔐', replies: [['Nerd.', 'Takes one to know one 🤓', 3], ['On my way.', 'Bring snacks!', 3]] },
  { id: 'm09', from: 'max', when: done('m09-final'), text: 'You did it, Rico. The whole city owes you. Take the night off — that\'s an order. 🎉', replies: [['Party at Afterglow?', 'Only if you don\'t make me dance.', 3], ['Already asleep.', 'Smart man.', 2]] },
  { id: 's2-02', from: 'jules', when: done('s2-02'), text: 'Hospital systems are back online thanks to you. Drinks at Afterglow tonight? I need to dance off this stress.', replies: [['Let\'s go!', 'YES. See you on the floor 💃', 3], ['Tired…', 'Boo. Next time!', 0]] },
  { id: 's2-05', from: 'jules', when: done('s2-05'), text: 'Cloud\'s stable. You were a rockstar in that war room 🌩️', replies: [['Team effort.', 'Modest. I like it.', 3], ['I know.', 'Ha! Confidence suits you.', 2]] },
  { id: 's2-08', from: 'priya', when: done('s2-08'), text: 'Black Lotus is DONE. You realize you\'re a legend now, right? 🌸', replies: [['Just a guy in a loud shirt.', 'A LEGENDARY guy in a loud shirt.', 3]] },
  { id: 'gym', from: 'dex', when: (s) => s.stats.muscle > 45, text: 'Bro, have you been hitting the gym?? Max says you\'re looking jacked 💪', replies: [['Muscle Beach every day.', 'Respect. Teach me your ways.', 2]] },
  { id: 'chubby', from: 'carla', when: (s) => s.stats.fat > 60, text: 'Maybe switch from cubanos to the salad for a week? Just saying… with love 😘', replies: [['Rude!', 'Love you too 😂', 1], ['You\'re right.', 'Salad\'s on me next time!', 2]] },
  { id: 'skye-met', from: 'skye', when: (s) => (s.rel.skye ?? 0) > 0, text: 'Hey it\'s Skye from the lifeguard tower 🏄 Text me if you ever want to hit the beach!', replies: [['Definitely!', 'Awesome! Sunset swims are the best 🌅', 4], ['Maybe.', 'No pressure 😊', 1]] },
  { id: 'ruby-met', from: 'ruby', when: (s) => (s.rel.ruby ?? 0) > 0, text: 'It\'s Ruby. You\'ve got moves. Come back to Afterglow — I\'ll play your song 🎛️', replies: [['Which song?', 'Guess you\'ll have to come find out 😉', 4], ['I can\'t dance.', 'Everyone can dance in neon light.', 2]] },
];

/** Triggers that should fire now (not yet sent). */
export function dueTexts(sent: string[], s: TriggerState): TextTrigger[] {
  return TRIGGERS.filter((t) => !sent.includes(t.id) && t.when(s));
}

export function deliver(threads: Thread[], from: string, text: string, replies: [string, string, number][], now: number): Thread {
  let t = threads.find((x) => x.with === from);
  if (!t) { t = { with: from, msgs: [], unread: 0, replies: [] }; threads.push(t); }
  t.msgs.push({ out: false, text, time: now });
  t.unread++;
  t.replies = replies;
  if (t.msgs.length > 40) t.msgs.splice(0, t.msgs.length - 40);
  return t;
}

/** Send the i-th canned reply; returns relationship points earned (or null if none pending). */
export function reply(t: Thread, i: number, now: number): { points: number; response: string } | null {
  const r = t.replies[i];
  if (!r) return null;
  t.msgs.push({ out: true, text: r[0], time: now });
  t.msgs.push({ out: false, text: r[1], time: now + 1500 });
  t.replies = [];
  return { points: r[2], response: r[1] };
}
