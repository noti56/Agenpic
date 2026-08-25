import { useId, type InputHTMLAttributes } from "react";
import styles from "./TextInput.module.css";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function TextInput({ label, id, className, ...rest }: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={[styles.input, className].filter(Boolean).join(" ")} {...rest} />
    </div>
  );
}
