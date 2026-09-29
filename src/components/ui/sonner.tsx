"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Position toasts to the LEFT of Hermes owl — so they appear
          // to come FROM Hermes rather than overlapping it.
          // Desktop: Hermes is 120px wide + right-16 (64px margin) = 184px
          // from the right edge. We offset the toast container by 200px
          // to give a 16px gap between the toast and Hermes.
          // Mobile: Hermes is 60px wide + right-1 (4px margin) = 64px.
          // We offset by 76px for a 12px gap.
          // The offset is applied via CSS custom properties so the
          // globals.css can use them in responsive media queries.
          "--hermes-offset-desktop": "200px",
          "--hermes-offset-mobile": "76px",
          right: "var(--hermes-offset-desktop)",
          top: "1rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
