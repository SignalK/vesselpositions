import React, { Fragment } from "react";

import { Circle, ContextProps, Polyline, withLeaflet } from "react-leaflet";
import { useObservableState } from "observable-hooks";
import { SVGMarker } from "./SVGMarker";
import VesselDataBundle from "./VesselDataBundle";
import { projectedLocation } from "./geoutil";
import { LatLngTuple } from "leaflet";

interface VesselDataDisplayProps extends ContextProps {
  vesselData: VesselDataBundle;
}

const PROJECTINMINUTES = 10;

const VesselDataDisplay = (props: VesselDataDisplayProps) => {
  const { vesselData } = props;
  const position = useObservableState(vesselData.positionSubject);
  const heading = useObservableState(vesselData.headingSubject);
  const speed = useObservableState(vesselData.speedSubject);
  const track = useObservableState(vesselData.uptodateTrack, []);
  const name = useObservableState(vesselData.nameSubject);
  const isSelf = useObservableState(vesselData.isSelfSubject);
  const projectionMinutes = Array.from(Array(PROJECTINMINUTES), (x, i) => i);
  const minutePositions =
    position && heading !== undefined && speed
      ? projectionMinutes.map<LatLngTuple>((minute) => {
          const advance = (speed || 0) * (minute + 1) * 60;
          return projectedLocation(
            position as LatLngTuple,
            heading || 0,
            advance
          );
        })
      : [];
  const projectionColor = isSelf ? 'blue' : 'black'
  return (
    <span>
      {position && (
        <SVGMarker
          position={position as any}
          course={heading}
          name={name}
          isSelf={isSelf}
          {...props}
        />
      )}
      {track.length > 0 && <Polyline positions={track} color="grey" />}
      {position && heading && (
        <Fragment>
          <Polyline
            positions={[
              position,
              projectedLocation(
                position as LatLngTuple,
                heading,
                (speed || 0) * PROJECTINMINUTES * 60
              ),
            ]}
            color={projectionColor}
          />
          {minutePositions.map((position, i) => (
            <Circle
              key={i}
              center={position}
              radius={2}
              color={projectionColor}
            />
          ))}
        </Fragment>
      )}
    </span>
  );
};

export default withLeaflet(VesselDataDisplay);
