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
- **Activités longues** : elle lit un livre, écoute de la musique, plante une carotte, regarde par la fenêtre… pendant 1 à 3 min. Un clic l'interrompt.
- **Crottes 💩 = monnaie** : Boune en laisse au sol de temps en temps (plus souvent après avoir mangé). Clique dessus pour les ramasser.
- **Boutique & meubles** (fenêtre Réglages) : gamelle d'eau, gamelle de foin, pot à friandises, panier-lit, branche à ronger, balle en osier, tapis. Après achat, « Placer » : l'objet suit la souris le long de la barre des tâches, clic pour poser. Glisser pour déplacer, clic droit pour ranger. Boune va boire, manger, se servir une friandise, ronger, et dort dans son panier.
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

## Idées pour la suite

- Autres animaux (chat, chien) : dupliquer le SVG et les classes d'état.
- Plus d'objets à grignoter et d'activités.
- Balade d'un écran à l'autre toute seule (pour l'instant elle change d'écran quand on la porte ou via « Ramener Boune ici »).
- Sons discrets (optionnels).
