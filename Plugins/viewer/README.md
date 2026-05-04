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
- **GLB/GLTF** - 3D models (Content-Type: `model/gltf-binary`)
- **IFC** - Building information models (converted to GLB)
- **DWG** - CAD drawings (converted to GLB or DXF)
- **DXF** - CAD exchange format (Content-Type: `application/dxf` or `application/octet-stream`)

**Response headers:**

| Header | Type | Description |
|--------|------|-------------|
| `Content-Type` | string | MIME type of the response (`model/gltf-binary`, `application/dxf`, `application/octet-stream`) |
| `X-Position` | string | Model position as `lng,lat,height` (e.g., `13.123456,55.654321,0`) |
| `X-Translation` | string | Model translation offset as `x,y,z` in meters (e.g., `0,0,0`) |
| `X-Rotation` | string | Model rotation as `heading,pitch,roll` in degrees (optional) |

**Response body:** Binary file data

### Download API

```
GET /api/relationshandling/fetch?projectID={projectID}&fileName={fileName}
```

## Dependencies

- [Three.js](https://threejs.org/) v0.162.0 - 3D rendering
## License

MIT
