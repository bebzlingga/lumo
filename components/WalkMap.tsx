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
 * The span held while following a position, in degrees — about 350 m across.
 *
 * Close enough to see which side of the street you took, wide enough that a
 * brisk walk does not outrun the frame between fixes.
 */
const FOLLOW_SPAN = 0.0032;

/**
 * How far the followed position sits ABOVE the middle of the map, as a share of
 * the span.
 *
 * The lower half of the tracking screen is cards. Centring the walker in the
 * map's own middle puts them behind those, so the region is centred SOUTH of
 * them — north is up, so a position north of centre draws higher up the screen
 * — leaving what is ahead of you visible instead of what is under a card.
 */
const FOLLOW_BIAS = 0.2;

/**
 * The region that contains a route.
 *
 * Falls back to a tight box around the last point when there is only one — a
 * zero-span region renders as a fully zoomed-out world map, which reads as
 * broken rather than as "one fix so far".
 */
function regionFor(points: WalkPoint[], center?: { lat: number; lon: number } | null) {
  if (points.length === 0) {
    /**
     * No fixes yet, but we know roughly where the phone is.
     *
     * This is the case that produced a map of the whole country: with no region
     * at all, the platform opens fully zoomed out. A tight box around the last
     * known position is the honest starting frame — it is where the walk is
     * about to happen.
     */
    return center
      ? { latitude: center.lat, longitude: center.lon, latitudeDelta: EDGE_PADDING * 4, longitudeDelta: EDGE_PADDING * 4 }
      : null;
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
  /** Where to look before the first fix joins the route. */
  center,
  /**
   * What the camera frames.
   *
   * `route` fits the whole line — right for a finished walk, where the shape is
   * the subject. `position` keeps you in the middle at a fixed zoom, which is
   * what you want WHILE walking: a camera that pulls back to fit a growing
   * route ends the hour showing a city and a thread.
   */
  frame = "route",
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
  /**
   * The wash over the tiles. On where the map is a SURFACE, off where it is the
   * subject — see the note where it is drawn.
   */
  scrim = true,
  style
}: {
  route: WalkPoint[];
  accent: string;
  /** False for a static preview — history cards have nothing to re-centre. */
  showRecenter?: boolean;
  center?: { lat: number; lon: number } | null;
  frame?: "route" | "position";
  recenterBottom?: number;
  following?: boolean;
  onFollowChange?: (next: boolean) => void;
  scrim?: boolean;
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

  /** The head of the route, or the last known position before there is one. */
  const here = route.length > 0 ? { lat: route[route.length - 1].lat, lon: route[route.length - 1].lon } : (center ?? null);
  const routeRegion = regionFor(route, center);
  const region =
    frame === "position" && here
      ? {
          latitude: here.lat - FOLLOW_SPAN * FOLLOW_BIAS,
          longitude: here.lon,
          latitudeDelta: FOLLOW_SPAN,
          longitudeDelta: FOLLOW_SPAN
        }
      : routeRegion;

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
        /**
         * The platform's blue dot is OFF, and we draw our own instead.
         *
         * It cannot be recoloured, and a system-blue dot on a route drawn in
         * the walk's own colour reads as two different things happening on one
         * map. Ours is the same colour as the line it is at the end of.
         *
         * The cost is that it only moves when a fix is ACCEPTED — the OS dot
         * updates on every raw fix. That is the honest position anyway: it is
         * where the route has reached.
         */
        showsUserLocation={false}
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
            {/* The route's own colour, not the app's green. Two colours on one
                map read as two different things being marked; the start and the
                head of the line are the same walk. */}
            <View style={[styles.pin, { backgroundColor: accent, borderColor: palette.white }]} />
          </Marker>
        ) : null}

        {/* Where you are now: the head of the route, in the route's own colour,
            with a soft halo so it reads as a position rather than a dot on the
            line. Falls back to `center` before the route has a point. */}
        {here ? (
          <Marker coordinate={{ latitude: here.lat, longitude: here.lon }} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="Where you are">
            <View style={[styles.hereHalo, { backgroundColor: alpha(accent, "33") }]}>
              <View style={[styles.here, { backgroundColor: accent, borderColor: palette.white }]} />
            </View>
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

      {/* Holds the map back so it reads as a surface the walk is drawn on
          rather than a Maps app someone opened. The route keeps its full
          strength; only what is underneath is quietened.

          Off where the map is the thing being looked at rather than the ground
          under something else. On the live screen the readout, the hint and the
          card all sit over these tiles and the wash is what keeps them legible;
          on a finished walk there is nothing over it, and quietening the streets
          only makes the route harder to place. */}
      {scrim ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: alpha(palette.canvas, isDark ? "59" : "4D") }]} />
      ) : null}
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
  hereHalo: {
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: radius.pill
  },
  here: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5
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
