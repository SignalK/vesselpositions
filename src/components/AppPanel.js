import React, { useEffect, useState, useRef } from 'react'
import { LayersControl, Map, Marker, TileLayer } from 'react-leaflet'
import Control from 'react-leaflet-control'
import * as lh from './leaflet-hack'
import VesselDataBundle from './VesselDataBundle'
import VesselDataDisplay from './VesselDataDisplay'
import * as pkg from '../../package.json'
import { ReplaySubject } from 'rxjs'

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
}).then(r => r.json())


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

    const fetchTrack = (context) => {
      const contextParts = context.split('.')
      if (contextParts[0] !== 'vessels') {
        return Promise.resolve({})
      }
      return fetch(`/signalk/v1/api/vessels/${contextParts[1]}/track`, {
        credentials: 'include'
      }).then(r => r.status === 200 ? r.json() : Promise.resolve({}))
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
      if (selectedBaselayerName) {
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
                fetchTrack(delta.context)
                  .then(trackGEOJson => {
                    if (trackGEOJson && trackGEOJson.coordinates && trackGEOJson.coordinates[0]) {
                      vesselData.vesselData.setRetrievedTrack(trackGEOJson.coordinates[0].map(([lng, lat]) => [lat, lng]))
                    }
                  })
                const newTarget = {}
                newTarget[delta.context] = vesselData
                setAisTargets(prevTargets => ({ ...prevTargets, ...newTarget }))
              }
              handler(vesselData.vesselData, pathValue.value)
            }
          })
        })
      } else if (delta.self) {
        selfId.current.next(delta.self)
      }
    }

    const fetchNames = () => {
      const vesselsWithNoName = Object.entries(aisTargetsRef.current).filter(([id, data]) => !data.hasName)
      const fetchNames = vesselsWithNoName.map(([id]) => props.adminUI.get({ context: id, path: 'name' }).then(r => r.json().then(data => [id, data])))
      Promise.allSettled(fetchNames).then(settleds => {
        const successes = settleds.filter(({ status }) => status === 'fulfilled')
        if (successes.length === 0) {
          return
        }
        setAisTargets((prevTargets) => {
          const result = successes.reduce((acc, { status, value }) => {
            const [id, name] = value
            acc[id].hasName = true
            acc[id].vesselData.setName(`${name[0]}${name.slice(1).toLowerCase()}`)
            return acc
          }, { ...prevTargets })
          return result
        })
      })
    }
    const fetchNamesTimer = setInterval(fetchNames, 10000)
    setTimeout(fetchNames, 500)
    return () => {
      clearInterval(fetchNamesTimer)
    }
  }, [])

  return (
    <Map
      ref={mapRef}
      style={{ height: '100%' }}
      center={viewport.center}
      zoom={viewport.zoom}
      onbaselayerchange={bl => localStorage.setItem('baselayer', bl.name)}
      onoverlayadd={e => saveOverlayState(e.name, true)}
      onoverlayremove={e => saveOverlayState(e.name, false)}
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
          setSelfAsCenter((center) => setViewport({zoom: lastZoom, center}))
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
        ([context, data]) => <VesselDataDisplay key={context} vesselData={data.vesselData} />)}
    </Map>
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
