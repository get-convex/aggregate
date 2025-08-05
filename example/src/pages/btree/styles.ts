// Custom styles for dark theme React Flow controls
export const controlsStyle = `
  .react-flow__controls-button {
    background-color: var(--mantine-color-dark-5) !important;
    border: 1px solid var(--mantine-color-dark-4) !important;
    color: white !important;
  }
  .react-flow__controls-button:hover {
    background-color: var(--mantine-color-dark-4) !important;
  }
  .react-flow__controls-button svg {
    fill: white !important;
  }
`;

export const REACT_FLOW_PROPS = {
  fitView: true,
  fitViewOptions: { padding: 50 },
  defaultViewport: { x: 0, y: 0, zoom: 0.8 },
  minZoom: 0.1,
  maxZoom: 2,
  deleteKeyCode: null,
  selectionKeyCode: null,
  multiSelectionKeyCode: null,
  nodesDraggable: true,
  nodesConnectable: false,
  elementsSelectable: true,
  panOnDrag: true,
  panOnScroll: true,
  zoomOnScroll: true,
  zoomOnPinch: true,
  zoomOnDoubleClick: true,
};

export const CONTAINER_STYLES = {
  height: "calc(100vh - 180px)", // Account for header and container padding
  backgroundColor: "var(--mantine-color-dark-7)",
  borderRadius: 8,
  overflow: "hidden" as const,
};

export const REACT_FLOW_STYLES = {
  backgroundColor: "var(--mantine-color-dark-8)",
};

export const BACKGROUND_STYLES = {
  backgroundColor: "var(--mantine-color-dark-8)",
};

export const CONTROLS_STYLES = {
  backgroundColor: "var(--mantine-color-dark-6)",
  border: "1px solid var(--mantine-color-dark-4)",
  borderRadius: "8px",
};
