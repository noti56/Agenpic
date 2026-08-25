import type { HTMLAttributes } from "react";
import styles from "./Panel.module.css";

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.panel, className].filter(Boolean).join(" ")} {...rest} />;
}
