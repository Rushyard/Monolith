# Monolith — audit et direction frontend

> Historique de la première passe. La direction actuelle et sa recherche sont décrites dans `monolith-art-direction.md`, `design-research-awards.md` et `design-pipeline.md`. Les cartes et la première composition ont été remplacées.

Date : 26 octobre 2026. Synthèse de trois angles d’audit : direction artistique et hiérarchie, parcours et accessibilité, références de produits comparables.

## Direction : un cockpit financier cinématique

Monolith possède déjà une identité : noir profond, ivoire, proportions du monolithe, lumière d’alignement et œil rouge HAL. Ce vocabulaire distingue le produit ; il mérite d’être conservé. L’amélioration consiste à lui donner la précision d’un outil financier : comprendre immédiatement la proposition, identifier son état, voir la prochaine action et recevoir un résultat explicite.

Le spectaculaire doit soutenir ces objectifs. L’accueil peut installer un univers ; le coffre, l’agent et l’auditeur doivent surtout être rapides à lire et à utiliser. Le rouge HAL garde son rôle de signature et de réaction ponctuelle. Les montants et états importants prennent le premier plan ; les adresses, métadonnées et détails techniques restent accessibles au second plan.

Trois principes réunissent les audits :

- **Comprendre avant de défiler.** L’ancien hero occupait 340vh et révélait son titre après 82 % de la progression. Une promesse et des accès doivent être présents dès l’arrivée.
- **Une hiérarchie financière stable.** Solde, budget restant, résultat et action suivante doivent être plus visibles que le décor, les cadres et les explications techniques.
- **Une fluidité ressentie.** Éviter les attentes décoratives imposées, limiter le travail graphique inutile et respecter les préférences de mouvement.

## Références et emprunts précis

Ces références servent de principes, sans reprendre leur identité graphique ni attribuer leurs fonctions à Monolith.

