import React from "react";

import { ContextProps, Polyline, withLeaflet } from "react-leaflet";
import { useObservableState } from "observable-hooks";
import { SVGMarker } from "./SVGMarker";
import VesselDataBundle from "./VesselDataBundle";

interface VesselDataDisplayProps extends ContextProps {
  vesselData: VesselDataBundle;
}

const VesselDataDisplay = (props: VesselDataDisplayProps) => {
  const { vesselData } = props;
  const position = useObservableState(vesselData.positionSubject);
  const heading = useObservableState(vesselData.headingSubject);
  const track = useObservableState(vesselData.uptodateTrack, []);
  const name = useObservableState(vesselData.nameSubject);
  return (
    <span>
      {position && (
        <SVGMarker
          position={position as any}
          course={heading}
          name={name}
          {...props}
        />
      )}
      {track.length > 0 && <Polyline positions={track} color="blue" />}
    </span>
  );
};

export default withLeaflet(VesselDataDisplay);
