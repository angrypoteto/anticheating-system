/**
 * Noticing a browser extension working on the exam page.
 *
 * A web page cannot switch extensions off, and cannot list them — browsers
 * keep both out of reach on purpose. What it can see is an extension *touching
 * it*: an AI helper that adds a button beside every question, a sidebar
 * injected into the page, a script or frame loaded from an extension's own
 * address, a marker attribute stamped on the page's elements. Those are the
 * extensions worth worrying about in an exam, because touching the page is how
 * they read it and write into it.
 *
 * What this cannot see is an extension that only reads, or one working in its
 * own popup or side panel outside the page. The screen recording is what
 * covers those.
 *
 * Each finding is a short signature — "extension:<id>", "element:<tag>",
 * "attribute:<name>", "frame:<host>" — so the same extension is reported once,
 * and a teacher can look an extension id up in the browser's store.
 */

const EXTENSION_SCHEMES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-web-extension://",
  "ms-browser-extension://",
  "extension://",
];

/** Custom elements the app itself (or Next.js) puts on the page. */
const OWN_ELEMENTS = new Set(["next-route-announcer", "nextjs-portal"]);

/** Attributes the app sets on <html> and <body>. Anything else there is foreign. */
const OWN_ROOT_ATTRIBUTES = new Set(["lang", "class", "style", "dir", "data-theme"]);

/** The part of an extension URL that names the extension. */
function extensionId(url: string): string | null {
  const scheme = EXTENSION_SCHEMES.find((s) => url.startsWith(s));
  if (!scheme) return null;
  return url.slice(scheme.length).split(/[/?#]/)[0] || "unknown";
}

/**
 * Is this attribute one the app would never have written?
 *
 * On <html> and <body> the app sets a handful, so the rule is a list. Elsewhere
 * React writes standard attributes, data-* and aria-*, none of which contain an
 * underscore — while extension markers very often do (bis_skin_checked,
 * __gchrome_uniqueid). An underscore is the tell.
 */
function foreignAttribute(el: Element, name: string): boolean {
  if (el === el.ownerDocument.documentElement || el === el.ownerDocument.body) {
    return !OWN_ROOT_ATTRIBUTES.has(name);
  }
  return name.includes("_");
}

/** Everything suspicious in and under one element. */
function inspect(root: Element, found: Set<string>) {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();

    if (tag.includes("-") && !OWN_ELEMENTS.has(tag)) found.add(`element:${tag}`);

    for (const attr of ["src", "href"]) {
      const value = el.getAttribute(attr);
      const id = value ? extensionId(value) : null;
      if (id) found.add(`extension:${id}`);
    }

    // The exam page has no frames of its own.
    if (tag === "iframe") {
      const src = el.getAttribute("src") ?? "";
      const id = extensionId(src);
      if (!id) {
        let host = "blank";
        try {
          if (src) host = new URL(src, location.href).host || "blank";
        } catch {
          host = "unknown";
        }
        found.add(`frame:${host}`);
      }
    }

    for (const { name } of Array.from(el.attributes)) {
      if (foreignAttribute(el, name)) found.add(`attribute:${name}`);
    }
  }
}

/** A look over the whole page as it is now — for the moment the exam starts. */
export function scanForExtensions(doc: Document = document): string[] {
  const found = new Set<string>();
  inspect(doc.documentElement, found);
  return [...found];
}

/**
 * Keep watching, and report each new signature once.
 *
 * Mutations are gathered and looked at in one pass a moment later, so a burst
 * of changes (a question rendering, say) costs one inspection rather than a
 * hundred. Returns a function that stops watching.
 */
export function watchForExtensions(
  onFound: (signatures: string[]) => void,
  { ignore = [] as string[], doc = document } = {},
): () => void {
  const seen = new Set<string>(ignore);
  const pending = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const found = new Set<string>();
    for (const el of pending) if (el.isConnected) inspect(el, found);
    pending.clear();
    const fresh = [...found].filter((s) => !seen.has(s));
    fresh.forEach((s) => seen.add(s));
    if (fresh.length) onFound(fresh);
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName && r.target instanceof Element) {
        if (foreignAttribute(r.target, r.attributeName)) {
          const sig = `attribute:${r.attributeName}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            onFound([sig]);
          }
        }
      }
      r.addedNodes.forEach((n) => {
        if (n instanceof Element) pending.add(n);
      });
    }
    if (pending.size && !timer) timer = setTimeout(flush, 400);
  });

  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  };
}

/** How a signature reads to a person. */
export function describeSignature(sig: string): string {
  const [kind, ...rest] = sig.split(":");
  const what = rest.join(":");
  switch (kind) {
    case "extension":
      return `loaded from extension ${what}`;
    case "element":
      return `added a <${what}> element`;
    case "attribute":
      return `marked the page with "${what}"`;
    case "frame":
      return `added a frame (${what})`;
    default:
      return sig;
  }
}
