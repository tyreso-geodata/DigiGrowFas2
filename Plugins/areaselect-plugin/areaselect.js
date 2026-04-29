import Origo from "Origo";
import Draw, { createBox } from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";

const AreaSelect = function AreaSelect(options = {}) {
  // Konfigurationsalternativ som kan skickas in när pluginet skapas
  const {
    destinations = [],
    geometryParamName = "GEOMETRY",
    buttonIcon = "#ic_upload_file_24px",
    tooltipText = "Ladda upp data",
  } = options;

  let viewer;
  let map;
  let targetId;
  let isActive = false;
  let drawInteraction = null;
  let rootEl;
  let button;

  let rectangleButton;
  let polygonButton;

  let activeToolButton = null;
  let activeDrawType = "rectangle";
  let confirmationModal = null;
  let modalObserver = null;
  let modalElement = null;
  let component = null;

  const toolButtons = () => [rectangleButton, polygonButton];

  function setActive(active) {
    isActive = active;
    const btnEl = document.getElementById(button.getId());
    if (btnEl) btnEl.classList.toggle("active", isActive);
  }

  function stopDraw() {
    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
    }
    drawInteraction = null;
  }

  function showToolButtons() {
    toolButtons().forEach((btn) => {
      document.getElementById(btn.getId())?.classList.remove("hidden");
    });
  }

  function hideToolButtons() {
    toolButtons().forEach((btn) => {
      document.getElementById(btn.getId())?.classList.add("hidden");
    });
  }

  function setActiveTool(btn, drawType) {
    if (activeToolButton) {
      document
        .getElementById(activeToolButton.getId())
        ?.classList.remove("active");
    }

    activeToolButton = btn;
    activeDrawType = drawType;
    document.getElementById(btn.getId())?.classList.add("active");
  }

  function createDraw(drawType) {
    if (drawType === "rectangle") {
      return new Draw({
        type: "Circle",
        geometryFunction: createBox(),
      });
    }

    return new Draw({
      type: drawType,
    });
  }

  // Konverterar en OpenLayers-geometri till GeoJSON-format ---
  // Transformerar till WGS84 (EPSG:4326)
  function convertToGeoJson(geometry) {
    const geoJsonFormat = new GeoJSON();

    return geoJsonFormat.writeGeometryObject(geometry, {
      featureProjection: map.getView().getProjection().getCode(),
      dataProjection: "EPSG:4326",
    });
  }

  // Skapar en SVG-förhandsvisning av den ritade geometrin
  function geometryToSvg(geoJsonGeometry) {
    // Polygon/Rektangel: hämta koordinaterna från GeoJSON
    const coords =
      geoJsonGeometry.type === "Polygon"
        ? geoJsonGeometry.coordinates[0] // Yttre ring av polygonen
        : geoJsonGeometry.coordinates;

    // Hitta min/max-värden för att kunna skala geometrin till SVG-koordinater
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const pad = 10;

    // Hjälpfunktion som skalar ett värde från ett intervall till ett annat
    const scale = (v, min, max, toMin, toMax) =>
      ((v - min) / (max - min)) * (toMax - toMin) + toMin;

    // Skala koordinaterna till SVG:ens 100x100 viewBox med padding
    // Y-axeln flippas (100-pad → pad) eftersom SVG har Y-axeln nedåt men kartan uppåt
    const points = coords
      .map((c) => [
        scale(c[0], minX, maxX, pad, 100 - pad),
        scale(c[1], minY, maxY, 100 - pad, pad), // flippa Y
      ])
      .map((p) => p.join(","))
      .join(" ");

    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${points}" fill="#58a97833" stroke="#58a978" stroke-width="2"/>
  </svg>`;
  }

  function stopModalObserver() {
    if (modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }
    modalElement = null;
  }

  function startModalObserver() {
    stopModalObserver();

    const viewerEl = document.getElementById(viewer.getId());
    if (!viewerEl) return;

    modalElement = viewerEl.querySelector(".o-modal");
    if (!modalElement) return;

    modalObserver = new MutationObserver(() => {
      if (!document.contains(modalElement)) {
        stopModalObserver();
        deactivate();
        confirmationModal = null;
      }
    });

    modalObserver.observe(viewerEl, { childList: true, subtree: true });
  }

  function closeConfirmationModal() {
    if (!confirmationModal) return;

    stopModalObserver();

    const modalId = confirmationModal.getId();
    if (modalId) {
      document.getElementById(modalId)?.remove();
    }

    confirmationModal = null;
  }

  function deactivate() {
    if (!isActive) return;

    setActive(false);
    stopDraw();
    closeConfirmationModal();
    hideToolButtons();

    if (activeToolButton) {
      document
        .getElementById(activeToolButton.getId())
        ?.classList.remove("active");
      activeToolButton = null;
    }
  }

  function sendToUrl(url, geoJsonGeometry) {
    try {
      const targetUrl = new URL(url);

      const dynamicParameterData = [
        {
          name: geometryParamName,
          defaultValue: JSON.stringify(geoJsonGeometry),
        },
      ];

      targetUrl.searchParams.set(
        "dynamicParameterData",
        JSON.stringify(dynamicParameterData),
      );

      window.open(targetUrl.toString(), "_blank", "noopener,noreferrer");
      deactivate();
    } catch (err) {
      console.error("AreaSelect: Ogiltig URL:", err);
      alert("Kunde inte skapa en giltig länk till uppladdningsformuläret.");
    }
  }

  function showConfirmationModal(geoJsonGeometry) {
    closeConfirmationModal();

    const modalContentId = `areaselect-modal-${Date.now()}`;

    const destButtonsHtml = destinations.length
      ? destinations
          .map(
            ({ label }, i) =>
              `<button
          class="o-areaselect-btn o-areaselect-btn-destination"
          data-index="${i}"
          type="button">
          ${label}
        </button>`,
          )
          .join("")
      : `<p class="o-areaselect-no-destinations">
      Inga destinationer är konfigurerade. Kontakta administratören.
    </p>`;

    confirmationModal = Origo.ui.Modal({
      title: "Skicka till formulär",
      target: viewer.getId(),
      content: `
      <div id="${modalContentId}" class="o-areaselect-modal-content">

        <div class="o-areaselect-preview">
          ${geometryToSvg(geoJsonGeometry)}
        </div>

        <p class="o-areaselect-modal-text">
          Välj vart du vill skicka det markerade området:
        </p>

        <div class="o-areaselect-destinations">
          ${destButtonsHtml}
        </div>

        <div class="o-areaselect-actions">
          <button class="o-areaselect-cancel o-areaselect-btn o-areaselect-btn-secondary" type="button">
            Avbryt
          </button>
          <button class="o-areaselect-retry o-areaselect-btn o-areaselect-btn-secondary" type="button">
            Rita om
          </button>
        </div>

      </div>
    `,
    });

    component.addComponent(confirmationModal);
    // Fördröjning för att ge Origo tid att rendera modalen i DOM:en
    // innan vi försöker hämta element och sätta event listeners
    setTimeout(() => {
      startModalObserver();

      const modalRoot = document.getElementById(modalContentId);
      if (!modalRoot) return;

      modalRoot
        .querySelectorAll(".o-areaselect-btn-destination")
        .forEach((btn) => {
          btn.onclick = () => {
            const dest = destinations[Number(btn.dataset.index)];
            sendToUrl(dest.url, geoJsonGeometry);
          };
        });

      const retryBtn = modalRoot.querySelector(".o-areaselect-retry");
      if (retryBtn) {
        retryBtn.onclick = () => {
          closeConfirmationModal();
          startDraw(activeDrawType);
        };
      }

      const cancelBtn = modalRoot.querySelector(".o-areaselect-cancel");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          deactivate();
        };
      }
    }, 50);
  }

  function onDrawEnd(e) {
    try {
      const geometry = e.feature.getGeometry();
      const geoJsonGeometry = convertToGeoJson(geometry);
      stopDraw();
      showConfirmationModal(geoJsonGeometry);
    } catch (err) {
      console.error("AreaSelect Error:", err);
    }
  }

  function startDraw(drawType) {
    stopDraw();
    drawInteraction = createDraw(drawType);
    drawInteraction.on("drawend", onDrawEnd);
    map.addInteraction(drawInteraction);
  }

  function activate() {
    if (isActive) return;

    setActive(true);
    showToolButtons();
    setActiveTool(rectangleButton, "rectangle");
    startDraw("rectangle");
  }

  function toggle() {
    isActive ? deactivate() : activate();
  }

  return Origo.ui.Component({
    name: "areaselect",
    cls: "o-areaselect-control",

    onInit() {
      rootEl = Origo.ui.Element({
        tagName: "div",
        cls: "o-areaselect",
      });

      button = Origo.ui.Button({
        cls: "o-areaselect-button padding-small icon-smaller round light box-shadow",
        icon: buttonIcon,
        tooltipText,
        tooltipPlacement: "east",
        click: () => toggle(),
      });

      rectangleButton = Origo.ui.Button({
        cls: "o-areaselect-tool padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden",
        icon: "#ic_crop_square_24px",
        tooltipText: "Rektangel",
        tooltipPlacement: "east",
        click: () => {
          setActiveTool(rectangleButton, "rectangle");
          startDraw("rectangle");
        },
      });

      polygonButton = Origo.ui.Button({
        cls: "o-areaselect-tool padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden",
        icon: "#fa-polygon-o",
        tooltipText: "Polygon",
        tooltipPlacement: "east",
        click: () => {
          setActiveTool(polygonButton, "Polygon");
          startDraw("Polygon");
        },
      });

      this.addComponents([rootEl, button, rectangleButton, polygonButton]);
    },

    onAdd(e) {
      viewer = e.target;
      map = viewer.getMap();
      component = this;
      targetId = viewer.getMain().getMapTools().getId();
      this.render();
    },

    onRemove() {
      stopModalObserver();
      stopDraw();
      closeConfirmationModal();
    },

    render() {
      const rootHtml = Origo.ui.dom.html(rootEl.render());
      document.getElementById(targetId).appendChild(rootHtml);

      const rootId = rootEl.getId();
      const rootDom = document.getElementById(rootId);

      rootDom.appendChild(Origo.ui.dom.html(button.render()));
      toolButtons().forEach((btn) => {
        rootDom.appendChild(Origo.ui.dom.html(btn.render()));
      });

      this.dispatch("render");
    },
  });
};

export default AreaSelect;
