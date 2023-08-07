// click injector
export function setClickHook(
  el: HTMLElement,
  hydrate: (onMount: () => void) => void,
  dispose: () => void,
) {
  let isHydrated = false;
  const onClick = (ev: MouseEvent) => {
    if (isHydrated) return;
    isHydrated = true;
    console.log("hydrate by click!");
    // @ts-ignore
    const newEvent = new ev.constructor(ev.type, ev);
    hydrate(dispose);
  };
  el.addEventListener("click", onClick);
  return () => {
    el.removeEventListener("click", onClick);
  };
}

// click injector
export function setViewHook(
  el: HTMLElement,
  hydrate: (resolve: () => void) => void,
  dispose: () => void,
) {
  let isHydrated = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.find((x) => x.isIntersecting)) {
        if (isHydrated) return;
        // console.log("intersect", entries);
        console.log("intersect hydrate!");
        isHydrated = true;
        hydrate(dispose);
      }
    },
    {
      root: null,
      threshold: 0,
    },
  );
  observer.observe(el);
  return () => observer.unobserve(el);
}
