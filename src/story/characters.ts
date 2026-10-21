// Story cast, ambient pedestrian chatter and cutscenes for Neon Bay.

export interface DialogueLine {
  /** Character id from CHARACTERS, or 'narrator'. */
  speaker: string;
  text: string;
}

export type ShirtPattern = 'hawaiian' | 'plain' | 'suit' | 'labcoat';

export interface Outfit {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  shirtPattern?: ShirtPattern;
}

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  portraitColor: string;
  outfit: Outfit;
  bio: string;
  greeting: string[];
  idle: string[];
}

export const CHARACTERS: Record<string, CharacterDef> = {
  rico: {
    id: 'rico',
    name: 'Rico Vega',
    role: 'Junior Security Analyst, Sunset Shield',
    portraitColor: '#19e6ff',
    outfit: { shirt: '#1fb5c9', pants: '#e9e4d8', skin: '#c68a5e', hair: '#1d1410', shirtPattern: 'hawaiian' },
    bio: 'Self-taught defender from up north. Fixed his whole apartment block\'s Wi-Fi at fifteen. Came to Neon Bay for the sun; stayed for the incidents.',
    greeting: ['Rico Vega, Sunset Shield. How can I help?'],
    idle: ['Patch first, coffee second.', 'Trust, but verify the sender.'],
  },
  max: {
    id: 'max',
    name: 'Max Cortez',
    role: 'Head of Operations, Sunset Shield Security',
    portraitColor: '#ff8a3d',
    outfit: { shirt: '#2a3f66', pants: '#2b2b33', skin: '#8d5a3b', hair: '#b8b8b8', shirtPattern: 'plain' },
    bio: 'Ex-Navy signals officer turned SOC lead. Has seen every flavor of breach and has a dry one-liner for each. Runs Sunset Shield like a ship: tight, calm, and always logged.',
    greeting: [
      'Vega. Good. The coffee is terrible and the threats are real.',
      'Back on deck? Logs don\'t read themselves.',
      'If it\'s urgent, it\'s probably phishing. If it\'s REALLY urgent, it\'s definitely phishing.',
    ],
    idle: [
      'Least privilege, Vega. Nobody needs admin to read the lunch menu.',
      'Defense in depth: if one wall falls, the next one had better be standing.',
      'An unpatched server is a welcome mat with your address on it.',
      'In the Navy we said "loose lips sink ships." Now it\'s loose passwords.',
      'Document everything. Future-you will be grateful. Lawyers too.',
    ],
  },
  carla: {
    id: 'carla',
    name: 'Carla Reyes',
    role: 'Owner, Coral Café',
    portraitColor: '#ff7f6b',
    outfit: { shirt: '#ffd6a5', pants: '#3d2f4f', skin: '#d9a07a', hair: '#4a2a1a', shirtPattern: 'plain' },
    bio: 'Runs the best café on Ocean Drive. Knows every regular by name and every pastry by heart. Computers, less so — but she learns fast when her business is on the line.',
    greeting: [
      'Rico! Sit, sit. Cafecito is on the house — computers are on you.',
      'My nephew says I should "turn it off and on again." I did. Twice.',
      'You look hungry. And smart. Mostly hungry.',
    ],
    idle: [
      'I wrote my passwords on a sticky note. Then I hid the sticky note. Under the keyboard.',
      'A bank emailed me with a typo in their own name. Even I noticed that one.',
      'Now I use one of those password managers. It remembers so I don\'t have to.',
      'MFA? Mucho Fantástico Authentication. That\'s what I call it.',
    ],
  },
  dex: {
    id: 'dex',
    name: 'Dex Holloway',
    role: 'SOC Manager, Harbor Security Operations Center',
    portraitColor: '#7b2cff',
    outfit: { shirt: '#1b1438', pants: '#2a2a2a', skin: '#f0c8a8', hair: '#d14a1f', shirtPattern: 'plain' },
    bio: 'Runs the Harbor SOC on cold brew and alert fatigue. Talks fast, thinks faster. Believes every dashboard can be improved by one more graph.',
    greeting: [
      'Rico! Grab a chair, grab a coffee, grab an alert. We have plenty.',
      'Three monitors, four energy drinks, five hundred alerts. Normal Tuesday.',
      'Welcome to the SOC. Don\'t touch the red button. Kidding. There\'s no red button. Probably.',
    ],
    idle: [
      'False positives are the price of visibility. Tune, don\'t ignore.',
      'Beaconing every sixty seconds? Malware loves a schedule.',
      'Port 23 open to the internet? It\'s not 1985, people. Well, the music is.',
      'If you can\'t see it in the logs, it didn\'t happen. Or worse — it did.',
    ],
  },
  tito: {
    id: 'tito',
    name: 'Tito Ramos',
    role: 'Network Engineer, Harbor Cloud',
    portraitColor: '#3dffb0',
    outfit: { shirt: '#ff9f6b', pants: '#2f3a4a', skin: '#a8714f', hair: '#111111', shirtPattern: 'hawaiian' },
    bio: 'Keeps Harbor Cloud\'s cables tidy and its firewalls tighter. Dances salsa in the server aisle when the uptime graph is green. Hates "ALLOW ANY ANY" with a burning passion.',
    greeting: [
      '¡Ey, Rico! Mind the cables — they\'re color-coded, like my heart.',
      'Every packet in this building passes through rules I wrote. Mostly.',
      'You dance? No? Firewall rules are like salsa: order matters.',
    ],
    idle: [
      'Segment your network. Your printer does NOT need to talk to the database.',
      'First match wins in a firewall. Put your specific rules on top.',
      'Default deny. Allow only what the business actually needs.',
      'A flat network is a party where every guest has every key.',
    ],
  },
  marisol: {
    id: 'marisol',
    name: 'Marisol Vance',
    role: 'Chief Operating Officer, Palmetto Bank',
    portraitColor: '#ffd23f',
    outfit: { shirt: '#f4f1ea', pants: '#1f2233', skin: '#e8b48f', hair: '#2d1b10', shirtPattern: 'suit' },
    bio: 'Sharp, polished and three moves ahead. Built Palmetto Bank\'s operations from a single branch to the tallest tower in the bay. Expects facts, not excuses.',
    greeting: [
      'Mr. Vega. You have five minutes. Make them count.',
      'Palmetto Bank runs on trust. I\'d like to keep it that way.',
      'Results, Mr. Vega. I can read a report faster than you can apologize.',
    ],
    idle: [
      'Any change to payment details gets a callback to the number on file. No exceptions.',
      'Our staff are trained to say no to the CEO. Especially to the "CEO" who emails from a gmail account.',
      'Business continuity isn\'t a document. It\'s a habit.',
    ],
  },
  lena: {
    id: 'lena',
    name: 'Dr. Lena Okafor',
    role: 'Professor of Digital Forensics, Bayview University',
    portraitColor: '#b14dff',
    outfit: { shirt: '#f7f7f7', pants: '#3a3550', skin: '#6b4430', hair: '#141010', shirtPattern: 'labcoat' },
    bio: 'Meticulous forensic scientist who testified in more trials than she can count. Treats every timestamp like a witness and every hash like a fingerprint.',
    greeting: [
      'Rico. Gloves on, assumptions off.',
      'Evidence first, theories later. Always in that order.',
      'Ah, the analyst who asks good questions. Welcome to the lab.',
    ],
    idle: [
      'Never work on the original drive. Image it, hash it, then analyze the copy.',
      'Chain of custody: who touched it, when, and why. Write it down.',
      'Normalize your time zones before you build a timeline. UTC is your friend.',
      'Correlation is a clue, not a conviction.',
    ],
  },
  priya: {
    id: 'priya',
    name: 'Priya Shah',
    role: 'Security Researcher & Byte Bazaar stall owner',
    portraitColor: '#ff2fa0',
    outfit: { shirt: '#2fb5a8', pants: '#1a1a2e', skin: '#b5835a', hair: '#0f0a0a', shirtPattern: 'plain' },
    bio: 'Ethical hacker, CTF champion and the only person in the Tech Market who reads license agreements. Sells refurbished gear by day, reports vulnerabilities responsibly by night.',
    greeting: [
      'Hey Rico! Looking for gadgets or gossip? I have both.',
      'Everything here is legit, refurbished and wiped. I checked. Twice.',
      'Found a bug? Report it, don\'t exploit it. That\'s the code.',
    ],
    idle: [
      'Responsible disclosure: tell the owner, give them time, then talk.',
      'That "FreeBeachWiFi" network? Not free. You pay with your data.',
      'Base64 isn\'t encryption. It\'s just a costume.',
      'Hackers don\'t break in, they log in. Protect your credentials.',
    ],
  },
  flamingo: {
    id: 'flamingo',
    name: 'The Flamingo',
    role: 'Leader of the Pink Tide crew',
    portraitColor: '#ff2fa0',
    outfit: { shirt: '#ff5cad', pants: '#ffffff', skin: '#d8a687', hair: '#f5f0e6', shirtPattern: 'suit' },
    bio: 'Theatrical, vain and dangerously clever. Leads the Pink Tide, a crew that phishes, plants and extorts its way across Neon Bay — and always signs its work in pink.',
    greeting: [
      'Darling. You\'re late to the party — the Tide already came in.',
      'Every city has a weakness. Yours wears a lanyard and clicks links.',
    ],
    idle: [
      'Security is a costume. I simply change into something more... pink.',
      'Your passwords are my playlist, Mr. Vega.',
    ],
  },
};

