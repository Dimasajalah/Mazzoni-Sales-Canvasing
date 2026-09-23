//frontend/src/components/VisitsMap.jsx
import { useRef, useState } from "react";
import { GoogleMap, Marker, Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "../lib/googleMaps";

const containerStyle = { width: "100%", height: "220px", borderRadius: "12px", marginBottom: 14 };
const defaultCenter = { lat: -6.2, lng: 106.816666 };

export default function VisitsMap({ visits }) {
    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const autocompleteRef = useRef(null);
    const [mapCenter, setMapCenter] = useState(null);
    const [selectedId, setSelectedId] = useState(null);

    const handlePlaceChanged = () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        setMapCenter({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
    };

    const points = visits
        .map((v) => ({
            id: v.id,
            lat: v.checkin_lat ?? v.latitude ?? v.lat,
            lng: v.checkin_lng ?? v.longitude ?? v.lng,
            name: v.customer?.name || v.customer_name || v.cust,
        }))
        .filter((p) => p.lat != null && p.lng != null);

    if (!isLoaded) return <div>Loading map…</div>;
    if (points.length === 0) return null;

    const center = points[0] ? { lat: points[0].lat, lng: points[0].lng } : defaultCenter;

    return (
        <div>
            <Autocomplete onLoad={(ac) => (autocompleteRef.current = ac)} onPlaceChanged={handlePlaceChanged}>
                <input
                    type="text"
                    placeholder="Cari lokasi…"
                    style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
                />
            </Autocomplete>
            <GoogleMap mapContainerStyle={containerStyle} center={mapCenter || center} zoom={13}>
                {points.map((p) => (
                    <Marker
                        key={p.id}
                        position={{ lat: p.lat, lng: p.lng }}
                        title={p.name}
                        onClick={() => setSelectedId(p.id)}
                        icon={
                            selectedId === p.id
                                ? { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#EA4335", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
                                : undefined
                        }
                    />
                ))}
            </GoogleMap>
        </div>
    );
}