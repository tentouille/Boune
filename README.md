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
- **Menu dans la barre système** : stats, dodo/réveil, la ramener sous le curseur, quitter.

## Lancer

```bash
npm install
npm run dev      # lance en mode dev (relancer après modification de src/)
npm run build    # exe + installeur dans src-tauri/target/release/bundle/
```

Prérequis : Node 18+, Rust stable, WebView2 (déjà présent sur Windows 10/11).

## Réglages

Tout est dans l'objet `CFG` en haut de `src/main.js` : vitesse, fréquence des siestes, seuil anti-scroll, motifs de titre surveillés, etc.
Les répliques sont dans `SAY` et `NIBBLES` juste en dessous.

## Structure

```
src/            front (HTML + CSS + JS vanilla, aucune dépendance)
  index.html    le SVG de Boune
  style.css     tous les états / animations
  main.js       machine à états, souris, progression
src-tauri/      côté natif Rust
  src/lib.rs    commandes Win32 (souris globale, fenêtre active, minimiser) + tray
```

La sauvegarde (XP, compteurs) est dans le `localStorage` de la webview.

## Idées pour la suite

- Autres animaux (chat, chien) : dupliquer le SVG et les classes d'état.
- Fenêtre de réglages plutôt que d'éditer `CFG`.
- Plus d'événements longs (jardinage, lecture) et d'objets à grignoter.
- Support multi-écrans (elle reste sur l'écran principal pour l'instant).
