# Monolith — pipeline de direction artistique et livraison

26 octobre 2026. Cette version remplace la première proposition de landing. La priorité est l’univers 2001 : objet monumental, vide, lumière ivoire et HAL. La version Claude a servi de référence pour l’entrée, sans importer ni écraser une branche du projet.

## 1. Recherche vérifiée

[Recherche awards](design-research-awards.md) : douze cas principaux et deux compléments, avec sources officielles Awwwards, CSS Design Awards et FWA. Chaque prix est distingué d’une nomination ou d’un top 10. Les observations en navigateur de Lusion et d’Exat sont séparées de la recherche documentaire. L’expérience complète de The Monolith Project n’a pas pu être parcourue, le navigateur signalant un média non lisible.

Décision : étudier objet, proportions, matière et rythme plutôt qu’appliquer des effets de portfolio au hasard. Aucune image, police commerciale ou animation de ces sites n’a été copiée.

## 2. Direction et composition

[Direction artistique](monolith-art-direction.md) : deux familles, une grille, une palette, des rôles stricts pour chaque image et chaque niveau de texte.

- Instrument Sans remplace Jost et Michroma ; IBM Plex Mono est réservé aux métadonnées et aux chiffres. Les fichiers de polices sont servis localement par Next.
- Le film garde la scène dégagée et sa révélation tardive. La navigation apparaît à sa sortie, sans déplacer le contenu.
- Un manifeste, puis trois grands chapitres image/texte alternés remplacent les cartes. La frontière public/confidentiel reste explicitement expliquée.
- Les images utilisent le même langage : obsidienne, lumière chaude, grain discret. Seul l’agent porte la lentille rouge.
- Les liens et légendes suivent la même grille ; les titres ne reprennent pas le large interlettrage du wordmark. Les textes sont adaptés en anglais, français et portugais.

## 3. Production visuelle originale

[Assets, masters et prompts exacts](artwork/README.md). Trois créations générées avec l’outil intégré imagegen, puis exportées en WebP pour l’app. Les exports totalisent 250 282 octets, soit environ 244,4 Kio. Les masters sont conservés. Aucun texte important n’est incrusté dans l’image ; les contenus et actions restent en HTML.

## 4. Mise au point du défilement

La comparaison avec le déploiement Claude a révélé deux écarts : masque appliqué directement aux images vidéo et seeks concurrents. La nouvelle implémentation :

- retire le masque vidéo et place le fondu dans un plan CSS séparé ;
- utilise le scroll natif, sans lissage artificiel ni interception de la molette ;
- conserve uniquement la dernière destination demandée au décodeur ;
- attend la fin d’un seek avant d’en lancer un autre ;
- calcule la progression avec la hauteur réelle du cadre sticky, notamment sur mobile ;
- ne fait plus tourner une boucle de rendu permanente ;
- ne met à jour React que lorsque les légendes changent ;
- conserve une scène fixe pour le mouvement réduit et l’échec vidéo.

## 5. Vérifications effectuées

- TypeScript, compilation de production et contrôle du diff : réussis.
- Douze scénarios simulés du film : intro, absence de boucle inactive, événements groupés, géométrie, sérialisation du décodeur, dernière destination, retour arrière, restauration du scroll, mouvement réduit, erreur média, refus d’autoplay et nettoyage : réussis. Ce contrôle ne remplace pas un test matériel sur téléphone.
- Navigateur à 1280 × 720 : à scrollY 720, progression 0,41667 et temps vidéo 5,195833 s, correspondant à la destination attendue pour le film de 10 s. Retour en haut : temps 1,8 s et vidéo en pause. Masque vidéo calculé : `none`.
- Navigateur à 319 px : largeur de document 319 px, aucun débordement mesuré sur les titres et la navigation en français et portugais. Trois images chargées et polices chargées. Aucun message d’erreur dans le journal navigateur consulté.
- Composition desktop observée, dont les coupures françaises de titres. Ajustement tablette à cinq colonnes de texte, pour limiter les retours de ligne.
- Aucune transaction ni signature de portefeuille effectuée pour ces vérifications visuelles.

## Itération suivante

Évaluer la page en mouvement, puis les trois parcours métier. Noter un point précis par retour : passage du film, coupure de titre, espace entre deux actes, cadrage ou densité d’un écran. Les références, la grille et les prompts sont conservés pour poursuivre sans changer de DA à chaque retouche. Une amélioration supplémentaire doit passer par composition → réalisation → observation, et non par accumulation d’effets.

Cette version est locale. Aucun déploiement, commit ou push n’a été effectué.

## Évolution — la traversée continue

À la demande de l’utilisateur, la succession de chapitres éditoriaux devient une expérience qui se déroule au fil du scroll. L’ouverture reste conservée ; elle est suivie d’un seul cadre plein écran et de neuf temps narratifs, soit dix tableaux perçus avec le film initial.

1. Le coffre, plan large.
2. La matière et la preuve, plan de détail original.
3. Le seuil vers l’autonomie.
4. HAL, plan large.
5. La limite, approche de la lentille.
6. Le seuil vers la visibilité autorisée.
7. Le prisme de l’auditeur.
8. La révélation, approche du faisceau.
9. L’horizon final et l’entrée dans l’app.

Les trois plans supplémentaires et leurs prompts se trouvent dans [journey-prompts.md](artwork/journey-prompts.md). Six images WebP originales servent les neuf cadrages, pour environ 425 Kio cumulés. Deux couches d’image affichées restent persistantes ; un décodage préalable et une protection contre les réponses obsolètes évitent d’effacer la scène pendant les chargements rapides.

Le mouvement suit le scroll natif sans interception de la molette : zoom léger, changement de cadrage, fondu d’image et textes successifs. Aucun texte ne se superpose au suivant pendant les fondus. Le dernier tableau reste visible jusqu’à la sortie. Un index permet d’aller directement à une étape ; un lien de fin permet de revenir volontairement au commencement.

Le mode mouvement réduit, le rendu avant hydratation et une panne de la première image présentent le récit statique dans l’ordre. Si une image ultérieure échoue, la scène précédente reste visible. Les explications public/confidentiel et les accès à l’app suivent la traversée.

### Contrôles de cette évolution

- TypeScript et contrôle du diff réussis.
- Tests simulés du moteur de traversée réussis : événements groupés, absence de boucle inactive, fondus sans double texte, base opaque, décodage, réponses obsolètes, grands sauts, fin du parcours, ancres, rendu statique, erreurs d’images et changement de langue. Les tests du film d’entrée passent également.
- Navigateur à 1280 px : coffre → détail → limite ; retour arrière vers l’agent ; saut direct à l’horizon final. Étapes actives correctes, deux couches d’image, image de base opaque et absence de débordement horizontal mesurés.
- Aucun paiement, changement de contrat, commit, push ou déploiement effectué.
