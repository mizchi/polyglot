import { PolyglotComponent } from "./types";
import { h, hydrate as preactHydrate, createContext } from "preact";
import { lazy } from "preact/compat";
import { renderToString } from "preact-render-to-string";
// @ts-ignore
import prepass from "preact-ssr-prepass";

import { useEffect, useRef, useContext, useMemo } from "preact/hooks";

const PreactSSRContext = createContext<boolean>(false);

export const fromPreact = (Component: any): PolyglotComponent => {
  let isHydrated = false;
  return {
    stringify,
    setHtml: setHtml,
    hydrate: hydrate,
    setHydrationHook,
  };
  function setHydrationHook(root: HTMLElement, types: string[]) {
    const disposes: Function[] = [];
    const dispose = () => {
      let next: Function | undefined = undefined;
      while ((next = disposes.pop())) {
        next();
      }
    };
    if (types.includes("click")) {
      // click injector
      const onClick = (ev: MouseEvent) => {
        if (isHydrated) return;
        isHydrated = true;
        console.log("hydrate by click!");
        // clone original event and re-dispatch
        // @ts-ignore
        const newEvent = new ev.constructor(ev.type, ev);
        const TempLoader = () => {
          useEffect(() => {
            ev.target?.dispatchEvent(newEvent);
            dispose();
          }, []);
          return h(Component, null);
        };
        preactHydrate(h(TempLoader, null), root);
      };
      root.addEventListener("click", onClick);
      disposes.push(() => {
        root.removeEventListener("click", onClick);
      });
    }

    if (types.includes("view")) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.find((x) => x.isIntersecting)) {
            if (isHydrated) return;
            // console.log("intersect", entries);
            console.log("intersect hydrate!");
            isHydrated = true;
            preactHydrate(h(Component, null), root);
            dispose();
          }
        },
        {
          root: null,
          threshold: 0,
        },
      );
      observer.observe(root);
      disposes.push(() => {
        observer.unobserve(root);
      });
    }
  }
  async function setHtml(root: HTMLElement) {
    const html = await stringify();
    root.innerHTML = html;
  }
  async function hydrate(root: HTMLElement) {
    preactHydrate(h(Component, null), root);
  }
  async function stringify() {
    // @ts-ignore
    const vdom = h(
      PreactSSRContext.Provider,
      // @ts-ignore
      { value: true },
      h(Component, null),
    );
    await prepass(vdom);
    // @ts-ignore
    const html = renderToString(vdom);
    return html;
    // return await new Response(stream).text();
  }
};

export function toPreact(poly: PolyglotComponent) {
  return lazy(async () => {
    const html = await poly.stringify();
    return {
      default: () => {
        const ref = useRef<HTMLDivElement>(null);
        const initialHtml = useMemo(() => html, []);
        const isSSR = useContext(PreactSSRContext);
        useEffect(() => {
          if (ref.current) {
            poly.setHydrationHook(ref.current, ["view"]);
          }
        }, [ref.current]);
        if (isSSR) {
          console.log("ssr render", html);
          // @ts-ignore
          return h("div", { dangerouslySetInnerHTML: { __html: initialHtml } });
        }
        // @ts-ignore
        return h("div", {
          ref,
          dangerouslySetInnerHTML: { __html: initialHtml },
        });
      },
    };
  });
}
