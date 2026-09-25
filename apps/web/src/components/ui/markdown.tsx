import type { ComponentProps } from "react"
import ReactMarkdown from "react-markdown"

export interface MarkdownProps {
  source: string
}

const CLASSES = {
  h1: "mt-4 font-medium text-[15px] text-ink first:mt-0",
  h2: "mt-4 font-medium text-[14px] text-ink first:mt-0",
  h3: "mt-3 font-medium text-[13px] text-ink first:mt-0",
  p: "text-[13px] text-ink-2",
  ul: "flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2",
  ol: "flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2",
  code: "rounded-sm bg-raised px-1 font-data text-[12px] text-ink",
  a: "underline underline-offset-2 hover:text-ink",
} as const

function heading(level: "h1" | "h2" | "h3") {
  return function Heading(props: ComponentProps<typeof level>) {
    const Tag = level

    return <Tag {...props} className={CLASSES[level]} />
  }
}

// react-markdown drops raw HTML, so nothing in a note reaches the page as markup.
export function Markdown({ source }: MarkdownProps) {
  return (
    <div className="flex flex-col gap-2">
      <ReactMarkdown
        components={{
          h1: heading("h2"),
          h2: heading("h3"),
          h3: heading("h3"),
          p: (props) => <p {...props} className={CLASSES.p} />,
          ul: (props) => <ul {...props} className={CLASSES.ul} />,
          ol: (props) => <ol {...props} className={CLASSES.ol} />,
          code: (props) => <code {...props} className={CLASSES.code} />,
          a: (props) => (
            <a
              {...props}
              className={CLASSES.a}
              rel="noreferrer"
              target="_blank"
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
