import React from 'react';
import { X } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles = {
  default: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-700 dark:text-secondary-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-600 dark:bg-secondary-700 dark:text-secondary-300',
  success: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300',
  warning: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300',
  error: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300',
  destructive: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300',
  info: 'bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-300',
  outline: 'bg-transparent border border-secondary-300 text-secondary-700 dark:border-secondary-600 dark:text-secondary-300',
};

const dotColors = {
  default: 'bg-secondary-500',
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
  destructive: 'bg-error-500',
  info: 'bg-info-500',
  outline: 'bg-secondary-500',
};

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-2xs gap-1',
  md: 'px-2 py-0.5 text-xs gap-1.5',
  lg: 'px-2.5 py-1 text-sm gap-1.5',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      dot = false,
      removable = false,
      onRemove,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      'inline-flex items-center rounded-full font-medium transition-colors',
      variantStyles[variant],
      sizeStyles[size],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span ref={ref} className={classes} {...props}>
        {dot && (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
        )}
        {children}
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="ml-0.5 -mr-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// Status Badge with predefined status colors
export interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'completed' | 'cancelled' | 'draft' | 'published' | 'archived';
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<StatusBadgeProps['status'], { variant: BadgeProps['variant']; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'secondary', label: 'Inactive' },
  pending: { variant: 'warning', label: 'Pending' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'error', label: 'Cancelled' },
  draft: { variant: 'secondary', label: 'Draft' },
  published: { variant: 'success', label: 'Published' },
  archived: { variant: 'secondary', label: 'Archived' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} size={size} dot={showDot} className={className}>
      {config.label}
    </Badge>
  );
};

// Count Badge (for notifications, etc.)
export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: 'primary' | 'error' | 'warning' | 'success';
  size?: 'sm' | 'md';
  className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  max = 99,
  variant = 'error',
  size = 'sm',
  className = '',
}) => {
  const displayCount = count > max ? `${max}+` : count.toString();

  const sizeClasses = {
    sm: 'min-w-[18px] h-[18px] text-2xs px-1',
    md: 'min-w-[22px] h-[22px] text-xs px-1.5',
  };

  const variantClasses = {
    primary: 'bg-primary-600 text-white',
    error: 'bg-error-600 text-white',
    warning: 'bg-warning-500 text-white',
    success: 'bg-success-600 text-white',
  };

  if (count === 0) return null;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {displayCount}
    </span>
  );
};

export default Badge;
