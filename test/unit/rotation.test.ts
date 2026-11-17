import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useRotation } from "../../app/composables/useRotation";

describe("useRotation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(count = 3) {
    const scope = effectScope();
    const total = ref(count);
    const rotation = scope.run(() => useRotation(total, 9000))!;
    return { scope, total, ...rotation };
  }

  it("avance seule toutes les 9 s et boucle", () => {
    const { index, scope } = setup(3);
    expect(index.value).toBe(0);
    vi.advanceTimersByTime(9000);
    expect(index.value).toBe(1);
    vi.advanceTimersByTime(18000);
    expect(index.value).toBe(0);
    scope.stop();
  });

  it("s'arrête en pause et repart ensuite", () => {
    const { index, paused, scope } = setup(3);
    paused.value = true;
    vi.advanceTimersByTime(30000);
    expect(index.value).toBe(0);
    paused.value = false;
    vi.advanceTimersByTime(9000);
    expect(index.value).toBe(1);
    scope.stop();
  });

  it("un choix manuel relance le délai complet", () => {
    const { index, go, scope } = setup(4);
    vi.advanceTimersByTime(8000);
    go(2);
    vi.advanceTimersByTime(8000);
    expect(index.value).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(index.value).toBe(3);
    scope.stop();
  });

  it("ne tourne pas avec un seul élément et démarre quand la liste grandit", async () => {
    const { index, total, scope } = setup(1);
    vi.advanceTimersByTime(20000);
    expect(index.value).toBe(0);
    total.value = 2;
    await nextTick();
    vi.advanceTimersByTime(9000);
    expect(index.value).toBe(1);
    scope.stop();
  });

  it("s'arrête quand le composant est détruit", () => {
    const { index, scope } = setup(3);
    scope.stop();
    vi.advanceTimersByTime(30000);
    expect(index.value).toBe(0);
  });
});