| Référence officielle | Principe observé | Adaptation proposée pour Monolith |
| --- | --- | --- |
| [Linear — A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) | Navigation plus discrète, actions cohérentes, séparations moins bruyantes, niveaux visuels mieux hiérarchisés. | Faire ressortir le contenu de travail ; employer des espacements, surfaces et contrôles communs aux trois espaces. |
| [Mercury Treasury](https://mercury.com/treasury) | Promesse immédiatement lisible et accès à une démonstration du produit. | Donner une entrée explicite à l’agent et un parcours sans portefeuille vers l’auditeur ; présenter un aperçu concret du produit. |
| [Ramp — Finance for the Agent Economy](https://agents.ramp.com/) | Présentation par identité, règles, capacités autorisées et piste d’audit. | Résumer clairement le propriétaire de l’agent, son budget, ses permissions et ses résultats. |
| [Safe Wallet](https://safe.global/wallet) | Explication du parcours proposer, vérifier, signer, exécuter avec le contexte de transaction. | Montrer les étapes de Monolith, le destinataire, la visibilité du montant et la signature attendue. |

## Arbitrage après comparaison avec la version Claude

L’utilisateur préfère l’entrée cinématique de la version de référence : monolithe seul en plein écran, lever du soleil contrôlé au défilement, messages puis révélation du titre. Cette préférence remplace la recommandation initiale de grand titre et boutons immédiats. Le film épinglé est rétabli ; la navigation apparaît à sa sortie. Les cartes et améliorations des écrans opérationnels sont conservées.

## Première passe : changements présents dans le code

Statut établi par lecture du diff local, au moment de rédaction. « Implémenté » signifie présent dans le code ; cela ne constitue pas une certification visuelle ou fonctionnelle. Aucun résultat de compilation, mesure de performance ou test de transaction n’est annoncé dans ce document.

| N° | Priorité | Changement implémenté | Emplacement principal |
| --- | --- | --- | --- |
| 01 | P0 | Entrée cinématique rétablie : monolithe plein écran, lever de soleil piloté au défilement et révélation progressive du titre. | `app/app/fx/hero-video.tsx` |
| 02 | P0 | Navigation discrète pendant le film, puis visible à la sortie ; accès aux trois espaces dans les cartes conservées. | `app/app/fx/hero-video.tsx` |
| 03 | P0 | Retrait de l’intertitre plein écran à chaque navigation du layout. Le composant reste disponible dans les sources. | `app/app/layout.tsx` |
| 04 | P0 | Indication persistante démo/propriétaire à proximité du champ de demande de l’agent. | `app/app/agent/page.tsx` |
| 05 | P1 | Cartes d’entrée illustrées et progression « Protéger / Déléguer / Vérifier ». | `app/app/page.tsx` |
| 06 | P1 | Section qui explique la frontière public/confidentiel, avec accès aux preuves de l’auditeur. | `app/app/page.tsx` |
| 07 | P1 | Hiérarchie partagée : largeur de contenu, surfaces graphite, contrastes de texte, titres moins espacés et contrôles harmonisés. | `app/app/globals.css` |
| 08 | P1 | Navigation active plus lisible, marque graphique, cibles tactiles et pied de page harmonisés. | `app/app/layout.tsx`, `app/app/globals.css` |
| 09 | P0 | Lien d’évitement, nom accessible de navigation et focus clavier visible. | `app/app/nav.tsx`, `app/app/globals.css` |
| 10 | P1 | Correction du décalage vertical du deuxième panneau dans une grille, causé par la règle globale des panneaux adjacents. | `app/app/globals.css` |
| 11 | P1 | Film piloté au défilement ; image fixe et titre direct en mouvement réduit ; erreur vidéo ramenée à une scène fixe. | `app/app/fx/hero-video.tsx` |
| 12 | P1 | Films ambiants limités aux fichiers disponibles, absence de média en mouvement réduit ; arrêt du préchargement caché permanent de Stargate. | `app/app/fx/ambient-film.tsx`, `app/app/fx/stargate.tsx` |
| 13 | P1 | Stargate statique en mouvement réduit ; shader seulement en solution de repli ; minuterie dissociée des images ; ressources graphiques libérées. | `app/app/fx/stargate.tsx` |
| 14 | P1 | Nouveaux textes d’accueil et de navigation en anglais, français et portugais ; règles adaptatives pour les petits écrans. | `app/lib/i18n/`, `app/app/globals.css` |

Les changements de cette passe concernent la présentation et le comportement des effets. Ils ne constituent pas une refonte des contrats, des permissions financières ou des parcours connectés du coffre.

## Idées priorisées à explorer

Toutes les lignes suivantes sont des **propositions**, pas des fonctionnalités livrées. P0 désigne une friction importante de compréhension ou de confiance ; P1 une amélioration à fort impact ; P2 une finition ou une extension à arbitrer après usage.

### Parcours et états

| N° | Priorité | Proposition | Résultat attendu |
| --- | --- | --- | --- |
| 15 | P0 | Regrouper le coffre autour d’un résumé de solde et d’une action principale ; placer Déposer, Envoyer, Retirer dans une navigation compacte. | Éviter plusieurs formulaires concurrents dès l’ouverture. |
| 16 | P0 | Afficher un parcours de première utilisation : connecter, préparer les fonds de test, créer le coffre, effectuer une première opération. | Savoir où commencer et ce qu’il reste à faire. |
| 17 | P0 | Présenter les étapes d’une opération : préparation, preuve, signature, confirmation, avec la prochaine intervention attendue. | Comprendre une attente sans lire le terminal. |
| 18 | P0 | Placer un résultat simple au début de chaque réponse agent : simulé, confirmé, signature requise ou bloqué. | Comprendre immédiatement ce qui s’est réellement passé. |
| 19 | P0 | Rendre les erreurs actionnables : ce qui a échoué, si quelque chose a été envoyé, comment réessayer ; conserver la saisie. | Récupérer d’un échec sans inquiétude ni perte de travail. |
| 20 | P0 | Donner au statut de session un état de vérification explicite avant de conclure « démo » ou « propriétaire ». | Éviter un statut provisoire trompeur lors du chargement. |
| 21 | P1 | Mettre le montant restant du budget au premier plan ; garder plafond, période et consommation à proximité. | Lire la capacité de l’agent en une seconde. |
| 22 | P1 | Résumer l’identité et les permissions réelles de l’agent dans une carte compacte. | Rendre le contrôle tangible : propriétaire, budget, actions permises, pause. |
| 23 | P1 | Déplier le raisonnement et les détails du réseau à la demande ; conserver une explication courte visible. | Préserver la transparence avec moins de texte simultané. |
| 24 | P1 | Uniformiser les états vides : aucune activité, aucune opération dans la fenêtre disponible, portefeuille non connecté, service indisponible. | Distinguer l’absence de données d’un problème technique. |
| 25 | P1 | Réduire le terminal à un volet « Détails techniques » accessible après les retours destinés à l’utilisateur. | Un écran financier plus serein, tout en gardant le diagnostic. |
| 26 | P1 | Dans l’auditeur, raconter les étapes « Lire la chaîne / Vérifier une clé / Voir ce qu’elle révèle ». | Faire comprendre le rôle de la clé sans expertise cryptographique. |

### Direction artistique et démonstration

| N° | Priorité | Proposition | Résultat attendu |
| --- | --- | --- | --- |
| 27 | P1 | Ajouter à l’accueil un aperçu du produit : demande, budget, verdict et preuve. Identifier clairement toute illustration ou donnée simulée. | Montrer le produit concret avant ses détails techniques. |
| 28 | P1 | Illustrer un même transfert côté public et côté auditeur autorisé, avec les limites réelles de confidentialité. | Rendre la confidentialité compréhensible sans promesse excessive. |
| 29 | P1 | Définir une échelle typographique commune : chiffres, titres, texte courant, métadonnées ; réserver le style console aux signatures. | Une densité plus lisible et plus cohérente. |
| 30 | P1 | Définir des tokens d’espacement, rayons, bordures et mouvements, puis consolider les anciennes règles CSS avec les nouvelles. | Éviter qu’une accumulation de surcharges dégrade les prochaines évolutions. |
| 31 | P1 | Réserver les couleurs à des rôles stables : ivoire pour les actions, violet pour le confidentiel, vert pour les confirmations, rouge pour attention/refus. | Identifier les états sans lire chaque ligne, avec libellés complémentaires. |
| 32 | P2 | Transformer le motif du monolithe en système de petits pictogrammes cohérents pour coffre, agent et audit. | Une marque reconnaissable jusque dans les détails. |
| 33 | P2 | Proposer une expérience cinématique volontaire « Voir le film », séparée de l’accès courant au produit. | Conserver la mise en scène longue pour les visiteurs qui la souhaitent. |
| 34 | P2 | Donner une présence visuelle aux contacts : initiale, nom et adresse courte, avec confirmation du destinataire avant signature. | Des paiements plus humains et moins de lecture d’adresses. |

### Fluidité, accessibilité et finition

| N° | Priorité | Proposition | Résultat attendu |
| --- | --- | --- | --- |
| 35 | P0 | Vérifier et compléter les noms accessibles des champs, associations label/champ, statuts annoncés et boutons iconographiques. | Utiliser tous les parcours au clavier et avec un lecteur d’écran. |
| 36 | P1 | Ajouter des squelettes aux dimensions finales pour soldes, budget et activité. | Des chargements lisibles sans saut de mise en page. |
| 37 | P1 | Limiter les réactions HAL à des changements d’état ; vérifier les autres animations continues et leur arrêt hors écran. | Un point d’attention utile et moins de travail graphique. |
| 38 | P1 | Harmoniser les interactions brèves, autour de 150–250 ms, et supprimer les déplacements au mouvement réduit. | Une réponse vive, sans animation qui retarde une action. |
| 39 | P1 | Vérifier les parcours à 360–390 px : navigation, longue adresse, erreur, formulaire rempli, clavier virtuel et table d’audit. | Une qualité mobile qui couvre les états difficiles. |
| 40 | P1 | Ajouter copie d’adresse avec retour discret, chiffres tabulaires et liens d’explorateur explicites là où ils manquent. | Réduire les petites frictions des opérations courantes. |
| 41 | P2 | Mesurer les octets vidéo, le chargement initial et la réactivité sur un appareil modeste avant de choisir d’autres effets. | Faire dépendre les effets d’un budget de performance observable. |
| 42 | P2 | Prévoir des filtres d’activité utiles : privé/public, résultat et période, en indiquant la fenêtre réellement disponible. | Retrouver une opération sans masquer la limite de rétention des événements. |

## Feuille de route

### Étape 1 — Valider la première passe

Contrôler le rendu accueil/agent/coffre/auditeur sur ordinateur et mobile, les trois langues, la navigation clavier, la pause vidéo et le mouvement réduit. Exécuter les contrôles TypeScript et de compilation du projet. Le statut de ces vérifications doit être consigné après exécution, avec leurs limites ; aucune validation de paiement réel ne doit être déduite d’une validation visuelle.

### Étape 2 — Rendre les parcours immédiatement compréhensibles

Traiter 15–20, 24 et 35 avant d’ajouter du décor. Critère de réussite : un nouveau visiteur sait où commencer, distingue simulation et envoi, comprend la signature attendue et peut corriger un échec. Vérifier aussi le rendu sans portefeuille et lorsque la chaîne ne répond pas.

### Étape 3 — Donner au produit sa précision financière

Traiter 21–23, 25–31, 36, 39 et 40. Critère de réussite : budget, solde, destinataire et résultat dominent l’écran ; les détails restent disponibles ; les trois espaces parlent le même langage visuel.

### Étape 4 — Ajouter les signatures distinctives

Arbitrer 32–34, 37–38 et 41–42 à partir des retours et mesures. Le film, les illustrations et HAL doivent renforcer une expérience déjà claire. La démonstration de confidentialité doit employer des données réelles vérifiées ou être explicitement présentée comme une illustration.

## Points de contrôle produit

- Ne jamais remplacer une valeur indisponible par un solde inventé ou un succès fictif.
- Garder la distinction explicite : transferts internes confidentiels ; adresses, entrées, sorties et paiements publics de l’agent visibles.
- Préserver le rôle de la signature propriétaire et le contrôle on-chain, même si leur présentation devient plus simple.
- Évaluer la qualité sur des états réels : chargement, vide, erreur, refus, attente de signature et confirmation, pas seulement une capture idéale.

## Vérifications effectuées sur cette passe

- Vérification TypeScript et compilation de production réussies le 26 octobre 2026 ; contrôle du diff sans erreur d’espacement.
- Navigation locale observée sur les quatre pages, dans une fenêtre de navigateur de 740 px de large ; aucun débordement horizontal mesuré sur l’agent à cette largeur.
- Passage anglais/français vérifié dans le navigateur. Le contrôle lecture/pause appartenait à la première proposition et a été retiré avec celle-ci au profit du film piloté au défilement.
- Consultation du budget agent : réponse affichée cohérente avec le budget lu on-chain (plafond 10 USDC, dépensé 3, restant 7 au moment du contrôle).
- Lecture publique de l’auditeur réussie : transferts confidentiels toujours chiffrés sans clé. Aucun message d’erreur dans le journal navigateur consulté après navigation vers le coffre.
- Limites de cette validation : pas de signature de portefeuille, de transfert, de déchiffrement avec une clé d’audit réelle, ni de test sur téléphone physique. Les adaptations mobiles et le mouvement réduit ont été revus dans le code ; un contrôle sur appareil reste à faire.
- Version disponible localement ; aucune publication en production effectuée.
