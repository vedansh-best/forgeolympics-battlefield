# Forge Olympics · Battlefield Leaderboard

A live house leaderboard with a real-time 3D battlefield. Plain static files, no build step.

```
index.html        the page
css/style.css     all styling
js/config.js      ← the only file you normally edit
js/app.js         reads the sheet, analyses every battle, renders the page
js/scene.js       the 3D layer: waving flags, crown, light beam, flaming arrows (Three.js from a CDN)
js/fx.js          animates the painted backdrop: fires, sparks, embers, ash, clouds, moon glow, lightning
js/audio.js       synthesised drums, horns, thunder and ambience
assets/           crests and Mesa logo
```

## Run it on your computer
```
python3 local-server.py
```
Then open http://localhost:4173. This server stops the browser from showing old saved copies.

## Running the event from the Google Sheet
- **Scores:** type each house's points in its column. Points can differ game to game.
- **A game appears automatically** when you add a row. It is grouped into a "front" by its name.
- **Battle in progress:** add a column called `Status` and type `Live` on a game's row while it is being played.
  The site shows "Battle raging" for that game. Clear it (or fill all four scores) when it ends.
- **Lead changes** trigger the cutscene and war horn automatically. A finished game triggers drums and a toast.
- **When every game has scores**, the champion screen with fireworks plays automatically.

The sheet must stay shared as *Anyone with the link → Viewer*. If it ever isn't, the site falls back to the slower Apps Script feed.

## Settings in `js/config.js`
- `HERO_STYLE: 'flags'` (current) shows the houses as hanging war banners on spears, ranked by height, with the last place torn. `'bars'` shows waving leaderboard bars instead (`js/board.js`).
- `BACKGROUND: 'image'` (current) uses a painted backdrop, set by `BACKGROUND_IMAGE`:
  - `assets/battlefield-fissure.webp` (current): the cracked battlefield with riders, skeletons removed, the castle on the right horizon.
  - `assets/battlefield.webp`: the purple moon-and-castle painting.
  `js/fx.js` animates whichever is chosen: fire, smoke, sparks, embers, ash, drifting clouds and lightning.
  `BACKGROUND: '3d'` switches to the fully 3D-built battlefield instead.
- `EVENT.start` is the countdown target. It is set to 12 Oct 2026, 12:00 PM IST.
- `EVENT.venue`, `EVENT.label` control the "Mon 12 Oct · DHI" text.
- `HOUSES` holds colours, crests and captain names.
- `REFRESH_MS` is how often scores are pulled (15 seconds).

## Handy URLs
- `?demo=14` previews fake scores with 14 games played (any number 1–23). `?demo=23` shows the champion screen.
- `?no3d` forces the lighter 2D battlefield.
- Double-click the **Forge Olympics** title to replay the leader cutscene.
- Sound starts after the first tap or click anywhere (a browser rule). The 🔊 button toggles it.

## Put it online (free .vercel.app address)
1. Go to github.com → New repository → name it `forge-battlefield` → Create.
2. Click "uploading an existing file", drag in everything *inside* this folder (index.html, css, js, assets, README.md), then Commit.
3. Go to vercel.com → Add New → Project → Import the `forge-battlefield` repo.
   Framework preset: Other. Leave build and output settings empty. Deploy.
4. The site is live at https://forge-battlefield.vercel.app (Vercel uses the project name).

Score changes in the Google Sheet show up on the live site automatically. You only redeploy if these files change.
