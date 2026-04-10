import { useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "../toast/ToastProvider";
import { useDotoriPresenceContext, type DotoriPresenceTarget } from "./DotoriPresenceContext";

export function useSyncDotoriPresenceTarget(target: DotoriPresenceTarget) {
  const { setCurrentTarget } = useDotoriPresenceContext();
  const lastPresenceTargetRef = useRef<string>("");

  useEffect(() => {
    const nextTargetKey = `${target.kind ?? ""}|${target.id ?? ""}|${target.label ?? ""}`;
    if (lastPresenceTargetRef.current === nextTargetKey) {
      return;
    }
    lastPresenceTargetRef.current = nextTargetKey;
    setCurrentTarget(target);
  }, [setCurrentTarget, target]);
}

export function useDotoriPresenceLocks(page: string) {
  const { presenceConnections } = useDotoriPresenceContext();
  const { showToast } = useToast();

  const pagePresenceConnections = useMemo(
    () => presenceConnections.filter((connection) => connection.page === page),
    [page, presenceConnections],
  );

  const getPresenceForTarget = useCallback(
    (targetKind: string, targetId: string) =>
      pagePresenceConnections.filter(
        (connection) => connection.targetKind === targetKind && connection.targetId === targetId,
      ),
    [pagePresenceConnections],
  );

  const showLockedTargetToast = useCallback(
    (targetKind: string, targetId: string, fallbackLabel: string) => {
      const editors = getPresenceForTarget(targetKind, targetId);
      if (!editors.length) return false;
      const editorNames = Array.from(new Set(editors.map((connection) => connection.username))).join(", ");
      showToast(`${editorNames || "다른 사용자"}가 ${fallbackLabel} 편집 중이라 지금은 수정할 수 없습니다.`, "info");
      return true;
    },
    [getPresenceForTarget, showToast],
  );

  return {
    pagePresenceConnections,
    getPresenceForTarget,
    getTargetEditors: getPresenceForTarget,
    showLockedTargetToast,
  };
}
