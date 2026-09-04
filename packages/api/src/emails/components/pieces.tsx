import { Heading, Hr, Link, Section, Text } from "@react-email/components"
import type { ReactNode } from "react"
import { theme } from "../theme"

export function EmailTitle({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      className="pu-ink"
      style={{
        margin: `0 0 ${theme.space[3]}`,
        fontFamily: theme.displayFont,
        fontSize: "22px",
        fontWeight: 700,
        letterSpacing: "-0.01em",
        lineHeight: 1.2,
        color: theme.color.ink,
      }}
    >
      {children}
    </Heading>
  )
}

export function EmailParagraph({ children }: { children: ReactNode }) {
  return (
    <Text
      className="pu-ink-2"
      style={{
        margin: `0 0 ${theme.space.gutter}`,
        fontSize: "14px",
        lineHeight: 1.6,
        color: theme.color["ink-2"],
      }}
    >
      {children}
    </Text>
  )
}

export function EmailFootnote({ children }: { children: ReactNode }) {
  return (
    <>
      <Hr
        className="pu-rule"
        style={{
          margin: `${theme.space[8]} 0 ${theme.space[4]}`,
          border: "none",
          borderTop: `1px solid ${theme.color.line}`,
        }}
      />
      <Text
        className="pu-ink-3"
        style={{
          margin: 0,
          fontSize: "12px",
          lineHeight: 1.6,
          color: theme.color["ink-3"],
        }}
      >
        {children}
      </Text>
    </>
  )
}

export function EmailButton({
  children,
  url,
}: {
  children: ReactNode
  url: string
}) {
  return (
    <table cellPadding="0" cellSpacing="0" role="presentation" width="100%">
      <tr>
        <td style={{ paddingBottom: theme.space.gutter }}>
          <table cellPadding="0" cellSpacing="0" role="presentation">
            <tr>
              <td
                className="pu-button"
                style={{
                  backgroundColor: theme.color.inverse,
                  borderRadius: theme.radius.sm,
                }}
              >
                <Link
                  href={url}
                  style={{
                    display: "inline-block",
                    padding: `${theme.space[3]} ${theme.space[6]}`,
                    color: theme.color["inverse-ink"],
                    fontSize: "14px",
                    fontWeight: 600,
                    lineHeight: 1,
                    textDecoration: "none",
                  }}
                >
                  {children}
                </Link>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  )
}

export interface EmailField {
  label: string
  value: string
  mono?: boolean
}

export function EmailData({ fields }: { fields: EmailField[] }) {
  return (
    <Section
      className="pu-sunken"
      style={{
        margin: `0 0 ${theme.space.gutter}`,
        padding: `${theme.space[3]} ${theme.space[4]}`,
        backgroundColor: theme.color.sunken,
        border: `1px solid ${theme.color.line}`,
        borderRadius: theme.radius.md,
      }}
    >
      <table cellPadding="0" cellSpacing="0" role="presentation" width="100%">
        {fields.map((field) => (
          <tr key={field.label}>
            <td
              style={{
                padding: `${theme.space[2]} ${theme.space[4]} ${theme.space[2]} 0`,
                verticalAlign: "top",
                whiteSpace: "nowrap",
              }}
            >
              <Text
                className="pu-ink-3"
                style={{
                  margin: 0,
                  fontSize: "10.5px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.5,
                  color: theme.color["ink-3"],
                }}
              >
                {field.label}
              </Text>
            </td>
            <td
              style={{
                padding: `${theme.space[2]} 0`,
                verticalAlign: "top",
                width: "100%",
              }}
            >
              <Text
                className="pu-ink"
                style={{
                  margin: 0,
                  fontFamily:
                    field.mono === false ? theme.font : theme.monoFont,
                  fontSize: field.mono === false ? "13px" : "12px",
                  lineHeight: 1.5,
                  wordBreak: "break-all",
                  color: theme.color.ink,
                }}
              >
                {field.value}
              </Text>
            </td>
          </tr>
        ))}
      </table>
    </Section>
  )
}

export function EmailTrouble({ label, url }: { label: string; url: string }) {
  return (
    <Text
      className="pu-ink-4"
      style={{
        margin: `0 0 ${theme.space[2]}`,
        fontSize: "11px",
        lineHeight: 1.6,
        color: theme.color["ink-4"],
      }}
    >
      {label}
      <br />
      <span style={{ fontFamily: theme.monoFont, wordBreak: "break-all" }}>
        {url}
      </span>
    </Text>
  )
}
