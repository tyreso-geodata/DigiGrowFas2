# Three.js Viewer Plugin for Origo

A modular Three.js viewer plugin that displays 3D models (GLB) and technical drawings (DXF) fetched from a backend API. The plugin integrates with Origo maps and can be controlled from external search tools.

## Installation

```bash
npm install
```

## Development

Start the development server:

```bash
npm start
```

This runs webpack-dev-server on port 9008 and watches for SCSS changes.

## Build

Build for production:

```bash
npm run build
```

Output files:
- `build/js/viewer-plugin.min.js` - Minified JavaScript
- `build/css/viewer-plugin.css` - Compiled CSS

## Usage

### With Origo Map

```html
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Origo with Viewer Plugin</title>
    <link href="css/style.css" rel="stylesheet">
    <link href="plugins/viewer-plugin.css" rel="stylesheet">
</head>
<body>
<div id="app-wrapper"></div>
<script src="js/origo.js"></script>
<script src="plugins/viewer-plugin.js"></script>

<script type="text/javascript">
  var origo = Origo('index.json');
  origo.on('load', function (viewer) {
    var viewerPlugin = ViewerPlugin({
      apiBaseUrl: "http://localhost:8080",
      buttonText: "3D Viewer",
      tooltipText: "Open 3D Viewer",
      showTestUI: false,
      
      onViewerReady: function(threeViewer) {
        console.log('Viewer ready');
      },
      onLoadSuccess: function(model) {
        console.log('Model loaded', model);
      },
      onLoadError: function(error) {
        console.error('Load error', error);
      }
    });
    
    viewer.addComponent(viewerPlugin);
  });
</script>
</body>
```

### Integration with Search Tool

Load a file from an external search tool:

```javascript
// Get reference to the plugin (after initialization)
var viewerPlugin = viewer.getComponent('viewerPlugin');

// Load a file
viewerPlugin.loadFile('projectID', 'fileName');

// Or open with specific parameters
viewerPlugin.open('projectID', 'fileName');

// Download original file
viewerPlugin.downloadFile('projectID', 'fileName');

// Show the currently loaded model in the 3D globe (requires globeActive: true)
// Shows a spinner popup while loading; displays an error popup if X-Position is missing
viewerPlugin.showInMap();
```

### Standalone Usage (Without Origo)

```javascript
import { ThreeViewer, fetchViewerFile, setApiBaseUrl } from './viewer-plugin';

// Configure API
setApiBaseUrl('http://your-api-server.com');

// Create viewer
const viewer = new ThreeViewer('container-id');

// Load file
const result = await fetchViewerFile('projectID', 'fileName');
await viewer.loadModel(result.data, result.fileType);

// Control the viewer
viewer.resetCamera();
viewer.toggleGrid();
viewer.toggleAxes();
const screenshot = viewer.takeScreenshot();

// Clean up
viewer.dispose();
```

## Configuration

### API Endpoints

Default configuration:

```javascript
{
  api: {
    baseUrl: 'http://localhost:8080',
    endpoints: {
      viewer: '/api/relationshandling/fetch',  // ?projectID={}&fileName={}&view=true
      download: '/api/relationshandling/fetch' // ?projectID={}&fileName={}
    }
  }
}
```

Update at runtime:

```javascript
viewerPlugin.setApiBaseUrl('http://new-api-server.com');

// Or update full config
viewerPlugin.updateConfig({
  api: {
    baseUrl: 'http://new-server.com'
  },
  viewer: {
    backgroundColor: 0xffffff,
    showGrid: false
  }
});
```

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiBaseUrl` | string | `http://localhost:8080` | Base URL for API calls |
| `buttonText` | string | `3D Viewer` | Button/modal title text |
| `tooltipText` | string | `Open 3D Viewer` | Tooltip on hover |
| `icon` | string | `#fa-cube` | Origo icon reference |
| `viewerWidth` | string | `100%` | Viewer container width |
| `viewerHeight` | string | `600px` | Viewer container height |
| `showTestUI` | boolean | `false` | Show development test controls |
| `showParameterPanel` | boolean | `false` | Show a toolbar button that opens a floating panel for entering projectID, fileName and API URL |
| `parameterPanelIcon` | string | `#fa-search` | Origo icon for the parameter panel button |
| `parameterPanelTitle` | string | `Ladda 3D-fil` | Title shown on the panel header |
| `projectID` | string | `null` | Initial project ID to load |
| `fileName` | string | `null` | Initial file name to load |
| `globeActive` | boolean | `false` | Enable "Visa i kartan" buttons for 3D globe integration (requires Cesium / OL-Cesium via `window.oGlobe`) |
| `onViewerReady` | function | `null` | Callback when viewer is initialized |
| `onLoadSuccess` | function | `null` | Callback on successful load |
| `onLoadError` | function | `null` | Callback on load error |
| `onClose` | function | `null` | Callback when viewer is closed |

