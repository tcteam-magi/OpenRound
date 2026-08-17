/* OpenRound — client-side deck parsing (pdf / pptx / docx / txt / md).
   Everything runs in the browser: pdf.js and JSZip are lazy-loaded from a CDN
   the first time a file needs them, and the file itself never leaves the page.
   The OOXML walk (which XML parts are the source of truth, text collected in
   document order, <a:br>/<w:br> as soft breaks) adapts the approach of
   genoffice's @genoffice/file-parse (Apache-2.0), reimplemented on DOMParser. */

"use strict";

const OpenRoundParse = (() => {
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs";
  const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs";
  const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_URL).then((m) => {
        m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return m;
      }).catch(() => {
        pdfjsPromise = null;
        throw new Error("Couldn't load the PDF parser (CDN blocked?). Paste your text instead.");
      });
    }
    return pdfjsPromise;
  }

  let jszipPromise = null;
  function loadJSZip() {
    if (!jszipPromise) {
      jszipPromise = new Promise((resolve, reject) => {
        if (window.JSZip) return resolve(window.JSZip);
        const s = document.createElement("script");
        s.src = JSZIP_URL;
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => {
          jszipPromise = null;
          reject(new Error("Couldn't load the archive parser (CDN blocked?). Paste your text instead."));
        };
        document.head.appendChild(s);
      });
    }
    return jszipPromise;
  }

  // ------------------------------------------------------------------- pdf
  async function pdfToText(buf) {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: buf });
    const doc = await task.promise;
    try {
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if ("str" in item) {
            text += item.str;
            if (item.hasEOL) text += "\n";
          }
        }
        pages.push(text.trim());
        page.cleanup();
      }
      return pages.join("\n\n").trim();
    } finally {
      await task.destroy();
    }
  }

  // ----------------------------------------------------------------- ooxml
  function parseXml(str) {
    const doc = new DOMParser().parseFromString(str, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Malformed XML inside the file.");
    }
    return doc;
  }

  // One paragraph's text in document order. `replacements` maps break-like
  // tags (soft line breaks, tabs) to the character they stand for.
  function paragraphText(p, textTag, replacements) {
    let out = "";
    (function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue; // elements only
        if (child.nodeName === textTag) out += child.textContent;
        else if (child.nodeName in replacements) out += replacements[child.nodeName];
        else walk(child);
      }
    })(p);
    return out;
  }

  async function pptxToText(buf) {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .map((p) => {
        const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(p);
        return m ? { path: p, n: Number(m[1]) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.n - b.n);
    if (!slides.length) throw new Error("No slides found — is this a valid .pptx?");
    const sections = [];
    for (const s of slides) {
      const doc = parseXml(await zip.files[s.path].async("text"));
      const paras = [];
      for (const p of doc.getElementsByTagName("a:p")) {
        const line = paragraphText(p, "a:t", { "a:br": "\n" });
        if (line.trim()) paras.push(line);
      }
      sections.push([`## Slide ${s.n}`, ...paras].join("\n"));
    }
    return sections.join("\n\n");
  }

  async function docxToText(buf) {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(buf);
    const docXml = zip.file("word/document.xml");
    if (!docXml) throw new Error("Missing word/document.xml — is this a valid .docx?");
    const doc = parseXml(await docXml.async("text"));
    const lines = [];
    for (const p of doc.getElementsByTagName("w:p")) {
      lines.push(paragraphText(p, "w:t", { "w:br": "\n", "w:cr": "\n", "w:tab": "\t" }));
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // -------------------------------------------------------------- dispatch
  async function parseFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["txt", "md", "markdown"].includes(ext)) return (await file.text()).trim();
    const buf = await file.arrayBuffer();
    if (ext === "pdf") return pdfToText(buf);
    if (ext === "pptx") return pptxToText(buf);
    if (ext === "docx") return docxToText(buf);
    throw new Error(`Unsupported file type: .${ext} — use pdf, pptx, docx, txt, or md.`);
  }

  return { parseFile };
})();
