"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Car, Train, Bike, Footprints, MapPin, Clock, Navigation, Search } from "lucide-react";

type TravelModeOption = "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";

type SearchResult = {
    point: google.maps.LatLng;
    distanceMeters: number;
    durationSeconds: number;
    bearingDeg: number;
};

const MAP_LIBRARIES = ["geometry"] as any;

const AVERAGE_SPEED_KMH: Record<TravelModeOption, number> = {
    DRIVING: 70,
    WALKING: 5,
    BICYCLING: 15,
    TRANSIT: 40,
};

const TRAVEL_MODE_CONFIG = {
    DRIVING: { label: "車", icon: Car, color: "text-blue-600" },
    TRANSIT: { label: "公共交通機関", icon: Train, color: "text-green-600" },
    BICYCLING: { label: "自転車", icon: Bike, color: "text-orange-600" },
    WALKING: { label: "徒歩", icon: Footprints, color: "text-purple-600" },
} as const;

function secondsUntilEndOfToday(): number {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

function formatKm(meters: number): string {
    return (meters / 1000).toFixed(1) + " km";
}

export default function AsFarAsPossible() {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const currentMarkerRef = useRef<google.maps.Marker | null>(null);
    const farthestMarkerRef = useRef<google.maps.Marker | null>(null);
    const raysPolylineRef = useRef<google.maps.Polyline[]>([]);
    const bestLineRef = useRef<google.maps.Polyline | null>(null);

    const [mapsReady, setMapsReady] = useState(false);
    const [origin, setOrigin] = useState<google.maps.LatLng | null>(null);
    const [mode, setMode] = useState<TravelModeOption>("DRIVING");
    const [bearings, setBearings] = useState<number>(8); // 方位分割数
    const [timeBudgetSec, setTimeBudgetSec] = useState<number>(secondsUntilEndOfToday());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<SearchResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Google Maps の読み込みと初期化
    useEffect(() => {
        if (!mapDivRef.current) return;
        const loader = new Loader({
            apiKey: apiKey ?? "",
            version: "weekly",
            libraries: MAP_LIBRARIES,
            language: "ja",
            region: "JP",
        });

        let canceled = false;
        loader
            .load()
            .then(() => {
                if (canceled) return;
                setMapsReady(true);
                // 現在地取得
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            if (canceled) return;
                            const center = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
                            initMap(center);
                        },
                        (err) => {
                            console.warn("Geolocation error", err);
                            // 東京駅をフォールバック
                            const center = new google.maps.LatLng(35.681236, 139.767125);
                            initMap(center);
                        }
                    );
                } else {
                    const center = new google.maps.LatLng(35.681236, 139.767125);
                    initMap(center);
                }
            })
            .catch((e) => {
                console.error(e);
                setError("Google Maps の読み込みに失敗しました。");
            });

        function initMap(center: google.maps.LatLng) {
            setOrigin(center);
            const map = new google.maps.Map(mapDivRef.current as HTMLDivElement, {
                center,
                zoom: 12,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
            });
            mapRef.current = map;
            // 現在地マーカー
            currentMarkerRef.current = new google.maps.Marker({
                map,
                position: center,
                title: "現在地",
            });
        }

        return () => {
            canceled = true;
        };
    }, [apiKey]);

    const directionsService = useMemo(() => {
        if (!mapsReady) return null;
        return new google.maps.DirectionsService();
    }, [mapsReady]);

    function clearOverlays() {
        for (const pl of raysPolylineRef.current) pl.setMap(null);
        raysPolylineRef.current = [];
        if (farthestMarkerRef.current) {
            farthestMarkerRef.current.setMap(null);
            farthestMarkerRef.current = null;
        }
        if (bestLineRef.current) {
            bestLineRef.current.setMap(null);
            bestLineRef.current = null;
        }
    }

    async function getDurationSeconds(origin: google.maps.LatLng, destination: google.maps.LatLng, travelMode: TravelModeOption, departure: Date): Promise<number | null> {
        if (!directionsService) return null;
        return new Promise((resolve) => {
            directionsService.route(
                {
                    origin,
                    destination,
                    travelMode: google.maps.TravelMode[travelMode],
                    provideRouteAlternatives: false,
                    ...(travelMode === "DRIVING"
                        ? { drivingOptions: { departureTime: departure, trafficModel: google.maps.TrafficModel.BEST_GUESS } }
                        : {}),
                    ...(travelMode === "TRANSIT" ? { transitOptions: { departureTime: departure } } : {}),
                },
                (result, status) => {
                    if (status !== google.maps.DirectionsStatus.OK || !result || !result.routes[0]?.legs[0]) {
                        return resolve(null);
                    }
                    const leg = result.routes[0].legs[0];
                    const sec = (leg.duration_in_traffic?.value ?? leg.duration?.value) ?? null;
                    resolve(sec);
                }
            );
        });
    }

    function computeOffset(from: google.maps.LatLng, distanceMeters: number, headingDeg: number): google.maps.LatLng {
        return google.maps.geometry.spherical.computeOffset(from, distanceMeters, headingDeg);
    }

    async function findFarthestOnBearing(originLL: google.maps.LatLng, bearingDeg: number, travelMode: TravelModeOption, timeBudgetSeconds: number): Promise<SearchResult | null> {
        const depart = new Date();
        // 初期上限距離をざっくり設定（平均速度×時間×0.8）
        const hours = timeBudgetSeconds / 3600;
        const avgKm = AVERAGE_SPEED_KMH[travelMode] * hours * 0.8;
        let low = 0;
        let high = Math.max(1_000, Math.floor(avgKm * 1000)); // meters
        let bestPoint: google.maps.LatLng | null = null;
        let bestDist = 0;
        let bestSec = 0;

        // high が到達不能かチェック、もし到達可能なら上限を倍々で引き上げ（最大数回）
        for (let i = 0; i < 3; i++) {
            const cand = computeOffset(originLL, high, bearingDeg);
            const sec = await getDurationSeconds(originLL, cand, travelMode, depart);
            if (sec == null) break;
            if (sec <= timeBudgetSeconds) {
                bestPoint = cand;
                bestDist = high;
                bestSec = sec;
                high *= 2;
            } else {
                break;
            }
        }

        // 二分探索（回数制限）
        for (let iter = 0; iter < 7; iter++) {
            const mid = Math.floor((low + high) / 2);
            if (mid === low) break;
            const cand = computeOffset(originLL, mid, bearingDeg);
            const sec = await getDurationSeconds(originLL, cand, travelMode, depart);
            if (sec == null) break;
            if (sec <= timeBudgetSeconds) {
                low = mid;
                bestPoint = cand;
                bestDist = mid;
                bestSec = sec;
            } else {
                high = mid;
            }
        }

        if (!bestPoint) return null;
        return { point: bestPoint, distanceMeters: bestDist, durationSeconds: bestSec, bearingDeg };
    }

    async function runSearch() {
        setError(null);
        if (!mapsReady || !origin) {
            setError("地図が準備できていません。");
            return;
        }
        if (!apiKey) {
            setError("環境変数 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY を設定してください。");
            return;
        }
        setBusy(true);
        clearOverlays();

        try {
            const results: SearchResult[] = [];
            const step = 360 / bearings;
            for (let i = 0; i < bearings; i++) {
                const bearing = i * step;
                const r = await findFarthestOnBearing(origin, bearing, mode, timeBudgetSec);
                if (r) results.push(r);
                // 描画（放射線）
                if (r && mapRef.current) {
                    const line = new google.maps.Polyline({
                        map: mapRef.current,
                        path: [origin, r.point],
                        strokeColor: "#3b82f6",
                        strokeOpacity: 0.4,
                        strokeWeight: 2,
                    });
                    raysPolylineRef.current.push(line);
                }
            }

            if (results.length === 0) {
                setError("到達可能な地点を見つけられませんでした。");
                return;
            }

            // 最遠点を選択
            let best = results[0];
            for (const r of results) if (r.distanceMeters > best.distanceMeters) best = r;
            setResult(best);

            if (mapRef.current) {
                if (farthestMarkerRef.current) farthestMarkerRef.current.setMap(null);
                farthestMarkerRef.current = new google.maps.Marker({
                    map: mapRef.current,
                    position: best.point,
                    title: "今日中に到達可能な最遠点",
                    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#b91c1c", strokeWeight: 2 },
                });
                // 最良ラインを強調
                bestLineRef.current = new google.maps.Polyline({
                    map: mapRef.current,
                    path: [origin, best.point],
                    strokeColor: "#ef4444",
                    strokeOpacity: 0.9,
                    strokeWeight: 3,
                });
                mapRef.current.fitBounds(new google.maps.LatLngBounds().extend(origin).extend(best.point), 64);
            }
        } catch (e) {
            console.error(e);
            setError("探索中にエラーが発生しました。");
        } finally {
            setBusy(false);
        }
    }

    const selectedModeConfig = TRAVEL_MODE_CONFIG[mode];
    const ModeIcon = selectedModeConfig.icon;

    return (
        <div className="grid grid-rows-[auto_1fr] h-screen gap-2 bg-gray-50">
            {/* Header Controls */}
            <div className="bg-white shadow-sm border-b">
                <div className="p-4">
                    <div className="flex items-center gap-3 mb-6">
                        <MapPin className="w-6 h-6 text-red-500" />
                        <h1 className="text-xl font-bold text-gray-800">今日中に行ける一番遠い場所</h1>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        {/* Travel Mode Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">移動手段</label>
                            <div className="relative">
                                <select
                                    value={mode}
                                    onChange={(e) => setMode(e.target.value as TravelModeOption)}
                                    className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none"
                                >
                                    {Object.entries(TRAVEL_MODE_CONFIG).map(([value, config]) => (
                                        <option key={value} value={value}>
                                            {config.label}
                                        </option>
                                    ))}
                                </select>
                                <ModeIcon className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${selectedModeConfig.color} pointer-events-none`} />
                            </div>
                        </div>

                        {/* Search Divisions */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">探索分割数</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={6}
                                    max={24}
                                    step={1}
                                    value={bearings}
                                    onChange={(e) => setBearings(Math.max(6, Math.min(24, Number(e.target.value) || 8)))}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <Navigation className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* Time Budget */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">残り時間</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formatDuration(timeBudgetSec)}
                                    readOnly
                                    className="w-full p-3 pr-10 bg-gray-100 border border-gray-300 rounded-lg text-gray-700"
                                />
                                <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* Search Button */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 opacity-0">ボタン</label>
                            <button
                                onClick={runSearch}
                                disabled={!mapsReady || !origin || busy}
                                className="w-full p-3 bg-gray-900 text-white rounded-lg font-medium transition-all duration-200 hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {busy ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        探索中...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4" />
                                        探索開始
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span className="text-red-700 text-sm font-medium">{error}</span>
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {result && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="font-medium text-gray-700">距離:</span>
                                    <span className="text-green-700 font-semibold">{formatKm(result.distanceMeters)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-green-600" />
                                    <span className="font-medium text-gray-700">想定所要時間:</span>
                                    <span className="text-green-700 font-semibold">{formatDuration(result.durationSeconds)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Navigation className="w-4 h-4 text-green-600" />
                                    <span className="font-medium text-gray-700">方位:</span>
                                    <span className="text-green-700 font-semibold">{Math.round(result.bearingDeg)}°</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Map Container */}
            <div className="relative overflow-hidden">
                <div ref={mapDivRef} className="w-full h-full" />
            </div>
        </div>
    );
}