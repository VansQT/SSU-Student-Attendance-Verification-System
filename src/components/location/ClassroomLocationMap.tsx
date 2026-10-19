import React from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const locationPinIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;background:#1d4ed8;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px #0f172a80"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

interface ClassroomLocationMapProps {
  position: [number, number];
  radiusMeters: number;
  onPositionChange: (position: [number, number]) => void;
}

const LocationPicker: React.FC<ClassroomLocationMapProps> = ({ position, radiusMeters, onPositionChange }) => {
  useMapEvents({
    click: event => onPositionChange([event.latlng.lat, event.latlng.lng]),
  });

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Circle
        center={position}
        radius={radiusMeters}
        pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.16 }}
      />
      <Marker
        position={position}
        icon={locationPinIcon}
        draggable
        eventHandlers={{
          dragend: event => {
            const { lat, lng } = (event.target as L.Marker).getLatLng();
            onPositionChange([lat, lng]);
          },
        }}
      />
    </>
  );
};

export const ClassroomLocationMap: React.FC<ClassroomLocationMapProps> = props => (
  <MapContainer
    center={props.position}
    zoom={18}
    scrollWheelZoom
    className="h-full w-full"
  >
    <LocationPicker {...props} />
  </MapContainer>
);
