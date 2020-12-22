import { Observable, Subject } from "rxjs"
import { distinctUntilChanged, shareReplay } from "rxjs/operators"

interface Position {
  x: number
  y: number
}

export const CONTEXTATTRIBUTENAME = 'data-context'

export default class MouseVesselTracker {
  lastMousePosition: Position | undefined
  selectedContext_ = new Subject<string | null>()
  selectedContext = this.selectedContext_.pipe(
    distinctUntilChanged(),
    shareReplay(1)
  )

  nextMousePosition(e: any) {
    const {x, y} = e.originalEvent
    this.lastMousePosition = {x, y}
    this.updateSelectedContext()
  }

  updateSelectedContext() {
    let e = document.elementFromPoint(this.lastMousePosition?.x || -1, this.lastMousePosition?.y || -1)
    for(let i = 0; i < 5 && e?.parentElement; i ++) {
      if (e.getAttribute(CONTEXTATTRIBUTENAME)) {
        this.selectedContext_.next(e.getAttribute('data-context'))
        return
      }
      e = e.parentElement
    }
    this.selectedContext_.next(undefined)
  }
}