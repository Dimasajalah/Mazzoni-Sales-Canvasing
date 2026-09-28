// frontend/src/components/LocationPicker.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "../lib/googleMaps";

const containerStyle = { width: "100%", height: "400px", borderRadius: "14px 14px 0 0" };
const defaultCenter = { lat: -6.2, lng: 106.816666 }; // default: Jakarta

const mapOptions = {
  mapTypeControl: true,
  fullscreenControl: true,
  streetViewControl: true,
  zoomControl: false,
  clickableIcons: true,
  keyboardShortcuts: true,
};

export default function LocationPicker({ value, onChange, onAddressChange }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [position, setPosition] = useState(value || defaultCenter);
  const [mapRef, setMapRef] = useState(null);
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [address, setAddress] = useState("");
  const [focused, setFocused] = useState(false);
  const autocompleteServiceRef = useRef(null);
  const geocoderRef = useRef(null);

  useEffect(() => {
    if (value && (value.lat !== position.lat || value.lng !== position.lng)) {
      setPosition(value);
      if (mapRef) mapRef.panTo(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (isLoaded && window.google) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
    }
  }, [isLoaded]);

  const reverseGeocode = useCallback((lat, lng) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const formatted = results[0].formatted_address;
        setAddress(formatted);
        onAddressChange?.(formatted);
      }
    });
  }, [onAddressChange]);

  useEffect(() => {
    if (isLoaded) reverseGeocode(position.lat, position.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const updatePosition = useCallback(
    (lat, lng) => {
      const next = { lat, lng };
      setPosition(next);
      onChange?.(next);
      reverseGeocode(lat, lng);
    },
    [onChange, reverseGeocode]
  );

  const handleMapClick = useCallback(
    (e) => updatePosition(e.latLng.lat(), e.latLng.lng()),
    [updatePosition]
  );

  const handleMarkerDragEnd = useCallback(
    (e) => updatePosition(e.latLng.lat(), e.latLng.lng()),
    [updatePosition]
  );

  const handleQueryChange = (text) => {
    setQuery(text);
    if (!text || !autocompleteServiceRef.current) {
      setPredictions([]);
      return;
    }
    autocompleteServiceRef.current.getPlacePredictions(
      { input: text, componentRestrictions: { country: "id" } },
      (results) => setPredictions(results || [])
    );
  };

  const handleSelectPrediction = (prediction) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status !== "OK" || !results?.[0]) return;
      const loc = results[0].geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();
      updatePosition(lat, lng);
      if (mapRef) {
        mapRef.panTo({ lat, lng });
        mapRef.setZoom(17);
      }
      onAddressChange?.(prediction.description);
      setQuery("");
      setPredictions([]);
    });
  };

  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Search box */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#F8FAFD",
            border: `1.5px solid ${focused ? "var(--orange)" : "var(--stroke)"}`,
            borderRadius: 12,
            padding: "11px 14px",
            transition: "border-color .15s",
          }}
        >
          <span style={{ opacity: 0.5 }}>🔍</span>
          <input
            type="text"
            placeholder="Cari alamat…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "none",
              fontSize: 13,
              fontFamily: "inherit",
              color: "var(--text)",
            }}
          />
        </div>

        {predictions.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "calc(100% + 4px)",
              zIndex: 30,
              background: "#fff",
              border: "1px solid var(--stroke)",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(16,32,64,.12)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {predictions.map((p) => (
              <div
                key={p.place_id}
                onClick={() => handleSelectPrediction(p)}
                role="button"
                tabIndex={0}
                style={{
                  padding: "11px 14px",
                  fontSize: 12.5,
                  borderBottom: "1px solid var(--stroke)",
                  cursor: "pointer",
                }}
              >
                {p.description}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Peta + bar koordinat menyatu di bawahnya */}
      <div
        style={{
          borderRadius: 14,
          overflow: "hidden",
          border: "1.5px solid var(--stroke)",
        }}
      >
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={position}
          zoom={16}
          options={mapOptions}
          onClick={handleMapClick}
          onLoad={(map) => setMapRef(map)}
        >
          <Marker position={position} draggable onDragEnd={handleMarkerDragEnd} />
        </GoogleMap>

        <div
          style={{
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            fontFamily: "monospace",
            padding: "6px 12px",
            textAlign: "center",
            letterSpacing: 0.2,
          }}
        >
          {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
      </div>

      {/* Kartu alamat — di bawah peta, gaya Grab/Gojek */}
      <div
        style={{
          marginTop: 14,
          background: "var(--card)",
          border: "1.5px solid var(--orange)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          boxShadow: "0 4px 14px rgba(238,106,10,.12)",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: "20px" }}>📍</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
            {address || "Menentukan alamat…"}
          </div>
        </div>
      </div>
    </div>
  );
}