import React, { useEffect, useState, useRef } from 'react'
import { LayersControl, Map, Marker, TileLayer } from 'react-leaflet'
import Control from 'react-leaflet-control'
import * as lh from './leaflet-hack'
import VesselDataBundle from './VesselDataBundle'
import VesselDataDisplay from './VesselDataDisplay'
import MouseVesselTracker from './MouseVesselTracker'
import * as pkg from '../../package.json'
import { ReplaySubject } from 'rxjs'
import { useObservableState } from 'observable-hooks'

const safePluginId = pkg.name.replace(/[-@/]/g, '_')
const APPLICATION_DATA_VERSION = '1.0'

const BASELAYERS = [
  {
    name: 'OpenStreetMap',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }
]

const OVERLAYS = [
  {
    name: 'OpenSeaMap',
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: '',
    checked: JSON.parse(localStorage.getItem('selectedOverlay')) === 'OpenSeaMap'
  }
]

const pathValueHandlers = {
  'navigation.position': (vesselData, position) => vesselData.nextPosition(position),
  'navigation.speedOverGround': (vesselData, speed) => vesselData.nextSpeed(speed),
  'navigation.courseOverGroundTrue': (vesselData, course) => vesselData.nextHeading(course)
}

const saveViewport = (viewport) => {
  let settings
  try {
    settings = JSON.parse(window.localStorage.getItem(safePluginId))
  } catch (e) {
    settings = {}
  }
  window.localStorage.setItem(safePluginId, JSON.stringify({ ...settings, viewport }))
}

const setSelfAsCenter = (setCenter) => fetch('/signalk/v1/api/vessels/self/navigation/position/value', {
  credentials: 'include'
}).then(r => r.json()).then(pos => {
  const { latitude, longitude } = pos
  setCenter([latitude, longitude])
})

const getInitialViewport = () => {
  try {
    const settings = JSON.parse(localStorage.getItem(safePluginId))
    if (settings.viewport) {
      return settings.viewport
    }
  } catch (e) {
    return {
      center: [60.1, 25],
      zoom: 10
    }
  }
}

const fetchCharts = () => fetch('/signalk/v1/api/resources/charts', {
  credentials: 'include'
}).then(r => r.json()).catch(e => ([]))

let fetchInProgress = false

let tracksAvailable = true

const tracksToFetch = []
let trackFetchInProgress = false

