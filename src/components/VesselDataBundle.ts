import { LatLngExpression } from "leaflet"
import { BehaviorSubject, EMPTY, Observable, ReplaySubject, Subject } from "rxjs"
import { map, throttleTime, scan, withLatestFrom, timeoutWith } from "rxjs/operators"

interface LatLngObject {
  latitude: number,
  longitude: number
}

export default class VesselDataBundle {
  positionSubject: Subject<LatLngExpression>
  positionTimeout: Observable<any>
  retrievedTrack: Subject<LatLngExpression[]>
  accumulatedTrack: Observable<LatLngExpression[]>
  uptodateTrack: Observable<LatLngExpression[]>
  headingSubject: Subject<number>
  speedSubject: Subject<number>
  nameSubject: Subject<string>

  constructor() {
    this.positionSubject = new ReplaySubject<LatLngExpression>()
    this.positionTimeout = this.positionSubject.pipe(
      timeoutWith(5 * 60 * 1000, EMPTY)
    )
    this.retrievedTrack = new BehaviorSubject([] as LatLngExpression[])
    this.accumulatedTrack = this.positionSubject.pipe(
      throttleTime(5 * 1000),
      scan<any, any>((acc, position) => {
        acc.push(position)
        return acc
      }, [])
    )
    this.uptodateTrack = this.positionSubject.pipe(
      withLatestFrom(this.retrievedTrack, this.accumulatedTrack),
      map(([latestPosition, retrievedTrack, earlierTrack]) => [
        ...retrievedTrack,
        ...earlierTrack,
        latestPosition,
      ])
    );
    this.headingSubject = new ReplaySubject<number>(1)
    this.speedSubject = new ReplaySubject<number>(1)
    this.nameSubject = new BehaviorSubject('-')
  }

  nextPosition(posObject: LatLngObject) {
    const latLng: LatLngExpression = [posObject.latitude, posObject.longitude]
    this.positionSubject.next(latLng)
  }

  nextHeading(heading: number) {
    this.headingSubject.next(heading)
  }

  nextSpeed(speed: number) {
    this.speedSubject.next(speed)
  }

  setName(name: string) {
    this.nameSubject.next(name)
  }

  setRetrievedTrack(track: LatLngExpression[]) {
    this.retrievedTrack.next(track)
  }
}
