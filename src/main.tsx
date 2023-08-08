import { h } from "preact";
import * as phooks from "preact/hooks";
import { lazy, useEffect, useState } from "react";
import { fromPreact, fromReact, toPreact, toReact } from "./impl.tsx";

// render preact
const PreactIsland = () => {
  const [count, setCount] = phooks.useState(0);
  const onClick = phooks.useCallback(() => {
    setCount(count + 1);
  }, [count]);
  return h("div", null, [
    h("h2", null, "Preact Island"),
    h("button", { onClick }, `preact: counter is ${count}`),
  ]);
};
const PolyPreactIsland = fromPreact(PreactIsland);
{
  // render root
  const ConvertedFromPreact = toReact(PolyPreactIsland, {});
  const App = lazy(() => import("./App.tsx"));
  function Root() {
    return (
      <>
        <div style={{}}>
          <h2>React Island</h2>
          <App />
        </div>
        <div
          style={{
            padding: 10,
            outline: "1px black dashed",
            background: "#eee",
          }}
        >
          <h3>&gt; Preact In React</h3>
          <ConvertedFromPreact />
        </div>
        <hr />
      </>
    );
  }

  const rootElement = document.getElementById("root")!;
  const p = fromReact(Root);
  const instance = p.attach(rootElement);
  const html = await p.stringify({});
  rootElement.innerHTML = html;
  instance.setHydrationHook(["click"]);
}

{
  const rootElement = document.createElement("div");
  rootElement.className = "preact-root";
  document.body.appendChild(rootElement);
  const p = fromPreact(PreactIsland);
  const instance = p.attach(rootElement);
  const html = await p.stringify({});
  rootElement.innerHTML = html;
  instance.hydrate({});
  // await p.setHtml(rootElement);
  // await p.hydrate(rootElement);
}

{
  const Simple = () => {
    return <div>hello react in preact</div>;
  };
  const poly = fromReact(Simple);
  const ConvertedFromReact = toPreact(poly, {});
  function PreactWithReact() {
    return h("div", null, [
      h("h2", null, "Preact With React"),
      h("div", null, [
        // expect hello
        h(ConvertedFromReact, null),
      ]),
    ]);
  }
  const rootElement = document.createElement("div");
  rootElement.className = "preact-root2";
  document.body.appendChild(rootElement);
  const p = fromPreact(PreactWithReact);
  const instance = p.attach(rootElement);
  const html = await p.stringify({});
  rootElement.innerHTML = html;
  instance.hydrate({});
}

// // Intersection loading views
{
  function MyView() {
    // const ref = useRef<HTMLDivElement>(null);
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
            display: "grid",
            placeItems: "center",
          }}
        >
          {loaded ? "View(ready)" : "View(loding)"}
        </div>
      </>
    );
  }

  for (const _i of [0, 1, 2, 3, 4]) {
    const el = document.createElement("div");
    el.className = "view" + _i;
    document.body.appendChild(el);

    const p = fromReact(MyView);
    const instance = p.attach(el);
    const html = await p.stringify({});
    el.innerHTML = html;
    instance.setHydrationHook(["view"]);
  }
}
