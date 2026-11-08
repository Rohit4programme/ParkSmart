import React, { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { TrafficSegment } from '../../hooks/useNavigationEngine';
import { LatLng } from '../../utils/polyline';
import { extractOverviewCoordinates } from '../../services/routingService';

// ─── Navigation Route ────────────────────────────────────────────────────────
// Draws the road-following wayline from the routing API's decoded geometry.
// The geometry comes from the Google Routes library (`route.path` — array of
// LatLngAltitude), so the line always follows actual roads and intersections.

interface NavigationRouteProps {
  isNavigating: boolean;
  /** Raw routing result (REST JSON or JS API DirectionsResult) to render. */
  directionsResult: any;
  trafficSegments: TrafficSegment[];
  showTraffic: boolean;
  selectedRouteIndex: number;
  travelMode: 'DRIVING' | 'WALKING';
}

export const NavigationRoute: React.FC<NavigationRouteProps> = ({
  isNavigating,
  directionsResult,
  trafficSegments,
  showTraffic,
  selectedRouteIndex,
  travelMode,
}) => {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    // Remove the previous navigation route before adding a new one.
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (!map || !isNavigating || !directionsResult?.routes?.length) return;

    const routeIndex = Math.min(selectedRouteIndex, directionsResult.routes.length - 1);
    const route = directionsResult.routes[routeIndex];
    const path = extractOverviewCoordinates(route);
    console.log(`[NAV] Rendering route: ${path.length} road coordinates`);
    if (path.length < 2) return;

    const strokeColor = travelMode === 'WALKING' ? '#059669' : '#2563eb';

    polylineRef.current = new google.maps.Polyline({
      map,
      path,
      strokeColor,
      strokeWeight: 7,
      strokeOpacity: 0.9,
      zIndex: 100,
    });

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, isNavigating, directionsResult, selectedRouteIndex, travelMode]);

  return null;
};

// ─── Navigation Camera ───────────────────────────────────────────────────────
// Smooth camera controller with lerp interpolation, tilt in following mode,
// and heading lock. Never jumps.

interface NavigationCameraProps {
  isNavigating: boolean;
  cameraMode: 'overview' | 'following' | 'destination';
  userLocation: LatLng | null;
  destination: LatLng | null;
  heading: number | null;
  /** Route bounds for overview mode. */
  routeBounds: { northeast: LatLng; southwest: LatLng } | null;
}

export const NavigationCamera: React.FC<NavigationCameraProps> = ({
  isNavigating,
  cameraMode,
  userLocation,
  destination,
  heading,
  routeBounds,
}) => {
  const map = useMap();
  const lastUpdateRef = useRef<number>(0);
  const targetRef = useRef<{ lat: number; lng: number; zoom: number; heading: number | null } | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !isNavigating) return;

    const now = Date.now();
    // Throttle updates to 300ms for following mode, 800ms for overview
    const throttleMs = cameraMode === 'following' ? 300 : 800;
    if (now - lastUpdateRef.current < throttleMs) return;
    lastUpdateRef.current = now;

    if (cameraMode === 'following' && userLocation) {
      const target = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        zoom: 18,
        heading: heading,
      };
      targetRef.current = target;

      // Smooth pan with lerp
      const currentCenter = map.getCenter();
      if (currentCenter) {
        const curLat = currentCenter.lat();
        const curLng = currentCenter.lng();
        const newLat = curLat + (target.lat - curLat) * 0.3;
        const newLng = curLng + (target.lng - curLng) * 0.3;
        map.panTo({ lat: newLat, lng: newLng });
      } else {
        map.panTo(target);
      }

      map.setZoom(18);
      if (heading !== null && heading !== undefined) {
        map.setHeading(heading);
      }
    } else if (cameraMode === 'overview' && routeBounds) {
      const bounds = new google.maps.LatLngBounds(
        { lat: routeBounds.southwest.lat, lng: routeBounds.southwest.lng },
        { lat: routeBounds.northeast.lat, lng: routeBounds.northeast.lng }
      );
      map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
    } else if (cameraMode === 'destination' && destination) {
      map.panTo(destination);
      map.setZoom(20);
    }
  }, [map, isNavigating, cameraMode, userLocation, destination, heading, routeBounds]);

  return null;
};

// ─── Navigation Marker ───────────────────────────────────────────────────────
// User location marker with heading cone, accuracy circle, and destination marker.
// Smooth position updates via lerp interpolation.

interface NavigationMarkerProps {
  isNavigating: boolean;
  userLocation: LatLng | null;
  heading: number | null;
  destination: LatLng | null;
  destinationName?: string;
}

