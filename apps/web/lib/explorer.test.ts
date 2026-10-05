import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { addrUrl, blockUrl, txUrl } from "./app-config";
import { explorerEnabled, explorerHref, explorerLabel } from "./explorer";
import { ExplorerLink, TxLink } from "@/components/app/explorer-link";

const H = "0xabcd" + "0".repeat(52) + "1234";
const A = "0x1147d482fD08DDd7F377838efb610B606B3Ad765";

describe("explorer urls", () => {
  it("builds BscScan urls", () => {
    expect(txUrl(H)).toBe(`https://bscscan.com/tx/${H}`);
    expect(addrUrl(A)).toBe(`https://bscscan.com/address/${A}`);
    expect(blockUrl(125815981)).toBe("https://bscscan.com/block/125815981");
    expect(explorerHref("block", 7)).toBe("https://bscscan.com/block/7");
  });
  it("labels", () => {
    expect(explorerLabel("tx", H)).toBe("View transaction 0xabcd…1234 on BscScan");
    expect(explorerLabel("block", 7)).toBe("View block 7 on BscScan");
  });
  it("links only for real mainnet data", () => {
    expect(explorerEnabled(false, false)).toBe(true);
    expect(explorerEnabled(true, false)).toBe(false);
    expect(explorerEnabled(false, true)).toBe(false);
  });
});

describe("ExplorerLink render", () => {
  it("renders a safe new-tab link", () => {
    const html = renderToStaticMarkup(createElement(TxLink, { hash: H, example: false }));
    expect(html).toContain(`href="https://bscscan.com/tx/${H}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="View transaction 0xabcd…1234 on BscScan"');
  });
  it("is plain text for example data", () => {
    const html = renderToStaticMarkup(createElement(ExplorerLink, { kind: "tx", value: H, example: true }));
    expect(html).not.toContain("<a ");
    expect(html).toContain("0xabcd…1234");
  });
});

describe("no hard-coded hashes", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : []; });
  it("app/ and components/ contain no 64-hex literals", () => {
    const root = join(__dirname, "..");
    const bad = [...walk(join(root, "app")), ...walk(join(root, "components"))].filter((f) => !/\.test\./.test(f) && /0x[0-9a-fA-F]{64}\b/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
    expect(bad).toEqual([]);
  });
});
