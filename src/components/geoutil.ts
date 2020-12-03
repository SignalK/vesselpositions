import { LatLngBoundsExpression, LatLngExpression, LatLngTuple } from "leaflet";

const toRadians = function(v:number) { return v * Math.PI / 180; };
const toDegrees = function(v:number) { return v * 180 / Math.PI; };
const radius = 6371e3; // (Mean) radius of earth

export const projectedLocation = (start:LatLngTuple, θ: number, distance:number): LatLngTuple => {
    const [lat, lon] = start

    // sinφ2 = sinφ1·cosδ + cosφ1·sinδ·cosθ
    // tanΔλ = sinθ·sinδ·cosφ1 / cosδ−sinφ1·sinφ2
    // see mathforum.org/library/drmath/view/52049.html for derivation

    const δ = Number(distance) / radius; // angular distance in radians

    const φ1 = toRadians(Number(lat));
    const λ1 = toRadians(Number(lon));

    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ), cosδ = Math.cos(δ);
    const sinθ = Math.sin(θ), cosθ = Math.cos(θ);

    const sinφ2 = sinφ1*cosδ + cosφ1*sinδ*cosθ;
    const φ2 = Math.asin(sinφ2);
    const y = sinθ * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);

    return [toDegrees(φ2), (toDegrees(λ2)+540)%360-180]; // normalise to −180..+180°
 }
