import { Image, StyleSheet, Text, View } from "react-native";
import type { ImageBlockInfo } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import { assetUrl } from "@/lib/asset-url";

/**
 * An illustration inside a chapter — the mobile half of the pair.
 *
 * Same `imageBlockInfo` contract as web, so a published figure is the same
 * figure on both. `resizeMode="contain"` with a fixed aspect box keeps a tall
 * diagram from being cropped: an editorial figure that loses its bottom third
 * is worse than one that leaves whitespace.
 *
 * `alt` becomes the accessibility label, which is why the contract refuses to
 * yield an image without it.
 */
export function ImageBlock({ info }: { info: ImageBlockInfo }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: assetUrl(info.imageUrl) }}
        style={styles.image}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={info.alt}
      />
      {(info.caption || info.credit) && (
        <Text style={styles.caption}>
          {info.caption}
          {info.caption && info.credit ? " · " : ""}
          {info.credit ? (
            <Text style={styles.credit}>{info.credit}</Text>
          ) : null}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: Spacing.lg },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[100],
  },
  caption: {
    marginTop: Spacing.xs,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.warm[600],
  },
  credit: { color: Colors.warm[500] },
});
