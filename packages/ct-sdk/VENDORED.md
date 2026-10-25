# Vendored package

Copied from [`brozorec/stellar-confidential-token-sdk`](https://github.com/brozorec/stellar-confidential-token-sdk)
at commit `aad17069714713bcb36fa376d0f2a87743e8e2a7` (MIT, see `LICENSE`).
This is the SDK pinned by the reference app
[`brozorec/stellar-confidential-token-demo`](https://github.com/brozorec/stellar-confidential-token-demo).

**Not Monolith's code.** Vendored (rather than a `github:` dependency) so every
environment installs it the same way.

Why this SDK: its verification keys (`circuits/vks/*.vk.bin`) are byte-identical
to the audited ones in `OpenZeppelin/stellar-contracts` →
`packages/confidential/circuits/vks` (protocol `stellar-confidential` 0.8.0),
so its proofs are accepted by the 0.8.0 on-chain verifier.

## Local modifications

- `test/` and `scripts/` not copied.
- `package.json`: `private: true`, `packageManager` removed, scripts reduced to
  `build` / `typecheck` (the root `postinstall` builds `dist/`).

Nothing under `src/` or `circuits/` is modified.
