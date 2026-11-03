import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight } from "sugar-high";
import { Check, Copy } from "lucide-react";

// Wrap words in spans so newly streamed words mount with a fade-in
const rehypeFadeWords = () => (tree) => {
  const walk = (node) => {
    if (!node.children || node.tagName === "pre" || node.tagName === "code") return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text") {
        walk(child);
        return [child];
      }
      return child.value
        .split(/(\s+)/)
        .filter(Boolean)
        .map((w) => (/^\s+$/.test(w) ? { type: "text", value: w } : { type: "element", tagName: "span", properties: { className: ["fw"] }, children: [{ type: "text", value: w }] }));
    });
  };
  walk(tree);
};

const langOf = (className) => /language-([\w+-]+)/.exec(String(className || ""))?.[1] || "";

// Fenced code blocks get a header (language + copy) and syntax highlighting.
// Implemented at the <pre> level so inline `code` keeps the default renderer.
const Pre = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const className = child?.props?.className || "";
  const code = String(child?.props?.children ?? "").replace(/\n$/, "");
  const lang = langOf(className);
  let html = null;
  try {
    html = code ? highlight(code) : null;
  } catch {
    html = null;
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard denied — text selection still works */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="codeblock" data-testid="code-block">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{lang || "code"}</span>
        <button onClick={copy} className="codeblock-copy" data-testid="code-copy" aria-label="Copy code">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        {html ? <code className={className} dangerouslySetInnerHTML={{ __html: html }} /> : <code className={className}>{code}</code>}
      </pre>
    </div>
  );
};

export const Markdown = ({ children, fade = false }) => (
  <div className="md">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={fade ? [rehypeFadeWords] : []} components={{ pre: Pre }}>
      {children || ""}
    </ReactMarkdown>
  </div>
);
