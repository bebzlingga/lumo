import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

type InlineNode = { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean };

// Tiny inline tokenizer for **bold**, *italic*/_italic_, `code`, ~~strike~~.
// Markers toggle styles via a small state machine; inside code spans other
// markers are treated literally.
function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let bold = false;
  let italic = false;
  let strike = false;
  let code = false;

  const flush = () => {
    if (buffer) {
      nodes.push({ text: buffer, bold, italic, strike, code });
      buffer = "";
    }
  };

  for (let i = 0; i < input.length; i += 1) {
    const two = input.slice(i, i + 2);

    if (code) {
      if (input[i] === "`") {
        flush();
        code = false;
      } else {
        buffer += input[i];
      }
      continue;
    }

    if (two === "**" || two === "__") {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }

    if (two === "~~") {
      flush();
      strike = !strike;
      i += 1;
      continue;
    }

    if (input[i] === "*" || input[i] === "_") {
      flush();
      italic = !italic;
      continue;
    }

    if (input[i] === "`") {
      flush();
      code = true;
      continue;
    }

    buffer += input[i];
  }

  flush();
  return nodes;
}

function InlineText({ value, style }: { value: string; style: StyleProp<any> }) {
  const { palette } = useLumo();
  const nodes = parseInline(value);

  return (
    <Text style={style}>
      {nodes.map((node, index) => (
        <Text
          key={index}
          style={[
            node.bold && styles.bold,
            node.italic && styles.italic,
            node.strike && styles.strike,
            node.code && [styles.code, { backgroundColor: palette.surface, color: palette.ink }]
          ]}
        >
          {node.text}
        </Text>
      ))}
    </Text>
  );
}

export function MarkdownView({ content, style, textColor }: { content: string; style?: StyleProp<ViewStyle>; textColor?: string }) {
  const { palette } = useLumo();
  const inkColor = textColor ?? palette.ink;
  const bodyColor = textColor ?? palette.body;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    const key = `line-${index}`;
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push(<View key={key} style={styles.spacer} />);
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const headingStyle = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      blocks.push(<InlineText key={key} value={heading[2]} style={[headingStyle, { color: inkColor }]} />);
      return;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      blocks.push(<View key={key} style={[styles.rule, { backgroundColor: palette.hairline }]} />);
      return;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(
        <View key={key} style={[styles.quote, { borderLeftColor: palette.greenSoft }]}>
          <InlineText value={quote[1]} style={[styles.paragraph, { color: palette.subtle }]} />
        </View>
      );
      return;
    }

    const ordered = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (ordered) {
      blocks.push(
        <View key={key} style={styles.listRow}>
          <Text style={[styles.bullet, { color: palette.subtle }]}>{ordered[1]}.</Text>
          <InlineText value={ordered[2]} style={[styles.paragraph, styles.listText, { color: bodyColor }]} />
        </View>
      );
      return;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <View key={key} style={styles.listRow}>
          <Text style={[styles.bullet, { color: palette.subtle }]}>•</Text>
          <InlineText value={bullet[1]} style={[styles.paragraph, styles.listText, { color: bodyColor }]} />
        </View>
      );
      return;
    }

    blocks.push(<InlineText key={key} value={trimmed} style={[styles.paragraph, { color: bodyColor }]} />);
  });

  return <View style={style}>{blocks}</View>;
}

const styles = StyleSheet.create({
  paragraph: {
    fontFamily: fontFamilies.lexend,
    fontSize: 16,
    lineHeight: 25,
    marginBottom: spacing.sm
  },
  h1: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 24,
    lineHeight: 31,
    marginBottom: spacing.sm,
    marginTop: spacing.xs
  },
  h2: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 27,
    marginBottom: spacing.sm,
    marginTop: spacing.xs
  },
  h3: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 17,
    lineHeight: 24,
    marginBottom: spacing.xs,
    marginTop: spacing.xs
  },
  listRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs
  },
  listText: {
    flex: 1,
    marginBottom: 0
  },
  bullet: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16,
    lineHeight: 25
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    marginBottom: spacing.sm
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md
  },
  spacer: {
    height: spacing.xs
  },
  bold: {
    fontFamily: fontFamilies.lexendBold
  },
  italic: {
    fontStyle: "italic"
  },
  strike: {
    textDecorationLine: "line-through"
  },
  code: {
    fontFamily: "Courier",
    borderRadius: 4,
    paddingHorizontal: 4
  }
});
