export default {
  id: "move-motion",
  install({ ui }) {
    return ui.addStyles("move-motion", new URL("./style.css", import.meta.url));
  },
};
