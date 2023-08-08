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
type StaticMarkup = {
  html: string;
  css: string;
  props: string;
};

export type PolyglotInstance = {
  setHydrationHook: (hooks: Hook[]) => void;
  hydrate: () => Promise<void>;
  dispose: () => void;
};

export type PolyglotComponent<P> = {
  impl: "react" | "preact" | "static";
  attach(root: HTMLElement): PolyglotInstance;
  stringify: () => Promise<StaticMarkup>;
  getProps: () => P;
  load: () => Promise<any>;
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

type SSRContextApi = {
  addClickHook: (selector: string) => void;
  getHooks: () => {};
};

export const SSRContext = React.createContext<SSRContextApi | false>(false);

const polyglotWrapperStyle = {
  display: "contents",
};

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

// WIP
export function observe() {
  {
    {
      const observer = new MutationObserver((mutations) => {
        const flatten = mutations
          .flatMap((m) => {
            return m.type === "childList" ? Array.from(m.addedNodes) : [];
          })
          .filter((n) => n instanceof HTMLElement) as HTMLElement[];
        for (const node of flatten) {
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }
}

/** ------------ React ------------ */
export function fromReact<P>(
  Component: React.ComponentType<any>,
  props: P,
  ssrCtx?: SSRContextApi,
): PolyglotComponent<P> {
  return {
    impl: "react",
    stringify,
    attach,
    getProps: () => props,
    load: async () => {
      return () => {
        return <Component {...props} />;
      };
    },
  };
  function attach(el: HTMLElement): PolyglotInstance {
    let isHydrated = false;
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
        el.addEventListener("click", onClick, {
          once: true,
          passive: true,
        });
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
    async function hydrate() {
      ReactDOM.hydrateRoot(el, <Component {...props} />);
    }
  }
  async function stringify() {
    // const clickHooks = new Set<string>();
    const stream = await ReactDOMServer.renderToReadableStream(
      <SSRContext.Provider value={ssrCtx ?? false}>
        <Component {...props} />
      </SSRContext.Provider>,
    );
    return {
      html: await new Response(stream).text(),
      css: "",
      props: JSON.stringify(props),
    };
  }
}

export function createRenderingContext(): SSRContextApi {
  const clickHooks = new Set<string>();
  return {
    addClickHook: (selector: string) => {
      console.log("add click hook", selector);
      clickHooks.add(selector);
    },
    getHooks() {
      return {
        clickHooks,
      };
    },
  };
}

export function toReact<P>(polyglot: PolyglotComponent<P>) {
  return React.lazy(async () => {
    if (polyglot.impl === "react") {
      const C = await polyglot.load();
      return {
        default: C,
      };
    }
    const markup = await polyglot.stringify();
    const id = "__poly" + Math.random().toString(32).slice(2);
    return {
      default: () => {
        const ref = React.useRef<HTMLDivElement>(null);
        const initialHtml = React.useMemo(() => markup.html, []);
        const ssrCtx = React.useContext(SSRContext);
        React.useEffect(() => {
          if (ref.current) {
            const instance = polyglot.attach(ref.current);
            ref.current.innerHTML = initialHtml;
            instance.hydrate();
          }
        }, [ref.current]);
        if (ssrCtx) {
          ssrCtx.addClickHook(`#${id}`);
          return (
            <div
              id={id}
              ref={ref}
              style={polyglotWrapperStyle}
              data-poly-triggers={`click-${id}`}
              dangerouslySetInnerHTML={{ __html: initialHtml }}
            />
          );
        }
        return (
          <div
            id={id}
            ref={ref}
            style={polyglotWrapperStyle}
            data-poly-triggers={`click-${id}`}
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        );
      },
    };
  });
}

/** ------------ Preact ------------ */
const PreactSSRContext = Preact.createContext<SSRContextApi | false>(false);

export function fromPreact<P>(
  Component: any,
  props: P,
  ctx: SSRContextApi,
): PolyglotComponent<P> {
  return {
    impl: "preact",
    stringify,
    attach,
    getProps: () => ({ ...props }),
    load: async () => {
      return Component;
    },
  };
  function attach(el: HTMLElement): PolyglotInstance {
    let isHydrated = false;
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
  async function stringify() {
    const vdom = h(
      PreactSSRContext.Provider,
      // @ts-ignore
      { value: ctx ?? false },
      // @ts-ignore
      h(Component, props),
    );
    await preactPrepass(vdom);
    const html = preactRender(vdom as any);
    return {
      html,
      css: "",
      props: JSON.stringify(props),
    };
  }
}

export function toPreact<P>(poly: PolyglotComponent<P>) {
  return Preact.lazy(async () => {
    if (poly.impl === "preact") {
      const C = await poly.load();
      return {
        default: () => C,
      };
    }

    const markup = await poly.stringify();
    const id = "__poly" + Math.random().toString(32).slice(2);
    return {
      default: () => {
        const ref = preactHooks.useRef<HTMLDivElement>(null);
        const initialHtml = preactHooks.useMemo(() => markup.html, []);
        const ssrCtx = preactHooks.useContext(PreactSSRContext);
        preactHooks.useEffect(() => {
          // debugger;
          if (ref.current) {
            const instance = poly.attach(ref.current);
            ref.current.innerHTML = initialHtml;
            instance.hydrate();
          }
        }, [ref.current]);

        if (ssrCtx) {
          ssrCtx.addClickHook(`#${id}`);
          // @ts-ignore
          return h("div", {
            ref,
            id,
            "data-poly-triggers": `click-${id}`,
            dangerouslySetInnerHTML: { __html: initialHtml },
          });
        }
        // @ts-ignore
        return h("div", {
          ref,
          id,
          "data-poly-triggers": `click-${id}`,
          dangerouslySetInnerHTML: { __html: initialHtml },
        });
      },
    };
  });
}

// ------ static
export function fromStatic(
  raw: string,
  ctx: SSRContextApi,
): PolyglotComponent<{}> {
  return {
    impl: "static",
    stringify,
    attach,
    getProps: () => ({}),
    load: async () => {
      return raw;
    },
  };
  function attach(el: HTMLElement): PolyglotInstance {
    // let isHydrated = false;
    return {
      hydrate,
      setHydrationHook,
      dispose,
    };
    function dispose() {}
    function setHydrationHook(types: string[]) {
      // DO nothing
    }
    async function hydrate() {
      // DO nothing
    }
  }
  async function stringify() {
    return {
      html: raw,
      css: "",
      props: JSON.stringify({}),
    };
  }
}
