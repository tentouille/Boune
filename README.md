# Boune 🐰

Petit lapin compagnon qui se balade en bas de ton écran. Léger (Tauri 2 : ~35 Mo de RAM, CPU quasi nul au repos), mignon, et un peu espiègle.

## Ce qu'elle fait

- **Se balade** en sautillant sur la barre des tâches, regarde ton curseur, cligne des yeux, remue les oreilles.
- **Caresse** : clic gauche → cœurs, yeux fermés de bonheur. Trop de clics → elle s'agace.
- **Porter / lâcher** : glisse-la où tu veux, elle pendouille, puis retombe et rebondit.
- **Dodo** : siestes aléatoires ou si tu n'as pas touché la souris depuis 6 min. Un clic la réveille (de mauvaise humeur).
- **Grignote** des trucs : le câble internet, celui de la souris, une carotte, un cookie…
- **Anti doom-scroll** : si la fenêtre active contient `TikTok`, `Reels` ou `Shorts` pendant plus de 3 min, elle traverse l'écran, pousse la fenêtre et la **minimise** (réversible, tu la reprends depuis la barre des tâches). Puis 10 min de répit.
- **Progression** : XP pour les câlins, grignotages, scrolls stoppés et temps passé ensemble. Niveau 3 → écharpe, 5 → nœud, 8 → couronne de fleurs.
- **Suivi de la souris** : bouge le curseur près d'elle, elle te suit en bondissant ; survole-la, elle s'arrête et te regarde (clic gauche = caresse).
- **Alerte** : un mouvement brusque du curseur près d'elle et elle se dresse sur ses pattes arrière, aux aguets.
- **Quitter** : bouton « Quitter Boune » dans les Réglages (clic droit sur elle), ou menu de la barre système.
- **Comportements de lapin** : bonds (pas de glissement), binky (saut de joie), flop (elle fond au sol), toilette, zoomies, nez qui frémit, moustaches, chinning (elle « marque » les meubles), thump (coup de patte agacé).
- **Activités longues** : elle lit un livre, écoute de la musique, plante une carotte, regarde par la fenêtre… pendant 1 à 3 min. Un clic l'interrompt.
- **Recycleur** : une poubelle de recyclage déplaçable est posée par défaut ; passe la souris sur une crotte (sans cliquer) et elle file dedans (+1). 
- **Crottes 💩 = monnaie** : Boune en laisse au sol de temps en temps (plus souvent après avoir mangé). Clique dessus pour les ramasser.
- **Boutique & meubles** (fenêtre Réglages) : gamelle d'eau, gamelle de foin, pot à friandises, panier-lit, branche à ronger, balle en osier, tapis. Après achat, « Placer » : l'objet suit la souris le long de la barre des tâches, clic pour poser. Glisser pour déplacer, clic droit pour ranger. Boune va boire, manger, se servir une friandise, ronger, et dort dans son panier.
- **Réglages en deux onglets** (Boutique / Réglages) avec « Quitter Boune » en haut.
- **Réglages** (clic droit sur Boune, ou menu barre système) : lancement avec Windows, taille, vitesse, bavardage, siestes, seuil et mots-clés anti-scroll, remise à zéro de la progression. Appliqués en direct.
- **Menu dans la barre système** : réglages, stats, dodo/réveil, la ramener sous le curseur (fonctionne sur l'écran où est la souris), quitter.

## Lancer

```bash
npm install
npm run dev      # lance en mode dev (relancer après modification de src/)
npm run build    # exe + installeur dans src-tauri/target/release/bundle/
```

Prérequis : Node 18+, Rust stable, WebView2 (déjà présent sur Windows 10/11).

## Réglages

Les réglages courants sont dans la fenêtre **Réglages** (clic droit sur Boune). Les valeurs par défaut et les réglages plus fins sont dans l'objet `CFG` en haut de `src/main.js`.
Les répliques sont dans `SAY`, les objets à grignoter dans `NIBBLES`, les activités longues dans `ACTIVITIES`.

## Structure

```
src/            front (HTML + CSS + JS vanilla, aucune dépendance)
  index.html    le SVG de Boune
  settings.html fenêtre de réglages + boutique
  scene.html    bande transparente le long de la barre des tâches : meubles et crottes
  style.css     tous les états / animations
  main.js       machine à états, souris, progression
src-tauri/      côté natif Rust
  src/lib.rs    commandes Win32 (souris globale, fenêtre active, minimiser), tray, autostart
```

La sauvegarde (XP, crottes, objets), la scène (meubles posés) et les réglages sont dans le `localStorage` de la webview, partagé entre les trois fenêtres. Les fenêtres se parlent par événements Tauri (`poop`, `collect`, `shop-buy`, `scene-place`, `scene-changed`…).

## Vie privée

Boune fonctionne entièrement sur ton ordinateur : **aucune connexion réseau, aucun compte, aucune donnée envoyée nulle part**.

Pour l'anti doom-scroll, elle lit toutes les 2 secondes le titre de la fenêtre au premier plan et, si c'est un navigateur, l'adresse affichée (via l'API d'accessibilité de Windows, en lecture seule). Ces informations servent uniquement à comparer avec les mots surveillés, elles ne sont ni enregistrées ni transmises. Elle peut aussi mettre en pause la vidéo du navigateur et couper puis rendre son son (si tu le laisses activé dans les réglages).

Sa progression, ses réglages et ton modèle perso restent dans les données locales de l'application.

## Installer en confiance

Télécharge Boune uniquement depuis les [releases de ce dépôt](https://github.com/tentouille/Boune/releases/latest) ou depuis [tentouille.fr/boune](https://laplace.tentouille.fr/boune). L'installeur est construit par GitHub Actions à partir du code de ce dépôt (voir `.github/workflows/release.yml`).

L'installeur n'est pas signé : Windows SmartScreen affiche « Windows a protégé votre ordinateur ». Clique sur « Informations complémentaires » puis « Exécuter quand même ».

Pour vérifier que le fichier n'a pas été modifié, compare son empreinte avec celle publiée dans `SHA256SUMS.txt` (même release) :

```powershell
Get-FileHash .\Boune-x64-setup.exe -Algorithm SHA256
```

## Licence

Boune est gratuite à utiliser, pour tout le monde. Le code et les dessins sont consultables, mais ne peuvent être ni modifiés, ni copiés, ni redistribués sans accord : voir [LICENSE](LICENSE).

## Idées pour la suite

- Autres animaux (chat, chien) : dupliquer le SVG et les classes d'état.
- Plus d'objets à grignoter et d'activités.
- Balade d'un écran à l'autre toute seule (pour l'instant elle change d'écran quand on la porte ou via « Ramener Boune ici »).
- Sons discrets (optionnels).
