import type { BankSource } from '../types';

// Banks: escape, risk, payments, web3, resilience, competition.

export const escape: BankSource = {
  id: 'escape',
  card: {
    title: 'Puzzle-room thinking',
    definition: 'Breaking a locked problem into small verifiable steps: observe, decode, test, unlock.',
    whyItMatters: 'Real investigations and CTFs reward methodical, stepwise reasoning over guessing.',
    example: 'A locked terminal\'s hint is Base64; decoded, it gives a Caesar-shifted passphrase that opens the vault.',
    bestPractice: 'Write down every clue, test one hypothesis at a time, and verify each step before moving on.',
  },
  classify: [
    ['Clue ends with "==" and uses only A–Z, a–z, 0–9, + and /', true, 'Looks like Base64 encoding (padding "=") — a clue to decode, not random noise.'],
    ['Hint text written in plain English with no symbols', false, 'Nothing encoded here — read it literally.'],
    ['String of only 0–9 and a–f characters with even length', true, 'Likely hexadecimal-encoded bytes.'],
    ['Lock screen says "Default password? Check the manual on the desk"', true, 'The puzzle is teaching that default passwords are a weakness.'],
    ['Sticky note: "Room 3 is a red herring"', false, 'Informational clue — not encoded.'],
    ['Text where every letter seems shifted (e.g. "KHOOR")', true, 'Caesar shift (here by 3 → HELLO).'],
  ],
  pairs: [
    ['Red herring', 'A clue placed to mislead'],
    ['Flag', 'The secret answer proving a challenge is solved, e.g. NB{...}'],
    ['Caesar shift', 'Rotating each letter a fixed number of places'],
    ['Hexadecimal', 'Base-16 representation using 0–9 and a–f'],
    ['Vigenère cipher', 'A Caesar shift that changes per letter using a keyword'],
    ['Checkpoint', 'A verified intermediate step in a multi-stage puzzle'],
  ],
  order: [{ title: 'Solve a locked-terminal room', steps: ['Read every clue in the room', 'Identify which clues are encoded', 'Decode the outer layer', 'Apply the inner cipher using the found key', 'Verify the result looks like a flag', 'Enter the flag to unlock the terminal'], why: 'Observe, classify, peel layers in order, verify, then act.' }],
  configs: [
    ['Vault lock in the puzzle', 'Default PIN 0000', 'Unique PIN changed at install', 'The room teaches that defaults get guessed.'],
    ['Terminal session', 'Never locks', 'Locks after inactivity', 'An unattended open terminal is the easiest "escape".'],
  ],
  quiz: [
    ['"TkJ7RVNDQVBFfQ==" is most likely…', ['Encrypted with AES', 'Base64 encoded', 'A SHA-256 hash', 'Random noise'], 1, 'Base64 alphabet with = padding; it decodes to NB{ESCAPE}.'],
    ['A 64-character hex string next to a file is probably…', ['A password', 'A SHA-256 hash of the file', 'Base64', 'A Caesar cipher'], 1, 'SHA-256 digests are 64 hex characters.'],
  ],
  triage: [
    ['Countdown at 30 seconds, last lock remaining, flag decoded', 1, 'Enter it now!'],
    ['Decorative poster with no symbols', 4, 'Likely a red herring.'],
    ['Partially decoded clue with a missing key', 2, 'Find the key — it\'s the blocker.'],
  ],
  spot: [{
    title: 'Escape room: The Locked Terminal',
    fields: [['Note A', 'VGhlIGtleSBpcyBTSElFTEQ='], ['Note B', 'Caesar? Try the number of palm trees on the poster'], ['Poster', '7 palm trees, 1 flamingo'], ['Note C', 'This painting is very nice'], ['Terminal', 'Enter flag NB{...}']],
    flags: [['Note A is Base64', 'Decodes to "The key is SHIELD".'], ['Note B gives the shift method', 'Points to the poster count.'], ['Poster count = 7', 'The shift value.']],
    decoys: [['Note C', 'Red herring.'], ['Flamingo on poster', 'Decoration.']],
  }],
  words: ['ESCAPE', 'VAULT', 'CLUE', 'UNLOCK', 'CHAMBER', 'MAZE'],
};

