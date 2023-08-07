export type PolyglotComponent = {
  stringify: () => Promise<string>;
  setHtml: (root: HTMLElement) => Promise<void>;
  hydrate: (root: HTMLElement) => Promise<void>;
  setHydrationHook: (root: HTMLElement, types: string[]) => void;
};
