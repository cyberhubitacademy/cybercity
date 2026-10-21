import type { ChallengeDefinition, ConceptCard } from '../../types';
import { mountCrypto } from './ui';

const conceptCards: ConceptCard[] = [
  {
    id: 'crypto-encoding-vs-encryption', title: 'Encoding vs. Encryption', topic: 'crypto',
    definition: 'Encoding (Base64, hex, URL-encoding) changes how data is represented and is reversible by anyone. Encryption transforms data with a secret key so only key holders can read it.',
    whyItMatters: 'Attackers and careless developers often "hide" passwords or tokens in Base64. That protects nothing.',
    example: 'A config file storing the database password as cGFzc3dvcmQxMjM= — decoded instantly to password123.',
    bestPractice: 'Treat encoded secrets as plaintext. Encrypt sensitive data with a vetted algorithm and keep keys in a secrets manager.',
  },
  {
    id: 'crypto-hashing', title: 'Hashing & Integrity', topic: 'crypto',
    definition: 'A cryptographic hash (e.g. SHA-256) maps any input to a fixed-length digest. It is one-way, and changing a single bit changes the digest completely (avalanche effect).',
    whyItMatters: 'Hashes let you verify that downloads, evidence and messages were not altered.',
    example: 'Software vendors publish SHA-256 checksums so you can confirm an installer was not tampered with.',
    bestPractice: 'Use SHA-256 or stronger for integrity. For passwords use slow, salted algorithms like Argon2id, bcrypt or scrypt — never a plain fast hash.',
  },
  {
    id: 'crypto-symmetric-asymmetric', title: 'Symmetric vs. Asymmetric Encryption', topic: 'crypto',
    definition: 'Symmetric encryption (AES) uses one shared key for both directions. Asymmetric encryption (RSA, ECC) uses a public key to encrypt and a matching private key to decrypt.',
    whyItMatters: 'Symmetric is fast for bulk data; asymmetric solves sharing keys with strangers. TLS combines both.',
    example: 'HTTPS uses asymmetric key exchange to agree on a session key, then AES-GCM or ChaCha20 to encrypt the traffic.',
    bestPractice: 'Use well-reviewed libraries and modern modes (AES-GCM). Never invent your own cipher.',
  },
  {
    id: 'crypto-digital-signatures', title: 'Digital Signatures', topic: 'crypto',
    definition: "A signature is created with the signer's private key and verified by anyone with the signer's public key. It proves who sent the data and that it was not changed.",
    whyItMatters: 'Signatures protect software updates, emails (S/MIME, DKIM) and certificates from forgery.',
    example: 'Your OS refuses to install a driver whose code signature does not verify against a trusted publisher key.',
    bestPractice: 'Protect private keys (hardware security modules, smart cards), verify signatures before trusting content, and obtain public keys from a trusted source.',
  },
  {
    id: 'crypto-classical-ciphers', title: 'Why Classical Ciphers Fail', topic: 'crypto',
    definition: 'Substitution ciphers like Caesar keep the letter-frequency pattern of the language and have tiny key spaces.',
    whyItMatters: 'Any scheme you can break by hand in minutes offers zero protection against a computer.',
    example: 'Caesar has 25 usable keys — trying all of them takes microseconds.',
    bestPractice: "Rely on modern, standardized cryptography (Kerckhoffs's principle: security must rest only on the key).",
  },
];

export const cryptoChallenge: ChallengeDefinition = {
  id: 'crypto-1',
  title: "The Flamingo's Cipher",
  topic: 'crypto',
  difficulty: 2,
  objective: 'Tell encoding, encryption, hashing and signatures apart by peeling an intercepted message layer by layer.',
  intro:
    "Priya Shah snagged a Pink Tide transmission off a rogue relay at Neon Pier. It's wrapped in layers. Use the Cryptography Playground to peel it open, recover the flag, verify the message hash and figure out how to check The Flamingo's signature. Neon Bay is counting on you, Rico.",
  passScore: 60,
  conceptCards,
  mount: (ctx) => mountCrypto(ctx, 'crypto-1', conceptCards.map((c) => c.id)),
};
