import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  Marker as LeafletMarker,
  Icon as LeafletIcon,
  DivIcon,
  LatLngExpression,
} from "leaflet";
import { MapLayer, MapLayerProps } from "react-leaflet";
import { withLeaflet } from "react-leaflet";

interface SVGMarkerProps extends MapLayerProps {
  position?: LatLngExpression;
  course?: number;
  name?: string;
}

export class SVGMarker extends MapLayer<SVGMarkerProps> {
  el?: LeafletMarker;
  createLeafletElement(props: any) {
    const options = this.getOptions({
      ...props,
      icon: divIcon(props),
    });
    this.el = new LeafletMarker(props.position, options);
    return this.el;
  }

  updateLeafletElement(fromProps: SVGMarkerProps, toProps: SVGMarkerProps) {
    if (fromProps.position != toProps.position && toProps.position) {
      this.el?.setLatLng(toProps.position);
    }
    if (fromProps.name != toProps.name || fromProps.course != toProps.course) {
      this.el?.setIcon(divIcon(toProps));
    }
  }
}

const divIcon = (props: SVGIconProps) => {
  return new DivIcon({
    className: "custom-icon", //suppress default icon white box
    iconAnchor: [25, 25],
    html: ReactDOMServer.renderToString(
      <SVGIcon course={props.course} name={props.name} />
    ),
  });
};

interface SVGIconProps {
  course?: number;
  name?: string;
}
const SVGIcon = (props: SVGIconProps) => (
  <svg width="150px" height="50px" viewBox="-50 -50 325 100">
    <g transform={`rotate(${deg(props.course || 0)})`}>
      <circle r="2" stroke="black" />
      <polygon
        points="0 -25, 10 15, -10 15"
        fill="none"
        strokeWidth="2"
        stroke="black"
      />
    </g>
    <g>
      <text x="10" style={{fontSize: 28}}>{props.name ? props.name : ""}</text>
    </g>
  </svg>
);

const deg = (r: number) => (r / Math.PI) * 180;
