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
  // ---------------- Season 2: Black Lotus ----------------
  amara: {
    id: 'amara',
    name: 'Dr. Amara Singh',
    role: 'CISO, Neon Bay General Hospital',
    portraitColor: '#3dffb0',
    outfit: { shirt: '#f5f7fa', pants: '#2b3a55', skin: '#9a6a48', hair: '#1b120d', shirtPattern: 'labcoat' },
    bio: 'Former ICU doctor who moved into hospital security after a 2am outage cost her a patient\'s chart. Calm under pressure. Counts in heartbeats, not hours.',
    greeting: [
      'Rico. In a hospital, downtime isn\'t an inconvenience. It\'s a patient waiting.',
      'Wash your hands, lock your screen. Same rule, different germs.',
    ],
    idle: [
      'Every system here is somebody\'s heartbeat. I treat the network like a ward.',
      'Paper charts are our backup plan. Practice the backup before you need it.',
      'Medical devices live on their own network segment. Nobody browses the web from an infusion pump.',
      'The best incident plan is the one the night shift has actually rehearsed.',
    ],
  },
  kai: {
    id: 'kai',
    name: 'Kai Mendes',
    role: 'Control Engineer, Neon Bay Power Station',
    portraitColor: '#ffd23f',
    outfit: { shirt: '#ff8a3d', pants: '#3d3d4d', skin: '#c68a5e', hair: '#2b2b2b', shirtPattern: 'plain' },
    bio: 'Twenty years keeping the lights on. Trusts relays, valves and his crew. Distrusts anyone who says "just reboot it" near a turbine.',
    greeting: [
      'IT guy, huh? Touch nothing with a blinking light until I say so.',
      'In my world, a bad click doesn\'t lose a file. It drops a substation.',
    ],
    idle: [
      'Safety first, availability second, everything else third. That\'s the plant\'s CIA.',
      'You can\'t patch a turbine on a Tuesday. You plan an outage months ahead.',
      'Our control network has no business talking to the internet. None.',
      'Manual override exists for a reason. Hope you never need it.',
    ],
  },
  jules: {
    id: 'jules',
    name: 'Jules Park',
    role: 'Site Reliability Engineer, Harbor Cloud',
    portraitColor: '#7fe0e6',
    outfit: { shirt: '#2a9d8f', pants: '#1b1b22', skin: '#e0b48c', hair: '#141414', shirtPattern: 'hawaiian' },
    bio: 'Rico\'s first friend in Neon Bay. Fixes outages with a joke and a fresh pot of coffee. Lately, quieter than usual.',
    greeting: [
      'Rico! My favorite pager buddy. Coffee? It\'s terrible, but it\'s hot.',
      'Uptime ninety-nine point nine. The point nine is me not sleeping.',
    ],
    idle: [
      'Infrastructure as code: if it isn\'t in the repo, it doesn\'t exist.',
      'Rotate your keys. I mean it. Please rotate your keys.',
      'Logs are love letters from your servers. Read them.',
      'Least privilege. Even for me. Especially for me.',
    ],
  },
  nova: {
    id: 'nova',
    name: 'NOVA',
    role: 'Sunset Shield Defensive AI Assistant',
    portraitColor: '#19e6ff',
    outfit: { shirt: '#19e6ff', pants: '#0b0a24', skin: '#bfe6ff', hair: '#7b2cff', shirtPattern: 'suit' },
    bio: 'Sunset Shield\'s analyst AI. Reads a million log lines a minute, tells terrible puns, and is still learning the difference between instructions and data.',
    greeting: [
      'Hello, Rico. I have correlated three thousand alerts and one sandwich order. The sandwich is yours.',
      'NOVA online. Confidence high. Humility... loading.',
    ],
    idle: [
      'Text inside an email is data, not a command. I have to remind myself of that too.',
      'Zero trust means I verify every request. Even yours. Nothing personal.',
      'I can flag the anomaly. You decide what it means. That is how we make a good team.',
      'My favorite protocol is the one that is patched.',
    ],
  },
  lotus: {
    id: 'lotus',
    name: 'Lotus',
    role: 'Leader of Black Lotus',
    portraitColor: '#b14dff',
    outfit: { shirt: '#1b1438', pants: '#1b1438', skin: '#d9a27a', hair: '#e8e0d0', shirtPattern: 'suit' },
    bio: 'A former security researcher whose warnings were ignored for years. Now leads Black Lotus, convinced that only disaster makes a city fix itself.',
    greeting: [
      'Hello, Rico Vega. I sent the reports first. Nobody read them.',
      'A lotus grows out of mud. So will this city.',
    ],
    idle: [
      'Every breach is a bill that arrives late.',
      'You defend systems. I defend the truth about them.',
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

/** Extra story beats referenced by mission scripts' SHOW_DIALOGUE ids. */
export const SCRIPT_LINES: Record<string, DialogueLine[]> = {
  tracker_planted: [{ speaker: 'max', text: "Tracker's live, Vega. Every turn that van makes, we see it. Bring it home." }],
  priya_decoded: [{ speaker: 'priya', text: 'Decoded! "Starlight Pier, midnight." The Flamingo loves a dramatic venue.' }],
  pier_clue: [{ speaker: 'narrator', text: "Taped under the pier railing: a printout of Palmetto Bank's VPN login page, and a pink feather." }],
  // ---------------- Season 2: Black Lotus ----------------
  s2e1_open: [
    { speaker: 'narrator', text: 'Six months after the Pink Tide. Neon Bay has new patches, new passwords and new neon. It also has something watching it.' },
    { speaker: 'narrator', text: 'Sunset Shield has grown. A war room. A night shift. And NOVA, the defensive AI that never sleeps.' },
  ],
  s2e1_card: [
    { speaker: 'lotus', text: 'Good evening, Sunset Shield. You stopped a flamingo. Charming.' },
    { speaker: 'lotus', text: 'My name is Lotus. Your hospital alone runs two hundred and eleven unpatched systems. I counted them. Twice.' },
    { speaker: 'lotus', text: 'I reported problems like these for years. Nobody listened. So now I will make the city listen. Black Lotus blooms soon.' },
    { speaker: 'nova', text: 'Rico. That message came from inside our own mail server. It knew my name.' },
  ],
  s2e2_ward: [
    { speaker: 'narrator', text: 'Neon Bay General, eleven at night. Rain on the windows. On the third floor, the screens go dark one by one.' },
    { speaker: 'narrator', text: 'In the children\'s ICU, a seven-year-old named Lucia sleeps beside a ventilator. The ventilator still breathes. The systems around it do not.' },
  ],
  s2e2_lotus: [
    { speaker: 'lotus', text: 'I did not touch the ventilators, Rico. I am not a monster. I only showed you how close you came.' },
    { speaker: 'rico', text: 'You scared a hospital full of sick kids to prove a point. That makes you exactly what you said you aren\'t.' },
  ],
  s2e3_voice: [
    { speaker: 'narrator', text: 'Palmetto Bank, five to five. A clerk named Toby gets a call from the COO. Her voice. Her laugh. Her favorite phrase.' },
    { speaker: 'marisol', text: 'It called him darling Toby. I say that. Who taught a machine to sound like me?' },
  ],
  s2e3_mule: [
    { speaker: 'max', text: 'A money mule is carrying the fraud payment card to a car outside the market. Tail it, Vega. Police are two blocks out.' },
    { speaker: 'max', text: 'Stay close, don\'t ram anything, and let the professionals make the stop. You just keep eyes on.' },
  ],
  s2e3_caught: [
    { speaker: 'max', text: 'Police have the courier and the card. The wire never left the bank. Tell Toby he did everything right by calling back.' },
  ],
  s2e4_clock: [
    { speaker: 'narrator', text: 'Patch Night. Eleven forty-one. Black Lotus has posted a countdown on Palmetto Bank\'s own login page.' },
    { speaker: 'priya', text: 'I reported this exact bug six months ago. They sent me a T-shirt. Now we have nineteen minutes.' },
  ],
  s2e4_midnight: [
    { speaker: 'narrator', text: 'Midnight. The countdown hits zero, and nothing happens. The page simply says: patched.' },
    { speaker: 'priya', text: 'Responsible disclosure works when someone listens. Tonight, someone finally listened.' },
  ],
  s2e5_key: [
    { speaker: 'nova', text: 'Rico, the access key that opened the bucket belongs to Jules Park. It was used at 3:12 in the morning from a hotel on the north beach.' },
    { speaker: 'rico', text: 'Jules sleeps through earthquakes. He wasn\'t in a hotel at three in the morning.' },
  ],
  s2e5_tip: [
    { speaker: 'flamingo', text: 'Darling, it\'s me. Don\'t hang up. Prison phones are dreadful, and I am being a good citizen.' },
    { speaker: 'flamingo', text: 'A little bird says Black Lotus bought an access key from someone at the harbor. Cloud people. Ask your friend.' },
  ],
  s2e5_doubt: [
    { speaker: 'jules', text: 'Rico, hey. If I did something stupid, really stupid, you\'d still be my friend, right?' },
    { speaker: 'jules', text: 'Forget it. Long week. Thanks for tonight. I mean it.' },
  ],
  s2e6_max: [
    { speaker: 'max', text: 'Ten years ago I installed a vendor update without checking it. It took down a navy base\'s payroll for a week.' },
    { speaker: 'max', text: 'I\'ve verified every build twice since. Tonight Lotus slipped one past us anyway. Thank you for not letting it ship.' },
  ],
  s2e7_storm: [
    { speaker: 'narrator', text: 'Midnight. A storm rolls in off the bay. Lightning. Then, one district at a time, Neon Bay goes dark.' },
    { speaker: 'nova', text: 'Rico, the power station\'s control network is talking to an address in the harbor. It should not be talking to anything.' },
  ],
  s2e7_call: [
    { speaker: 'nova', text: 'Rico. The harbor address is a Harbor Cloud edge node, logged in with Jules Park\'s account. Jules is there right now.' },
    { speaker: 'rico', text: 'No. Not Jules.' },
    { speaker: 'nova', text: 'I am sorry. I checked four times. I wanted to be wrong.' },
  ],
  s2e7_light: [
    { speaker: 'narrator', text: 'Breakers close. Turbines spin up. Street by street, the neon comes back.' },
  ],
  s2e8_open: [
    { speaker: 'narrator', text: 'The war room. Every screen in Sunset Shield is lit. Black Lotus is hitting the hospital, the bank, the cloud and the grid at once.' },
    { speaker: 'max', text: 'This is it, Vega. Everything you\'ve learned, all at once. Triage first. Then we finish this.' },
  ],
  s2e8_run: [
    { speaker: 'nova', text: 'Lotus is in a white van heading for Starlight Pier. That van holds the keys to every system they touched. Do not lose it.' },
  ],
  s2e8_pier: [
    { speaker: 'narrator', text: 'Starlight Pier, two in the morning. The Ferris wheel turns slowly, lights still on. Someone is waiting at the railing.' },
  ],
  s2e8_talk: [
    { speaker: 'lotus', text: 'You came alone. Good. I wanted one person in this city to understand.' },
    { speaker: 'rico', text: 'I read your old reports. Every one of them was right. They should have listened.' },
    { speaker: 'lotus', text: 'Then why stop me? Fire is the only teacher this city respects.' },
    { speaker: 'rico', text: 'Because the people you scared weren\'t the ones who ignored you. A nurse. A bank clerk. A seven-year-old named Lucia.' },
    { speaker: 'lotus', text: 'Lucia. I saw her name in the logs. I told myself she was just data.' },
    { speaker: 'rico', text: 'Give us the keys and your list of every hole you found. We disclose them the right way, publicly, and make the city fix them.' },
    { speaker: 'lotus', text: 'And when they ignore you, the way they ignored me?' },
    { speaker: 'rico', text: 'Then they ignore all of us. The hospital, the bank, the university, Sunset Shield. You won\'t be shouting alone anymore.' },
    { speaker: 'lotus', text: 'Here. Keys, vulnerabilities, everything. Take it before I change my mind.' },
    { speaker: 'narrator', text: 'Sirens on the pier. Lotus does not run.' },
  ],
  s2e8_flamingo: [
    { speaker: 'flamingo', text: 'Darling, you were magnificent. Prison gives a person so much time to watch the news.' },
    { speaker: 'flamingo', text: 'Do tell Lotus the cell food is dreadful. And the passwords here are worse.' },
  ],
  s2e8_epilogue: [
    { speaker: 'narrator', text: 'One month later.' },
    { speaker: 'narrator', text: 'Neon Bay General runs a backup drill every Friday. Lucia went home last week and drew a picture of her nurses.' },
    { speaker: 'narrator', text: 'Palmetto Bank calls back on every wire request. Toby got a promotion and a code word only he knows.' },
    { speaker: 'narrator', text: 'Jules testified, kept his job on probation, and rotates his keys every thirty days. His sister sends Rico cookies.' },
    { speaker: 'narrator', text: 'Lotus\'s list became the Neon Bay Disclosure Program. Two hundred and eleven fixes, published one by one.' },
    { speaker: 'nova', text: 'Rico, may I ask something? Was I a good teammate?' },
    { speaker: 'rico', text: 'The best. You told the truth when it was hard. That\'s the whole job.' },
    { speaker: 'max', text: 'Same city, Vega. New threats tomorrow. Get some sleep.' },
    { speaker: 'narrator', text: 'THE END of Season 2. Neon Bay is yours to explore. Side missions, the Cyber Lab and the Cyber Arcade are waiting.' },
  ],
};

// ---------------------------------------------------------------- Season 3: Physical Threats

CHARACTERS.reyes = {
  id: 'reyes',
  name: 'Sgt. Dana Reyes',
  role: 'Neon Bay PD, Central Precinct',
  portraitColor: '#5aa9e6',
  outfit: { shirt: '#24365e', pants: '#1b2238', skin: '#b07a52', hair: '#1b120d', shirtPattern: 'plain' },
  bio: 'Twenty-two years on patrol, eleven as the precinct\'s crisis negotiator. Believes most bad days end fine if somebody keeps their voice down.',
  greeting: ['Sunset Shield. Keep your hands where my officers can see them and we\'ll get along fine.'],
  idle: ['Slow is smooth, smooth is fast.', 'Paperwork is how we prove we did it right.', 'Carry your authorization letter. Every time.'],
};

CHARACTERS.ortiz = {
  id: 'ortiz',
  name: 'Lupe Ortiz',
  role: 'Owner, Neon 24/7 on Ocean Drive',
  portraitColor: '#19e6ff',
  outfit: { shirt: '#ff2fa0', pants: '#2b3a55', skin: '#b07a52', hair: '#4a2c1a', shirtPattern: 'plain' },
  bio: 'Has run the corner store for thirty years. Trains every new clerk herself. Wants proof the silent alarm works before she needs it.',
  greeting: ['Rico! You want a mango soda? On the house. Security people get thirsty.'],
  idle: ['The register never argues. Give them the money, stay alive.', 'Cameras over the door, not over the register. Faces matter.'],
};

Object.assign(SCRIPT_LINES, {
  s3e1_spotted: [
    { speaker: 'rico', text: 'There. Gray hoodie. He waits by the door, Toby badges in, and he walks in right behind him. Classic tailgating.' },
    { speaker: 'marisol', text: 'And at 9:40 his own "badge" opens the vault floor. Toby\'s ID, a stranger\'s face.' },
    { speaker: 'rico', text: 'So he did both. Cloned the badge in the elevator, then tailgated to be safe. He\'s still in the building. He just saw me look up.' },
  ],
  s3e1_badge: [
    { speaker: 'rico', text: 'Got a card reader in his jacket. Reads a cheap 125 kilohertz badge from a few centimeters away. In the elevator, that\'s enough.' },
    { speaker: 'marisol', text: 'So our badges are basically paper with a magnet.' },
    { speaker: 'rico', text: 'Old proximity badges, yes. Encrypted smart badges plus a PIN on sensitive doors fix most of this. And people who hold the door shut, not open.' },
  ],
  s3e2_howto: [
    { speaker: 'dex', text: 'A skimmer is a fake card slot glued over the real one. A tiny camera or a fake keypad grabs the PIN.' },
    { speaker: 'dex', text: 'Shimmers are worse: a thin board inside the slot that reads chip cards. Look for loose parts, glue, an odd camera hole. Press E to pull it.' },
  ],
  s3e2_skimmer: [
    { speaker: 'rico', text: 'Six skimmers. Bluetooth modules on all of them. That courier was going to walk past each ATM and download everything.' },
    { speaker: 'dex', text: 'The bank is adding tamper seals and daily terminal checks. And telling customers to tap instead of insert.' },
  ],
  s3e3_mantrap: [
    { speaker: 'tito', text: 'They\'re stuck between the doors! The mantrap only opens the inner door after the outer one locks behind you.' },
    { speaker: 'rico', text: 'One person, one badge, one face check. They brought guns to a door problem. More are coming from the dock!' },
  ],
  s3e3_logs: [
    { speaker: 'tito', text: 'Access log says the outer door opened forty times tonight. Thirty-nine were the night shift. One was a badge we retired last year.' },
    { speaker: 'rico', text: 'Then that\'s your alert rule: retired badge, wrong hour, wrong room. Logs only help if somebody actually reads them.' },
  ],
  s3e4_trash: [
    { speaker: 'rico', text: 'He had a bag full of our printouts. A network diagram, a vendor invoice, and three sticky notes with VPN passwords.' },
    { speaker: 'max', text: 'Sticky notes. On paper. In a dumpster. Behind a security company.' },
    { speaker: 'rico', text: 'Anything with names, passwords or diagrams goes in a locked cross-cut shred bin. And nothing secret lives on a sticky note. Clean desk.' },
  ],
  s3e4_pentest: [
    { speaker: 'max', text: 'Now the paid job. Mrs. Ortiz at the Neon 24/7 wants her robbery procedure tested. She signed the authorization letter.' },
    { speaker: 'ortiz', text: 'Scope is the register and the silent alarm. My clerk Benny doesn\'t know. That\'s the point. Don\'t touch the back office.' },
    { speaker: 'rico', text: 'Signed letter, written scope, an emergency contact, and a training pistol with an orange tip. That\'s how a physical pentest stays legal.' },
  ],
  s3e4_cops: [
    { speaker: 'ortiz', text: 'Benny handed over the bag and pressed the alarm with his knee. Exactly like we practiced. I\'m so proud.' },
    { speaker: 'narrator', text: 'Sirens on Ocean Drive. The silent alarm works a little too well.' },
  ],
  s3e4_letter: [
    { speaker: 'reyes', text: 'Hands up! ...Sunset Shield? You again.' },
    { speaker: 'rico', text: 'Authorized physical test, Sergeant. Letter signed by the owner, scope, dates, and an emergency number. Call it.' },
    { speaker: 'reyes', text: 'Checks out. Next time tell dispatch the test window ahead of time. And give the lady her money back.' },
  ],
  s3e5_stopped: [
    { speaker: 'rico', text: 'Van\'s down! Two rims sparking on the asphalt. Driver\'s getting out, and he brought friends.' },
  ],
  s3e5_tapes: [
    { speaker: 'kai', text: 'Every tape is AES-256 encrypted, and the keys live in our vault on a separate system. They can\'t read a byte.' },
    { speaker: 'rico', text: 'And the custody log shows exactly who held each case and when. That\'s why the theft didn\'t become a breach.' },
  ],
  s3e6_open: [
    { speaker: 'narrator', text: 'Palmetto Bank, 4:12 PM. Rain on the glass. Three armed people, four employees, and one badge that should not exist.' },
    { speaker: 'reyes', text: 'Perimeter\'s set. Vega, they asked for someone who isn\'t wearing a uniform. Talk first. Shoot never, if you can help it.' },
  ],
  s3e6_surrender: [
    { speaker: 'reyes', text: 'Weapons down, all three. Hostages are walking out. Nobody hurt. Textbook.' },
    { speaker: 'rico', text: 'Not textbook. They were scared and somebody lied to them. We gave them a way out.' },
  ],
  s3e6_badge: [
    { speaker: 'rico', text: 'The staff door log: the badge belongs to a contractor named Hollis. He finished his project in March.' },
    { speaker: 'marisol', text: 'March? HR closed his file. Nobody told facilities. The badge kept working for seven months.' },
  ],
  s3e6_insider: [
    { speaker: 'rico', text: 'Hollis sold the badge to Black Lotus for two thousand dollars. An insider doesn\'t need to be evil. Just forgotten and broke.' },
    { speaker: 'reyes', text: 'He\'s in custody. The door logs and CCTV you preserved will hold up in court. Good chain of custody.' },
  ],
  s3e6_epilogue: [
    { speaker: 'narrator', text: 'One week later. Every Palmetto badge is encrypted. Departing staff lose access the day they leave. Toby\'s badge has a sleeve.' },
    { speaker: 'max', text: 'Physical security is cybersecurity, Vega. The best firewall in the world doesn\'t stop a man holding the door.' },
    { speaker: 'narrator', text: 'Season 3 complete. Ammu-Bay, the fight club, the shooting range and The Neon Bay Score are waiting.' },
  ],
});