export const risk: BankSource = {
  id: 'risk',
  card: {
    title: 'Risk management and security architecture',
    definition: 'Risk ≈ likelihood × impact; architecture places controls at trust boundaries to reduce it.',
    whyItMatters: 'Budgets are limited — fix the risks that matter most first.',
    example: 'An internet-facing payment API with known flaws outranks a typo on an internal wiki.',
    bestPractice: 'Inventory assets, model threats, prioritize by risk, apply layered controls, and review regularly.',
  },
  classify: [
    ['Spending the whole budget on one control and none on detection', true, 'Defense in depth needs layers.'],
    ['Risk register listing owner, likelihood, impact and treatment', false, 'Good governance.'],
    ['Critical customer database not in the asset inventory', true, 'You can\'t protect what you don\'t know about.'],
    ['Threat modeling a new feature before it\'s built', false, 'Cheapest time to fix design flaws.'],
    ['Accepting a high risk without a named owner or review date', true, 'Unmanaged risk acceptance.'],
    ['Separating admin access with a trust boundary and MFA', false, 'Architecture control.'],
  ],
  pairs: [
    ['Risk', 'The chance of harm combining likelihood and impact'],
    ['Threat model', 'A structured look at what can go wrong and how to prevent it'],
    ['Trust boundary', 'A point where data crosses between different trust levels'],
    ['Risk acceptance', 'Formally deciding to live with a risk, with an owner'],
    ['Compliance', 'Meeting required laws, standards and policies'],
    ['Defense in depth', 'Layering independent controls so one failure isn\'t fatal'],
  ],
  order: [{ title: 'Risk assessment cycle', steps: ['Identify and classify assets', 'Identify threats and vulnerabilities', 'Estimate likelihood and impact', 'Prioritize risks', 'Choose treatments (mitigate, transfer, avoid, accept)', 'Monitor and review'], why: 'Know what you have, what threatens it, how bad it is, then act and revisit.' }],
  configs: [
    ['Admin access path', 'Direct from the internet', 'Through a bastion/VPN with MFA', 'Adds a controlled trust boundary.'],
    ['Risk ownership', 'Nobody assigned', 'Named owner with review date', 'Accountability drives treatment.'],
  ],
  quiz: [
    ['Which risk should be fixed first?', ['Low likelihood, low impact', 'High likelihood, high impact', 'Medium likelihood, low impact', 'Unknown impact on a test server'], 1, 'Highest combined risk first.'],
    ['Buying cyber insurance is which risk treatment?', ['Avoid', 'Transfer', 'Accept', 'Mitigate'], 1, 'Financial impact is transferred to the insurer.'],
  ],
  triage: [
    ['Audit finds payment systems missing required encryption', 1, 'High impact compliance and breach risk.'],
    ['Policy document formatting inconsistent', 4, 'Cosmetic.'],
    ['Vendor with access to customer data has no security review', 2, 'Third-party risk.'],
  ],
  spot: [{
    title: 'Architecture review: Palmetto mobile banking',
    fields: [['API', 'Internet → API → DB, no WAF'], ['Admin', 'Admin panel on public internet, password only'], ['Logging', 'Central SIEM'], ['Vendors', 'Analytics vendor has full DB read'], ['Threat model', 'Not done']],
    flags: [['Public admin panel, no MFA', 'High risk.'], ['Vendor over-access', 'Third-party risk.'], ['No threat model', 'Design flaws unknown.'], ['No WAF on public API', 'Missing layer.']],
    decoys: [['Central SIEM logging', 'Good control.']],
  }],
  words: ['RISK', 'BOUNDARY', 'CONTROL', 'AUDIT', 'ASSET', 'POLICY'],
};

