import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { DotoriPresenceConnection } from "../api/dotoriStorage";

export type DotoriPresenceTarget = {
  kind: string | null;
  id: string | null;
  label: string | null;
};

type DotoriPresenceContextValue = {
  presenceConnections: DotoriPresenceConnection[];
  currentTarget: DotoriPresenceTarget;
  setCurrentTarget: (target: DotoriPresenceTarget) => void;
};

const DotoriPresenceContext = createContext<DotoriPresenceContextValue | null>(null);

export function DotoriPresenceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DotoriPresenceContextValue;
}) {
  return <DotoriPresenceContext.Provider value={value}>{children}</DotoriPresenceContext.Provider>;
}

export function useDotoriPresenceContext() {
  const context = useContext(DotoriPresenceContext);
  if (!context) {
    throw new Error("DotoriPresenceContext is not available.");
  }
  return context;
}
