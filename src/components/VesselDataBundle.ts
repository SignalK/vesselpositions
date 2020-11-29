import { LatLngExpression } from "leaflet"
import { BehaviorSubject, Observable, Subject } from "rxjs"
import { map, throttleTime, scan, withLatestFrom } from "rxjs/operators"

interface LatLngObject {
  latitude: number,
  longitude: number
}

export default class VesselDataBundle {
  positionSubject: Subject<LatLngExpression>
  accumulatedTrack: Observable<LatLngExpression[]>
  uptodateTrack: Observable<LatLngExpression[]>
  headingSubject: Subject<number>
  nameSubject: Subject<string>

  constructor() {
    this.positionSubject = new Subject()
    this.accumulatedTrack = this.positionSubject.pipe(
      throttleTime(5 * 1000),
      scan<any, any>((acc, position) => {
        acc.push(position)
        return acc
      }, [])
    )
    this.uptodateTrack = this.positionSubject.pipe(
      withLatestFrom(this.accumulatedTrack),
      map(([latestPosition, earlierTrack]) => [...earlierTrack, latestPosition])
    )
    this.headingSubject = new BehaviorSubject(0)
    this.nameSubject = new BehaviorSubject('-')
  }

  nextPosition(posObject: LatLngObject) {
    const latLng: LatLngExpression = [posObject.latitude, posObject.longitude]
    this.positionSubject.next(latLng)
  }

  nextHeading(heading: number) {
    this.headingSubject.next(heading)
  }

  setName(name: string) {
    this.nameSubject.next(name)
  }
}