export const payments: BankSource = {
  id: 'payments',
  card: {
    title: 'Payment fraud and financial security',
    definition: 'Detecting and preventing fraudulent transactions, account takeovers and payment redirection.',
    whyItMatters: 'Fraud causes direct, often irreversible money loss.',
    example: 'A "vendor" emails new bank details right before a large invoice is due — classic payment redirection.',
    bestPractice: 'Verify payment changes out-of-band, use dual approval, tokenize card data, and monitor for anomalies.',
  },
  classify: [
    ['Vendor bank details changed by email with a "new account, pay today" note', true, 'Payment redirection / BEC.'],
    ['Large transfer approved by two people after a callback to a known number', false, 'Dual control and verification.'],
    ['Many $1 card transactions from different shops in a few minutes', true, 'Card testing.'],
    ['Card numbers replaced by tokens in the café\'s POS database', false, 'Tokenization limits breach impact.'],
    ['Same invoice number paid twice to slightly different account numbers', true, 'Duplicate/fraudulent payment pattern.'],
    ['Customer\'s first purchase in their home city with their usual device', false, 'Normal behavior.'],
  ],
  pairs: [
    ['Tokenization', 'Replacing a card number with a meaningless token'],
    ['Account takeover', 'A criminal gaining control of a real customer\'s account'],
    ['Card testing', 'Small transactions to check whether stolen cards work'],
    ['Dual control', 'Requiring two people to approve sensitive actions'],
    ['Chargeback', 'A disputed payment reversed by the card issuer'],
    ['Payment redirection', 'Tricking someone into paying a fraudster\'s account'],
  ],
  order: [{ title: 'Handle a bank-detail change request', steps: ['Receive the change request', 'Do not use contact details from the request', 'Call the vendor on the number already on file', 'Confirm the change with a known contact', 'Get a second approver to apply it', 'Make a small test payment before large transfers'], why: 'Independent verification and dual control stop most redirection fraud.' }],
  configs: [
    ['Payment approval', 'Single clerk can change details and pay', 'Separate roles + dual approval', 'Segregation of duties.'],
    ['Stored card data', 'Full card numbers in the database', 'Tokens via a payment provider', 'Minimizes what can be stolen.'],
  ],
  quiz: [
    ['A customer logs in from a new device and immediately changes email, phone and payout account. Signal?', ['Normal update', 'Account takeover', 'Server bug', 'Marketing'], 1, 'Changing recovery contacts first is a takeover pattern.'],
    ['Best control against invoice fraud?', ['Pay faster', 'Out-of-band verification of bank changes', 'Bigger invoices', 'Email confirmation reply'], 1, 'Replying to the fraudster confirms nothing.'],
  ],
  triage: [
    ['$480,000 wire to a new account requested by "CEO" email, due in 1 hour', 1, 'Stop and verify immediately.'],
    ['Chargeback for a duplicate coffee order', 4, 'Routine dispute.'],
    ['Spike of $1 authorizations on the online store', 2, 'Card testing — enable controls.'],
  ],
  spot: [{
    title: 'Invoice #7712 from "Harbor Logistics"',
    fields: [['From', 'billing@harbor-logistics-pay.nb'], ['Bank', 'NEW account — "our old bank is under audit"'], ['Amount', '$96,400 (usual: ~$12,000)'], ['Due', 'Today, before 3 PM'], ['PO number', 'Matches open PO 4471']],
    flags: [['Lookalike sender domain', 'Not the vendor\'s usual domain.'], ['Changed bank account with excuse', 'Redirection pattern.'], ['Amount far above normal', 'Anomaly.'], ['Same-day pressure', 'Urgency tactic.']],
    decoys: [['PO number matches', 'Attackers can learn real PO numbers — not proof of legitimacy, but not a red flag itself.']],
  }],
  words: ['INVOICE', 'TOKEN', 'LEDGER', 'WIRE', 'FRAUD', 'CHARGEBACK'],
};

