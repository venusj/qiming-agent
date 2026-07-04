import type { SelectHTMLAttributes } from 'react';
import styles from './Dropdown.module.css';

export interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Dropdown({ className, children, ...rest }: DropdownProps) {
  return (
    <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}
