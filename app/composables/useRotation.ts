// Rotation automatique d'un index (carrousel). Seul le bouton pause l'arrête :
// ni le survol ni le focus, qui bloquaient la rotation sur une bannière plein écran.
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";

export function useRotation(count: Ref<number>, intervalMs: number) {
  const index = ref(0);
  const paused = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function next() {
    if (count.value > 1) index.value = (index.value + 1) % count.value;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (count.value > 1) {
      timer = setInterval(() => {
        if (!paused.value) next();
      }, intervalMs);
    }
  }

  /** Choix manuel : affiche l'élément et relance le délai complet. */
  function go(i: number) {
    index.value = i;
    start();
  }

  watch(count, (n) => {
    if (index.value >= n) index.value = 0;
    start();
  });

  start();
  if (getCurrentScope()) onScopeDispose(stop);

  return { index, paused, next, go, stop };
}