export const web3: BankSource = {
  id: 'web3',
  card: {
    title: 'Blockchain and wallet security',
    definition: 'Protecting private keys, verifying contracts and transactions, and spotting crypto scams.',
    whyItMatters: 'Blockchain transactions are usually irreversible — mistakes and thefts are permanent.',
    example: 'A "token airdrop" site asks you to approve unlimited spending — draining your wallet later.',
    bestPractice: 'Never share seed phrases, use hardware wallets, review approvals, and audit smart contracts before trusting them.',
  },
  classify: [
    ['Website asking you to type your 12-word seed phrase to "verify" your wallet', true, 'No legitimate service needs your seed phrase.'],
    ['Hardware wallet showing the destination address on its own screen', false, 'Independent verification.'],
    ['Approving unlimited token spending for an unknown contract', true, 'Lets the contract drain that token later.'],
    ['Smart contract audited and with a public bug bounty', false, 'Good (not perfect) assurance.'],
    ['DM from "support" offering to recover lost funds for a fee', true, 'Recovery scam.'],
    ['Revoking old token approvals you no longer use', false, 'Reduces exposure.'],
  ],
  pairs: [
    ['Seed phrase', 'Words that can regenerate all private keys of a wallet'],
    ['Private key', 'The secret that authorizes spending from an address'],
    ['Smart contract', 'Code on a blockchain that executes automatically'],
    ['Token approval', 'Permission for a contract to move your tokens'],
    ['Reentrancy', 'A contract bug where a call re-enters before state is updated'],
    ['Immutable ledger', 'A record that can\'t be changed once confirmed'],
  ],
  order: [{ title: 'Send crypto safely', steps: ['Get the address from a verified source', 'Check the network/chain is correct', 'Send a small test amount', 'Confirm the test arrived', 'Verify the full address on the hardware wallet screen', 'Send the remaining amount'], why: 'Irreversible transfers deserve verification and a test first.' }],
  configs: [
    ['Seed phrase storage', 'Photo in cloud storage', 'Offline, written, stored securely', 'Online copies get stolen.'],
    ['Token approvals', 'Unlimited for every dApp', 'Exact amounts, revoked when done', 'Limits drain risk.'],
  ],
  quiz: [
    ['Who should ever know your seed phrase?', ['Wallet support', 'Nobody but you', 'Your exchange', 'Anyone who asks politely'], 1, 'The seed phrase is full control of your funds.'],
    ['A contract sends funds before updating balances. Risk?', ['Gas fees', 'Reentrancy attack', 'Phishing', 'None'], 1, 'Update state before external calls (checks-effects-interactions).'],
  ],
  triage: [
    ['Hot wallet private key found in a public repo', 1, 'Move funds immediately; key is compromised.'],
    ['Old approval for a reputable DEX still active', 3, 'Revoke when convenient.'],
    ['Price of a token dropped 3%', 4, 'Market movement, not a security event.'],
  ],
  spot: [{
    title: 'Airdrop page: "NeonBay Token Giveaway"',
    fields: [['Ask', 'Connect wallet and sign "SetApprovalForAll"'], ['Bonus', 'Enter seed phrase to claim 2x'], ['Timer', 'Offer ends in 4:59'], ['Contract', 'Unverified, deployed 2 hours ago'], ['Network', 'Correct mainnet']],
    flags: [['Approval for all assets', 'Drainer pattern.'], ['Requests seed phrase', 'Always a scam.'], ['Countdown pressure', 'Urgency tactic.'], ['Unverified brand-new contract', 'No track record.']],
    decoys: [['Correct network', 'Not suspicious by itself.']],
  }],
  words: ['LEDGER', 'WALLET', 'CONTRACT', 'BLOCK', 'SEED', 'CHAIN'],
};

export const resilience: BankSource = {
  id: 'resilience',
  card: {
    title: 'Resilience and disaster recovery',
    definition: 'Keeping critical services running — or restoring them quickly — despite failures and attacks.',
    whyItMatters: 'Customers judge you on how fast you recover, not whether you were ever hit.',
    example: 'Harbor Cloud fails over to a second region within its 30-minute RTO during an outage.',
    bestPractice: 'Know your critical services, set RTO/RPO, build redundancy, and rehearse recovery drills.',
  },
  classify: [
    ['Single database server with no replica for the payment system', true, 'Single point of failure.'],
    ['Quarterly failover drill with timed results', false, 'Proves recovery works.'],
    ['Recovery plan stored only on the server it describes', true, 'Unavailable when you need it.'],
    ['Services ranked by business impact in a BIA', false, 'Guides recovery priority.'],
    ['Backups in the same data center as production only', true, 'One disaster takes both.'],
    ['Status page and communication templates prepared in advance', false, 'Faster, calmer communication.'],
  ],
  pairs: [
    ['Business impact analysis', 'Assessing how downtime of each service hurts the business'],
    ['Failover', 'Switching to a standby system when the primary fails'],
    ['High availability', 'Designing systems to minimize downtime'],
    ['Single point of failure', 'A component whose failure stops the whole service'],
    ['Tabletop exercise', 'Talking through an incident scenario to test plans'],
    ['RTO', 'Target time to restore a service after disruption'],
  ],
  order: [{ title: 'Recover after a data center outage', steps: ['Declare the disaster per the plan', 'Activate the response team and communications', 'Fail over critical services to the standby site', 'Verify data integrity and service health', 'Restore lower-priority services', 'Fail back and review lessons learned'], why: 'Declare, communicate, recover critical first, verify, then the rest.' }],
  configs: [
    ['Critical database', 'Single instance', 'Replicated across zones with automatic failover', 'Removes a single point of failure.'],
    ['Recovery plan location', 'On the production file share', 'Offline copies + secure cloud copy', 'Accessible during an outage.'],
  ],
  quiz: [
    ['Which should be restored first?', ['The staff lunch-menu site', 'The payment processing service', 'The test server', 'The archive of 2009 photos'], 1, 'Restore by business impact.'],
    ['Purpose of a tabletop exercise?', ['Buy furniture', 'Practice decisions and find gaps in the plan', 'Replace backups', 'Train AI'], 1, 'Cheap rehearsal reveals weaknesses.'],
  ],
  triage: [
    ['Primary payment cluster down, failover not starting', 1, 'Critical service outage.'],
    ['Secondary monitoring dashboard slow', 3, 'Minor.'],
    ['Drill completed within RTO', 4, 'Good outcome.'],
  ],
  spot: [{
    title: 'DR plan: Neon Bay Transit',
    fields: [['Ticketing DB', 'Single server, nightly backup on same rack'], ['RTO/RPO', 'Not defined'], ['Last drill', 'Never'], ['Comms', 'Templates prepared'], ['Plan copy', 'Only on the ticketing server']],
    flags: [['Single server + co-located backup', 'One failure takes both.'], ['No RTO/RPO', 'No recovery targets.'], ['Never drilled', 'Untested plan.'], ['Plan stored on the system it recovers', 'Unavailable in a disaster.']],
    decoys: [['Comms templates prepared', 'Good practice.']],
  }],
  words: ['FAILOVER', 'RESTORE', 'UPTIME', 'REPLICA', 'DRILL', 'CONTINUITY'],
};

