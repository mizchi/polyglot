// import React, { lazy, useContext, useEffect, useMemo, useRef } from "react";
import React from "react";
import ReactDOM from "react-dom/client";
import ReactDOMServer from "react-dom/server";
import { h, hydrate as preactHydrate } from "preact";
import * as Preact from "preact/compat";
import preactRender from "preact-render-to-string";
import preactPrepass from "preact-ssr-prepass";
import * as preactHooks from "preact/hooks";
import { compile as svelteCompile } from "svelte/compiler";
import type { ComponentType as SvelteComponentType } from "svelte";

type HookResult = ViewHookResult | ClickHookResult;
type ViewHookResult = {
  type: "view";
};
type ClickHookResult = {
  type: "click";
  target: HTMLElement;
  clonedEvent: MouseEvent;
};

type HookDef = ViewHookDef | ClickHookDef;
type ViewHookDef = {
  type: "view";
};
type ClickHookDef = {
  type: "click";
  selector: string;
};

type StaticMarkup = {
  html: string;
  css: string;
  props: string;
  hooks: Array<HookDef>;
};

export type PolyglotInstance = {
  hydrate: () => Promise<void>;
  dispose: () => void;
};

export type PolyglotComponent<_P> = {
  impl: "react" | "preact" | "static" | "svelte";
  attach(root: HTMLElement): PolyglotInstance;
  toMarkup: () => Promise<StaticMarkup>;
  // getProps: () => P;
  load: () => Promise<any>;
};

// function markupToPolyglot(staticMarkup: StaticMarkup): PolyglotComponent<{}> {
//   return {
//     attach(_root) {
//       return {
//         hydrate() {
//           return Promise.resolve();
//         },
//         dispose() {},
//       };
//     },
//     toMarkup() {
//       return Promise.resolve(staticMarkup);
//     },
//     // load() {
//     //   return Promise.resolve(staticMarkup.html);
//     // },
//   };
// }

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
  getHooks(): Array<HookDef>;
};

export const SSRContext = React.createContext<SSRContextApi | false>(false);

const polyglotWrapperStyle = {
  display: "contents",
};

export async function setHydrationHook(
  target: HTMLElement,
  defs: Array<HookDef>,
  hydrate: () => Promise<void>,
) {
  const hooks: Array<Promise<HookResult>> = [];
  for (const hookDef of defs) {
    if (hookDef.type === "click") {
      hooks.push(registerClickHook(target));
    }
    if (hookDef.type === "view") {
      hooks.push(registerViewHook(target));
    }
  }
  const resolved = await Promise.race(hooks);
  await hydrate();
  if (resolved.type === "click") {
    resolved.target.dispatchEvent(resolved.clonedEvent);
  }
}

function registerViewHook(el: HTMLElement) {
  let dispose: Function | undefined = undefined;
  const p = new Promise<ViewHookResult>((resolve, reject) => {
    let isHydrated = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.find((x) => x.isIntersecting)) {
          if (isHydrated) return;
          isHydrated = true;
          resolve({ type: "view" });
        }
      },
      {
        root: null,
        threshold: 0,
      },
    );
    observer.observe(el);
    dispose = () => {
      reject();
      observer.unobserve(el);
    };
  });
  p.finally(dispose);
  return p;
}

function registerClickHook(el: HTMLElement) {
  let dispose: Function | undefined = undefined;
  const p = new Promise<ClickHookResult>((resolve) => {
    let isHydrated = false;
    const onClick = async (ev: MouseEvent) => {
      if (isHydrated) return;
      const newEvent = new (ev as any).constructor(ev.type, ev);
      const originalTarget = ev.target;
      resolve({
        type: "click",
        target: originalTarget as HTMLElement,
        clonedEvent: newEvent,
      });
    };
    el.addEventListener("click", onClick, {
      once: true,
      passive: true,
    });
    dispose = () => el.removeEventListener("click", onClick);
  });
  p.finally(dispose);
  return p;
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
        // for (const node of flatten) {
        // }
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
): PolyglotComponent<P> {
  const Wrapped = (props: { onLoaded?: () => void }) => {
    React.useEffect(() => {
      props.onLoaded?.();
    }, []);
    return <Component {...props} />;
  };

  return {
    impl: "react",
    async toMarkup() {
      const ssrCtx = createRenderingContext();
      const stream = await ReactDOMServer.renderToReadableStream(
        <SSRContext.Provider value={ssrCtx ?? false}>
          <Component {...props} />
        </SSRContext.Provider>,
      );
      return {
        html: await new Response(stream).text(),
        css: "",
        props: JSON.stringify(props),
        hooks: ssrCtx.getHooks(),
      };
    },
    attach,
    // getProps: () => props,
    load: async () => {
      return () => {
        return <Component {...props} />;
      };
    },
  };
  function attach(el: HTMLElement): PolyglotInstance {
    return {
      async hydrate() {
        return new Promise<void>((resolve) => {
          ReactDOM.hydrateRoot(el, <Wrapped onLoaded={resolve} />);
        });
      },
      dispose() {},
    };
  }
}

