// "Neon Bay Talk 86.1" — scripted talk-radio podcast segments with timing
// (seconds from segment start). The integrator can voice these with the
// project's TTS and schedule them on a radio station.

export interface PodcastLine {
  /** Seconds from the start of the episode. */
  t: number;
  speaker: string;
  text: string;
}

export interface PodcastEpisode {
  id: string;
  show: string;
  title: string;
  hosts: string[];
  lines: PodcastLine[];
}

export const PODCAST_STATION = { id: 'nbtalk', name: 'Neon Bay Talk 86.1', tagline: 'Talk radio for the terminally online' };

const ep = (id: string, show: string, title: string, hosts: string[], lines: [string, string][], pace = 4.2): PodcastEpisode => {
  let t = 0;
  return {
    id, show, title, hosts,
    lines: lines.map(([speaker, text]) => {
      const line = { t: Math.round(t * 10) / 10, speaker, text };
      t += Math.max(2.5, text.length / 15) + 0.6;
      void pace;
      return line;
    }),
  };
};

export const EPISODES: PodcastEpisode[] = [
  ep('ep1', 'Patch Tuesday Live', 'Your Password Is Bad (and That\'s OK)', ['Lou Bytes', 'Dee Crypt'], [
    ['Lou Bytes', 'Good evening Neon Bay, you\'re listening to Patch Tuesday Live on Neon Bay Talk eighty-six point one. I\'m Lou Bytes.'],
    ['Dee Crypt', 'And I\'m Dee Crypt. Tonight: passwords. Lou, what\'s yours?'],
    ['Lou Bytes', 'Nice try. But I\'ll tell you what it isn\'t. It isn\'t "flamingo one two three."'],
    ['Dee Crypt', 'Half our callers just changed their password. Good. Use a passphrase, folks. Four random words. Long beats clever.'],
    ['Lou Bytes', 'And turn on multi-factor. If a hacker gets your password, they still need your phone.'],
    ['Dee Crypt', 'First caller, you\'re on the air!'],
    ['Caller', 'Hi, uh, I got a text saying my Palmetto Bank account is frozen and I need to click a link?'],
    ['Lou Bytes', 'Don\'t click it. Hang up, call the number on the back of your card. That\'s phishing, my friend.'],
    ['Caller', 'Oh. Oh no. I already clicked it.'],
    ['Dee Crypt', 'Change your password now, call your bank, and turn on alerts. You\'re going to be fine. Great question.'],
    ['Lou Bytes', 'After the break: is your smart fridge spying on you? Spoiler: it\'s complicated.'],
  ]),
  ep('ep2', 'Neon Nights', 'Beach Report & Club Gossip', ['Ruby Lane', 'Big Sal'], [
    ['Big Sal', 'It\'s Neon Nights! Big Sal here with the one and only DJ Ruby Lane, live from Club Afterglow.'],
    ['Ruby Lane', 'Hey Neon Bay! The floor is packed, the lasers are pink, and somebody\'s wearing a Hawaiian shirt with confidence.'],
    ['Big Sal', 'Beach report: surf\'s chest high, Skye at tower two says watch the rip current by the pier.'],
    ['Ruby Lane', 'And the seagulls are, as always, criminals. Guard your fries.'],
    ['Big Sal', 'Somebody pulled a giant tarpon off Starlight Pier today. Photo\'s all over NeonFeed.'],
    ['Ruby Lane', 'Gym rats, Muscle Beach is open till midnight. Protein shakes at Coco Cabana.'],
    ['Big Sal', 'Next up, Ruby\'s spinning the new synthwave anthem. Neon Bay, let\'s glow!'],
  ]),
  ep('ep3', 'Wild Neon Bay', 'Gators, Gulls and Good Boys', ['Bea Watts'], [
    ['Bea Watts', 'Welcome to Wild Neon Bay, the only nature show broadcast between two car dealership ads.'],
    ['Bea Watts', 'This week: the harbor alligators. Yes, they\'re real. No, you cannot pet them.'],
    ['Bea Watts', 'They bask on the warm concrete by the industrial docks. Keep at least ten meters away, and never swim near them.'],
    ['Bea Watts', 'Over on the beach, ghost crabs scuttle sideways at sunset. Fun fact: they can run almost five meters a second.'],
    ['Bea Watts', 'And to the man who adopted the stray Shiba from the taco truck: thank you. That dog has the best life now.'],
    ['Bea Watts', 'Photo challenge! Snap a seagull, a pigeon, a cat and a gator on your phone and post them to NeonFeed.'],
  ]),
  ep('ep4', 'The Breach Report', 'Ransomware: A Love Story', ['Lou Bytes', 'Dr. Lena Okafor'], [
    ['Lou Bytes', 'This is The Breach Report. My guest is Doctor Lena Okafor from Bayview University. Welcome.'],
    ['Dr. Lena Okafor', 'Thank you, Lou. Happy to scare your listeners responsibly.'],
    ['Lou Bytes', 'Ransomware. What is it, in one sentence?'],
    ['Dr. Lena Okafor', 'Criminals encrypt your files and demand money for the key. The best defense is boring: backups, updates, and least privilege.'],
    ['Lou Bytes', 'Boring saves the day.'],
    ['Dr. Lena Okafor', 'Boring always saves the day. Keep an offline backup. Test that you can restore it.'],
    ['Lou Bytes', 'And if you do get hit?'],
    ['Dr. Lena Okafor', 'Isolate the machine, call your incident response team, and preserve evidence. Don\'t just wipe it in a panic.'],
  ]),
];

/** All lines flattened with episode metadata (for the integrator's radio). */
export function podcastLines(): (PodcastLine & { episode: string; show: string })[] {
  return EPISODES.flatMap((e) => e.lines.map((l) => ({ ...l, episode: e.id, show: e.show })));
}