/** Ambient pedestrian chatter. Each line hides a security habit to notice (good or bad). */
export const PEDESTRIAN_LINES: string[] = [
  'My password is my dog\'s name. He\'s very secure. He bites.',
  'I got a text saying I won a jet ski! I just need to pay the shipping...',
  'Free Wi-Fi on the beach! I\'m checking my bank account right now.',
  'I never update my phone. The new emojis aren\'t worth it.',
  'My boss emailed me for gift cards. Urgently. Weird, he\'s on vacation.',
  'I use the same password everywhere. Easier to remember, right?',
  'I turned on two-factor. Now my phone buzzes when someone tries my account. Creepy, but good.',
  'Who reads the sender address? The logo looked real!',
  'I back up my photos three ways. Ever since the Great Laptop Flood of \'84.',
  'Someone called saying they\'re from "IT" and asked for my code. I hung up and called IT back.',
  'Found a USB stick in the parking lot. Should I plug it in? ...Nah.',
  'My router password is still "admin". The router is still on my side, I hope.',
  'I hover over links before clicking. My cousin taught me. He works at a bank.',
  'Password manager? I have one. It\'s called a notebook.',
  'The website had a padlock, so it\'s safe! ...That\'s how it works, right?',
  'My smart fridge got hacked. Now it orders pineapple. I hate pineapple.',
  'I locked my screen when I went to get a coffee. Habit from work.',
  'They said my account would close in 24 hours unless I click. So dramatic.',
  'I shred anything with my name on it. Dumpster divers are real, man.',
  'My kid set my password. It\'s "password1". She says the 1 makes it strong.',
  'Saw a flamingo spray-painted on the bank ATM. Pink Tide, they say.',
  'I only download apps from the official store. Learned that the hard way.',
  'The guy in the van offered to "fix my computer for free". Hard pass.',
  'Ocean Drive at sunset, my phone at 2%. Paradise.',
  'My password has 20 characters. It\'s three random words and a fish emoji. Okay, no emoji.',
  'Someone left their laptop unlocked at the café. I locked it for them.',
  'I post my vacation dates online so everyone knows I\'m away! ...Wait.',
  'My email got hacked. Changed the password and turned on MFA. Never again.',
  'Did you hear? Somebody at Palmetto Bank almost wired a million to "the CEO".',
  'I reported a phishing email at work and got a donut. Security pays.',
  'My bike lock is stronger than my email password. Priorities.',
  'Update available? Later. Always later. Later never comes.',
  'I don\'t click "Enable Macros". I don\'t even know what a macro is.',
  'They say the Pink Tide uses fake Wi-Fi hotspots. Creepy.',
  'Saw a guy tailgate into the data center. Security guard was on it fast.',
  'My grandma spots scam calls better than anyone. She just asks for their callback number.',
  'I checked the URL. It said "pa1mettobank". Nice try.',
  'Sunscreen and software updates: apply regularly.',
  'I gave a quiz app my birthday, pet name and first car. For fun!',
  'Encryption? That\'s when my teenager talks to me.',
];

