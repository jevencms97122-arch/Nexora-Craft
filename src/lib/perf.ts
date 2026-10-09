/// PC modeste : peu de cœurs ou peu de mémoire. L'interface reste identique, seul le rythme de
/// la scène animée et sa résolution baissent.
export const LOW_END: boolean = (() => {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  } catch {
    return false;
  }
})();