export const NavigationMarker: React.FC<NavigationMarkerProps> = ({
  isNavigating,
  userLocation,
  heading,
  destination,
  destinationName,
}) => {
  const map = useMap();
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const headingConeRef = useRef<google.maps.Polygon | null>(null);
  const lastPosRef = useRef<LatLng | null>(null);

  // ── Creation effect: create/destroy markers only when map/isNavigating change ──
  useEffect(() => {
    if (!map) return;

    if (!isNavigating) {
      cleanupMarkers(userMarkerRef, destMarkerRef, accuracyCircleRef, headingConeRef, lastPosRef);
      return;
    }

    // User marker
    userMarkerRef.current = new google.maps.Marker({
      position: userLocation ?? { lat: 0, lng: 0 },
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      },
      zIndex: 100,
    });

    accuracyCircleRef.current = new google.maps.Circle({
      center: userLocation ?? { lat: 0, lng: 0 },
      radius: 20,
      map,
      fillColor: '#2563eb',
      fillOpacity: 0.1,
      strokeColor: '#2563eb',
      strokeOpacity: 0.3,
      strokeWeight: 1,
      clickable: false,
    });

    // Destination marker
    if (destination) {
      destMarkerRef.current = new google.maps.Marker({
        position: destination,
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        title: destinationName,
        zIndex: 90,
      });
    }

    return () => {
      cleanupMarkers(userMarkerRef, destMarkerRef, accuracyCircleRef, headingConeRef, lastPosRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isNavigating]);

  // ── Update effect: update marker positions on every GPS tick (no destroy/recreate) ──
  useEffect(() => {
    if (!map || !isNavigating || !userLocation) return;

    // Smooth position with lerp
    let pos = userLocation;
    if (lastPosRef.current) {
      const lerpFactor = 0.4;
      pos = {
        lat: lastPosRef.current.lat + (userLocation.lat - lastPosRef.current.lat) * lerpFactor,
        lng: lastPosRef.current.lng + (userLocation.lng - lastPosRef.current.lng) * lerpFactor,
      };
    }
    lastPosRef.current = pos;

    userMarkerRef.current?.setPosition(pos);
    accuracyCircleRef.current?.setCenter(pos);

    // Destination position updates
    if (destination) {
      if (!destMarkerRef.current && map) {
        destMarkerRef.current = new google.maps.Marker({
          position: destination,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          title: destinationName,
          zIndex: 90,
        });
      } else {
        destMarkerRef.current?.setPosition(destination);
      }
    }

    // ── Heading cone ──
    if (heading !== null && heading !== undefined) {
      if (headingConeRef.current) {
        headingConeRef.current.setMap(null);
        headingConeRef.current = null;
      }

      const dist = 0.0002;
      const angle = (heading * Math.PI) / 180;
      const leftAngle = angle - Math.PI / 6;
      const rightAngle = angle + Math.PI / 6;

      const tip = {
        lat: pos.lat + dist * Math.cos(angle),
        lng: pos.lng + dist * Math.sin(angle),
      };
      const left = {
        lat: pos.lat + dist * 0.3 * Math.cos(leftAngle),
        lng: pos.lng + dist * 0.3 * Math.sin(leftAngle),
      };
      const right = {
        lat: pos.lat + dist * 0.3 * Math.cos(rightAngle),
        lng: pos.lng + dist * 0.3 * Math.sin(rightAngle),
      };

      headingConeRef.current = new google.maps.Polygon({
        paths: [tip, left, right],
        map,
        fillColor: '#2563eb',
        fillOpacity: 0.4,
        strokeColor: '#2563eb',
        strokeOpacity: 0.6,
        strokeWeight: 1,
        clickable: false,
      });
    }
  }, [map, isNavigating, userLocation, heading, destination, destinationName]);

  return null;
};

function cleanupMarkers(
  userMarkerRef: React.MutableRefObject<google.maps.Marker | null>,
  destMarkerRef: React.MutableRefObject<google.maps.Marker | null>,
  accuracyCircleRef: React.MutableRefObject<google.maps.Circle | null>,
  headingConeRef: React.MutableRefObject<google.maps.Polygon | null>,
  lastPosRef: React.MutableRefObject<LatLng | null>
) {
  userMarkerRef.current?.setMap(null);
  destMarkerRef.current?.setMap(null);
  accuracyCircleRef.current?.setMap(null);
  headingConeRef.current?.setMap(null);
  userMarkerRef.current = null;
  destMarkerRef.current = null;
  accuracyCircleRef.current = null;
  headingConeRef.current = null;
  lastPosRef.current = null;
}
