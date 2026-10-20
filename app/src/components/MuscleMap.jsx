import { muscleMapSVG } from '../lib/muscle-map.js'

// The front/back body map (lib/muscle-map.js), coloured by the load of a workout.
export default function MuscleMap({ load, width = 220, labels = false }) {
  return <div role="img" aria-label="Muscles worked" style={{ width, flex: 'none', lineHeight: 0 }}
    dangerouslySetInnerHTML={{ __html: muscleMapSVG(load, { width, labels }) }} />
}
