// Toutes les phrases écrites par le SERVEUR de l'agent (jamais par le LLM), en anglais, français et
// portugais, et les mots-clés du planner de secours. Aucun texte destiné à l'utilisateur ailleurs.
// Langue : celle du message (détection simple), sinon celle envoyée par le client, sinon l'anglais
// (langue par défaut du site). Fichier sans dépendance serveur : utilisable aussi par les composants.

export type Lang = "en" | "fr" | "pt";
export const LANGS: Lang[] = ["en", "fr", "pt"];

const isLang = (v: unknown): v is Lang => v === "en" || v === "fr" || v === "pt";
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[‘’]/g, "'");

// ---------- détection ----------

const HINTS: Record<Lang, string[]> = {
  en: ["pay", "send", "to", "the", "my", "what", "what's", "whats", "how", "much", "is", "run", "payroll", "team", "address", "please", "me", "an", "buy", "has", "already", "paid", "all", "money", "and", "salaries", "left", "who", "did", "you", "mean"],
  fr: ["paie", "payer", "paye", "verse", "envoie", "envoyer", "vire", "virer", "salaires", "salaire", "quel", "quelle", "est", "mon", "ma", "mes", "combien", "reste", "adresse", "le", "la", "les", "du", "des", "une", "je", "tu", "pour", "avec", "chacun", "solde", "pas", "demander", "toutes", "regles", "deja", "compte", "tout", "argent", "qui", "plafond", "l'equipe", "qu'est-ce"],
  pt: ["pague", "pagar", "envie", "enviar", "transfira", "para", "o", "os", "meu", "minha", "qual", "quanto", "salarios", "endereco", "orcamento", "saldo", "conta", "da", "do", "dos", "faca", "todo", "dinheiro", "urgente", "voce", "ja", "em", "um", "uma", "nao", "quem", "folha", "equipe", "pagou", "trocar", "troca", "meus", "minhas", "por", "sobra"],
};

