import { Markdown } from "../ui/markdown";

export function FileMarkdownView({ text }: { text: string }) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto rounded-md border border-line bg-sunken px-5 py-4"
      data-rendered="markdown"
    >
      <Markdown source={text} />
    </div>
  );
}
