import { h } from "preact";
import * as phooks from "preact/hooks";
import { lazy, useEffect, useState } from "react";
import {
  fromPreact,
  fromReact,
  fromStatic,
  fromSvelte,
  getClientComponentFromSvelteTemplate,
  getServerRendererFromSvelteTemplate,
  setHydrationHook,
  toPreact,
  toReact,
} from "./impl.tsx";

// render preact
const PreactIsland = () => {
  const [count, setCount] = phooks.useState(0);
  const onClick = phooks.useCallback(() => {
    setCount(count + 1);
  }, [count]);
  return h(
    "div",
    {
      style: { outline: "1px solid red", padding: 3 },
    },
    [
      h("h2", null, "Preact Island"),
      h("button", { onClick }, `preact: counter is ${count}`),
    ],
  );
};
{
  // render root
  const PolyPreactIsland = fromPreact(PreactIsland, {});
  const PreactToReact = toReact(PolyPreactIsland);
  const Direct = (props: { name: string }) => {
    return <div>React to React - {props.name}</div>;
  };

  const PolyDirect = fromReact(Direct, { name: "world" });
  const ReactToReact = toReact(PolyDirect);

  const staticTemplate = `<div style="outline: 1px solid green; padding: 3px;">Static</div>`;
  const PolyStatic = fromStatic(staticTemplate);
  const StaticToReact = toReact(PolyStatic);

  const App = lazy(() => import("./App.tsx"));
  function Root() {
    return (
      <div style={{ outline: "1px solid blue", padding: 3 }}>
        <div>
          <h2>React Island</h2>
          <App />
        </div>
        <div
          style={{
            padding: 10,
            background: "#eee",
          }}
        >
          <PreactToReact />
          <ReactToReact />
          <StaticToReact />
        </div>
        <hr />
      </div>
    );
  }
  const rootElement = document.getElementById("root")!;
  const p = fromReact(Root, {});
  const instance = p.attach(rootElement);
  const markup = await p.toMarkup();
  rootElement.innerHTML = markup.html;
  setHydrationHook(rootElement, ["click"], instance.hydrate);
}

{
  // preact root
  const rootElement = document.createElement("div");
  rootElement.className = "preact-root";
  document.body.appendChild(rootElement);
  const p = fromPreact(PreactIsland, {});
  const instance = p.attach(rootElement);
  const markup = await p.toMarkup();
  rootElement.innerHTML = markup.html;
  instance.hydrate();
}

{
  // svelte root
  const rootElement = document.createElement("div");
  rootElement.className = "svelte-root";
  document.body.appendChild(rootElement);
  const template = `
<script>
  let x = 1;
  const onClick = () => {
    x += 1;
  }
</script>
<div>svelte:{x}</div>
<button on:click={onClick}>click</button>
`;
  const serverRenderer = await getServerRendererFromSvelteTemplate(template);
  const clientComponent = await getClientComponentFromSvelteTemplate(template);
  const polyglot = fromSvelte(serverRenderer, clientComponent, {});
  const instance = polyglot.attach(rootElement);
  const markup = await polyglot.toMarkup();
  rootElement.innerHTML = markup.html;
  instance.hydrate();
}

{
  const Simple = (props: { name: string }) => {
    return (
      <div style={{ outline: "1px solid blue", padding: 3 }}>
        hello {props.name} (preact)
      </div>
    );
  };
  const poly = fromReact(Simple, {
    name: "world",
  });
  const ConvertedFromReact = toPreact(poly);
  function PreactWithReact() {
    return h(
      "div",
      {
        style: { outline: "1px solid red", padding: 3 },
      },
      [
        h("h2", null, "Preact With React"),
        h("div", null, [
          // expect hello
          h(ConvertedFromReact, null),
        ]),
      ],
    );
  }
  const rootElement = document.createElement("div");
  rootElement.className = "preact-root2";
  document.body.appendChild(rootElement);
  const p = fromPreact(PreactWithReact, {});
  const instance = p.attach(rootElement);
  const markup = await p.toMarkup();
  rootElement.innerHTML = markup.html;
  instance.hydrate();
}

// Intersection loading views
{
  function MyView() {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      setTimeout(() => {
        setLoaded(true);
      }, 1000);
    }, []);
    return (
      <>
        <div
          style={{
            width: 400,
            height: 400,
            boxSizing: "border-box",
            background: loaded ? "#eee" : "1px solid #ddd",
            outline: "1px solid blue",
            display: "grid",
            placeItems: "center",
          }}
        >
          {loaded ? "View(ready)" : "View(loding)"}
        </div>
      </>
    );
  }

  const listRoot = document.createElement("div");
  listRoot.className = "list-root";
  listRoot.style.display = "flex";
  listRoot.style.flexWrap = "wrap";
  document.body.appendChild(listRoot);
  for (const _i of [0, 1, 2, 3, 4]) {
    const el = document.createElement("div");
    el.className = "view" + _i;
    // document.body.appendChild(el);
    listRoot.appendChild(el);
    const p = fromReact(MyView, {});
    const instance = p.attach(el);
    const markup = await p.toMarkup();
    el.innerHTML = markup.html;
    setHydrationHook(el, ["view"], instance.hydrate);
  }
}
