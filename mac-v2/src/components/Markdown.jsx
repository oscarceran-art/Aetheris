import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export const Markdown = ({ children, fade = false }) => (
  <div className="md">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={fade ? [rehypeFadeWords] : []}>
      {children || ""}
    </ReactMarkdown>
  </div>
);
