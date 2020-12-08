import React, { useEffect, useState, useRef } from 'react'
import { Map, Marker, TileLayer } from 'react-leaflet'
import * as lh from './leaflet-hack'
import VesselDataBundle from './VesselDataBundle'
import VesselDataDisplay from './VesselDataDisplay'
const APPLICATION_DATA_VERSION = '1.0'

const pathValueHandlers = {
  'navigation.position': (vesselData, position) => vesselData.nextPosition(position),
  'navigation.speedOverGround': (vesselData, speed) => vesselData.nextSpeed(speed),
  'navigation.courseOverGroundTrue': (vesselData, course) => vesselData.nextHeading(course)
}

const AppPanel = (props) => {
  if (props.loginStatus.status === 'notLoggedIn' && props.loginStatus.authenticationRequired) {
    return <props.adminUI.Login />
  }

  const [applicationData, setApplicationData] = useState({ markers: [] })
  const [aisTargets, setAisTargets] = useState({})
  const [center, setCenter] = useState([60.1, 25])
  const aisTargetsRef = useRef();
  aisTargetsRef.current = aisTargets

  const mapRef = useRef(null)

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

    fetch('/signalk/v1/api/vessels/self/navigation/position/value', {
      credentials: 'include'
    }).then(r => r.json()).then(pos => {
      const { latitude, longitude } = pos
      setCenter([latitude, longitude])
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
              if (!vesselData) {
                vesselData = {
                  vesselData: new VesselDataBundle()
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
      center={center}
      zoom={10}
      onClick={(e) => {
        const markers = [...applicationData.markers || []]
        markers.push(e.latlng)
        const appData = { ...applicationData, markers }
        props.adminUI.setApplicationUserData(APPLICATION_DATA_VERSION, appData)
          .then(() => {
            setApplicationData(appData)
          })
      }}
    >
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />  )
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

export default AppPanel
