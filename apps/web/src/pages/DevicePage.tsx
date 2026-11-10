import { useParams } from 'react-router'
import { DeviceView } from '../device/DeviceView'
import { PageTransition } from '../motion/PageTransition'

/** `/devices/:id`: the device details. */
export function DevicePage() {
  const { id = '' } = useParams()
  return (
    <PageTransition key={id}>
      <DeviceView id={id} />
    </PageTransition>
  )
}