export const INTRO_CUTSCENE: DialogueLine[] = [
  { speaker: 'narrator', text: 'Neon Bay, 1986. Sunset paints the towers pink as a yellow taxi rolls down Ocean Drive.' },
  { speaker: 'narrator', text: 'In the back seat: Rico Vega, one duffel bag, one laptop, and a job offer from Sunset Shield Security.' },
  { speaker: 'rico', text: 'Palm trees, neon, ocean breeze... and somewhere out there, a network begging to be patched.' },
  { speaker: 'narrator', text: 'His pager buzzes. Then the car phone rings.' },
  { speaker: 'max', text: 'Vega? Max Cortez. Welcome to Neon Bay. Hope you packed sunscreen, because the city\'s on fire.' },
  { speaker: 'max', text: 'Three businesses hit this week. Fake emails, weird traffic, accounts hijacked. Somebody\'s organizing this.' },
  { speaker: 'rico', text: 'Somebody with a name?' },
  { speaker: 'max', text: 'They sign their work with a pink flamingo. The street calls them the Pink Tide.' },
  { speaker: 'max', text: 'Get to HQ on Ocean Drive. Pink building, big neon sign. You can\'t miss it — believe me, I\'ve tried.' },
];

export const ENDING_CUTSCENE: DialogueLine[] = [
  { speaker: 'narrator', text: 'Palmetto Bank\'s systems hum back to life. Backups verified. Accounts locked down. Not a single dollar wired to the Tide.' },
  { speaker: 'marisol', text: 'Mr. Vega. The board wanted to pay the ransom. I told them to wait for you. I\'m glad I did.' },
  { speaker: 'narrator', text: 'At dawn, Neon Bay police arrest a flamboyant figure trying to board a yacht with a pink hard drive.' },
  { speaker: 'flamingo', text: 'You\'ve won a battle, darling. But somewhere out there, somebody is still reusing their password.' },
  { speaker: 'max', text: 'He\'s not wrong. That\'s why we don\'t stop. Good work, Vega. Welcome to the crew — for real this time.' },
  { speaker: 'rico', text: 'Same city. New mission. Let\'s keep it cyber safe.' },
  { speaker: 'narrator', text: 'THE END... of chapter one. Neon Bay is still yours to explore: side missions, data shards and the Cyber Lab await.' },
];
