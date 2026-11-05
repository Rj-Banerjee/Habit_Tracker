/* global jest */
// Reanimated and its worklets need native code. Tests get a small stand-in for the parts
// the app uses, in which every animation lands on its end value at once.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const identity = (value) => value;
  const easing = (fn) => fn;
  const Easing = {
    linear: identity,
    cubic: (t) => t * t * t,
    back: () => identity,
    out: easing,
    in: easing,
    inOut: easing,
    bezier: () => identity,
  };
  const createAnimatedComponent = (Component) => {
    const Animated = React.forwardRef(({ animatedProps, ...props }, ref) =>
      React.createElement(Component, { ...props, ...(animatedProps ?? {}), ref })
    );
    Animated.displayName = `Animated(${Component.displayName ?? Component.name ?? 'Component'})`;
    return Animated;
  };
  const AnimatedView = createAnimatedComponent(View);
  return {
    __esModule: true,
    default: { View: AnimatedView, createAnimatedComponent },
    createAnimatedComponent,
    Easing,
    useSharedValue: (initial) =>
      React.useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(next) {
          this.value = next;
        },
      }).current,
    useAnimatedProps: (fn) => fn(),
    useAnimatedStyle: (fn) => fn(),
    useFrameCallback: () => ({ setActive: () => {} }),
    withTiming: (value, _config, done) => {
      done?.(true);
      return value;
    },
    withDelay: (_ms, value) => value,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
  };
});
