import { Text } from "react-native";
import { safeInlineMarks, toInlineSegments } from "@psico/types";

/**
 * A block's text with its editorial formatting, on mobile.
 *
 * Uses the SAME segmentation as the web reader — one shared pure function — so
 * an underline cannot mean one span of characters in a browser and a different
 * one on a phone. Offsets are the thing being interpreted, and two
 * interpretations of the same offsets is precisely the bug worth preventing.
 *
 * When a block carries no marks this returns the string unchanged, so every
 * chapter that exists today renders through exactly the path it renders through
 * now. Malformed metadata falls back to the same place rather than throwing:
 * losing emphasis is a blemish, losing the chapter is not.
 *
 * The block-level highlight tint stays OUTSIDE this, on the container, which is
 * how mobile already works. Editorial emphasis goes inside the text; the
 * reader's own mark stays around it.
 */
export function FormattedBlockText({
  content,
  meta,
}: {
  content: string;
  meta?: Record<string, unknown> | null;
}) {
  const marks = safeInlineMarks(meta ?? null, content);
  if (marks.length === 0) return <>{content}</>;

  return (
    <>
      {toInlineSegments(content, marks).map((segment, index) => {
        if (!segment.bold && !segment.italic && !segment.underline) {
          return <Text key={index}>{segment.text}</Text>;
        }
        return (
          <Text
            key={index}
            // Nested <Text> inherits the parent's typography, so this adds
            // emphasis to the block's own scale rather than replacing it — a
            // heading's bold has to stay heavier than a paragraph's.
            style={{
              fontWeight: segment.bold ? "700" : undefined,
              fontStyle: segment.italic ? "italic" : undefined,
              textDecorationLine: segment.underline ? "underline" : undefined,
            }}
          >
            {segment.text}
          </Text>
        );
      })}
    </>
  );
}
