'use client';

import { useEffect, useRef, useState } from 'react';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function loadLeaflet(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    if ((window as any).L) return resolve((window as any).L);
    const existing = document.querySelector('script[data-leaflet]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L || null));
      return;
    }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.async = true;
    js.setAttribute('data-leaflet', '1');
    js.onload = () => resolve((window as any).L || null);
    js.onerror = () => resolve(null);
    document.body.appendChild(js);
  });
}

export default function LocationMap({
  lat,
  lng,
  title,
  zoom = 15,
  height = 280,
  interactive = false,
  onPick,
}: {
  lat: number;
  lng: number;
  title?: string;
  zoom?: number;
  height?: number;
  interactive?: boolean;
  onPick?: (coord: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (!L || cancelled || !containerRef.current) {
        if (!L) setFailed(true);
        return;
      }
      const c = containerRef.current!;
      if (mapRef.current) return;
      const map = L.map(c, { center: [lat, lng], zoom, dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, boxZoom: false, attributionControl: true });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([lat, lng]).addTo(map);
      if (title) marker.bindPopup(title);
      markerRef.current = marker;
      if (interactive && onPick) {
        map.on('click', (e: any) => {
          const { lat: la, lng: ln } = e.latlng;
          marker.setLatLng([la, ln]);
          onPick({ lat: la, lng: ln });
        });
      }
      // 容器尺寸在脚本加载后才确定，需 invalidateSize
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
    });
    return () => {
      cancelled = true;
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line

  // 坐标变化（非交互模式用于更新位置）
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || interactive) return;
    mapRef.current.setView([lat, lng], zoom);
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng, zoom, interactive]);

  if (failed) {
    return (
      <div
        className="rounded-2xl border border-ink-100 bg-ink-50 flex items-center justify-center text-center text-sm text-ink-600 px-4"
        style={{ height }}
      >
        地图组件加载失败，请检查网络后刷新
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="rounded-2xl overflow-hidden border border-ink-100 z-0"
    />
  );
}
