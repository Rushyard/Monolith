# Video voice-over (ElevenLabs) — 2:30

One block per scene: generate each block separately in ElevenLabs (easier to sync in CapCut).
Pauses use `<break time="…s" />`. Pronunciation: write "U.S.D.C." if the voice reads "usdc" as a word.
Scene numbers match `docs/submission.md` §(c).

**1 — Hook (0:00–0:15)** · black screen, text lines, then the home film (`app/public/hero/monolith.mp4`)
> Every payment on a blockchain is public. Every balance. Every salary. <break time="0.5s" /> And whoever holds the key… can spend everything. <break time="0.7s" /> Now, give that key to an AI.

**Title card** · "Monolith" — "A private treasury. An AI agent the chain keeps in check."

**2 — Sarah (0:15–0:25)**
> Meet Sarah. She runs a small company on Stellar. <break time="0.3s" /> She signs in with Freighter. Without her, the agent can only simulate.

**3 — Agent pays alone (0:25–0:45)**
> Alice is a contractor. The agent pays her on its own: one U.S.D.C., from a public petty cash, with its own key. <break time="0.4s" /> Done.

**4 — The on-chain cap (0:45–1:15)**
> Now, fifty. That's over the agent's limit. <break time="0.6s" /> Our server didn't stop it. The Stellar network did. <break time="0.3s" /> Spending limit exceeded, enforced on-chain by the smart account. <break time="0.6s" /> Only Sarah can let it through. <break time="0.3s" /> One signature.

**5 — Guard-rails (1:15–1:35)**
> A typo is never paid. The agent asks. <break time="0.6s" /> And when someone tries to rush it into sending everything… <break time="0.4s" /> it refuses. Nothing moves.

**6 — Confidential payroll (1:35–2:00)**
> Payroll is different. Carol and Bob are paid from the private vault. <break time="0.3s" /> The AI prepares. Sarah signs, with a zero-knowledge proof made right in her browser. <break time="0.7s" /> One payment. Three views. <break time="0.3s" /> The public sees who, not how much. Marc, the accountant, sees the amounts. <break time="0.3s" /> And the agent never touched the vault.

**7 — Explorer and auditor (2:00–2:20)**
> On the explorer: no amount. <break time="0.6s" /> With his audit key, Marc reads three… and two. <break time="0.6s" /> We hide how much. Not who.

**8 — Close (2:20–2:30)**
> The AI proposes. The chain caps. The human signs. <break time="0.3s" /> And the vault stays private. <break time="0.9s" /> Monolith.

## Optional 7c — liquidity planner (+20 s, only if the cut stays under ~2:50)
> Receiving ten thousand dollars should not mean exposing ten thousand dollars. <break time="0.5s" /> The AI reads Sarah's week. Fixed code computes what the petty cash needs. Sarah signs. <break time="0.4s" /> The public sees ten go out. Never what stays in the vault.

---

## Voice — ElevenLabs Voice Design prompt (Voices → Add voice → Voice Design)

> A warm, intimate male narrator in his late thirties, American accent, low-mid baritone, recorded very close to a high-end studio microphone in a silent room. He speaks slowly and deliberately, with calm, quiet confidence — never loud, never salesy. Soft attack on words, slight breathiness, a hint of a smile. Pitch stays steady; sentences land with a gentle downward inflection. He leaves real silence between ideas and stresses key words by slowing down, not by getting louder. Premium tech product film narration.

Female alternative: replace the first sentence with « A warm, composed female narrator in her late thirties, American accent, mid-low register… ».
Preview text to judge the voices: « Our server didn't stop it. The Stellar network did. »

Settings: Stability 50 % · Similarity 75 % · Style 10 % · Speaker boost on · Speed 0.92–0.95.

## Same script for Eleven v3 (v3 ignores `<break>`: pauses are « … », em dashes and line breaks; tags in [ ] steer delivery)

1. [calm, intimate] Every payment on a blockchain is public. Every balance. Every salary… And whoever holds the key — can spend everything… [slower] Now… give that key to an AI.
2. [warm] Meet Sarah. She runs a small company on Stellar. She signs in with Freighter. Without her, the agent can only simulate.
3. [relaxed, matter-of-fact] Alice is a contractor. The agent pays her on its own — one U.S.D.C., from a public petty cash, with its own key… Done.
4. [measured] Now… fifty. That's over the agent's limit… [confident, slower] Our server didn't stop it. The Stellar network did… Spending limit exceeded — enforced on-chain, by the smart account… [softly] Only Sarah can let it through. One signature.
5. [calm] A typo is never paid. The agent asks… [lower, serious] And when someone tries to rush it into sending everything… it refuses. Nothing moves.
6. [warm, building] Payroll is different. Carol and Bob are paid from the private vault. The AI prepares. Sarah signs — with a zero-knowledge proof, made right in her browser… [slower] One payment. Three views… The public sees who — not how much. Marc, the accountant, sees the amounts. [softly] And the agent never touched the vault.
7. [quiet] On the explorer… no amount… With his audit key, Marc reads three… and two… [confident] We hide how much. Not who.
8. [slow, deliberate, quiet confidence] The AI proposes. The chain caps. The human signs… And the vault stays private… [softly] Monolith.

## Music (150 s, one track, cut to the edit)

Prompt for an AI music generator (ElevenLabs Music, Suno, Udio):

> Minimal, elegant instrumental for a premium tech product film, 150 seconds, 96 BPM, no vocals. 0–15 s: soft sustained piano notes and a warm pad, lots of space, slightly tense. 15 s: gentle lift as a light pulse enters — muted plucked synth and soft kick. 15–95 s: steady, understated groove, felt piano, subtle arpeggio, never busy, leaves room for a voice-over. 95–125 s: emotional swell, warm strings pad and wider stereo. 125–145 s: everything opens up, confident resolution. Ends with a clean final chord and silence at 148 s. Clean, modern, optimistic, Apple-keynote-style product reveal.

Library search terms (Epidemic Sound, Artlist, Musicbed, Uppbeat, YouTube Audio Library): « minimal piano tech », « product reveal ambient », « inspiring minimal corporate », « keynote ». Mix: −18 to −22 dB under the voice, back up on the closing card, hard stop on « Monolith ».
