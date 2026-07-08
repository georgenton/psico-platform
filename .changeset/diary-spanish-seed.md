---
"@psico/crypto": minor
---

Switch the recovery seed phrase to the Spanish BIP39 wordlist (was English).
The master key is unchanged; only its 12-word representation differs. This is
a hard break for any phrase generated under the English wordlist — acceptable
pre-launch (no real users), but a documented migration would be required if we
ever change the wordlist again. Rationale: the audience is Ecuador → LATAM.
