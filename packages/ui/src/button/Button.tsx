import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className, ...rest }, ref) => (
    <button
      ref={ref}
      className={[styles.btn, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';
