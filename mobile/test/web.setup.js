// jsdom has no matchMedia, which react-native-web reads for colour scheme and
// reduced motion.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});
