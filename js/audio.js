export function createPlayer({
  onEnded = () => {},
  onError = () => {},
  onProgress = () => {},
  onDuration = () => {},
} = {}) {
  const audio = new Audio();
  audio.preload = 'auto';

  let playing = false;
  let id = 0;
  let timer = null;

  function fail(reason) {
    if (!playing) return;
    playing = false;
    clearTimeout(timer);
    onError(reason);
  }

  audio.addEventListener('ended', () => {
    if (!playing) return;
    playing = false;
    clearTimeout(timer);
    onEnded();
  });

  audio.addEventListener('error', () => fail('media-error'));

  audio.addEventListener('timeupdate', () => {
    onProgress(
      audio.currentTime || 0,
      Number.isFinite(audio.duration) ? audio.duration : 0,
    );
  });

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) onDuration(audio.duration);
  });

  function play(src, { durationHint = 15 } = {}) {
    stop();
    playing = true;
    id += 1;
    const current = id;

    audio.src = src;
    audio.currentTime = 0;

    const hint = Math.max(5, Number(durationHint) || 15);
    timer = setTimeout(() => {
      if (playing && current === id) fail('timeout');
    }, hint * 1000 + 5000);

    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        if (playing && current === id) fail('play-rejected');
      });
    }
  }

  function stop() {
    playing = false;
    id += 1;
    clearTimeout(timer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  return { play, stop };
}
