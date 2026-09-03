"use client";

/**
 * The four practices a reader answers by choosing.
 *
 * They differ in what they ask and share how they behave: every selection is a
 * toggle, nothing is marked right or wrong, and nothing a reader picks or types
 * leaves the component. There is no `onChange` reaching upward and no request
 * anywhere in this file — the only thing that ever travels is the confirmation
 * the scene sends when the reader presses the button, and that carries no
 * answers.
 *
 * Free text, where a design allows it, is local scaffolding for thinking. It is
 * held in component state, never lifted, never stored, never sent.
 */

import { useState } from "react";
import type {
  BeliefLensPractice,
  ContextPlausibilityPractice,
  FourPartDistinctionPractice,
  SignalContextComparePractice,
} from "@psico/types";
import { practiceStyles as S } from "./practice-ui";

/** A pill that says whether it is chosen in more than one way. */
function Choice({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      style={selected ? { ...S.chip, ...S.chipSelected } : S.chip}
    >
      {label}
    </button>
  );
}

function useToggleSet() {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setPicked((prev) => ({ ...prev, [key]: !prev[key] }));
  return { picked, toggle };
}

/** MG01 — one belief, three questions asked of it. */
export function BeliefLens({
  interaction,
}: {
  interaction: BeliefLensPractice;
}) {
  const { picked, toggle } = useToggleSet();
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <section data-testid="practice-belief-lens">
      <p style={S.subheading}>{interaction.belief}</p>
      {interaction.zones.map((zone) => (
        <div key={zone.key} style={S.zone}>
          <h4 style={S.subheading}>{zone.label}</h4>
          <p style={S.hint}>{zone.hint}</p>
          <div style={S.chipRow} role="group" aria-label={zone.label}>
            {zone.options.map((o) => (
              <Choice
                key={o.key}
                label={o.label}
                selected={Boolean(picked[`${zone.key}:${o.key}`])}
                onToggle={() => toggle(`${zone.key}:${o.key}`)}
              />
            ))}
          </div>
          {interaction.allowsFreeText ? (
            <label>
              <span style={S.srOnly}>{`Escribe lo tuyo: ${zone.label}`}</span>
              <textarea
                rows={2}
                style={S.textarea}
                placeholder="Si prefieres, escríbelo con tus palabras…"
                value={notes[zone.key] ?? ""}
                onChange={(e) =>
                  setNotes((p) => ({ ...p, [zone.key]: e.target.value }))
                }
              />
            </label>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** MG02 — the same expression, sorted by how well each reading fits. */
export function ContextPlausibility({
  interaction,
}: {
  interaction: ContextPlausibilityPractice;
}) {
  const [assigned, setAssigned] = useState<Record<string, string>>({});

  return (
    <section data-testid="practice-context-plausibility">
      <p style={S.subheading}>{interaction.situation}</p>
      <div style={S.zone}>
        <h4 style={S.subheading}>Qué se observa</h4>
        <p style={S.hint}>{interaction.observation}</p>
        <h4 style={S.subheading}>Contexto disponible</h4>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {interaction.availableContext.map((c) => (
            <li key={c} style={S.hint}>
              {c}
            </li>
          ))}
        </ul>
      </div>

      {interaction.readings.map((reading) => (
        <div key={reading.key} style={S.zone}>
          <p style={S.subheading}>{reading.label}</p>
          <div style={S.chipRow} role="group" aria-label={reading.label}>
            {interaction.buckets.map((bucket) => (
              <Choice
                key={bucket.key}
                label={bucket.label}
                selected={assigned[reading.key] === bucket.key}
                onToggle={() =>
                  setAssigned((p) => ({
                    ...p,
                    [reading.key]:
                      p[reading.key] === bucket.key ? "" : bucket.key,
                  }))
                }
              />
            ))}
          </div>
        </div>
      ))}

      <p style={S.disclaimer}>{interaction.missingInformationPrompt}</p>
    </section>
  );
}

/** MG04 — four fields that are not the same field. */
export function FourPartDistinction({
  interaction,
}: {
  interaction: FourPartDistinctionPractice;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <section data-testid="practice-four-part">
      <p style={S.subheading}>{interaction.scenario}</p>
      {interaction.fields.map((field) => (
        <div key={field.key} style={S.zone}>
          <h4 style={S.subheading}>{field.label}</h4>
          <div style={S.chipRow} role="group" aria-label={field.label}>
            {field.options.map((o) => (
              <Choice
                key={o.key}
                label={o.label}
                selected={chosen[field.key] === o.key}
                onToggle={() =>
                  setChosen((p) => ({
                    ...p,
                    [field.key]: p[field.key] === o.key ? "" : o.key,
                  }))
                }
              />
            ))}
          </div>
          {interaction.allowsFreeText ? (
            <label>
              <span style={S.srOnly}>{`Escribe lo tuyo: ${field.label}`}</span>
              <textarea
                rows={2}
                style={S.textarea}
                placeholder="O escríbelo con tus palabras…"
                value={notes[field.key] ?? ""}
                onChange={(e) =>
                  setNotes((p) => ({ ...p, [field.key]: e.target.value }))
                }
              />
            </label>
          ) : null}
        </div>
      ))}
      <p style={S.disclaimer}>{interaction.disclaimer}</p>
    </section>
  );
}

/** MG05 — the same signals in two situations. */
export function SignalContextCompare({
  interaction,
}: {
  interaction: SignalContextComparePractice;
}) {
  const { picked, toggle } = useToggleSet();

  return (
    <section data-testid="practice-signal-context">
      <div style={S.zone}>
        <h4 style={S.subheading}>Las mismas señales</h4>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {interaction.signals.map((s) => (
            <li key={s} style={S.hint}>
              {s}
            </li>
          ))}
        </ul>
      </div>

      {interaction.contexts.map((ctx) => (
        <div key={ctx.key} style={S.zone}>
          <h4 style={S.subheading}>{ctx.label}</h4>
          <p style={S.hint}>{ctx.description}</p>
        </div>
      ))}

      <p style={S.subheading}>{interaction.prompt}</p>
      <div style={S.chipRow} role="group" aria-label={interaction.prompt}>
        {interaction.factors.map((f) => (
          <Choice
            key={f.key}
            label={f.label}
            selected={Boolean(picked[f.key])}
            onToggle={() => toggle(f.key)}
          />
        ))}
      </div>
    </section>
  );
}