export const competition: BankSource = {
  id: 'competition',
  card: {
    title: 'Capture the Flag and cyber competitions',
    definition: 'Timed, scored challenges in purpose-built environments where teams solve puzzles or defend systems.',
    whyItMatters: 'Competitions build real skills safely and legally.',
    example: 'A Neon Bay CTF gives teams a sandboxed web app and awards points for each NB{...} flag found.',
    bestPractice: 'Attack only the provided targets, don\'t attack the scoring infrastructure, and share write-ups after the event.',
  },
  classify: [
    ['Attacking the competition\'s scoring server to change points', true, 'Out of bounds and cheating.'],
    ['Solving challenges only on the provided sandbox targets', false, 'Fair play.'],
    ['Sharing flags with another team mid-competition', true, 'Violates rules.'],
    ['Publishing a write-up after the event ends', false, 'Community learning.'],
    ['Scanning random internet hosts "for practice" during the CTF', true, 'Unauthorized activity.'],
    ['Blue team documenting how they detected the red team', false, 'Purple-team value.'],
  ],
  pairs: [
    ['Jeopardy CTF', 'Separate challenges in categories, each worth points'],
    ['Attack-defense CTF', 'Teams defend their own services while attacking others\' in a sandbox'],
    ['Write-up', 'A post-event explanation of how a challenge was solved'],
    ['Flag format', 'The agreed pattern of answers, e.g. NB{...}'],
    ['Scoreboard', 'Live ranking of teams by points'],
    ['King of the hill', 'Teams compete to take and hold control of a target'],
  ],
  order: [{ title: 'Play a CTF challenge', steps: ['Read the rules and allowed targets', 'Read the challenge description carefully', 'Gather information from the provided files', 'Form and test a hypothesis', 'Extract and verify the flag format', 'Submit the flag and note your method'], why: 'Rules first; then structured problem solving.' }],
  configs: [
    ['Competition targets', 'Anything on the internet', 'Only provided sandbox hosts', 'Legal and fair.'],
    ['Team credentials', 'Shared on public chat', 'Kept within the team', 'Prevents sabotage.'],
  ],
  quiz: [
    ['You find a bug in the CTF platform itself. Best action?', ['Exploit it for points', 'Report it to the organizers', 'Tell other teams', 'Ignore it'], 1, 'Responsible disclosure applies to platforms too.'],
    ['In attack-defense, what earns defense points?', ['Turning your services off', 'Keeping services up while patching vulnerabilities', 'Deleting the scoring bot', 'Blocking everything'], 1, 'Availability plus security.'],
  ],
  triage: [
    ['Your service is down and failing SLA checks', 1, 'Losing points every tick.'],
    ['A low-value trivia challenge remains unsolved', 3, 'Nice to have.'],
    ['Scoreboard refresh delay', 4, 'Cosmetic.'],
  ],
  spot: [{
    title: 'Team plan: Neon Bay CTF',
    fields: [['Targets', 'Sandbox 10.66.0.0/16 (provided)'], ['Extra', 'Also scan the organizer\'s website'], ['Sharing', 'Trade flags with friends on team 7'], ['Comms', 'Private team channel'], ['After', 'Publish write-ups after closing']],
    flags: [['Scanning organizer site', 'Out of scope.'], ['Trading flags', 'Against the rules.']],
    decoys: [['Sandbox targets', 'Allowed.'], ['Private team channel', 'Fine.'], ['Post-event write-ups', 'Encouraged.']],
  }],
  words: ['FLAG', 'ARENA', 'SCORE', 'TEAM', 'SPRINT', 'TROPHY'],
};
