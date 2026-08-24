export function stylesheetFeature(id, styleUrl) {
  return {
    id,
    install({ ui, capabilities }) {
      const removeStyle = ui.addStyles(id, styleUrl);
      const removeCapability = capabilities.provide(id, true);
      return () => { removeCapability(); removeStyle(); };
    },
  };
}
