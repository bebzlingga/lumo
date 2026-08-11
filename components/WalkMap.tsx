import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import type { WalkPoint } from "@/lib/walk";

/**
 * The walk route on a map.
 *
 * `react-native-maps` is loaded through the deferred-require pattern from
 * `lib/orientation.ts`: it resolves native views at import time, so a plain
 * top-level import crashes any build made before the module was linked. Here
 * that would take down the whole Walk screen — including the stats and the
 * controls, which work perfectly well without a map. Missing module renders a
 * placeholder instead.
 */
type MapsModule = typeof import("react-native-maps");

let mapsModule: MapsModule | null | undefined;

function loadMaps(): MapsModule | null {
  if (mapsModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mapsModule = require("react-native-maps") as MapsModule;
    } catch {
      mapsModule = null;
    }
  }

  return mapsModule;
}

export function canShowMap(): boolean {
  return loadMaps() !== null;
}

/** Latitude padding around a route so the polyline is not flush to the edges. */
const EDGE_PADDING = 0.0012;

/**
 * The region that contains a route.
 *
 * Falls back to a tight box around the last point when there is only one — a
 * zero-span region renders as a fully zoomed-out world map, which reads as
 * broken rather than as "one fix so far".
 */
function regionFor(points: WalkPoint[]) {
  if (points.length === 0) {
    return null;
  }

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, EDGE_PADDING) * 1.4,
    longitudeDelta: Math.max(maxLon - minLon, EDGE_PADDING) * 1.4
  };
}

export function WalkMap({
  route,
  accent,
  showRecenter = true,
  /** Lifts the Re-center button clear of whatever floats over the map's foot. */
  recenterBottom,
  /**
   * Controlled follow mode.
   *
   * Pass both to move the Re-center control somewhere else — a page bar, say —
   * and the map stops owning the state. Omit them and it keeps its own, which
   * is what every other caller wants.
   */
  following: followingProp,
  onFollowChange,
  style
}: {
  route: WalkPoint[];
  accent: string;
  /** False for a static preview — history cards have nothing to re-centre. */
  showRecenter?: boolean;
  recenterBottom?: number;
  following?: boolean;
  onFollowChange?: (next: boolean) => void;
  style?: object;
}) {
  const { palette, isDark } = useLumo();
  const maps = loadMaps();
  const mapRef = React.useRef<InstanceType<NonNullable<MapsModule["default"]>> | null>(null);
  /**
   * Whether the map still follows the walk.
   *
   * Cleared the moment the user drags. A map that snaps back to the current
   * position while someone is trying to look at where they have been is the
   * single most irritating thing a tracking app does, so panning wins until
   * Re-centre is pressed.
   */
  const [ownFollowing, setOwnFollowing] = React.useState(true);
  const following = followingProp ?? ownFollowing;
  const setFollowing = React.useCallback(
    (next: boolean) => {
      setOwnFollowing(next);
      onFollowChange?.(next);
    },
    [onFollowChange]
  );

  const region = regionFor(route);

  React.useEffect(() => {
    if (!following || !region || !mapRef.current) {
      return;
    }

    mapRef.current.animateToRegion(region, 400);
  }, [following, region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

  if (!maps) {
    return (
      <View style={[styles.placeholder, { backgroundColor: palette.surface }, style]}>
        <Icon name="target" size={22} color={palette.muted} weight="bulk" />
        <AppText variant="caption" color={palette.muted} style={styles.placeholderText}>
          The map needs a new build of Lumo. Your route is still being recorded.
        </AppText>
      </View>
    );
  }

  const MapView = maps.default;
  const { Polyline, Marker } = maps;

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region ?? undefined}
        /**
         * Light and muted, always.
         *
         * `mutedStandard` is Apple's desaturated map — roads and labels step
         * back so the route is the loudest thing on it, which is the whole
         * point of drawing it. `userInterfaceStyle` pins it to the light map
         * even in dark mode: this map sits inside a card on a cream screen, and
         * a black map in that hole reads as a photograph of somewhere else.
         *
         * Both are iOS/Apple Maps; Google falls back to the standard map, which
         * is already light.
         */
        mapType="mutedStandard"
        userInterfaceStyle="light"
        // Everything the map wants to tell you about, off. Shops, buildings,
        // traffic and indoor floor plans are all things to read, and this map
        // is here to be glanced at — the route is the only content.
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsScale={false}
        // The blue dot is the OS's own and needs no polling from us.
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // `onPanDrag` fires for a finger drag but not for our own
        // `animateToRegion`, which is what makes it the right signal for
        // "the user took over".
        onPanDrag={() => setFollowing(false)}
        accessibilityLabel="Map of your walk"
      >
        {route.length > 1 ? <Polyline coordinates={route.map((point) => ({ latitude: point.lat, longitude: point.lon }))} strokeColor={accent} strokeWidth={5} lineCap="round" lineJoin="round" /> : null}
        {route.length > 0 ? (
          <Marker
            coordinate={{ latitude: route[0].lat, longitude: route[0].lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel="Where your walk started"
          >
            <View style={[styles.pin, { backgroundColor: palette.greenActive, borderColor: palette.white }]} />
          </Marker>
        ) : null}
      </MapView>

      {showRecenter && !following ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Re-center the map on your walk"
          onPress={() => setFollowing(true)}
          style={({ pressed }) => [
            styles.recenter,
            recenterBottom === undefined ? null : { bottom: recenterBottom },
            { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.8 : 1 }
          ]}
        >
          <Icon name="target" size={14} color={palette.ink} weight="bold" />
          <AppText variant="caption" color={palette.ink}>
            Re-center
          </AppText>
        </Pressable>
      ) : null}

      {/* Softens the map's own colours into the card it sits in. */}
      <View pointerEvents="none" style={[styles.edge, { borderColor: alpha(palette.hairline, "60") }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderRadius: radius.card
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.card
  },
  placeholderText: {
    textAlign: "center"
  },
  pin: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    borderWidth: 3
  },
  recenter: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card
  }
});
