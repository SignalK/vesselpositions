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
import { CONTEXTATTRIBUTENAME } from "./MouseVesselTracker";

interface SVGMarkerProps extends MapLayerProps {
  position?: LatLngExpression;
  course?: number;
  context: string;
  name?: string;
  isSelf?: boolean;
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
    html: ReactDOMServer.renderToString(<SVGIcon {...props} />),
  });
};

interface SVGIconProps {
  course?: number;
  name?: string;
  context: string;
  isSelf?: boolean;
}

const VESSELLENGTH = 80;
//"0 -25, 10 15, -10 15"
const points = `0 -${(25 / 40) * VESSELLENGTH}, ${VESSELLENGTH / 4} ${(15 / 40) * VESSELLENGTH
  }, -${VESSELLENGTH / 4} ${(15 / 40) * VESSELLENGTH}`;

const SVGIcon = (props: SVGIconProps) => {
  const dataContextProp: any = {};
  dataContextProp[CONTEXTATTRIBUTENAME] = props.context;
  return (
    <svg width="150px" height="50px" viewBox="-50 -50 325 100" pointerEvents="none">
      <g {...dataContextProp} transform={`rotate(${deg(props.course || 0)})`}>
        {props.course !== undefined && (
          <polygon
            points={points}
            fill={props.isSelf ? "black" : "gray"}
            strokeWidth="2"
            stroke="black"
            pointerEvents="all"
          />
        )}
        <circle r={props.course === undefined ? 10 : 2} stroke="black" />
      </g>
      {(props.name?.length || 0) > 0 && <g>
        <text x="10" style={{ fontSize: 28 }} pointerEvents="none">
          {props.name}
        </text>
      </g>}
    </svg>
  );
};

const deg = (r: number) => (r / Math.PI) * 180;
