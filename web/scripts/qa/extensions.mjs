/**
 * What counts as a browser extension touching the exam page.
 *
 * The detector has to tell an extension's fingerprints from the app's own
 * markup, and it runs on every student's page — a rule that is too eager flags
 * everybody, and one that is too lax flags nobody. This builds small pages by
 * hand (there is no browser here, so a few lines stand in for the DOM) and
 * checks what scanForExtensions() makes of them: the traces seen on real
 * machines, and the ordinary markup it must leave alone.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
globalThis.location = { href: "https://proctorly.live/exam/1" };

const { scanForExtensions, describeSignature } = await import(
  new URL("../../src/lib/extension-watch.ts", import.meta.url).href
);

/** Just enough of an element for the detector: tag, attributes, children. */
function el(tag, attrs = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    children,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    querySelectorAll: () => {
      const all = [];
      const walk = (e) => e.children.forEach((c) => (all.push(c), walk(c)));
      walk(node);
      return all;
    },
  };
  children.forEach((c) => (c.parent = node));
  return node;
}

/** A page: <html> with a <body>, wired so each element knows its document. */
function page(htmlAttrs, bodyAttrs, bodyChildren) {
  const body = el("body", bodyAttrs, bodyChildren);
  const html = el("html", htmlAttrs, [el("head"), body]);
  const doc = { documentElement: html, body };
  const stamp = (e) => ((e.ownerDocument = doc), e.children.forEach(stamp));
  stamp(html);
  return doc;
}

const app = () => [
  el("div", { class: "flex", "data-slot": "x", "aria-label": "Question" }, [
    el("svg", { viewBox: "0 0 24 24", "stroke-width": "2" }),
    el("video", { src: "https://abc.supabase.co/storage/v1/object/sign/x.webm" }),
    el("a", { href: "/exam/1" }),
  ]),
  el("next-route-announcer"),
];

let checks = 0;
const bugs = [];
const t = (c, l, d = "") => {
  checks++;
  if (!c) bugs.push(l);
  console.log(`  ${c ? "ok " : "BUG"}  ${l}${d ? " — " + d : ""}`);
};

console.log("\n== The app's own page is clean ==");
{
  const found = scanForExtensions(page({ lang: "en", class: "font-vars h-full" }, { class: "min-h-full" }, app()));
  t(found.length === 0, "nothing flagged on an untouched page", JSON.stringify(found));
}

console.log("\n== Traces seen on real machines are caught ==");
{
  // From the dev server log on 11 September: an extension stamping <html> and
  // every <div> it could reach.
  const found = scanForExtensions(
    page({ lang: "en", class: "x", crxlauncher: "", "crxlauncher-bridged": "" }, { class: "y", bis_register: "W3" }, [
      el("div", { class: "a", bis_skin_checked: "1" }),
    ]),
  );
  t(found.includes("attribute:crxlauncher"), "a marker on <html>", found.join(" | "));
  t(found.includes("attribute:bis_register"), "a marker on <body>");
  t(found.includes("attribute:bis_skin_checked"), "a marker stamped on the page's own elements");
}
{
  const found = scanForExtensions(
    page({ lang: "en" }, { class: "y" }, [
      ...app(),
      el("grammarly-desktop-integration"),
      el("script", { src: "chrome-extension://kiilhncajadbgbmdbdcopdpnmdhlbdle/content.js" }),
      el("link", { rel: "stylesheet", href: "moz-extension://1234-abcd/panel.css" }),
      el("iframe", { src: "chrome-extension://abcdefghijklmnop/sidebar.html" }),
      el("iframe", {}),
    ]),
  );
  t(found.includes("element:grammarly-desktop-integration"), "an injected custom element", found.join(" | "));
  t(found.includes("extension:kiilhncajadbgbmdbdcopdpnmdhlbdle"), "a script from an extension, named by its id");
  t(found.includes("extension:1234-abcd"), "a Firefox extension's stylesheet");
  t(found.includes("extension:abcdefghijklmnop"), "an extension's sidebar frame, by id, not as a frame");
  t(!found.some((s) => s.startsWith("frame:chrome")), "that frame is not reported twice");
  t(found.includes("frame:blank"), "a blank injected frame");
  t(!found.includes("element:next-route-announcer"), "Next.js's own element is left alone");
}

console.log("\n== Read by a person ==");
t(describeSignature("extension:abc") === "loaded from extension abc", "an extension id");
t(describeSignature("attribute:bis_skin_checked") === 'marked the page with "bis_skin_checked"', "a marker");
t(describeSignature("element:x-helper") === "added a <x-helper> element", "an element");

console.log(`\n${checks} checks, ${bugs.length} bug${bugs.length === 1 ? "" : "s"}`);
if (bugs.length) process.exit(1);
