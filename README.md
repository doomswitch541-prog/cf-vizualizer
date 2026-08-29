# Coldflame visualizer

A static, artwork-reactive listening room for Coldflame's complete seven-track catalog.

Public page: <https://doomswitch541-prog.github.io/cf-vizualizer/>

Hand-authored About page: `about.html`. The prose owned by RG is bounded by the `RG HAND-AUTHORING START/END` comments and should not be rewritten by automation.

The visualizer is vanilla HTML, CSS, and JavaScript with no framework, build step, tracking, or third-party runtime dependency. Release metadata and palette roles live in `data/coldflame.json`; deploy-ready audio and artwork live in `assets/coldflame/`.

The archive masters retain their full embedded covers. The deploy audio is losslessly copied into fast-start, audio-only M4A files, while `artwork-web/` carries 1200×1200 derivatives of the exact official covers. This keeps phone playback light without changing the AAC stream.

## Run locally

Serve the repository with any static server and open the root page. For example:

```powershell
npx.cmd serve .
```

Playback uses the native `<audio>` element underneath the custom controls. The play request begins directly inside the user tap before Web Audio analysis attaches; this ordering is required for dependable iPhone/Safari playback.

## Controls

- Space: play or pause
- Left / right arrow: previous or next track
- M: mute or restore volume
- F: enter or leave the visualizer view

The Share control uses the native OS share sheet when available and falls back to copying the current track and URL.

## Hosting

GitHub Pages publishes the root of `main`. `.nojekyll` keeps the repository fully static. The temporary `noindex` directive stays in place until audience logging is ready; it does not prevent anyone with the URL from opening or sharing the page.

## Source relationship

`../archive/library/coldflame/` is the canonical archive. Media here is a same-origin deployment replica whose integrity is recorded in the shared catalog.