function createRenderingContext(): SSRContextApi {
  const hooks: Array<HookDef> = [];
  return {
    addClickHook: (selector: string) => {
      hooks.push({
        type: "click",
        selector,
      });
    },
    getHooks() {
      return hooks;
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
    const markup = await polyglot.toMarkup();
    const id = "__poly" + Math.random().toString(32).slice(2);

    function Wrapped() {
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
    }
    return {
      default: () => {
        return <Wrapped />;
      },
    };
  });
}

/** ------------ Preact ------------ */
const PreactSSRContext = Preact.createContext<SSRContextApi | false>(false);

export function fromPreact<P>(Component: any, props: P): PolyglotComponent<P> {
  return {
    impl: "preact",
    async toMarkup() {
      const ssrCtx = createRenderingContext();
      const vdom = h(
        PreactSSRContext.Provider,
        // @ts-ignore
        { value: ssrCtx ?? false },
        // @ts-ignore
        h(Component, props),
      );
      await preactPrepass(vdom);
      const html = preactRender(vdom as any);
      return {
        html,
        css: "",
        props: JSON.stringify(props),
        hooks: ssrCtx.getHooks(),
      };
    },
    attach(el) {
      return {
        async hydrate() {
          // @ts-ignore
          preactHydrate(h(Component, props), el);
        },
        dispose() {
          // WIP
        },
      };
    },
    load: async () => {
      return Component;
    },
  };
}

export function toPreact<P>(poly: PolyglotComponent<P>) {
  return Preact.lazy(async () => {
    if (poly.impl === "preact") {
      const C = await poly.load();
      return {
        default: () => C,
      };
    }
    const markup = await poly.toMarkup();
    const id = "__poly" + Math.random().toString(32).slice(2);

    function Wrapped() {
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
    }

    return {
      default: () => {
        return h(Wrapped, null);
      },
    };
  });
}

// ------ static
export function fromStatic(raw: string): PolyglotComponent<{}> {
  return {
    impl: "static",
    async toMarkup() {
      return {
        html: raw,
        css: "",
        props: JSON.stringify({}),
        hooks: [],
      };
    },
    attach(_el) {
      // let isHydrated = false;
      return {
        hydrate,
        dispose,
      };
      function dispose() {
        // DO nothing
      }
      async function hydrate() {
        // DO nothing
      }
    },
    load: async () => {
      return raw;
    },
  };
}

// ------ svelte
type SvelteRendererResult = {
  html: string;
  css: { code: string; map: string };
  head: string;
};

export function fromSvelte<T>(
  serverRenderer: { render: (props: T) => SvelteRendererResult },
  clientComponent: SvelteComponentType,
  props: T,
): PolyglotComponent<T> {
  let instance: InstanceType<SvelteComponentType> | undefined = undefined;
  return {
    impl: "svelte",
    async toMarkup() {
      const ret = serverRenderer.render(props);
      return {
        html: ret.html,
        css: "",
        props: JSON.stringify(props),
        hooks: [],
      };
    },
    attach(el) {
      return {
        async hydrate() {
          instance = new clientComponent({
            target: el,
            hydrate: true,
          });
        },
        dispose() {
          instance?.$destroy();
        },
      };
    },

    // getProps: () => ({ ...props }),
    load: async () => {
      throw new Error("not implement");
    },
  };
}

async function evaluateModuleCode(code: string) {
  const b64 = btoa(unescape(encodeURIComponent(code)));
  const url = "data:text/javascript;base64," + b64;
  return await import(/* @vite-ignore */ url);
}

export async function getClientComponentFromSvelteTemplate(template: string) {
  const client = svelteCompile(template, {
    hydratable: true,
    sveltePath: "https://esm.sh/svelte@4.1.2/",
  });
  const mod = await evaluateModuleCode(client.js.code);
  const C = mod.default;
  return C;
}

export async function getServerRendererFromSvelteTemplate(template: string) {
  const ssr = svelteCompile(template, {
    generate: "ssr",
    sveltePath: "https://esm.sh/svelte@4.1.2/",
  });
  const mod = await evaluateModuleCode(ssr.js.code);
  return mod.default as {
    render: (props: any) => SvelteRendererResult;
  };
}
