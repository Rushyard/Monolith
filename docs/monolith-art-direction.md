# Monolith — direction artistique cinématographique

> La palette, les polices et le langage d’image sont conservés. La nouvelle demande de traversée continue remplace les sections de composition et de mouvement initiales ci-dessous : voir la dernière section de `design-pipeline.md`.

## Intention

Une traversée en quatre actes : apparition, coffre, agent, auditeur. Le monolithe est l'objet central ; la lumière révèle successivement ses propriétés. Le visiteur découvre un instrument financier à travers un langage de cinéma, puis entre dans une interface précise. La landing est une séquence éditoriale, pas une collection de cartes SaaS.

Le reveal vidéo actuel reste libre : ne pas masquer le monolithe avec une colonne de marketing, une énorme accroche ou des boutons. Le titre apparaît au moment de l'alignement, la navigation reste discrète. Les actions existent dans la navigation et à la fin de chaque chapitre.

## Recherche et limites

- [Lusion, site officiel](https://lusion.co/) présente son travail comme du récit visuel 3D et des expériences interactives. [Sa présentation](https://lusion.co/about/) décrit une production unissant design, mouvement, 3D et technologie. Principe retenu : produire les images et leur mise en scène ensemble, avec une continuité de matière et de mouvement.
- [Heco, site officiel](https://heco.partners/) organise son discours autour de la simplification des produits complexes et de projets de marque. Principe retenu : une idée par composition et peu de texte, mais une signification produit claire.
- [Active Theory](https://activetheory.net/) et [Resn](https://www.resn.co.nz/) ont été ouverts ; leur expérience exige JavaScript et n'est pas lisible dans la capture textuelle. Aucune observation visuelle détaillée ni récompense précise n'est affirmée ici.

Les décisions ci-dessous sont une interprétation pour Monolith, pas une reproduction des sites cités. Les cartes, badges et mini-illustrations de la première passe ne portent pas suffisamment cette ambition : ils fragmentent l'histoire et donnent trop de poids au petit texte.

## Typographie : deux familles, rôles stricts

1. **Instrument Sans 400, 500 et 600** : grotesque calme et nette pour une composition éditoriale. Le poids 400 porte les grands titres, 500 les actions, 600 seulement les nombres ou états qui ont besoin de relief. Le vocabulaire de 2001 vient de la composition, des proportions et de l’approche du wordmark, plutôt que de reproduire une police Futura. Aucun texte de lecture en 300.
2. **IBM Plex Mono 400** : numéros de chapitres, coordonnées, montants, navigation secondaire, traces de preuve.

Supprimer Michroma du chargement et remplacer son rôle par Instrument Sans. Le maximum de deux familles vaut pour l'app entière, même dans HAL.

| Usage | Desktop | Mobile | Interligne | Approche |
| --- | --- | --- | --- | --- |
| MONOLITH au reveal | clamp(48px, 7.4vw, 112px) | clamp(30px, 7.8vw, 46px) | 1.0 | .20em desktop, .12em mobile |
| Manifeste après film | clamp(36px, 4.2vw, 64px) | 30–38px | 1.18 | -.015em |
| Titre de chapitre | clamp(44px, 5.2vw, 76px) | 36–44px | 1.05 | -.025em |
| Texte explicatif | 18px | 16px | 1.65 | 0 |
| Lien d'action | 15px, poids 500 | 15px | 1.4 | .01em |
| Numéro / légende | 10–11px mono | 10px mono | 1.5 | .16em |
| Navigation | 12px | 12px | 1.2 | .08em |

Le titre Monolith doit être centré optiquement : compenser l'approche finale par `text-indent` ou marge finale, pas de décalage arbitraire. Les autres titres sont alignés à gauche et en casse naturelle. Pas de capitales très espacées dans les paragraphes ou boutons. Le manifeste fait deux lignes desktop, trois à quatre mobile ; pas de saut de ligne imposé qui crée un mot orphelin en français ou portugais.

## Couleur et matière

- Fond #030303, profondeur #090909, ivoire #e8e4db, texte secondaire #aaa69d.
- Lumière chaude #d6bc8f en faible quantité ; elle appartient à l'image, jamais à un grand halo derrière chaque bloc.
- Rouge HAL #e5462c réservé à la lentille et aux vrais refus. Pas d'usage décoratif sur tous les liens.
- Le violet existant peut rester une convention de données confidentielles dans l'app ; la landing garde la palette noir/ivoire.
- Images légèrement granuleuses, contraste doux dans les ombres, un bord lumineux précis. Aucun dégradé violet générique, planète bleue, pièce crypto, cadenas illustré ou particules gratuites.

## Mise en page desktop

Grille 12 colonnes ; largeur utile 1320px max ; marge latérale `clamp(24px, 5vw, 88px)` ; gouttière 24px. Landing autorisée à dépasser la largeur des écrans métier. Les bords des titres et des légendes partagent les mêmes axes.

### Acte 0 — apparition

Film plein écran, axe vertical intact. Le titre et une phrase courte apparaissent dans le tiers inférieur une fois l'alignement obtenu. Réduire au besoin la hauteur totale du scroll à 250–280vh après observation, mais conserver les étapes du lever de soleil. Un seul petit indice de scroll. Aucun panneau d'interface flottant sur l'image. Navigation visible après la première partie du reveal ; son apparition ne doit pas déplacer le contenu.

### Respiration — manifeste

Fond noir, minimum 180px de vide après le film et 160px avant le chapitre I. Petit label mono à gauche ; manifeste sur colonnes 3–10 : « Une trésorerie confidentielle. Une autonomie sous contrôle. » Le vrai texte produit suit sur colonnes 7–11, largeur 34ch maximum, avec une action fine « Explorer l'agent → ». Cette asymétrie installe le rythme avant les images. Ne pas reprendre tout le texte du hero.

### Chapitre I — Le coffre

Image sur colonnes 1–7, ratio 6:5 ; texte sur colonnes 9–12, centré verticalement avec un décalage de 40px vers le bas. Numéro I au-dessus du titre ; description 28–34ch ; lien « Entrer dans le coffre ↗ ». Entre titre et texte : 24px ; avant lien : 32px. Aucun cadre, fond de carte ou arrondi. Une légende très fine sous l'image : « I / Matière confidentielle ».

### Chapitre II — L'agent

Pause de 180px. Texte sur colonnes 2–5, image sur colonnes 7–12 avec ratio 1:1. La lentille HAL fournit le seul accent rouge de la séquence. Une ligne de contrôle, séparée du paragraphe : « L'IA propose. Le contrat limite. » Lien « Parler à l'agent ↗ ». Ne pas placer la lentille exactement au centre horizontal de la page : elle répond au poids du titre à gauche.

### Chapitre III — L'auditeur

Pause de 180px. Image large sur colonnes 1–8, ratio 3:2 ; texte sur colonnes 10–12, aligné au tiers inférieur. Le contraste de l'image monte légèrement pour terminer le parcours par la révélation. Texte clair sur ce que voit l'auditeur ; lien « Voir la preuve ↗ ».

### Épilogue — ce qui reste public

120px après chapitre III : une ligne horizontale très discrète, un titre de 28px et une comparaison typographique ouverte en deux colonnes. Pas de panneaux. « Visible : adresses, entrées, sorties, paiements publics de l'agent. » / « Confidentiel : soldes et montants des transferts du coffre. » Phrase finale « Confidentiel, pas anonyme. » Lien vers l'auditeur. Footer calme, espace de 100px avant.

## Briefs d'illustration cohérents

Produire une série, pas trois images sans relation. Même caméra de cinéma grand format, même matière obsidienne satinée, même lumière ivoire chaude, même grain fin, même noir. Images sans texte ni lettres, sans interface, sans chiffres, sans cadre. Les textes restent en HTML. Export master 2400px, déclinaisons WebP/AVIF après validation ; conserver les masters. Les sujets doivent rester identifiables à 390px.

### I — Matière confidentielle

Une dalle d'obsidienne rectangulaire aux proportions 4:9, vue de trois quarts très légèrement par le dessous, dans un espace noir silencieux. La dalle occupe 60% de la hauteur et se tient à gauche du centre. Une lumière rasante ivoire révèle uniquement son bord et une très fine stratification sur sa surface ; aucune inscription lisible. Ombre dense, reflet au sol presque imperceptible. Sensation : masse, secret, silence. Le côté droit de l'image garde de l'air. Ratio 6:5. Pas de halo solaire : il appartient déjà au hero.

### II — Autonomie délimitée

Gros plan d'une lentille optique rouge enchâssée dans un boîtier rectangulaire noir satiné, inspirée des instruments spatiaux analogiques. Cercle optique au tiers droit, légèrement au-dessus du centre ; anneaux usinés précis, minuscule cœur ambre, rouge profond limité à la lentille. À gauche du boîtier, une fente lumineuse ivoire très fine s'arrête nettement, suggérant une limite physique. Noir autour de l'objet, pas de personnage, pas de robot, pas d'UI. Même grain et éclairage que I. Ratio 1:1. Sensation : présence, attention, contrôle.

### III — Révélation sélective

Un prisme optique de verre fumé aux proportions allongées se tient dans le noir. Une étroite lame de lumière chaude le traverse et révèle une structure intérieure de fines lignes géométriques, sans caractères. Le reste demeure opaque. Prisme au tiers gauche, bord lumineux net, léger reflet ambre ; l’ensemble rappelle les dimensions du monolithe sans répéter exactement la dalle de I. Aucun livre, cadenas, clé ou code à l'écran. Même traitement argentique. Ratio 3:2. Sensation : précision, autorisation, dévoilement partiel.

## Mouvement

- Le film est le mouvement principal. Les chapitres n'ont pas de pinning obligatoire, pas de carrousel horizontal, pas de scroll artificiel.
- Entrée des images : opacité .65→1 et translation 16px→0, 850ms, `cubic-bezier(.22,1,.36,1)`, une fois à 15% de visibilité. Les titres restent visibles avant toute animation si JavaScript est lent.
- Parallaxe éventuelle de 18px maximum sur desktop ; supprimer sur tactile. Pas d'effet qui recadre le sujet hors de son image.
- Liens : flèche déplacée de 4px en 220ms, soulignement discret. Aucune carte qui monte puisqu'il n'y a plus de cartes.
- Aucun clignotement, bruit animé ou halo qui respire en boucle sur toute la landing.
- Mouvement réduit : poster du film, reveal complet, chapitres statiques. Nettoyer les observateurs et arrêter les boucles hors écran.

## Mobile et validation

À 760px et moins : grille simple, marge 22px (20px à 320px), image d'abord puis texte, 28px entre les deux ; les titres et numéros restent sur le même axe. Chapitre II repasse aussi image puis texte, même si le DOM desktop alterne. Conserver 88–112px entre chapitres. Ratios 6:5, 1:1, 6:5 ; éviter trois images panoramiques minuscules. Texte max 34ch, aucun débordement horizontal. Pas de grand vide imposé en vh sous un texte long.

Vérifier 1440×900, 1280×800, 768px, 390×844 et 320px ; puis les trois langues, mouvement réduit, poster vidéo, erreur vidéo et navigation au clavier. La qualité s'évalue d'abord sur les captures statiques : équilibre des masses, taille réelle des textes, axes, recadrages. Ensuite seulement la vidéo de défilement valide le rythme. Un effet supplémentaire n'est accepté que s'il améliore cette composition et la compréhension.

## Pipeline conseillé

1. Valider cette grammaire et fabriquer les trois images comme une série.
2. Monter une page statique sans animation : positions, tailles, couleurs et textes définitifs.
3. Capturer desktop et mobile, corriger le poids visuel des compositions avant les détails.
4. Ajouter les entrées discrètes, tester le film et les chemins d'accès aux trois outils.
5. Contrôler accessibilité, images responsives et chargement ; les images sous le film sont différées.
