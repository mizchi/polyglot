// import React, { lazy, useContext, useEffect, useMemo, useRef } from "react";
import React from "react";
import ReactDOM from "react-dom/client";
import ReactDOMServer from "react-dom/server";
import { h, hydrate as preactHydrate } from "preact";
import * as Preact from "preact/compat";
import preactRender from "preact-render-to-string";
import preactPrepass from "preact-ssr-prepass";
import * as preactHooks from "preact/hooks";

type Hook = "view" | "click";

export type PolyglotInstance<P> = {
  // setHtml: (html: string) => Promise<void>;
  setHydrationHook: (hooks: Hook[]) => void;
  hydrate: (props: P) => Promise<void>;
  dispose: () => void;
};

export type PolyglotComponent<P> = {
  attach(root: HTMLElement): PolyglotInstance<P>;
  stringify: (props: P) => Promise<string> | string;
};

export interface ReactPolyglotComponent<Props>
  extends PolyglotComponent<Props> {
  type: "react";
  render: (props: Props) => React.ReactElement;
}

export interface PreactPolyglotComponent<Props>
  extends PolyglotComponent<Props> {
  type: "preact";
  render: (props: Props) => React.ReactElement;
}

export const SSRContext = React.createContext<boolean>(false);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: any) => void;
};
function defer<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined = undefined;
  let reject: ((value: any) => void) | undefined = undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

// Utils

// click injector
function setViewHook(el: HTMLElement, onResolve: () => void) {
  let isHydrated = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.find((x) => x.isIntersecting)) {
        if (isHydrated) return;
        // console.log("intersect", entries);
        console.log("intersect hydrate!");
        isHydrated = true;
        onResolve();
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

export function setClickHook(el: HTMLElement, onResolve: () => void) {
  let isHydrated = false;
  const onClick = (ev: MouseEvent) => {
    if (isHydrated) return;
    isHydrated = true;
    console.log("hydrate by click!");
    // @ts-ignore
    const newEvent = new ev.constructor(ev.type, ev);
    onResolve();
    // hydrate(dispose);
  };
  el.addEventListener("click", onClick);
  return () => {
    el.removeEventListener("click", onClick);
  };
}

/** ------------ React ------------ */
export function fromReact<P>(
  Component: React.ComponentType<any>,
): PolyglotComponent<P> {
  let isHydrated = false;
  return {
    stringify,
    attach,
  };
  function attach(el: HTMLElement): PolyglotInstance<P> {
    return {
      hydrate,
      setHydrationHook,
      dispose() {},
    };
    // function dispose() {}
    function setHydrationHook(types: string[]) {
      const { promise, resolve, reject } = defer<void>();
      if (types.includes("click")) {
        // click injector
        const onClick = (ev: MouseEvent) => {
          if (isHydrated) return;
          isHydrated = true;
          console.log("hydrate by click!");
          // @ts-ignore
          const newEvent = new ev.constructor(ev.type, ev);
          const TempLoader = () => {
            React.useEffect(() => {
              ev.target?.dispatchEvent(newEvent);
              resolve();
            }, []);
            return <Component />;
          };
          ReactDOM.hydrateRoot(el, <TempLoader />, {
            onRecoverableError: (err) => {
              reject(err);
            },
          });
        };
        el.addEventListener("click", onClick);
        promise.finally(() => {
          el.removeEventListener("click", onClick);
        });
      }
      if (types.includes("view")) {
        const d = setViewHook(el, () => {
          ReactDOM.hydrateRoot(el, <Component />);
        });
        promise.finally(d);
      }
    }
    async function hydrate(props: P) {
      ReactDOM.hydrateRoot(el, <Component {...props} />);
    }
  }
  async function stringify() {
    const stream = await ReactDOMServer.renderToReadableStream(
      <SSRContext.Provider value={true}>
        <Component />
      </SSRContext.Provider>,
    );
    return await new Response(stream).text();
  }
}

export function toReact<P>(poly: PolyglotComponent<P>, props: P) {
  return React.lazy(async () => {
    const html = await poly.stringify(props);
    return {
      default: () => {
        const ref = React.useRef<HTMLDivElement>(null);
        const initialHtml = React.useMemo(() => html, []);
        const isSSR = React.useContext(SSRContext);
        React.useEffect(() => {
          if (ref.current) {
            const instance = poly.attach(ref.current);
            ref.current.innerHTML = initialHtml;
            instance.hydrate(props);
            // poly.setHydrationHook(ref.current, ["view"]);
          }
        }, [ref.current]);
        if (isSSR) {
          return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return (
          <div ref={ref} dangerouslySetInnerHTML={{ __html: initialHtml }} />
        );
      },
    };
  });
}

/** ------------ Preact ------------ */
const PreactSSRContext = Preact.createContext<boolean>(false);

export function fromPreact<P>(Component: any): PolyglotComponent<P> {
  let isHydrated = false;
  return {
    stringify,
    attach,
  };
  function attach(el: HTMLElement): PolyglotInstance<any> {
    return {
      hydrate,
      setHydrationHook,
      dispose,
    };
    function dispose() {}
    function setHydrationHook(types: string[]) {
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
            preactHooks.useEffect(() => {
              ev.target?.dispatchEvent(newEvent);
              dispose();
            }, []);
            return h(Component, null);
          };
          preactHydrate(h(TempLoader, null), el);
        };
        el.addEventListener("click", onClick);
        disposes.push(() => {
          el.removeEventListener("click", onClick);
        });
      }

      if (types.includes("view")) {
        const d = setViewHook(el, () => {
          hydrate();
          dispose();
        });
        disposes.push(d);
      }
    }
    async function hydrate() {
      preactHydrate(h(Component, null), el);
    }
  }
  async function stringify(props: P) {
    const vdom = h(
      PreactSSRContext.Provider,
      // @ts-ignore
      { value: true },
      // @ts-ignore
      h(Component, props),
    );
    await preactPrepass(vdom);
    const html = preactRender(vdom as any);
    return html;
  }
}

export function toPreact<P>(poly: PolyglotComponent<P>, props: P) {
  return Preact.lazy(async () => {
    const html = await poly.stringify(props);
    return {
      default: () => {
        const ref = preactHooks.useRef<HTMLDivElement>(null);
        const initialHtml = preactHooks.useMemo(() => html, []);
        const isSSR = preactHooks.useContext(PreactSSRContext);
        preactHooks.useEffect(() => {
          // debugger;
          if (ref.current) {
            const instance = poly.attach(ref.current);
            ref.current.innerHTML = initialHtml;
            instance.hydrate(props);
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
