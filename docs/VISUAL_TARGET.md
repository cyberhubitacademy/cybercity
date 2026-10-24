# Visual target: studied from the GTA VI "Extended Look" trailer

Reference only. We copy **techniques and qualities** (light, materials, density, camera), never
characters, logos, brands, story or scenes. Neon Bay stays our own city with our own CC0 assets.
Frames were studied muted in the browser; none are stored in the repo.

## What makes those frames read as "real"

### 1. Light (daytime street and rooftop frames)
- Hard, high sun. Shadows are crisp, long and **cool blue-grey, never black** (lit by the sky).
- Sunlit surfaces are warm; shade is cool. That warm/cool split is most of the realism.
- Bright, pale sky near the horizon; deeper blue overhead.
- **Aerial perspective:** distant towers fade to a pale blue-grey haze and lose saturation and contrast.
- Soft contact darkening where things meet the ground (cars, kerbs, walls, plant pots).

### 2. Colour
- Natural and restrained. Greens are olive, concrete is beige-grey, asphalt is dark grey.
- Saturation is spent on a few accents only: red bougainvillea, signage, a coloured car.
- Our current look is too saturated and too evenly bright ("toy" look).

### 3. Density and clutter (the biggest gap)
- Every street has: overhead power lines and poles, street lamps, stop signs, traffic signs,
  bins, bollards, utility boxes, storm drains, newspaper boxes, benches.
- Kerbs with painted markings, green bike lanes, crosswalks, worn lane lines, tyre stains, patched asphalt.
- Grass verges between sidewalk and road; hedges along lots; flower beds; lawns with edges.
- Many palms of **varied heights** and lean, plus broadleaf trees and flowering shrubs.
- Rooftops covered in AC units, vents, water tanks, cranes on the skyline.

### 4. Buildings
- Window grids that **reflect the sky**, balconies, awnings, signage, murals, rooftop kit.
- Beige/white/cream bases with one accent colour; modern towers with glass and balcony bands.

### 5. Cars
- Glossy clearcoat paint with sharp sky/environment reflections and bright highlights.
- Dark tinted, reflective glass; dark tyres; a soft contact shadow under the body.

### 6. Camera and screen
- Close third-person, ~50–55° FOV, low-ish height; HUD minimal.
- Mild motion blur when driving; filmic highlight roll-off; slight vignette; no heavy bloom in daylight.

## Our gap list (priority order)
1. Frame rate on ordinary laptops (must fix first; ~17 fps on integrated AMD graphics):
   ~1,000 draw calls, 443 skinned pieces (≈7 per pedestrian), many parts per car.
2. Grade: lower saturation, warm sun / cool shade, aerial-perspective haze.
3. Street clutter and power lines (instanced, cheap).
4. Vegetation variety (palm heights, broadleaf trees, red flowering shrubs, hedges).
5. Car paint clearcoat + tinted glass + contact shadows.
6. Facade windows that reflect the sky.
