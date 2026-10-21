import { ambient } from './audio.js';

const VIDEO_ID = 'jEnaeqB877E';

// Background music is a YouTube video played through the official embed, looped.
// If it cannot load (offline, blocked), the synthesised sea sounds play instead.
let player = null;
let ready = false;
let failed = false;
let wantPlay = false;
let loading = null;

function load() {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const make = () => {
      const host = document.createElement('div');
      host.id = 'yt-music';
      // Kept on the page but out of sight; a display:none player can be paused by the browser.
      Object.assign(host.style, { position: 'fixed', left: '-300px', bottom: '0', width: '200px', height: '200px', pointerEvents: 'none', opacity: '0' });
      host.setAttribute('aria-hidden', 'true');
      document.body.append(host);
      player = new YT.Player(host, {
        width: 200, height: 200, videoId: VIDEO_ID,
        playerVars: { autoplay: 0, controls: 0, loop: 1, playlist: VIDEO_ID, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1 },
        events: {
          onReady: () => {
            ready = true;
            player.setVolume(70);
            if (wantPlay) player.playVideo();
            resolve();
          },
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) player.playVideo(); },
          onError: () => { failed = true; if (wantPlay) ambient.start(); resolve(); },
        },
      });
    };
    if (window.YT?.Player) return make();
    window.onYouTubeIframeAPIReady = make;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => { failed = true; if (wantPlay) ambient.start(); resolve(); };
    document.head.append(tag);
  });
  return loading;
}

export const music = {
  // Load ahead of time so that the first tap can start playback straight away (phones require that).
  preload() { load(); },
  start() {
    wantPlay = true;
    if (failed) return ambient.start();
    if (ready) player.playVideo();
    else load();
  },
  stop() {
    wantPlay = false;
    ambient.stop();
    if (ready) player.pauseVideo();
  },
};
