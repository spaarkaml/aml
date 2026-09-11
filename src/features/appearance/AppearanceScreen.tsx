import { useState } from "react";
import { Icon } from "@/app/icons";
import { useFolioStore } from "@/features/folio/store";
import styles from "./AppearanceScreen.module.css";
import {
  applyAppearance,
  current,
  effectiveType,
  type Mode,
  type ModeSetting,
  resolveMode,
  useAppearanceStore,
} from "./store";
import {
  contrastRatio,
  contrastVerdict,
  DEFAULTS,
  EDITOR_FONTS,
  isHex,
  TOKENS,
  TYPE_DEFAULTS,
  UI_FONTS,
} from "./tokens";

const MODES: Array<{ id: ModeSetting; label: string }> = [
  { id: "system", label: "Follow the OS" },
  { id: "paper", label: "Paper" },
  { id: "ink", label: "Ink" },
];

function Swatch({ mode, token }: { mode: Mode; token: (typeof TOKENS)[number] }) {
  const appearance = useAppearanceStore((s) => current(s));
  const setToken = useAppearanceStore((s) => s.setToken);
  const colours = mode === "ink" ? appearance.ink : appearance.paper;
  const fallback = DEFAULTS[mode][token.name] ?? "#000000";
  const value = colours[token.name] ?? fallback;
  const changed = colours[token.name] !== undefined;
  const against = colours.bg ?? DEFAULTS[mode].bg ?? "#ffffff";
  const verdict = token.text ? contrastVerdict(contrastRatio(value, against)) : null;

  return (
    <li className={styles.token} data-testid={`token-${mode}-${token.name}`}>
      <input
        type="color"
        className={styles.picker}
        value={value}
        onChange={(e) => setToken(mode, token.name, e.target.value.toLowerCase())}
        aria-label={`${token.label} colour`}
        data-testid={`colour-${mode}-${token.name}`}
      />
      <span className={styles.tokenText}>
        <span className={styles.tokenName}>{token.label}</span>
        <span className={styles.tokenRole}>{token.role}</span>
      </span>
      <input
        className={styles.hex}
        value={value}
        onChange={(e) => {
          const next = e.target.value.trim().toLowerCase();
          if (isHex(next)) setToken(mode, token.name, next);
        }}
        aria-label={`${token.label} hex`}
        spellCheck={false}
      />
      {verdict ? (
        <span
          className={verdict.ok ? styles.pass : styles.warn}
          title="Contrast against the background"
          data-testid={`contrast-${mode}-${token.name}`}
        >
          {verdict.label}
        </span>
      ) : (
        <span className={styles.spacer} />
      )}
      <button
        type="button"
        className={styles.reset}
        disabled={!changed}
        onClick={() => setToken(mode, token.name, null)}
        aria-label={`Reset ${token.label}`}
        data-testid={`reset-${mode}-${token.name}`}
      >
        <Icon name="revert" size={13} />
      </button>
    </li>
  );
}

