import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CLASSES = {
  h1: "mt-5 font-medium text-title text-ink first:mt-0",
  h2: "mt-5 font-medium text-heading text-ink first:mt-0",
  h3: "mt-4 font-medium text-body text-ink first:mt-0",
  h4: "mt-3 font-medium text-control text-ink first:mt-0",
  p: "text-control text-ink-2",
  ul: "flex list-disc flex-col gap-1 pl-5 text-control text-ink-2",
  ol: "flex list-decimal flex-col gap-1 pl-5 text-control text-ink-2",
  blockquote: "border-line-strong border-l-2 pl-3 text-control text-ink-3",
  code: "rounded-sm bg-raised px-1 font-data text-small text-ink",
  pre: "overflow-x-auto rounded-md bg-sunken p-3 font-data text-small text-ink [&>code]:bg-transparent [&>code]:p-0",
  table: "w-full border-collapse text-control text-ink-2",
  th: "border border-line px-2 py-1 text-left font-medium text-ink",
  td: "border border-line px-2 py-1",
  hr: "border-line",
  a: "underline underline-offset-2 hover:text-ink",
} as const;

type Level = "h1" | "h2" | "h3" | "h4";

function heading(level: Level) {
  return function Heading(props: ComponentProps<Level>) {
    const Tag = level;

    return <Tag {...props} className={CLASSES[level]} />;
  };
}

// react-markdown drops raw HTML; the window's open handler sends `_blank` links outside the app.
export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown
        components={{
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          h4: heading("h4"),
          h5: heading("h4"),
          h6: heading("h4"),
          p: (props) => <p {...props} className={CLASSES.p} />,
          ul: (props) => <ul {...props} className={CLASSES.ul} />,
          ol: (props) => <ol {...props} className={CLASSES.ol} />,
          blockquote: (props) => (
            <blockquote {...props} className={CLASSES.blockquote} />
          ),
          code: (props) => <code {...props} className={CLASSES.code} />,
          pre: (props) => <pre {...props} className={CLASSES.pre} />,
          table: (props) => <table {...props} className={CLASSES.table} />,
          th: (props) => <th {...props} className={CLASSES.th} />,
          td: (props) => <td {...props} className={CLASSES.td} />,
          hr: (props) => <hr {...props} className={CLASSES.hr} />,
          a: (props) => (
            <a
              {...props}
              className={CLASSES.a}
              rel="noreferrer"
              target="_blank"
            />
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
