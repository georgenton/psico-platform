---
"@psico/crypto": minor
---

Recovery phrase reduced from 24 to 12 words (ADR 0007 §G v2).

The master key length drops 32 → 16 bytes (256 → 128 bits). The key never
touches the AEAD directly — it always passes through HKDF, which expands the
16-byte IKM into the 32-byte subkeys XChaCha20-Poly1305 needs, so entry
encryption is unchanged. 128 bits is bank-grade and the master key's real
entropy is already bounded by the user's password, so this halves the
recovery-phrase length with no meaningful loss of security.

Breaking: `MASTER_KEY_VERSION` is now `2`. Data encrypted under a 32-byte
master key (v1) will not decrypt with a 16-byte key. Pre-launch accounts must
re-register; a dual-version migration is required before this ships to real
production data. New exports: `MASTER_KEY_LEN`, `SEED_PHRASE_WORD_COUNT`.
