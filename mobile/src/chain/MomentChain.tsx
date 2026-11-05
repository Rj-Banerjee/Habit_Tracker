import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  Chain,
  chainBefore,
  CROSSFADE_MS,
  FRACTURE_MS,
  IdentityToken,
  Moment,
  MotionSettings,
  motionPlan,
  PROTECTED_MS,
  space,
  WELD_CAPTION_MS,
  WELD_MS,
} from '@habit-tracker/core';
import {
  CHAIN_HEIGHT,
  CHAIN_MID,
  CHAIN_NODE,
  chainSummary,
  CRACK_APART,
  CRACK_LENGTH,
  crackPath,
  LinkMark,
  linkSpan,
  nodeCentres,
  SHIELD_PATH,
  StatusShapes,
  stitchesPath,
  Text,
  useChainColours,
  useTheme,
} from '@habit-tracker/ui';
import { crackTap, weldSuccess } from '../services/haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface MomentCaptions {
  // Shown under the chain once the moment has played.
  caption: string;
  // Fracture only: what "How to repair" reveals.
  repairHint?: string;
}

interface MomentChainProps {
  chain: Chain;
  moment: Moment;
  identity: IdentityToken;
  settings: MotionSettings;
  captions: MomentCaptions;
  // Set when the person taps or logs mid-way: everything jumps to its end state.
  interrupted?: boolean;
  onFinish?: () => void;
  // Weld only: when the seam forms, so the streak number can count up.
  onSeam?: () => void;
  // The playground's frame-rate readout, measured on the UI thread.
  onFrames?: (fps: number, dropped: number) => void;
}

const phase = (t: number, [a, b]: readonly [number, number]) => {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
};

const easeOut = Easing.out(Easing.cubic);
// A soft spring that settles with well under a pixel of overshoot.
const softSpring = Easing.out(Easing.back(0.6));

const nodeTransform = (x: number) =>
  `translate(${x - CHAIN_NODE / 2} ${(CHAIN_HEIGHT - CHAIN_NODE) / 2}) scale(${CHAIN_NODE / 28})`;

// The spark directions, fixed so every weld looks the same.
const SPARKS = [-60, -20, 25, 70, 115].map((deg) => (deg * Math.PI) / 180);

