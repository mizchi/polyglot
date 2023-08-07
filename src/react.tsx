import React, { lazy, useContext, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import ReactDOMServer from "react-dom/server";
import { PolyglotComponent } from "./types.ts";

export const SSRContext = React.createContext<boolean>(false);

export const fromReact = (
  Component: React.ComponentType<any>,
): PolyglotComponent => {
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
          return <Component />;
        };
        ReactDOM.hydrateRoot(root, <TempLoader />, {
          onRecoverableError: (err) => {
            console.error("[onRecoverable]", err);
          },
        });
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
            ReactDOM.hydrateRoot(root, <Component />);
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
    ReactDOM.hydrateRoot(root, <Component />);
  }
  async function stringify() {
    const stream = await ReactDOMServer.renderToReadableStream(
      <SSRContext.Provider value={true}>
        <Component />
      </SSRContext.Provider>,
    );
    return await new Response(stream).text();
  }
};

export function toReact(poly: PolyglotComponent) {
  return lazy(async () => {
    const html = await poly.stringify();
    return {
      default: () => {
        const ref = useRef<HTMLDivElement>(null);
        const initialHtml = useMemo(() => html, []);
        const isSSR = useContext(SSRContext);
        useEffect(() => {
          if (ref.current) {
            poly.setHydrationHook(ref.current, ["view"]);
          }
        }, [ref.current]);

        if (isSSR) {
          return <div dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return (
          <div ref={ref} dangerouslySetInnerHTML={{ __html: initialHtml }} />
        );
      },
    };
  });
}