/** Langue du message (fr / en / pt), ou null si le texte ne suffit pas (« 5 », « bob »). */
export function detectLang(message: string): Lang | null {
  const raw = message.toLowerCase();
  const words = strip(message).split(/[^a-z0-9'-]+/).filter(Boolean);
  const score: Record<Lang, number> = { en: 0, fr: 0, pt: 0 };
  for (const w of words) for (const l of LANGS) if (HINTS[l].includes(w)) score[l]++;
  if (/[ãõ]/.test(raw)) score.pt += 2;
  if (/(^|\s)à(\s|$)|[èùœ]/.test(raw)) score.fr += 1;
  const ranked = LANGS.map((l) => [l, score[l]] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;
}

/** Message → client → anglais. */
export function pickLang(message?: string, clientLang?: unknown): Lang {
  return (message ? detectLang(message) : null) ?? (isLang(clientLang) ? clientLang : "en");
}

/** Langue demandée par le client seul (routes sans message) : `?lang=` ou en-tête `x-monolith-lang`. */
export function requestLang(req: Request): Lang {
  const q = new URL(req.url).searchParams.get("lang") ?? req.headers.get("x-monolith-lang");
  return isLang(q) ? q : "en";
}

// ---------- mots-clés du planner de secours et du contrôle des champs (texte sans accents) ----------

export const KEYWORDS = {
  pay: /\b(pa(ie|ye|yer|y|ies)|send|envoie|envoyer|vire|virer|transfere|transferer|pague|pagar|envie|enviar|transfira)\b/,
  payroll: /\b(salaires?|salaries|salary|payroll|pa(ie|yer) (de )?l'?equipe|pay (the |my )?team|salarios?|folha de pagamento|pagar (a )?equipe)\b/,
  unsupported: /\b(swap|echange|echanger|nft|stak(e|ing)|bridge|pont|lend|pret|emprunt|borrow|troca|trocar)\b/,
  address: /\b(adresse|address|endereco)\b/,
  budget: /\b(budget|plafond|cap|limite?|orcamento)\b/,
  history: /(historique|history|historico|deja paye|already paid|ja pagou|paiements|payments|pagamentos)/,
  balance: /(solde|balance|saldo|reste|combien|quanto|remaining|left|sobra)/,
  /** préposition devant un destinataire : « à Bob », « to Bob », « para o Bob ». */
  recipientPrep: /\b(?:a|to|para|pour|vers)\s+(?:(?:l[ae']|o|os|as)\s*)?([a-z][a-z'-]{1,30})\b/,
  notAName: new Set(["moi", "me", "mim", "lui", "eux", "quelqu", "quelqu'un", "someone", "alguem", "usdc", "dollars", "usd", "the", "my", "meu"]),
} as const;

/** Texte normalisé pour les mots-clés : minuscules, sans accents. */
export const keywordText = strip;

// ---------- phrases ----------

type Usdc = string | number;

const en = {
  // A2 : champs manquants
  slotBoth: "How much, and to whom?",
  slotTo: "To whom?",
  slotAmount: "How much?",
  // A1 : noms
  didYouMean: (names: string[]) => `Did you mean ${names.join(" or ")}? Say it again with the exact name: I don't pay on a correction.`,
  didYouMeanTyped: (name: string, typed: string | null) =>
    `Did you mean ${name}?${typed ? ` (you wrote "${typed}")` : ""} Say it again with the exact name: I don't pay on a correction.`,
  unknownName: (raw: string) => `I don't know "${raw}": give me their G… address.`,
  invalidAddress: (start: string) => `"${start}…" is not a valid Stellar address: check it (56 characters, starts with G).`,
  // coffre
  vaultPrepared: (n: number) =>
    `I prepared ${n} confidential payment${n > 1 ? "s" : ""}: you sign, and the amounts will stay hidden from the public.`,
  payrollTotal: (total: Usdc) => `Payroll: ${total} USDC in total.`,
  vaultCheckFailed: "I couldn't check whether this recipient is in the vault. I won't pay in public blindly, that would reveal the amount: try again in a moment.",
  vaultSuspicious: "Vault recipient: I don't prepare anything on a suspicious message. Ask again calmly, with the exact amount.",
  vaultUnknownRecipient: "This recipient is in the vault but not in your contacts: check the address before signing.",
  // gatekeeper
  refusal:
    "I won't do this one. Your message pushes me to skip my checks, and it would empty the account or send the money to an unknown address. If you really want it, ask again calmly, with an exact amount, and I'll ask for your approval.",
  infoOnly: "Just a lookup: no funds move.",
  onePaymentPerMessage: "One payment per message, so that each amount is checked on its own.",
  invalidAmount: "I couldn't read a valid amount, so nothing was done.",
  unknownRecipient: (to: string) => `I can't find "${to}" in your contacts, and it isn't a valid Stellar address.`,
  budgetUnreadable: "I couldn't read the agent's on-chain budget, so I'm asking for your approval.",
  overBudget: (limit: Usdc, spent: Usdc, remaining: Usdc) =>
    `This exceeds the agent's budget: ${limit} USDC per ~24 h, ${spent} already spent, ${remaining} left. The network will refuse the agent's signature; yours is needed.`,
  notInContacts: "This recipient isn't in your contacts, so I'm asking for your approval.",
  firstPayment: "First payment to this address: I'm asking for your approval, even under the cap.",
  historyUnreadable: "(On-chain history unreadable.)",
  pressure: "Your message pushes me to skip my checks or to hurry, so I'm checking with you.",
  amountMismatch: (understood: Usdc, written: string[]) => `The amount I understood (${understood} USDC) doesn't match the one in your message (${written.join(", ")}).`,
  unplannedAddress: "Your message mentions an address that isn't part of the planned payment.",
  autoExecute: (remaining: Usdc, limit: Usdc) => `Within the agent's budget (${remaining} USDC left out of ${limit}), known recipient: the agent pays on its own.`,
  payrollAlone: "Payroll runs on its own, with no other action in the same message.",
  payrollNotInVault: "An employee isn't registered in the vault: I don't pay a salary in public.",
  payrollAmounts: (lines: string) => `Salaries are fixed in the payroll (${lines} USDC): your message mentions another amount.`,
  payrollAddress: "Your message mentions an address: payroll only goes to employees in your contacts.",
  payrollSuspicious: "I don't prepare the payroll on a suspicious message.",
  paused:
    "The agent is paused: Sarah removed its rule on-chain, its signature is worth nothing now. Only the public petty cash is cut off; in the vault, Sarah already signs every payment.",
  // simulation (mode démo)
  simRefusedCap: (what: string) => `Simulation: this payment (${what}) would have been refused by the network (#3221, the agent's cap). Only Sarah could approve it with Freighter. Nothing was sent.`,
  simRefused: (what: string, code: number) => `Simulation: this payment (${what}) would have been refused by the network${code > 0 ? ` (#${code})` : ""}. Nothing was sent.`,
  simExecuted: (what: string) => `Simulation: this payment (${what}) would have been executed by the agent on its own, under its cap. Nothing was sent.`,
  simNeedsOwner: (rules: string) => `Simulation: the network would have accepted the agent's signature, but the gatekeeper would have asked for Sarah's approval (${rules}). Nothing was sent.`,
  // A7 : lectures
  budget: (limit: Usdc, hours: number, spent: Usdc, remaining: Usdc) =>
    `Agent's cap: ${limit} USDC over a rolling ~${hours} h. Spent: ${spent} USDC. Left: ${remaining} USDC. (Read on-chain from the spending-limit policy.)`,
  budgetError: "I couldn't read the agent's on-chain budget: try again in a moment.",
  accountLabel: "Agent's account (smart account)",
  accountAddress: (a: string) => `Agent's account address (smart account): ${a}`,
  contactAddress: (name: string, a: string) => `${name}'s address: ${a}`,
  balance: (bal: Usdc, remaining: Usdc, limit: Usdc) => `Agent's account balance: ${bal} USDC. Budget left: ${remaining} / ${limit} USDC.`,
  // planner de secours
  fbPayClarify: "What amount in USDC, and to whom (Alice or a G… address)?",
  fbNotUnderstood: 'I didn\'t understand. Example: "pay 2 USDC to Alice".',
  fbUnsupported: "I only make USDC payments: no swaps, NFTs, staking or bridges.",
  rPay: (amount: string, to: string) => `Payment of ${amount} USDC to ${to}.`,
  rPayroll: "Team payroll.",
  rAddress: "Address requested.",
  rBudget: "Agent's cap.",
  rHistory: "The agent's payment history.",
  rBalance: "Balance and budget lookup.",
  // pause (B4)
  pauseScope: "Pausing only cuts the agent's public petty cash. Nothing changes in the vault: Sarah already signs every payment there.",
  alreadyPaused: "The agent is already paused (no agent rule on-chain).",
  notPaused: (id: number) => `The agent isn't paused (rule ${id} is active).`,
  ruleUnreadable: (e: string) => `The agent's rule can't be read on-chain: ${e}`,
  simulationFailed: (fn: string, e: string) => `Simulation of ${fn} failed: ${e}`,
  // activité
  actPaidAgent: "Paid by the agent, under its cap.",
  actPaidOwner: "Approved by the owner (Freighter).",
  actRefusedCap: "Refused by the network: the agent's cap was exceeded (#3221).",
  actRefusedCode: (code: number) => `Refused by the network (#${code}).`,
  actRefused: "Refused by the network.",
  actPrivate: "Signed by the owner in the vault: amount hidden.",
  actBlocked: "Blocked by the gatekeeper.",
  actWaiting: "Waiting for the owner's signature in the vault.",
  // session (B12)
  loginTitle: "Monolith: owner sign-in",
  loginUnknown: "Unknown or modified challenge.",
  loginUnreadable: "Unreadable challenge.",
  loginExpired: "Challenge expired: start again.",
  loginReplayed: "Challenge already used.",
  loginBadSignature: "Invalid signature: this isn't the owner account.",
  loginDisabled: "Owner sign-in is disabled (SESSION_SECRET missing): everyone is in simulation.",
  ownerOnly: "Only the signed-in owner can do this.",
  // erreurs d'API
  errMessageRequired: "message required (1 to 1000 characters)",
  errRateLimit: (minutes: number) => `Too many messages: try again in ${minutes} min (public demo limit).`,
  errActivity: "On-chain activity unreadable.",
  errBudget: "On-chain budget unreadable.",
  errReceiptBody: "{ to: G…, hash } required, without an amount",
  errReceiptNotFound: "Transaction not found on-chain (still pending?).",
  errReceiptFailed: "This transaction failed on-chain.",
  errReceiptNotVault: "This transaction isn't a transfer of the confidential contract.",
  errReceiptMismatch: "Sender or recipient differs from this receipt.",
  errLoginBody: "{ message, token, signature } required",
  errPauseBody: '{ action: "pause" | "resume" } required',
  errSignedXdr: "signedXdr required",
  errBadXdr: "Invalid XDR.",
  errNotOwnerTx: "Transaction not signed by the owner.",
  errNotFound: "not found",
  errServer: (detail: string) => `Something went wrong on the server: ${detail}`,
  errNetwork: (stage: string, detail: string) => `The ${stage === "simulation" ? "simulation" : "network"} failed: ${detail}`,
  errOwnerApproval: (e: string) => `Preparing the owner approval failed: ${e}`,
  // composants
  uiOwner: (a: string) => `Owner signed in (${a})`,
  uiDemo: "Demo mode (simulation)",
  uiOwnerTitle: "The agent's payments are real.",
  uiDemoTitle: "The agent simulates: nothing is sent to the network.",
  uiLogin: "Sign in as Sarah with Freighter",
  uiLogout: "Sign out",
  uiLoginDisabled: "Owner sign-in is disabled on this deployment.",
  uiConnecting: "Connecting to Freighter",
  uiSigningChallenge: "Signing the challenge",
  uiVerifying: "Checking",
  uiNoFreighter: "Freighter isn't installed or isn't unlocked.",
  uiAccessDenied: (e: string) => `Access denied: ${e}`,
  uiWrongAccount: (active: string, owner: string) => `Active account ${active}: only the owner ${owner} can sign in.`,
  uiWrongNet: (net: string) => `Switch Freighter to Testnet (current network: ${net}).`,
  uiNotSigned: (e: string) => `Message not signed: ${e}`,
  uiPaused: "Agent paused: its on-chain rule is removed, it can't pay anything on its own.",
  uiActive: (id?: number) => `Agent's petty cash active (rule ${id ?? "?"}).`,
  uiPause: "Pause the agent",
  uiResume: "Reactivate the agent",
  uiSimulating: "Simulating",
  uiFee: (fee: number) => `Simulated fee: ~${fee} XLM (paid by the owner).`,
  uiSignPause: "Sign the pause in Freighter",
  uiSignResume: "Sign the reactivation in Freighter",
};

export type Messages = typeof en;

const fr: Messages = {
  slotBoth: "Payer combien, et à qui ?",
  slotTo: "À qui ?",
  slotAmount: "Combien ?",
  didYouMean: (names) => `Tu veux dire ${names.join(" ou ")} ? Redis-le avec le nom exact, je ne paie pas sur une correction.`,
  didYouMeanTyped: (name, typed) => `Tu veux dire ${name} ?${typed ? ` (tu as écrit « ${typed} »)` : ""} Redis-le avec le nom exact, je ne paie pas sur une correction.`,
  unknownName: (raw) => `Je ne connais pas « ${raw} » : donne-moi son adresse G….`,
  invalidAddress: (start) => `« ${start}… » n'est pas une adresse Stellar valide : vérifie-la (56 caractères, commence par G).`,
  vaultPrepared: (n) => `J'ai préparé ${n} paiement${n > 1 ? "s" : ""} confidentiel${n > 1 ? "s" : ""} : c'est toi qui signes, les montants resteront cachés au public.`,
  payrollTotal: (total) => `Paie : ${total} USDC au total.`,
  vaultCheckFailed: "Je n'ai pas pu vérifier si ce destinataire est dans le coffre. Je ne paie pas en public à l'aveugle, ça révélerait le montant : réessaie dans un instant.",
  vaultSuspicious: "Destinataire du coffre : je ne prépare rien sur un message suspect. Redemande calmement, avec le montant exact.",
  vaultUnknownRecipient: "Ce destinataire est dans le coffre mais pas dans ton carnet : vérifie l'adresse avant de signer.",
  refusal:
    "Je ne fais pas celui-ci. Ton message me pousse à sauter mes vérifications, et il viderait le compte ou enverrait l'argent vers une adresse inconnue. Si tu le veux vraiment, redemande-le calmement, avec un montant précis, et je te demanderai ton accord.",
  infoOnly: "Simple consultation : aucun fonds ne bouge.",
  onePaymentPerMessage: "Un seul paiement par message, pour que chaque montant soit vérifié séparément.",
  invalidAmount: "Je n'ai pas pu lire un montant valide, donc rien n'a été fait.",
  unknownRecipient: (to) => `Je ne trouve pas « ${to} » dans le carnet, et ce n'est pas une adresse Stellar valide.`,
  budgetUnreadable: "Je n'ai pas pu lire le budget on-chain de l'agent, donc je demande ton accord.",
  overBudget: (limit, spent, remaining) =>
    `Ça dépasse le budget de l'agent : ${limit} USDC par ~24 h, ${spent} déjà dépensés, ${remaining} restants. Le réseau refusera la signature de l'agent ; il faut la tienne.`,
  notInContacts: "Ce destinataire n'est pas dans ton carnet, donc je demande ton accord.",
  firstPayment: "Premier paiement vers cette adresse : je demande ton accord, même sous le plafond.",
  historyUnreadable: "(Historique on-chain illisible.)",
  pressure: "Ton message me pousse à sauter mes vérifications ou à me presser, donc je vérifie avec toi.",
  amountMismatch: (understood, written) => `Le montant compris (${understood} USDC) ne correspond pas à celui écrit dans ton message (${written.join(", ")}).`,
  unplannedAddress: "Ton message mentionne une adresse qui ne fait pas partie du paiement prévu.",
  autoExecute: (remaining, limit) => `Dans le budget de l'agent (${remaining} USDC restants sur ${limit}), destinataire connu : l'agent paie seul.`,
  payrollAlone: "La paie se lance seule, sans autre action dans le même message.",
  payrollNotInVault: "Un salarié n'est pas inscrit dans le coffre : je ne verse pas un salaire en public.",
  payrollAmounts: (lines) => `Les salaires sont fixés dans la paie (${lines} USDC) : ton message cite un autre montant.`,
  payrollAddress: "Ton message mentionne une adresse : la paie ne va qu'aux salariés du carnet.",
  payrollSuspicious: "Je ne prépare pas la paie sur un message suspect.",
  paused:
    "L'agent est en pause : Sarah a retiré sa règle on-chain, sa signature ne vaut plus rien. Seule la petite caisse publique est coupée ; dans le coffre, Sarah signe déjà chaque paiement.",
  simRefusedCap: (what) => `Simulation : ce paiement (${what}) aurait été refusé par le réseau (#3221, plafond de l'agent). Seule Sarah pourrait l'approuver avec Freighter. Rien n'a été envoyé.`,
  simRefused: (what, code) => `Simulation : ce paiement (${what}) aurait été refusé par le réseau${code > 0 ? ` (#${code})` : ""}. Rien n'a été envoyé.`,
  simExecuted: (what) => `Simulation : ce paiement (${what}) aurait été exécuté par l'agent seul, sous son plafond. Rien n'a été envoyé.`,
  simNeedsOwner: (rules) => `Simulation : le réseau aurait accepté la signature de l'agent, mais le gatekeeper aurait demandé l'accord de Sarah (${rules}). Rien n'a été envoyé.`,
  budget: (limit, hours, spent, remaining) =>
    `Plafond de l'agent : ${limit} USDC sur ~${hours} h glissantes. Dépensé : ${spent} USDC. Restant : ${remaining} USDC. (Lu on-chain dans la spending-limit policy.)`,
  budgetError: "Je n'ai pas pu lire le budget on-chain de l'agent : réessaie dans un instant.",
  accountLabel: "Compte de l'agent (smart account)",
  accountAddress: (a) => `Adresse du compte de l'agent (smart account) : ${a}`,
  contactAddress: (name, a) => `Adresse de ${name} : ${a}`,
  balance: (bal, remaining, limit) => `Solde du compte de l'agent : ${bal} USDC. Budget restant : ${remaining} / ${limit} USDC.`,
  fbPayClarify: "Quel montant en USDC, et à qui (Alice ou une adresse G…) ?",
  fbNotUnderstood: "Je n'ai pas compris. Exemple : « paie 2 USDC à Alice ».",
  fbUnsupported: "Je ne fais que des paiements en USDC : pas d'échange, de NFT, de staking ni de bridge.",
  rPay: (amount, to) => `Paiement de ${amount} USDC à ${to}.`,
  rPayroll: "Paie de l'équipe.",
  rAddress: "Adresse demandée.",
  rBudget: "Plafond de l'agent.",
  rHistory: "Historique des paiements de l'agent.",
  rBalance: "Consultation du solde et du budget.",
  pauseScope: "La pause ne coupe que la petite caisse publique de l'agent. Dans le coffre, rien ne change : c'est déjà Sarah qui signe chaque paiement.",
  alreadyPaused: "L'agent est déjà en pause (aucune règle de l'agent on-chain).",
  notPaused: (id) => `L'agent n'est pas en pause (règle ${id} active).`,
  ruleUnreadable: (e) => `Règle de l'agent illisible on-chain : ${e}`,
  simulationFailed: (fn, e) => `Simulation de ${fn} échouée : ${e}`,
  actPaidAgent: "Payé par l'agent, sous son plafond.",
  actPaidOwner: "Approuvé par l'owner (Freighter).",
  actRefusedCap: "Refusé par le réseau : plafond de l'agent dépassé (#3221).",
  actRefusedCode: (code) => `Refusé par le réseau (#${code}).`,
  actRefused: "Refusé par le réseau.",
  actPrivate: "Signé par l'owner dans le coffre : montant caché.",
  actBlocked: "Bloqué par le gatekeeper.",
  actWaiting: "En attente de la signature de l'owner dans le coffre.",
  loginTitle: "Monolith : connexion de l'owner",
  loginUnknown: "Défi inconnu ou modifié.",
  loginUnreadable: "Défi illisible.",
  loginExpired: "Défi expiré : recommence.",
  loginReplayed: "Défi déjà utilisé.",
  loginBadSignature: "Signature invalide : ce n'est pas le compte owner.",
  loginDisabled: "Connexion owner désactivée (SESSION_SECRET absent) : tout le monde est en simulation.",
  ownerOnly: "Réservé à l'owner connecté.",
  errMessageRequired: "message requis (1 à 1000 caractères)",
  errRateLimit: (minutes) => `Trop de messages : réessaie dans ${minutes} min (limite de la démo publique).`,
  errActivity: "Activité on-chain illisible.",
  errBudget: "Budget on-chain illisible.",
  errReceiptBody: "{ to: G…, hash } requis, sans montant",
  errReceiptNotFound: "Tx introuvable on-chain (encore en attente ?).",
  errReceiptFailed: "Cette tx a échoué on-chain.",
  errReceiptNotVault: "Cette tx n'est pas un transfert du contrat confidentiel.",
  errReceiptMismatch: "Émetteur ou destinataire différent de ce reçu.",
  errLoginBody: "{ message, token, signature } requis",
  errPauseBody: '{ action: "pause" | "resume" } requis',
  errSignedXdr: "signedXdr requis",
  errBadXdr: "XDR invalide.",
  errNotOwnerTx: "Tx non signée par l'owner.",
  errNotFound: "introuvable",
  errServer: (detail) => `Erreur côté serveur : ${detail}`,
  errNetwork: (stage, detail) => `Échec ${stage === "simulation" ? "de la simulation" : "sur le réseau"} : ${detail}`,
  errOwnerApproval: (e) => `Préparation de l'approbation owner échouée : ${e}`,
  uiOwner: (a) => `Owner connecté (${a})`,
  uiDemo: "Mode démo (simulation)",
  uiOwnerTitle: "Les paiements de l'agent sont réels.",
  uiDemoTitle: "L'agent simule : rien n'est envoyé sur le réseau.",
  uiLogin: "Se connecter en tant que Sarah avec Freighter",
  uiLogout: "Se déconnecter",
  uiLoginDisabled: "Connexion owner désactivée sur ce déploiement.",
  uiConnecting: "Connexion à Freighter",
  uiSigningChallenge: "Signature du défi",
  uiVerifying: "Vérification",
  uiNoFreighter: "Freighter n'est pas installé ou pas déverrouillé.",
  uiAccessDenied: (e) => `Accès refusé : ${e}`,
  uiWrongAccount: (active, owner) => `Compte actif ${active} : seul l'owner ${owner} peut se connecter.`,
  uiWrongNet: (net) => `Passe Freighter sur Testnet (réseau actuel : ${net}).`,
  uiNotSigned: (e) => `Message non signé : ${e}`,
  uiPaused: "Agent en pause : sa règle on-chain est retirée, il ne peut plus rien payer seul.",
  uiActive: (id) => `Petite caisse de l'agent active (règle ${id ?? "?"}).`,
  uiPause: "Mettre l'agent en pause",
  uiResume: "Réactiver l'agent",
  uiSimulating: "Simulation",
  uiFee: (fee) => `Frais simulés : ~${fee} XLM (payés par l'owner).`,
  uiSignPause: "Signer la pause dans Freighter",
  uiSignResume: "Signer la reprise dans Freighter",
};

const pt: Messages = {
  slotBoth: "Pagar quanto, e para quem?",
  slotTo: "Para quem?",
  slotAmount: "Quanto?",
  didYouMean: (names) => `Você quis dizer ${names.join(" ou ")}? Repita com o nome exato: não pago com base numa correção.`,
  didYouMeanTyped: (name, typed) => `Você quis dizer ${name}?${typed ? ` (você escreveu "${typed}")` : ""} Repita com o nome exato: não pago com base numa correção.`,
  unknownName: (raw) => `Não conheço "${raw}": me dê o endereço G… dessa pessoa.`,
  invalidAddress: (start) => `"${start}…" não é um endereço Stellar válido: confira (56 caracteres, começa com G).`,
  vaultPrepared: (n) => `Preparei ${n} pagamento${n > 1 ? "s" : ""} confidencia${n > 1 ? "is" : "l"}: quem assina é você, e os valores ficarão ocultos do público.`,
  payrollTotal: (total) => `Folha de pagamento: ${total} USDC no total.`,
  vaultCheckFailed: "Não consegui verificar se este destinatário está no cofre. Não pago em público às cegas, isso revelaria o valor: tente de novo daqui a pouco.",
  vaultSuspicious: "Destinatário do cofre: não preparo nada com uma mensagem suspeita. Peça de novo com calma, com o valor exato.",
  vaultUnknownRecipient: "Este destinatário está no cofre, mas não nos seus contatos: confira o endereço antes de assinar.",
  refusal:
    "Este eu não faço. Sua mensagem me pressiona a pular minhas verificações, e ela esvaziaria a conta ou mandaria o dinheiro para um endereço desconhecido. Se você quiser mesmo, peça de novo com calma, com um valor exato, e eu vou pedir a sua aprovação.",
  infoOnly: "Só uma consulta: nenhum fundo se move.",
  onePaymentPerMessage: "Um pagamento por mensagem, para que cada valor seja verificado separadamente.",
  invalidAmount: "Não consegui ler um valor válido, então nada foi feito.",
  unknownRecipient: (to) => `Não encontro "${to}" nos seus contatos, e não é um endereço Stellar válido.`,
  budgetUnreadable: "Não consegui ler o orçamento on-chain do agente, então estou pedindo a sua aprovação.",
  overBudget: (limit, spent, remaining) =>
    `Isso passa do orçamento do agente: ${limit} USDC a cada ~24 h, ${spent} já gastos, ${remaining} restantes. A rede vai recusar a assinatura do agente; é preciso a sua.`,
  notInContacts: "Este destinatário não está nos seus contatos, então estou pedindo a sua aprovação.",
  firstPayment: "Primeiro pagamento para este endereço: estou pedindo a sua aprovação, mesmo abaixo do limite.",
  historyUnreadable: "(Histórico on-chain ilegível.)",
  pressure: "Sua mensagem me pressiona a pular minhas verificações ou a ter pressa, então estou confirmando com você.",
  amountMismatch: (understood, written) => `O valor que entendi (${understood} USDC) não corresponde ao da sua mensagem (${written.join(", ")}).`,
  unplannedAddress: "Sua mensagem menciona um endereço que não faz parte do pagamento previsto.",
  autoExecute: (remaining, limit) => `Dentro do orçamento do agente (${remaining} USDC restantes de ${limit}), destinatário conhecido: o agente paga sozinho.`,
  payrollAlone: "A folha de pagamento roda sozinha, sem outra ação na mesma mensagem.",
  payrollNotInVault: "Um funcionário não está registrado no cofre: não pago salário em público.",
  payrollAmounts: (lines) => `Os salários são fixos na folha (${lines} USDC): sua mensagem cita outro valor.`,
  payrollAddress: "Sua mensagem menciona um endereço: a folha só vai para os funcionários dos seus contatos.",
  payrollSuspicious: "Não preparo a folha de pagamento com uma mensagem suspeita.",
  paused:
    "O agente está pausado: Sarah removeu a regra dele on-chain, a assinatura dele não vale mais nada. Só o caixa público foi cortado; no cofre, Sarah já assina cada pagamento.",
  simRefusedCap: (what) => `Simulação: este pagamento (${what}) teria sido recusado pela rede (#3221, limite do agente). Só Sarah poderia aprová-lo com o Freighter. Nada foi enviado.`,
  simRefused: (what, code) => `Simulação: este pagamento (${what}) teria sido recusado pela rede${code > 0 ? ` (#${code})` : ""}. Nada foi enviado.`,
  simExecuted: (what) => `Simulação: este pagamento (${what}) teria sido executado pelo agente sozinho, abaixo do limite dele. Nada foi enviado.`,
  simNeedsOwner: (rules) => `Simulação: a rede teria aceitado a assinatura do agente, mas o gatekeeper teria pedido a aprovação de Sarah (${rules}). Nada foi enviado.`,
  budget: (limit, hours, spent, remaining) =>
    `Limite do agente: ${limit} USDC em ~${hours} h móveis. Gasto: ${spent} USDC. Restante: ${remaining} USDC. (Lido on-chain na spending-limit policy.)`,
  budgetError: "Não consegui ler o orçamento on-chain do agente: tente de novo daqui a pouco.",
  accountLabel: "Conta do agente (smart account)",
  accountAddress: (a) => `Endereço da conta do agente (smart account): ${a}`,
  contactAddress: (name, a) => `Endereço de ${name}: ${a}`,
  balance: (bal, remaining, limit) => `Saldo da conta do agente: ${bal} USDC. Orçamento restante: ${remaining} / ${limit} USDC.`,
  fbPayClarify: "Qual valor em USDC, e para quem (Alice ou um endereço G…)?",
  fbNotUnderstood: 'Não entendi. Exemplo: "pague 2 USDC para a Alice".',
  fbUnsupported: "Eu só faço pagamentos em USDC: nada de trocas, NFTs, staking ou bridges.",
  rPay: (amount, to) => `Pagamento de ${amount} USDC para ${to}.`,
  rPayroll: "Folha de pagamento da equipe.",
  rAddress: "Endereço solicitado.",
  rBudget: "Limite do agente.",
  rHistory: "Histórico de pagamentos do agente.",
  rBalance: "Consulta de saldo e orçamento.",
  pauseScope: "A pausa só corta o caixa público do agente. Nada muda no cofre: lá, Sarah já assina cada pagamento.",
  alreadyPaused: "O agente já está pausado (nenhuma regra do agente on-chain).",
  notPaused: (id) => `O agente não está pausado (regra ${id} ativa).`,
  ruleUnreadable: (e) => `Regra do agente ilegível on-chain: ${e}`,
  simulationFailed: (fn, e) => `A simulação de ${fn} falhou: ${e}`,
  actPaidAgent: "Pago pelo agente, abaixo do limite dele.",
  actPaidOwner: "Aprovado pelo owner (Freighter).",
  actRefusedCap: "Recusado pela rede: limite do agente ultrapassado (#3221).",
  actRefusedCode: (code) => `Recusado pela rede (#${code}).`,
  actRefused: "Recusado pela rede.",
  actPrivate: "Assinado pelo owner no cofre: valor oculto.",
  actBlocked: "Bloqueado pelo gatekeeper.",
  actWaiting: "Aguardando a assinatura do owner no cofre.",
  loginTitle: "Monolith: login do owner",
  loginUnknown: "Desafio desconhecido ou modificado.",
  loginUnreadable: "Desafio ilegível.",
  loginExpired: "Desafio expirado: comece de novo.",
  loginReplayed: "Desafio já usado.",
  loginBadSignature: "Assinatura inválida: esta não é a conta do owner.",
  loginDisabled: "Login do owner desativado (SESSION_SECRET ausente): todos estão em simulação.",
  ownerOnly: "Reservado ao owner conectado.",
  errMessageRequired: "mensagem obrigatória (1 a 1000 caracteres)",
  errRateLimit: (minutes) => `Mensagens demais: tente de novo em ${minutes} min (limite da demo pública).`,
  errActivity: "Atividade on-chain ilegível.",
  errBudget: "Orçamento on-chain ilegível.",
  errReceiptBody: "{ to: G…, hash } obrigatório, sem valor",
  errReceiptNotFound: "Transação não encontrada on-chain (ainda pendente?).",
  errReceiptFailed: "Esta transação falhou on-chain.",
  errReceiptNotVault: "Esta transação não é uma transferência do contrato confidencial.",
  errReceiptMismatch: "Remetente ou destinatário diferente deste recibo.",
  errLoginBody: "{ message, token, signature } obrigatório",
  errPauseBody: '{ action: "pause" | "resume" } obrigatório',
  errSignedXdr: "signedXdr obrigatório",
  errBadXdr: "XDR inválido.",
  errNotOwnerTx: "Transação não assinada pelo owner.",
  errNotFound: "não encontrado",
  errServer: (detail) => `Algo deu errado no servidor: ${detail}`,
  errNetwork: (stage, detail) => `Falha ${stage === "simulation" ? "na simulação" : "na rede"}: ${detail}`,
  errOwnerApproval: (e) => `A preparação da aprovação do owner falhou: ${e}`,
  uiOwner: (a) => `Owner conectado (${a})`,
  uiDemo: "Modo demo (simulação)",
  uiOwnerTitle: "Os pagamentos do agente são reais.",
  uiDemoTitle: "O agente simula: nada é enviado para a rede.",
  uiLogin: "Entrar como Sarah com o Freighter",
  uiLogout: "Sair",
  uiLoginDisabled: "Login do owner desativado nesta implantação.",
  uiConnecting: "Conectando ao Freighter",
  uiSigningChallenge: "Assinando o desafio",
  uiVerifying: "Verificando",
  uiNoFreighter: "O Freighter não está instalado ou não está desbloqueado.",
  uiAccessDenied: (e) => `Acesso negado: ${e}`,
  uiWrongAccount: (active, owner) => `Conta ativa ${active}: só o owner ${owner} pode entrar.`,
  uiWrongNet: (net) => `Mude o Freighter para Testnet (rede atual: ${net}).`,
  uiNotSigned: (e) => `Mensagem não assinada: ${e}`,
  uiPaused: "Agente pausado: a regra dele on-chain foi removida, ele não pode pagar nada sozinho.",
  uiActive: (id) => `Caixa do agente ativo (regra ${id ?? "?"}).`,
  uiPause: "Pausar o agente",
  uiResume: "Reativar o agente",
  uiSimulating: "Simulando",
  uiFee: (fee) => `Taxa simulada: ~${fee} XLM (paga pelo owner).`,
  uiSignPause: "Assinar a pausa no Freighter",
  uiSignResume: "Assinar a reativação no Freighter",
};

export const T: Record<Lang, Messages> = { en, fr, pt };

/** Les trois traductions d'une phrase sans paramètre (ex. reconnaître nos propres questions). */
export const allLangs = (key: { [K in keyof Messages]: Messages[K] extends string ? K : never }[keyof Messages]): string[] =>
  LANGS.map((l) => T[l][key] as string);

// ---------- bloc « mandate » : mandat de l'agent (droits qui expirent on-chain, valid_until OZ) ----------

/** Durée lisible : « 6 days 23 h » / « 5 h 10 min » / « 3 min ». */
const span = (sec: number, u: { d: string; h: string; m: string }) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d} ${u.d} ${h} h` : h > 0 ? `${h} h ${m} min` : `${Math.max(m, 1)} min`;
};

const mandateEn = {
  expired: "The agent's mandate has expired: Sarah must renew it.",
  leftover: (usdc: string) => `There are ${usdc} USDC left in the petty cash. Do you want me to put them back in the vault?`,
  left: (sec: number) => `Mandate: expires in about ${span(sec, { d: "days", h: "h", m: "min" })}.`,
  none: "Mandate: no expiry.",
  expiredShort: "Mandate: expired.",
  howLong: "For how long? (between 1 hour and 30 days)",
  range: "A mandate lasts between 1 hour and 30 days: how long should it be?",
  granted: (until: string) => `Until ${until} (UTC, approximately), I'll be able to pay on my own under your cap. After that, I won't be able to pay anything. Renewing doesn't reset the budget already spent.`,
  simulated: (until: string) => `Simulation: Sarah would sign a mandate until ${until} (UTC, approximately). Nothing was sent.`,
  ownerOnly: "Only Sarah, signed in, can give the agent a mandate.",
  badgeLeft: (sec: number) => `Mandate: ${span(sec, { d: "d", h: "h", m: "min" })} left`,
  badgeNone: "No expiry",
  badgeExpired: "Expired: renew",
  sign: "Sign the mandate in Freighter",
  fee: (fee: number) => `Simulated fee: ~${fee} XLM (paid by Sarah).`,
};
type MandateMessages = typeof mandateEn;

const mandateFr: MandateMessages = {
  expired: "Le mandat de l'agent a expiré : Sarah doit le renouveler.",
  leftover: (usdc) => `Il reste ${usdc} USDC dans la petite caisse. Veux-tu que je les remette dans le coffre ?`,
  left: (sec) => `Mandat : expire dans environ ${span(sec, { d: "jours", h: "h", m: "min" })}.`,
  none: "Mandat : sans expiration.",
  expiredShort: "Mandat : expiré.",
  howLong: "Pour combien de temps ? (entre 1 heure et 30 jours)",
  range: "Un mandat dure entre 1 heure et 30 jours : combien de temps veux-tu ?",
  granted: (until) => `Jusqu'au ${until} (UTC, environ), je pourrai payer seul sous ton plafond. Après, je ne pourrai plus rien payer. Le renouvellement ne remet pas à zéro le budget déjà dépensé.`,
  simulated: (until) => `Simulation : Sarah signerait un mandat jusqu'au ${until} (UTC, environ). Rien n'a été envoyé.`,
  ownerOnly: "Seule Sarah, connectée, peut donner un mandat à l'agent.",
  badgeLeft: (sec) => `Mandat : ${span(sec, { d: "j", h: "h", m: "min" })} restants`,
  badgeNone: "Sans expiration",
  badgeExpired: "Expiré : à renouveler",
  sign: "Signer le mandat dans Freighter",
  fee: (fee) => `Frais simulés : ~${fee} XLM (payés par Sarah).`,
};

const mandatePt: MandateMessages = {
  expired: "O mandato do agente expirou: Sarah precisa renová-lo.",
  leftover: (usdc) => `Restam ${usdc} USDC no caixa. Quer que eu os devolva ao cofre?`,
  left: (sec) => `Mandato: expira em cerca de ${span(sec, { d: "dias", h: "h", m: "min" })}.`,
  none: "Mandato: sem expiração.",
  expiredShort: "Mandato: expirado.",
  howLong: "Por quanto tempo? (entre 1 hora e 30 dias)",
  range: "Um mandato dura entre 1 hora e 30 dias: por quanto tempo?",
  granted: (until) => `Até ${until} (UTC, aproximadamente), poderei pagar sozinho abaixo do seu limite. Depois, não poderei pagar mais nada. A renovação não zera o orçamento já gasto.`,
  simulated: (until) => `Simulação: Sarah assinaria um mandato até ${until} (UTC, aproximadamente). Nada foi enviado.`,
  ownerOnly: "Só Sarah, conectada, pode dar um mandato ao agente.",
  badgeLeft: (sec) => `Mandato: ${span(sec, { d: "d", h: "h", m: "min" })} restantes`,
  badgeNone: "Sem expiração",
  badgeExpired: "Expirado: renovar",
  sign: "Assinar o mandato no Freighter",
  fee: (fee) => `Taxa simulada: ~${fee} XLM (paga por Sarah).`,
};

export const MT: Record<Lang, MandateMessages> = { en: mandateEn, fr: mandateFr, pt: mandatePt };

/** État du mandat à afficher : `validUntil` (ledger, inclus) comparé au ledger courant. */
export type MandateView = { validUntil: number | null; ledger: number; secondsPerLedger: number };

export function mandateLine(m: MandateView, lang: Lang): string {
  if (m.validUntil === null) return MT[lang].none;
  if (m.validUntil < m.ledger) return MT[lang].expiredShort;
  return MT[lang].left((m.validUntil - m.ledger + 1) * m.secondsPerLedger);
}

/** Mots-clés du mandat (texte sans accents) et durée « 7 jours / 3 days / 12 h / 2 semanas ». */
export const MANDATE_KEYWORDS = {
  mandate: /\b(mandat|mandate|mandato|acces|access|acesso|droits?|rights?|direitos?)\b/,
  duration: /(\d+(?:[.,]\d+)?)\s*(jours?|days?|dias?|j|d|heures?|hours?|horas?|hrs?|h|semaines?|weeks?|semanas?|minutes?|minutos?|min)\b/,
};

/** « 7 days » → 168 (heures), ou null. Les minutes sont converties (et seront hors plage si < 1 h). */
export function mandateHours(text: string): number | null {
  const m = MANDATE_KEYWORDS.duration.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const unit = m[2];
  if (/^(semaine|week|semana)/.test(unit)) return n * 168;
  if (/^(jour|day|dia|j$|d$)/.test(unit)) return n * 24;
  if (/^(min)/.test(unit)) return n / 60;
  return n;
}

/** Date lisible d'une expiration, dans la langue de la réponse (UTC). */
export const mandateDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat({ en: "en-US", fr: "fr-FR", pt: "pt-BR" }[lang], { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
