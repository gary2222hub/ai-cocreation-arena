import { parsePrompt } from "../../src/prompt-format";

export function FormattedPrompt({ prompt, className = "" }: { prompt: string; className?: string }) {
  return (
    <div className={`formatted-prompt ${className}`.trim()}>
      {parsePrompt(prompt).map((block, index) => {
        if (block.type === "ordered") {
          return <ol key={index}>{block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ol>;
        }
        if (block.type === "unordered") {
          return <ul key={index}>{block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>;
        }
        return <p className={block.type === "label" ? "prompt-label" : undefined} key={index}>{block.text}</p>;
      })}
    </div>
  );
}
