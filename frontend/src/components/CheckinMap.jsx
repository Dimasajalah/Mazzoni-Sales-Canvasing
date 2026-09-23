//frontend/src/components/CheckinMap.jsx
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "../lib/googleMaps";

const containerStyle = { width: "100%", height: "200px", borderRadius: "12px" };

export default function CheckinMap({ userCoords, customerCoords }) {
    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES,
    });
    if (!isLoaded) return <div>Loading map…</div>;
    if (!userCoords && !customerCoords) return null;

    const center = userCoords || customerCoords;

    return (
        <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={15}>
            {userCoords && (
                <Marker
                    position={userCoords}
                    title="Lokasi Anda"
                    icon={{
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: "#4285F4",
                        fillOpacity: 1,
                        strokeColor: "#fff",
                        strokeWeight: 2,
                    }}
                />
            )}
            {customerCoords && <Marker position={customerCoords} title="Lokasi Customer" />}
            {userCoords && customerCoords && (
                <Polyline
                    path={[userCoords, customerCoords]}
                    options={{ strokeColor: "#EA4335", strokeOpacity: 0.7, strokeWeight: 2 }}
                />
            )}
        </GoogleMap>
    );
}