### Viewer Settings

```javascript
{
  viewer: {
    backgroundColor: 0xf0f0f0,
    ambientLightColor: 0xffffff,
    ambientLightIntensity: 0.6,
    directionalLightColor: 0xffffff,
    directionalLightIntensity: 0.8,
    cameraFov: 45,
    cameraNear: 0.1,
    cameraFar: 10000,
    gridSize: 100,
    gridDivisions: 100,
    showGrid: true,
    showAxes: true
  }
}
```

## Test Page

Run `npm start` and open http://localhost:9008/test/ in your browser (opens automatically). The test page includes:

- Input fields for API URL, Project ID, and File Name
- "Open Viewer" button to fetch and display files
- "Download Original" button to download source files
- Viewer controls (reset, grid, axes, screenshot, clear)
- Live URL preview
- Status and progress indicators

## Project Structure

```
viewer-plugin/
├── viewer-plugin.js          # Main plugin entry point
├── package.json
├── src/
│   ├── core/
│   │   ├── config.js         # Configuration and URL builders
│   │   ├── fileLoader.js     # API fetch and file type detection
│   │   ├── viewer.js         # Three.js viewer core
│   │   └── testUI.js         # Development test interface
│   └── utils/
│       └── urlHelper.js      # URL encoding utilities
├── scss/
│   └── viewer-plugin.scss    # Plugin styles
├── tasks/
│   ├── webpack.common.js
│   ├── webpack.dev.js
│   ├── webpack.prod.js
│   └── webpack.analyze.js
├── test/
│   └── index.html            # Standalone test page (localhost:9008/test/)
└── build/
    ├── js/
    │   └── viewer-plugin.min.js
    └── css/
        └── viewer-plugin.css
```

## API Response Format

### Viewer API

```
GET /api/relationshandling/fetch?projectID={projectID}&fileName={fileName}&view=true
```

**Supported file types:**
- **GLB/GLTF** - 3D models
- **IFC** - Building information models
- **DWG** - CAD drawings
- **DXF** - CAD exchange format

**Response headers:**

| Header | Type | Description |
|--------|------|-------------|
| `Content-Type` | string | MIME type of the response (`model/gltf-binary`, `application/dxf`, `application/ifc`, `application/dwg`) |
| `X-Position` | string | Model position as `lng,lat,height` (e.g., `13.123456,55.654321,0`) |
| `X-Translation` | string | Model translation offset as `x,y,z` in meters (e.g., `0,0,0`) |
| `X-Rotation` | string | Model rotation as `heading,pitch,roll` in degrees (optional) |

**Response body:** Binary file data

### Download API

```
GET /api/relationshandling/fetch?projectID={projectID}&fileName={fileName}
```

## Globe Integration — Visa i kartan

When `globeActive: true` is set the plugin exposes a **Visa i kartan** button in two places:

| Location | Element |
|----------|---------|
| Viewer toolbar | Button labeled **Visa i kartan** (only visible when a GLB file is open) |
| Parameter panel | Button below the other action buttons |

### Requirements

- [OL-Cesium](https://openlayers.org/ol-cesium/) must be active and exposed as `window.oGlobe`.
- [Cesium](https://cesium.com/) must be available as `window.Cesium`.
- The API response must include the `X-Position` header with valid WGS84 coordinates.

### Behaviour

1. Clicking **Visa i kartan** shows a centred spinner overlay while the model is fetched and positioned.
2. On success the spinner is dismissed and the Cesium camera flies to the model location.
3. If the `X-Position` response header is missing or the coordinates are `0,0` an error popup is shown:
   > *"Filen stöder inte positionering i världen. Ingen geografisk position finns tillgänglig för denna fil."*
4. Any other error (network, Cesium, etc.) also shows an error popup with a description and an **OK** button to dismiss.
5. DXF files are rejected immediately — only GLB/GLTF models can be placed in the globe.

### Positioning headers

The backend must expose the following CORS response headers:

| Header | Example | Description |
|--------|---------|-------------|
| `X-Position` | `13.123456,55.654321` | Longitude and latitude in WGS84 (**required**) |
| `X-Translation` | `0,0,12.5` | XYZ offset in metres; Z is used as height |
| `X-RotHeading` | `45` | Heading in degrees (0 = north); a 180° offset is automatically applied |

### Example

```javascript
var viewerPlugin = ViewerPlugin({
  apiBaseUrl: 'http://localhost:8080',
  globeActive: true   // enables "Visa i kartan"
});
viewer.addComponent(viewerPlugin);
```

## Dependencies

- [Three.js](https://threejs.org/) v0.162.0 - 3D rendering
## License

MIT
