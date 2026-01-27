import React from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: string;
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const sizeStyles = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
};

const iconSizes = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      success,
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth = true,
      className = '',
      id,
      type = 'text',
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const hasError = Boolean(error);
    const hasSuccess = Boolean(success);

    const baseStyles = [
      'w-full rounded-lg border bg-white',
      'text-secondary-900 placeholder:text-secondary-400',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2',
      'disabled:bg-secondary-100 disabled:cursor-not-allowed disabled:text-secondary-500',
      'dark:bg-secondary-800 dark:text-secondary-100',
      'dark:placeholder:text-secondary-500',
    ].join(' ');

    const stateStyles = hasError
      ? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
      : hasSuccess
      ? 'border-success-500 focus:ring-success-500/20 focus:border-success-500'
      : 'border-secondary-300 focus:ring-primary-500/20 focus:border-primary-500 dark:border-secondary-600 dark:focus:border-primary-400';

    const inputClasses = [
      baseStyles,
      stateStyles,
      sizeStyles[size],
      leftIcon && 'pl-10',
      (rightIcon || isPassword) && 'pr-10',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const containerClasses = fullWidth ? 'w-full' : '';

    return (
      <div className={containerClasses}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconSizes[size]} text-secondary-400`}>
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={inputType}
            className={inputClasses}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-helper`
                : undefined
            }
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconSizes[size]} text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition-colors`}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          )}

          {!isPassword && rightIcon && (
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconSizes[size]} text-secondary-400`}>
              {rightIcon}
            </div>
          )}

          {!isPassword && !rightIcon && hasError && (
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconSizes[size]} text-error-500`}>
              <AlertCircle />
            </div>
          )}

          {!isPassword && !rightIcon && hasSuccess && (
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconSizes[size]} text-success-500`}>
              <CheckCircle2 />
            </div>
          )}
        </div>

        {(error || success || helperText) && (
          <p
            id={hasError ? `${inputId}-error` : `${inputId}-helper`}
            className={`mt-1.5 text-xs ${
              hasError
                ? 'text-error-600 dark:text-error-400'
                : hasSuccess
                ? 'text-success-600 dark:text-success-400'
                : 'text-secondary-500 dark:text-secondary-400'
            }`}
          >
            {error || success || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Textarea component
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: string;
  fullWidth?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      success,
      fullWidth = true,
      className = '',
      id,
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const inputId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    const hasError = Boolean(error);
    const hasSuccess = Boolean(success);

    const baseStyles = [
      'w-full rounded-lg border bg-white px-3 py-2 text-sm',
      'text-secondary-900 placeholder:text-secondary-400',
      'transition-all duration-200 resize-y min-h-[80px]',
      'focus:outline-none focus:ring-2',
      'disabled:bg-secondary-100 disabled:cursor-not-allowed disabled:text-secondary-500',
      'dark:bg-secondary-800 dark:text-secondary-100',
      'dark:placeholder:text-secondary-500',
    ].join(' ');

    const stateStyles = hasError
      ? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
      : hasSuccess
      ? 'border-success-500 focus:ring-success-500/20 focus:border-success-500'
      : 'border-secondary-300 focus:ring-primary-500/20 focus:border-primary-500 dark:border-secondary-600 dark:focus:border-primary-400';

    const textareaClasses = [baseStyles, stateStyles, className].filter(Boolean).join(' ');
    const containerClasses = fullWidth ? 'w-full' : '';

    return (
      <div className={containerClasses}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          className={textareaClasses}
          disabled={disabled}
          rows={rows}
          aria-invalid={hasError}
          {...props}
        />

        {(error || success || helperText) && (
          <p
            className={`mt-1.5 text-xs ${
              hasError
                ? 'text-error-600 dark:text-error-400'
                : hasSuccess
                ? 'text-success-600 dark:text-success-400'
                : 'text-secondary-500 dark:text-secondary-400'
            }`}
          >
            {error || success || helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Input;
