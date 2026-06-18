"use client";
import { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectConfigureById } from "../../../store/slices/configuresSlice";
import Icon from "wynta-react-common/components/Icon";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

const TRIGGER_TYPES = [
  "DEPOSIT_SUCCESS",
  "REGISTRATION",
  "APP_VISIT",
  "BET_PLACED",
  "LEADERBOARD_WON",
  "TOURNAMENT_WON",
  "FRIEND_SIGNUP",
  "LOGIN",
] as const;

interface TriggerFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function TriggerForm({
  state,
  submitting,
  onCancel,
  onSubmit,
}: TriggerFormProps) {
  const isEdit = state.type === 'EDIT_TRIGGER';
  const existing = state.trigger;

  const cfg = useAppSelector(
    state.parentId != null
      ? selectConfigureById(state.parentId)
      : () => undefined,
  );

  const [releaseType, setReleaseType] = useState<"BONUS_RELEASE" | "CHUNK_RELEASE">(
    (existing?.release_type as "BONUS_RELEASE" | "CHUNK_RELEASE")
      ?? state.releaseType
      ?? "BONUS_RELEASE"
  );
  const [triggerType, setTriggerType] =
    useState<(typeof TRIGGER_TYPES)[number]>(
      (existing?.trigger_type as (typeof TRIGGER_TYPES)[number]) ?? "DEPOSIT_SUCCESS"
    );
  const [active, setActive] = useState(existing?.active !== undefined ? Boolean(existing.active) : true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      release_type: releaseType,
      trigger_type: triggerType,
      trigger_config: null,
      active,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Configure</label>
            <span className="parent-chip">
              <Icon name="settings-2" size={11} /> {cfg.name}
            </span>
          </div>
        )}
        <div className="field-group">
          <label>Release Type</label>
          <div className="seg" style={{ "--cols": 2 } as React.CSSProperties}>
            <button type="button" className={releaseType === "BONUS_RELEASE" ? "active" : ""} onClick={() => setReleaseType("BONUS_RELEASE")}>
              Bonus Release
            </button>
            <button type="button" className={releaseType === "CHUNK_RELEASE" ? "active" : ""} onClick={() => setReleaseType("CHUNK_RELEASE")}>
              Chunk Release
            </button>
          </div>
          <div className="helper" style={{ marginTop: 6 }}>
            {releaseType === "BONUS_RELEASE"
              ? "Bonus is granted when this event occurs."
              : "An already-granted chunk is released when this event occurs."}
          </div>
        </div>
        <div className="field-group">
          <label>Trigger Type</label>
          <div className="seg" style={{ "--cols": 2 } as React.CSSProperties}>
            {TRIGGER_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={triggerType === t ? "active" : ""}
                onClick={() => setTriggerType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <Toggle
            on={active}
            onChange={setActive}
            label={active ? "Active" : "Inactive"}
          />
        </div>
      </div>
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label={isEdit ? "Save Changes" : "Add Trigger"}
      />
    </form>
  );
}