/** Settings → Appearance (ADR-010): modes, every colour token, the faces and the measure. */
export function AppearanceScreen() {
  const open = useAppearanceStore((s) => s.open);
  const setOpen = useAppearanceStore((s) => s.setOpen);
  const appearance = useAppearanceStore((s) => current(s));
  const useDevice = useAppearanceStore((s) => s.useDevice);
  const setUseDevice = useAppearanceStore((s) => s.setUseDevice);
  const patch = useAppearanceStore((s) => s.patch);
  const resetMode = useAppearanceStore((s) => s.resetMode);
  const resetAll = useAppearanceStore((s) => s.resetAll);
  const folio = useFolioStore((s) => s.folio);
  const setting = (appearance.mode ?? "system") as ModeSetting;
  const [editing, setEditing] = useState<Mode>(resolveMode(setting));
  const type = effectiveType(appearance);

  if (!open) return null;

  // The colours being edited are shown live, whichever mode the app is actually in.
  const preview = () => applyAppearance(appearance, editing);

  return (
    <div className={styles.backdrop} data-testid="appearance-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close appearance settings"
      />
      <div className={styles.panel} role="dialog" aria-label="Appearance">
        <div className={styles.head}>
          <h2 className={styles.title}>Appearance</h2>
          <button type="button" className={styles.small} onClick={resetAll}>
            Reset all
          </button>
          <button
            type="button"
            className={styles.small}
            onClick={() => setOpen(false)}
            data-testid="appearance-close"
          >
            Done
          </button>
        </div>

        <p className={styles.where} data-testid="appearance-where">
          {useDevice
            ? "Saved on this device only."
            : folio
              ? `Saved in ${folio.name} — these follow the Folio to your other machines.`
              : "Open a Folio to save these with your work."}
        </p>

        <section className={styles.section}>
          <h3 className={styles.heading}>Mode</h3>
          <div className={styles.segmented}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={setting === m.id}
                className={setting === m.id ? styles.segmentOn : styles.segment}
                onClick={() => patch({ mode: m.id })}
                data-testid={`mode-${m.id}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.headingRow}>
            <h3 className={styles.heading}>Colours</h3>
            <div className={styles.segmented}>
              {(["paper", "ink"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={editing === m}
                  className={editing === m ? styles.segmentOn : styles.segment}
                  onClick={() => {
                    setEditing(m);
                    applyAppearance(appearance, m);
                  }}
                  data-testid={`edit-${m}`}
                >
                  {m === "paper" ? "Paper" : "Ink"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.small}
              onClick={() => resetMode(editing)}
              data-testid="reset-mode"
            >
              Reset {editing === "paper" ? "Paper" : "Ink"}
            </button>
          </div>
          <ul className={styles.tokens} data-testid="tokens">
            {TOKENS.map((token) => (
              <Swatch key={token.name} mode={editing} token={token} />
            ))}
          </ul>
          <p className={styles.note}>
            Editing {editing === "paper" ? "Paper" : "Ink"} shows it on screen while this is open.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Type</h3>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Editor face</span>
            <select
              className={styles.select}
              value={appearance.editorFont ?? ""}
              onChange={(e) => patch({ editorFont: e.target.value || null })}
              data-testid="editor-font"
            >
              <option value="">AML's own (Source Serif 4, then Times)</option>
              {EDITOR_FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} — {f.bundled ? "bundled" : f.note}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Interface face</span>
            <select
              className={styles.select}
              value={appearance.uiFont ?? ""}
              onChange={(e) => patch({ uiFont: e.target.value || null })}
              data-testid="ui-font"
            >
              <option value="">AML's own (the system face)</option>
              {UI_FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} — {f.note}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Measure</span>
            <input
              type="range"
              min={45}
              max={100}
              step={1}
              value={type.measure}
              onChange={(e) => patch({ measure: Number(e.target.value) })}
              data-testid="measure"
            />
            <span className={styles.value}>{type.measure} characters</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Leading</span>
            <input
              type="range"
              min={1.2}
              max={2.2}
              step={0.05}
              value={type.leading}
              onChange={(e) => patch({ leading: Number(e.target.value) })}
              data-testid="leading"
            />
            <span className={styles.value}>{type.leading.toFixed(2)}</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Paragraph spacing</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={type.paragraphSpacing}
              onChange={(e) => patch({ paragraphSpacing: Number(e.target.value) })}
              data-testid="paragraph-spacing"
            />
            <span className={styles.value}>{type.paragraphSpacing.toFixed(1)} em</span>
          </label>
          <p className={styles.note}>
            AML's own: {TYPE_DEFAULTS.measure} characters, {TYPE_DEFAULTS.leading} leading.
          </p>
        </section>

        <section className={styles.section}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={useDevice}
              onChange={(e) => {
                setUseDevice(e.target.checked);
                preview();
              }}
              data-testid="use-device"
            />
            <span>
              Keep this machine's own appearance
              <span className={styles.tokenRole}>
                Settings made here stay on this device instead of following the Folio.
              </span>
            </span>
          </label>
        </section>
      </div>
    </div>
  );
}
