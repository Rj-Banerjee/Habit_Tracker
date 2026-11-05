import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { Feature, hasFeature, Plan } from '@habit-tracker/core';
import { tracker } from '../services/tracker';

interface PlanState {
  plan: Plan;
  // Until the plan has loaded, nothing is shown as locked. The AI service checks again.
  ready: boolean;
}

const PlanContext = createContext<PlanState>({ plan: 'free', ready: false });

// Loads the signed-in person's plan once, and again on each return to the app.
export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlanState>({ plan: 'free', ready: false });

  useEffect(() => {
    let live = true;
    const load = () =>
      Promise.resolve()
        .then(() => tracker.getPlan())
        .then((plan) => live && setState({ plan, ready: true }))
        // Offline it keeps what it knew; the AI service has the final word anyway.
        .catch(() => {});
    void load();
    const sub = AppState.addEventListener('change', (next) => next === 'active' && void load());
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  return <PlanContext.Provider value={state}>{children}</PlanContext.Provider>;
}

// Screens ask for a feature, never a plan name.
export function useEntitlements() {
  const { plan, ready } = useContext(PlanContext);
  return useMemo(
    () => ({ plan, ready, can: (feature: Feature) => !ready || hasFeature(plan, feature) }),
    [plan, ready]
  );
}
