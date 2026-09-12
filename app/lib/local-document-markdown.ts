"use client";

export type LocalMarkdownResult = {
  markdown: string;
  method: string;
  pages: number | null;
};

const MAX_MARKDOWN_CHARACTERS = 650_000;

function compactMarkdown(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_MARKDOWN_CHARACTERS);
}

function htmlToMarkdown(html: string) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");

  const render = (node: Node, listDepth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return [...node.childNodes].map((child) => render(child, listDepth)).join("");
    const children = [...node.childNodes].map((child) => render(child, listDepth)).join("");
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return `\n${"#".repeat(Number(tag[1]))} ${children.trim()}\n`;
    if (tag === "p" || tag === "div") return `\n${children.trim()}\n`;
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return `**${children.trim()}**`;
    if (tag === "em" || tag === "i") return `*${children.trim()}*`;
    if (tag === "a") return `[${children.trim()}](${node.getAttribute("href") ?? ""})`;
    if (tag === "li") return `\n${"  ".repeat(listDepth)}- ${children.trim()}`;
    if (tag === "ul" || tag === "ol") return `${[...node.childNodes].map((child) => render(child, listDepth + 1)).join("")}\n`;
    if (tag === "tr") return `| ${[...node.children].map((child) => render(child, listDepth).trim()).join(" | ")} |\n`;
    if (tag === "table") {
      const rows = [...node.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
      if (!rows.length) return children;
      const rendered = rows.map((row) => render(row, listDepth));
      const columns = Math.max(1, rows[0].children.length);
      return `\n${rendered[0]}| ${Array(columns).fill("---").join(" | ")} |\n${rendered.slice(1).join("")}\n`;
    }
    if (tag === "img") return node.getAttribute("alt") ? `![${node.getAttribute("alt")}](本地图片)` : "";
    return children;
  };

  return compactMarkdown(render(documentNode.body));
}

export function supportsLocalMarkdown(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "docx", "txt", "md", "html", "htm", "xml", "rtf", "eml"].includes(extension);
}

export async function convertDocumentToMarkdown(file: File): Promise<LocalMarkdownResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    try {
      if (pdf.numPages > 600) throw new Error("PDF超过600页，请拆分后再导入");
      const result = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(result.text) ? result.text : [result.text];
      const markdown = compactMarkdown(pages.map((text, index) => `## 第 ${index + 1} 页\n\n${text.trim()}`).join("\n\n---\n\n"));
      if (markdown.replace(/[#\s|\-]/g, "").length < 20) throw new Error("这是扫描版PDF，未检测到可复制文字；请使用OCR版PDF或调用OCR转换服务");
      const garbledCharacters = markdown.match(/[�ÿþ]/g)?.length ?? 0;
      if (garbledCharacters > Math.max(20, markdown.length * 0.01)) {
        throw new Error("PDF内嵌字体编码异常，本地提取会产生乱码；请调用OCR转换服务后再导入");
      }
      return { markdown, method: `浏览器本地 PDF 转 Markdown（${result.totalPages}页）`, pages: result.totalPages };
    } finally {
      await pdf.cleanup().catch(() => undefined);
    }
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const markdown = htmlToMarkdown(result.value);
    if (!markdown) throw new Error("Word文档中没有提取到可读文字");
    return { markdown, method: "浏览器本地 Word 转 Markdown", pages: null };
  }
  const raw = await file.text();
  const markdown = ["html", "htm", "xml"].includes(extension)
    ? htmlToMarkdown(raw)
    : compactMarkdown(raw);
  if (!markdown) throw new Error("文件中没有提取到可读文字");
  return { markdown, method: "浏览器本地文本转 Markdown", pages: null };
}
