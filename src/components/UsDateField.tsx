import React from "react";
import DarkCalendar from "./DarkCalendar";
import {
  isoToDisplayDate,
  maskDateInput,
  parseToIsoDate,
  type DateDisplayOrder,
} from "../lib/usDate";

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
  order?: DateDisplayOrder;
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
  order = "MDY",
  inputStyle,
  wrapStyle,
}: UsDateFieldProps) {
  const iso = parseToIsoDate(value, order);

  const applyText = (raw: string) => {
    onChange(maskDateInput(raw, order, value));
  };

  const onTyped = (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    applyText((event.target as HTMLInputElement).value);
  };

  const commit = (nextIso: string | null) => {
    if (nextIso) onChange(isoToDisplayDate(nextIso, order));
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
        placeholder={order === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY"}
        maxLength={10}
        disabled={disabled}
        aria-labelledby={labelledBy}
        value={value}
        onChange={onTyped}
        onInput={onTyped}
        onBlur={() => commit(parseToIsoDate(value, order))}
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