export function MomentChain({
  chain,
  moment,
  identity,
  settings,
  captions,
  interrupted = false,
  onFinish,
  onSeam,
  onFrames,
}: MomentChainProps) {
  const colours = useChainColours(identity);
  const { identity: identityColour } = useTheme();
  const glow = identityColour(identity).glow;
  const plan = motionPlan(moment.kind, settings);
  const total =
    plan.mode === 'crossfade'
      ? CROSSFADE_MS
      : moment.kind === 'fracture'
        ? FRACTURE_MS.total
        : moment.kind === 'weld'
          ? WELD_MS.total
          : PROTECTED_MS.total;

  const [width, setWidth] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const t = useSharedValue(0);
  const captionOpacity = useSharedValue(0);
  const frames = useSharedValue(0);
  const longFrames = useSharedValue(0);
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fired = useRef({ haptic: false, seam: false });

  const before = chainBefore(chain, moment);
  const index = chain.nodes.findIndex((node) => node.date === moment.date);
  const linkIndex = index - 1;
  const centres = nodeCentres(chain.nodes.length, width);
  const span = linkIndex >= 0 && width > 0 ? linkSpan(centres[linkIndex], centres[index]) : null;

  const fireHaptic = () => {
    if (fired.current.haptic) return;
    fired.current.haptic = true;
    if (moment.kind === 'fracture') crackTap();
    if (moment.kind === 'weld') weldSuccess();
  };
  const fireSeam = () => {
    if (fired.current.seam) return;
    fired.current.seam = true;
    onSeam?.();
  };

  const showCaption = () => {
    captionOpacity.set(
      moment.kind === 'weld'
        ? withTiming(1, { duration: 150 }, () => {
            captionOpacity.value = withDelay(WELD_CAPTION_MS, withTiming(0, { duration: 300 }));
          })
        : withTiming(1, { duration: 150 })
    );
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    fireHaptic();
    fireSeam();
    if (plan.mode !== 'full' || moment.kind !== 'fracture') showCaption();
    else captionOpacity.set(1);
    onFinish?.();
  };

  const report = (count: number, long: number, ms: number) =>
    onFrames?.(ms > 0 ? Math.round((count * 1000) / ms) : 0, long);

  useFrameCallback((frame) => {
    'worklet';
    if (!onFrames || t.value >= total) return;
    frames.value += 1;
    // Anything over about 1.5 frames at 60 fps was a dropped frame.
    if ((frame.timeSincePreviousFrame ?? 0) > 25) longFrames.value += 1;
  }, Boolean(onFrames));

  // Plays once, on the first draw with a width.
  useEffect(() => {
    if (width === 0 || finished.current) return;
    const duration = plan.durationMs;
    const slow = duration / total;
    const at = (ms: number, run: () => void) => timers.current.push(setTimeout(run, ms * slow));
    const started = Date.now();
    frames.set(0);
    longFrames.set(0);
    t.set(withTiming(total, { duration, easing: Easing.linear }));
    if (moment.kind === 'fracture') fireHaptic();
    if (moment.kind === 'weld' && plan.mode === 'full') {
      at(WELD_MS.join[1], fireHaptic);
      at(WELD_MS.seam[0], fireSeam);
    }
    if (moment.kind === 'fracture' && plan.mode === 'full') {
      captionOpacity.set(
        withDelay(
          FRACTURE_MS.caption[0] * slow,
          withTiming(1, { duration: (FRACTURE_MS.caption[1] - FRACTURE_MS.caption[0]) * slow })
        )
      );
    }
    at(total, () => {
      report(frames.get(), longFrames.get(), Date.now() - started);
      finish();
    });
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  useEffect(() => {
    if (!interrupted || finished.current) return;
    cancelAnimation(t);
    t.set(total);
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted]);

  const crossfade = plan.mode === 'crossfade';

  // The day's node: what it was, fading out, and what it is, fading in.
  const nodeWindow: readonly [number, number] = crossfade
    ? [0, CROSSFADE_MS]
    : moment.kind === 'fracture'
      ? FRACTURE_MS.part
      : moment.kind === 'weld'
        ? WELD_MS.seam
        : [0, 1];
  const oldNode = useAnimatedProps(() => ({ opacity: 1 - phase(t.value, nodeWindow) }));
  const newNode = useAnimatedProps(() => ({ opacity: phase(t.value, nodeWindow) }));

  // The link: drawn as two halves that part for a crack and meet for a weld.
  const from = span?.from ?? 0;
  const to = span?.to ?? 0;
  const mid = span?.mid ?? 0;
  const apart = (value: number) => {
    'worklet';
    if (crossfade) return moment.kind === 'fracture' ? CRACK_APART : 0;
    if (moment.kind === 'fracture') return CRACK_APART * easeOut(phase(value, FRACTURE_MS.part));
    if (moment.kind === 'weld') return CRACK_APART * (1 - softSpring(phase(value, WELD_MS.join)));
    return 0;
  };
  const leftHalf = useAnimatedProps(() => ({ d: `M${from} ${CHAIN_MID}H${mid - apart(t.value)}` }));
  const rightHalf = useAnimatedProps(() => ({ d: `M${mid + apart(t.value)} ${CHAIN_MID}H${to}` }));
  const crack = useAnimatedProps(() => {
    if (moment.kind === 'fracture') {
      const drawn = crossfade ? phase(t.value, [0, CROSSFADE_MS]) : phase(t.value, FRACTURE_MS.crack);
      return { strokeDashoffset: CRACK_LENGTH * (1 - drawn), opacity: 1 };
    }
    const window: readonly [number, number] = crossfade ? [0, CROSSFADE_MS] : WELD_MS.seam;
    return { strokeDashoffset: 0, opacity: 1 - phase(t.value, window) };
  });
  const stitches = useAnimatedProps(() => {
    const window: readonly [number, number] = crossfade ? [0, CROSSFADE_MS] : WELD_MS.seam;
    return { opacity: phase(t.value, window) };
  });

  // The weld bead: a bright run of the identity colour moving left to right.
  const bead = useAnimatedProps(() => {
    const p = phase(t.value, WELD_MS.bead);
    const head = from + (to - from) * p;
    const tail = Math.max(from, head - 8);
    return { d: `M${tail} ${CHAIN_MID}H${head}`, opacity: p > 0 && p < 1 ? 1 : 0 };
  });
  const beadHead = useAnimatedProps(() => {
    const p = phase(t.value, WELD_MS.bead);
    const head = from + (to - from) * p;
    return { x: head - 2, opacity: p > 0 && p < 1 ? 0.9 : 0 };
  });
  const sparkProps = SPARKS.map((angle) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedProps(() => {
      const p = phase(t.value, WELD_MS.sparks);
      const distance = 2 + 7 * easeOut(p);
      return {
        x: mid + Math.cos(angle) * distance - 0.75,
        y: CHAIN_MID - Math.sin(angle) * distance - 0.75,
        opacity: p > 0 && p < 1 ? 1 - p : 0,
      };
    })
  );

  // A Grace Day: one sweep of light across the shield.
  const shimmer = useAnimatedProps(() => {
    const p = phase(t.value, crossfade ? [0, CROSSFADE_MS] : PROTECTED_MS.shimmer);
    return { x: -8 + 36 * p, opacity: crossfade || p >= 1 ? 0 : 0.85 };
  });

  const captionStyle = useAnimatedStyle(() => ({ opacity: captionOpacity.value }));

  const node = index >= 0 ? chain.nodes[index] : null;
  const oldStatus = before.nodes[index]?.status;
  const breaking = moment.kind === 'fracture' || moment.kind === 'weld';

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={styles.chain}
        pointerEvents="none"
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={chainSummary(chain)}
      >
        {width > 0 && node ? (
          <Svg width={width} height={CHAIN_HEIGHT}>
            <Defs>
              <ClipPath id={`shield-${moment.habitId}`}>
                <Path d={SHIELD_PATH} />
              </ClipPath>
            </Defs>
            {chain.links.map((kind, i) =>
              i === linkIndex && breaking ? null : (
                <LinkMark key={`l${i}`} kind={kind} span={linkSpan(centres[i], centres[i + 1])} colours={colours} />
              )
            )}
            {span && breaking ? (
              <>
                <AnimatedPath animatedProps={leftHalf} stroke={colours.accent} strokeWidth={2} strokeLinecap="round" fill="none" />
                <AnimatedPath animatedProps={rightHalf} stroke={colours.accent} strokeWidth={2} strokeLinecap="round" fill="none" />
                <AnimatedPath
                  animatedProps={crack}
                  d={crackPath(span)}
                  stroke={colours.hollow}
                  strokeWidth={1.25}
                  strokeLinejoin="round"
                  strokeDasharray={`${CRACK_LENGTH} ${CRACK_LENGTH}`}
                  fill="none"
                />
                {moment.kind === 'weld' ? (
                  <>
                    <AnimatedPath animatedProps={stitches} d={stitchesPath(span)} stroke={colours.accent} strokeWidth={1.5} strokeLinecap="round" />
                    {plan.mode === 'full' ? (
                      <>
                        <AnimatedPath animatedProps={bead} stroke={glow} strokeWidth={3.5} strokeLinecap="round" fill="none" />
                        <AnimatedRect animatedProps={beadHead} y={CHAIN_MID - 2} width={4} height={4} rx={2} fill={glow} />
                      </>
                    ) : null}
                    {plan.sparks
                      ? sparkProps.map((props, i) => (
                          <AnimatedRect key={i} animatedProps={props} width={1.5} height={1.5} rx={0.75} fill={glow} />
                        ))
                      : null}
                  </>
                ) : null}
              </>
            ) : null}
            {chain.nodes.map((n, i) =>
              i === index ? null : (
                <G key={n.date} transform={nodeTransform(centres[i])}>
                  <StatusShapes status={n.status} {...colours} />
                </G>
              )
            )}
            <G transform={nodeTransform(centres[index])}>
              {oldStatus && oldStatus !== node.status ? (
                <>
                  <AnimatedG animatedProps={oldNode}>
                    <StatusShapes status={oldStatus} {...colours} />
                  </AnimatedG>
                  <AnimatedG animatedProps={newNode}>
                    <StatusShapes status={node.status} {...colours} />
                  </AnimatedG>
                </>
              ) : (
                <StatusShapes status={node.status} {...colours} />
              )}
              {moment.kind === 'protected' ? (
                <G clipPath={`url(#shield-${moment.habitId})`}>
                  <AnimatedRect animatedProps={shimmer} y={0} width={6} height={28} fill={glow} />
                </G>
              ) : null}
            </G>
          </Svg>
        ) : null}
      </View>

      <Animated.View style={[styles.caption, captionStyle]}>
        <Text variant="small" muted numeric accessibilityLiveRegion="polite">
          {captions.caption}
        </Text>
        {captions.repairHint ? (
          showHint ? (
            <Text variant="small" numeric>
              {captions.repairHint}
            </Text>
          ) : (
            <Pressable accessibilityRole="link" onPress={() => setShowHint(true)} hitSlop={12}>
              <Text variant="small" style={styles.link}>
                How to repair
              </Text>
            </Pressable>
          )
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  chain: { height: CHAIN_HEIGHT, justifyContent: 'center' },
  caption: { gap: 2 },
  link: { textDecorationLine: 'underline' },
});
