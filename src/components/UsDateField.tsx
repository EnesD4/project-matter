import React from "react";
import DarkCalendar from "./DarkCalendar";
import { isoToUsDate, maskUsDateInput, parseToIsoDate } from "../lib/usDate";

type UsDateFieldProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onCommit?: (iso: string | null) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  labelledBy?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  inputStyle?: React.CSSProperties;
  wrapStyle?: React.CSSProperties;
};

export default function UsDateField({
  id,
  value,
  onChange,
  onCommit,
  min,
  max,
  disabled,
  labelledBy,
  autoFocus,
  autoComplete = "bday",
  inputStyle,
  wrapStyle,
}: UsDateFieldProps) {
  const iso = parseToIsoDate(value);

  const applyText = (raw: string) => {
    onChange(maskUsDateInput(raw));
  };

  const commit = (nextIso: string | null) => {
    if (nextIso) onChange(isoToUsDate(nextIso));
    onCommit?.(nextIso);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, ...wrapStyle }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder="MM/DD/YYYY"
        maxLength={10}
        disabled={disabled}
        aria-labelledby={labelledBy}
        value={value}
        onChange={(event) => applyText(event.target.value)}
        onBlur={() => commit(parseToIsoDate(value))}
        style={{ flex: 1, minWidth: 0, ...inputStyle }}
      />
      <DarkCalendar
        value={iso ?? ""}
        min={min}
        max={max}
        labelledBy={labelledBy}
        ariaLabel="Choose date from calendar"
        onChange={(nextIso) => commit(nextIso)}
      />
    </div>
  );
}
