import { LatLngExpression } from "leaflet"
import { BehaviorSubject, EMPTY, Observable, ReplaySubject, Subject } from "rxjs"
import { map, timeoutWith } from "rxjs/operators"
import { TrackAccumulator } from '@signalk/tracks'
import { LatLngTuple } from "@signalk/tracks/dist/types"

interface LatLngObject {
  latitude: number,
  longitude: number
}

export default class VesselDataBundle {
  positionSubject: Subject<LatLngExpression>
  positionTimeout: Observable<any>
  headingSubject: Subject<number>
  speedSubject: Subject<number>
  nameSubject: BehaviorSubject<string>
  context: string
  isSelfSubject: Observable<boolean>
  private accumulator: TrackAccumulator
  track: Observable<LatLngTuple[]>


  constructor(context:string, selfIdSubject: Subject<string>) {
    this.context = context
    this.isSelfSubject = selfIdSubject.pipe(
      map(selfId => selfId === this.context)
    )
    this.positionSubject = new ReplaySubject<LatLngExpression>()
    this.positionTimeout = this.positionSubject.pipe(
      timeoutWith(5 * 60 * 1000, EMPTY)
    )
    this.accumulator = new TrackAccumulator({
      resolution: 60*1000,
      pointsToKeep: 60,
      fetchTrackFor: context
    })
    this.track = this.accumulator.track
    this.headingSubject = new ReplaySubject<number>(1)
    this.speedSubject = new ReplaySubject<number>(1)
    this.nameSubject = new BehaviorSubject('-')
  }

  nextPosition(posObject: LatLngObject) {
    const latLng: LatLngExpression = [posObject.latitude, posObject.longitude]
    this.positionSubject.next(latLng)
    this.accumulator.nextLatLngTuple(latLng)
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
}
