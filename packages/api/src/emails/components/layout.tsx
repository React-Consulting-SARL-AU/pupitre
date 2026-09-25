import type { Locale } from "@pupitre/shared/i18n"
import {
  Body,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"
import { consoleUrl, EMAIL_DOMAIN } from "../config"
import type { EmailTranslator } from "../i18n"
import { theme } from "../theme"

// Gmail drops a whole `style` at its first unknown declaration; width is also an attribute for clients ignoring `max-width`.
const OUTER: React.CSSProperties = {
  maxWidth: `${theme.width}px`,
  width: "100%",
  margin: "0 auto",
}

export function EmailLayout({
  children,
  locale,
  preview,
  t,
}: {
  children: ReactNode
  locale: Locale
  preview: string
  t: EmailTranslator
}) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: `${theme.space[12]} ${theme.space[4]}`,
          backgroundColor: theme.color.base,
          fontFamily: theme.font,
          fontSize: "14px",
          lineHeight: 1.5,
          color: theme.color.ink,
        }}
      >
        <table
          align="center"
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{ ...OUTER, marginBottom: theme.space.gutter }}
          width={theme.width}
        >
          <tr>
            <td style={{ verticalAlign: "middle", width: "28px" }}>
              <table cellPadding="0" cellSpacing="0" role="presentation">
                <tr>
                  <td
                    style={{
                      width: "28px",
                      height: "28px",
                      textAlign: "center",
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.color.inverse,
                      color: theme.color["inverse-ink"],
                      fontFamily: theme.monoFont,
                      fontSize: "13px",
                      fontWeight: 700,
                      lineHeight: "28px",
                    }}
                  >
                    {">_"}
                  </td>
                </tr>
              </table>
            </td>
            <td
              style={{ paddingLeft: theme.space[2], verticalAlign: "middle" }}
            >
              <Text
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: "15px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  lineHeight: "28px",
                  color: theme.color.ink,
                }}
              >
                {t("common.brand")}
              </Text>
            </td>
          </tr>
        </table>

        <table
          align="center"
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{
            ...OUTER,
            backgroundColor: theme.color.surface,
            border: `1px solid ${theme.color.line}`,
            borderRadius: theme.radius.lg,
          }}
          width={theme.width}
        >
          <tr>
            <td>
              <Section
                style={{ padding: `${theme.space[8]} ${theme.space[6]}` }}
              >
                {children}
              </Section>
            </td>
          </tr>
        </table>

        <table
          align="center"
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{ ...OUTER, marginTop: theme.space.gutter }}
          width={theme.width}
        >
          <tr>
            <td>
              <Text
                style={{
                  margin: 0,
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: theme.color["ink-3"],
                }}
              >
                {t("common.tagline")}
              </Text>
              <Text
                style={{
                  margin: `${theme.space[2]} 0 0`,
                  fontSize: "11px",
                  lineHeight: 1.5,
                  color: theme.color["ink-4"],
                }}
              >
                <Link
                  href={consoleUrl()}
                  style={{
                    color: theme.color["ink-4"],
                    textDecoration: "none",
                  }}
                >
                  {EMAIL_DOMAIN}
                </Link>
                {" · "}
                {t("common.automatic")}
              </Text>
            </td>
          </tr>
        </table>
      </Body>
    </Html>
  )
}
