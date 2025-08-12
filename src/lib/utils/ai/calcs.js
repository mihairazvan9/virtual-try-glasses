import { THREE } from '@/lib/utils/utils'

function normalized_coords (landmark, cameraWidth, cameraHeight) {
  // Simple coordinate mapping from MediaPipe (0-1) to camera view
  const x = (landmark.x - 0.5) * cameraWidth
  const y = (0.5 - landmark.y) * cameraHeight
  
  return { x, y }
}

function get_angle (landmark1, landmark2) {
  const point_1 = normalized_coords(landmark1)
  const point_2 = normalized_coords(landmark2)
  
  // Calculate the differences in the coordinates
  let dx = point_2.x - point_1.x
  let dy = point_2.y - point_1.y

  // Calculate the angle using atan2, which gives the angle in radians
  let angle = Math.atan2(dy, dx)

  // Convert the angle from radians to degrees (optional)
  let angle_degrees = angle

  return angle_degrees
}

function get_distance (landmark1, landmark2) {
  const point_1 = normalized_coords(landmark1)
  const point_2 = normalized_coords(landmark2)

  const distance_x = Math.abs(point_2.x - point_1.x)

  return distance_x
}

export {
  normalized_coords,
  get_angle,
  get_distance
}