const AppPanel = (props) => {
  if (props.loginStatus.status === 'notLoggedIn' && props.loginStatus.authenticationRequired) {
    return <props.adminUI.Login />
  }

  const [applicationData, setApplicationData] = useState({ markers: [] })
  const [aisTargets, setAisTargets] = useState({})
  const [viewport, setViewport] = useState(getInitialViewport)
  const [charts, setCharts] = useState({ baselayers: BASELAYERS, overlays: OVERLAYS })
  const aisTargetsRef = useRef();
  const selfId = useRef(new ReplaySubject(1));
  const mouseVesselTrackerRef = useRef(new MouseVesselTracker());
  aisTargetsRef.current = aisTargets

  const mapRef = useRef(null)
  let lastZoom = 10

  useEffect(() => {
    props.adminUI.hideSideBar()

    // hack to resize the map in case sidebar was animated to hidden
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.leafletElement.invalidateSize()
      }
    }, 500)

    props.adminUI.getApplicationUserData(APPLICATION_DATA_VERSION).then(appData => {
      setApplicationData(appData)
    })


    const fetchTracks = (isStart = true) => {
      if (isStart && trackFetchInProgress) {
        return
      }
      if (tracksToFetch.length > 0) {
        trackFetchInProgress = true
        const { context, vesselData } = tracksToFetch.shift()
        const start = Date.now()
        fetchTrack(context)
          .then(trackGEOJson => {
            if (trackGEOJson && trackGEOJson.coordinates && trackGEOJson.coordinates[0]) {
              vesselData.setRetrievedTrack(trackGEOJson.coordinates[0].map(([lng, lat]) => [lat, lng]))
            }
          }).then(() => setTimeout(() => fetchTracks(false), Math.min(500, Date.now() - start)))
      } else {
        trackFetchInProgress = false
      }

    }
    const fetchTrack = (context) => {
      if (!tracksAvailable) {
        return Promise.resolve({})
      }
      const contextParts = context.split('.')
      if (contextParts[0] !== 'vessels') {
        return Promise.resolve({})
      }
      return fetch(`/signalk/v1/api/vessels/${contextParts[1]}/track`, {
        credentials: 'include'
      }).then(r => {
        if (r.status !== 200) {
          tracksAvailable = false
        }
        return r.json()
      })
    }

    fetchCharts().then(foundCharts => {
      const baselayers = [...BASELAYERS, ...Object.values(foundCharts).reduce((acc, chart) => {
        if (chart.tilemapUrl) {
          const { name, tilemapUrl } = chart
          acc.push({
            name,
            url: tilemapUrl
          })
        }
        return acc
      }, [])]
      const selectedBaselayerName = localStorage.getItem('baselayer')
      if (selectedBaselayerName) {
        (baselayers.find(l => l.name === selectedBaselayerName) || baselayers[0]).checked = true
      } else {
        baselayers[0].checked = true
      }
      setCharts({
        ...charts,
        baselayers
      })
    })

    const ws = props.adminUI.openWebsocket({ subscribe: 'none' })
    ws.onopen = () => {
      ws.send(JSON.stringify({
        context: '*',
        subscribe: Object.keys(pathValueHandlers).map(path => ({ path }))
      }))
    }
    ws.onmessage = (x) => {
      const delta = JSON.parse(x.data)
      if (delta.context) {
        (delta.updates || []).forEach(update => {
          (update.values || []).forEach(pathValue => {
            const handler = pathValueHandlers[pathValue.path]
            if (handler) {
              let vesselData = aisTargetsRef.current[delta.context]
              if (!vesselData && pathValue.path === 'navigation.position') {
                vesselData = {
                  vesselData: new VesselDataBundle(delta.context, selfId.current)
                }
                vesselData.vesselData.positionTimeout.subscribe({
                  complete: () => {
                    delete aisTargetsRef.current[delta.context]
                    setAisTargets({ ...aisTargetsRef.current })
                  }
                })
                tracksToFetch.push({ context: delta.context, vesselData: vesselData.vesselData })
                fetchTracks()
                const newTarget = {}
                newTarget[delta.context] = vesselData
                setAisTargets(prevTargets => ({ ...prevTargets, ...newTarget }))
              }
              if (vesselData) {
                handler(vesselData.vesselData, pathValue.value)
              }
            }
          })
        })
      } else if (delta.self) {
        selfId.current.next(delta.self)
      }
    }

    const fetchEachName = (vesselsWithNoName) => {
      if (vesselsWithNoName.length > 0) {
        const vessel = vesselsWithNoName.shift()
        const start = Date.now()
        props.adminUI.get({ context: vessel[0], path: 'name' }).then(r => {
          if (r.status === 200) {
            r.json().then(name => setAisTargets(prevTargets => {
              prevTargets[vessel[0]].hasName = true
              prevTargets[vessel[0]].vesselData.setName(`${name[0]}${name.slice(1).toLowerCase()}`)
              return { ...prevTargets }
            }))
          }
          setTimeout(() => fetchEachName(vesselsWithNoName), Math.min(Date.now() - start, 500))
        })
      } else {
        fetchInProgress = false
      }
    }

    const fetchNames = () => {
      if (fetchInProgress) {
        return
      }
      const vesselsWithNoName = Object.entries(aisTargetsRef.current).filter(([id, data]) => !data.hasName)
      fetchInProgress = true
      fetchEachName(vesselsWithNoName)
    }
    const fetchNamesTimer = setInterval(fetchNames, 30 * 1000)
    setTimeout(fetchNames, 500)
    return () => {
      clearInterval(fetchNamesTimer)
    }
  }, [])

  return (
    <div id='mapcontainer' style={{ height: '100%' }}>
      <Map
        ref={mapRef}
        style={{ height: '100%' }}
        center={viewport.center}
        zoom={viewport.zoom}
        onbaselayerchange={bl => localStorage.setItem('baselayer', bl.name)}
        onoverlayadd={e => saveOverlayState(e.name, true)}
        onoverlayremove={e => saveOverlayState(e.name, false)}
        onmousemove={(e) => mouseVesselTrackerRef.current.nextMousePosition(e)}
        onClick={(e) => {
          const markers = [...applicationData.markers || []]
          markers.push(e.latlng)
          const appData = { ...applicationData, markers }
          props.adminUI.setApplicationUserData(APPLICATION_DATA_VERSION, appData)
            .then(() => {
              setApplicationData(appData)
            })
        }}
        onViewportChanged={viewport => {
          saveViewport(viewport)
          lastZoom = viewport.zoom
        }}
      >
        <Control position="topleft" >
          <div class="leaflet-bar">
            <a class="leaflet-control-zoom-in" role="button" onClick={() => {
              setSelfAsCenter((center) => setViewport({ zoom: lastZoom, center }))
            }}>•</a>
          </div>
        </Control>

        <LayersControl position="topright">
          {charts.baselayers.map((layer, i) => (
            <LayersControl.BaseLayer key={i} checked={layer.checked} name={layer.name}>
              <TileLayer url={layer.url} attribution={layer.attribution} />
            </LayersControl.BaseLayer>
          ))}
          {charts.overlays.map((layer, i) => (
            <LayersControl.Overlay key={i} name={layer.name} checked={layer.checked}>
              <TileLayer url={layer.url} attribution={layer.attribution} />
            </LayersControl.Overlay>
          ))}
        </LayersControl>

        {(applicationData.markers || []).map((latlon, i) => (
          <Marker key={i} position={latlon} onClick={() => {
            const markers = applicationData.markers.slice()
            markers.splice(i, 1)
            const appData = { ...applicationData, markers }
            props.adminUI.setApplicationUserData(APPLICATION_DATA_VERSION, appData).then(() => setApplicationData(appData))
          }} />
        ))}
        {Object.entries(aisTargets).map(
          ([context, data]) =>
            <VesselDataDisplay
              mouseVesselTracker={mouseVesselTrackerRef.current}
              key={context}
              vesselData={data.vesselData} />)}
      </Map>
      <VesselInfoPanel
        mouseVesselTracker={mouseVesselTrackerRef.current}
        aisTargets={aisTargetsRef.current} />
    </div>
  )
}

const VesselInfoPanel = (props) => {
  const selectedContext = useObservableState(props.mouseVesselTracker.selectedContext);
  let vesselInfo = ''
  if (selectedContext) {
    const name = props.aisTargets[selectedContext].vesselData.nameSubject.getValue()
    const id = selectedContext.slice(selectedContext.lastIndexOf(':') + 1)
    vesselInfo = `${name}(${id})`
  }

  return (
    <div style={{ position: 'absolute', bottom: '50px', zIndex: 1000, background: 'rgba(0, 0, 0, 0.1)' }}>
      {vesselInfo}
    </div>
  )
}

function saveOverlayState(overlayName, checked) {
  if (checked) {
    localStorage.setItem('selectedOverlay', JSON.stringify(overlayName))
  } else {
    localStorage.setItem('selectedOverlay', JSON.stringify(null))
  }
}

export default AppPanel
