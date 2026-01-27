import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles = {
  primary: [
    'bg-primary-600 text-white',
    'hover:bg-primary-700 active:bg-primary-800',
    'focus-visible:ring-primary-500',
    'shadow-sm hover:shadow',
    'dark:bg-primary-500 dark:hover:bg-primary-600',
  ].join(' '),
  secondary: [
    'bg-secondary-100 text-secondary-700',
    'hover:bg-secondary-200 active:bg-secondary-300',
    'focus-visible:ring-secondary-500',
    'dark:bg-secondary-700 dark:text-secondary-200',
    'dark:hover:bg-secondary-600 dark:active:bg-secondary-500',
  ].join(' '),
  outline: [
    'border border-secondary-300 bg-transparent text-secondary-700',
    'hover:bg-secondary-50 active:bg-secondary-100',
    'focus-visible:ring-secondary-500',
    'dark:border-secondary-600 dark:text-secondary-300',
    'dark:hover:bg-secondary-800 dark:active:bg-secondary-700',
  ].join(' '),
  ghost: [
    'bg-transparent text-secondary-600',
    'hover:bg-secondary-100 active:bg-secondary-200',
    'focus-visible:ring-secondary-500',
    'dark:text-secondary-400',
    'dark:hover:bg-secondary-800 dark:active:bg-secondary-700',
  ].join(' '),
  danger: [
    'bg-error-600 text-white',
    'hover:bg-error-700 active:bg-error-800',
    'focus-visible:ring-error-500',
    'shadow-sm hover:shadow',
    'dark:bg-error-600 dark:hover:bg-error-700',
  ].join(' '),
  success: [
    'bg-success-600 text-white',
    'hover:bg-success-700 active:bg-success-800',
    'focus-visible:ring-success-500',
    'shadow-sm hover:shadow',
    'dark:bg-success-600 dark:hover:bg-success-700',
  ].join(' '),
  link: [
    'bg-transparent text-primary-600 underline-offset-4',
    'hover:underline hover:text-primary-700',
    'focus-visible:ring-primary-500',
    'dark:text-primary-400 dark:hover:text-primary-300',
    'p-0 h-auto',
  ].join(' '),
};

const sizeStyles = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-5 text-base gap-2 rounded-lg',
  xl: 'h-11 px-6 text-base gap-2.5 rounded-lg',
  icon: 'h-9 w-9 rounded-lg p-0',
};

const iconSizes = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-5 h-5',
  icon: 'w-4 h-4',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles = [
      'inline-flex items-center justify-center',
      'font-medium',
      'transition-all duration-200 ease-out',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      'select-none',
    ].join(' ');

    const classes = [
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      fullWidth && 'w-full',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className={`${iconSizes[size]} animate-spin`} />
            {size !== 'icon' && <span>Loading...</span>}
          </>
        ) : (
          <>
            {leftIcon && (
              <span className={`${iconSizes[size]} flex-shrink-0`}>
                {leftIcon}
              </span>
            )}
            {children}
            {rightIcon && (
              <span className={`${iconSizes[size]} flex-shrink-0`}>
                {rightIcon}
              </span>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Icon Button variant for convenience
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', ...props }, ref) => {
    return (
      <Button ref={ref} size="icon" {...props}>
        <span className={iconSizes[size]}>{icon}</span>
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default Button;
