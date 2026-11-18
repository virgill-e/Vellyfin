// État réactif d'un élément <video> (position, durée, mémoire tampon, volume…),
// mis à jour par ses événements.
const EVENTS = [
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "play",
  "pause",
  "playing",
  "waiting",
  "seeking",
  "seeked",
  "canplay",
  "progress",
  "volumechange",
  "ended",
  "emptied",
] as const;

export function useVideoState(video: Ref<HTMLVideoElement | null>) {
  const current = ref(0);
  const duration = ref(0);
  const buffered = ref(0);
  const paused = ref(true);
  const ended = ref(false);
  const waiting = ref(false);
  const volume = ref(1);
  const muted = ref(false);

  function update(event?: Event) {
    const el = video.value;
    if (!el) return;
    current.value = el.currentTime;
    duration.value = Number.isFinite(el.duration) ? el.duration : 0;
    paused.value = el.paused;
    ended.value = el.ended;
    volume.value = el.volume;
    muted.value = el.muted;
    // Fin de la plage mise en mémoire qui contient la position courante.
    let end = 0;
    for (let i = 0; i < el.buffered.length; i++) {
      if (el.buffered.start(i) <= el.currentTime + 0.5) end = Math.max(end, el.buffered.end(i));
    }
    buffered.value = end;
    if (event?.type === "waiting" || event?.type === "seeking") waiting.value = true;
    if (event && ["playing", "canplay", "seeked", "pause", "emptied"].includes(event.type)) waiting.value = false;
  }

  watch(
    video,
    (el, old) => {
      for (const name of EVENTS) {
        old?.removeEventListener(name, update);
        el?.addEventListener(name, update);
      }
      update();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    for (const name of EVENTS) video.value?.removeEventListener(name, update);
  });

  return { current, duration, buffered, paused, ended, waiting, volume, muted };
}
