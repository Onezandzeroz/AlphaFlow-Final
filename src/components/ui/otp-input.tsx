'use client';

import { useState, useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────

interface OTPInputProps {
  /** Number of digits (default: 6) */
  length?: number;
  /** Called when all digits are filled */
  onComplete: (value: string) => void;
  /** Controlled value (optional) */
  value?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Error state */
  error?: boolean;
  /** Auto-focus first input */
  autoFocus?: boolean;
  /** Input type */
  type?: 'numeric' | 'alphanumeric';
  /** Additional CSS classes */
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function OTPInput({
  length = 6,
  onComplete,
  value,
  disabled = false,
  error = false,
  autoFocus = true,
  type = 'numeric',
  className,
}: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [internalValue, setInternalValue] = useState<string[]>(
    value ? value.split('') : Array(length).fill('')
  );

  // Sync controlled value
  const values = value ? value.split('') : internalValue;

  const setValue = useCallback((newValues: string[]) => {
    setInternalValue(newValues);
    const result = newValues.join('');
    // Only call onComplete if all fields are filled
    if (result.length === length && !newValues.includes('')) {
      onComplete(result);
    }
  }, [length, onComplete]);

  const handleChange = useCallback((index: number, char: string) => {
    // Filter based on type
    const filtered = type === 'numeric' ? char.replace(/\D/g, '') : char.toUpperCase();
    if (!filtered) return;

    const newValues = [...values];
    newValues[index] = filtered.charAt(0);
    setValue(newValues);

    // Move focus to next input
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [values, length, setValue, type]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newValues = [...values];

      if (values[index]) {
        // Clear current field
        newValues[index] = '';
      } else if (index > 0) {
        // Clear previous field and focus it
        newValues[index - 1] = '';
        inputRefs.current[index - 1]?.focus();
      }

      setInternalValue(newValues);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }, [values, length]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();

    if (type === 'numeric' && !/^\d+$/.test(pasted)) return;
    if (type === 'alphanumeric' && !/^[A-Z0-9]+$/.test(pasted.toUpperCase())) return;

    const chars = pasted.split('').slice(0, length);
    const newValues = Array(length).fill('');
    chars.forEach((char, i) => {
      newValues[i] = type === 'alphanumeric' ? char.toUpperCase() : char;
    });

    setValue(newValues);

    // Focus the next empty field or the last one
    const nextEmpty = newValues.findIndex(v => !v);
    const focusIndex = nextEmpty === -1 ? length - 1 : nextEmpty;
    inputRefs.current[focusIndex]?.focus();
  }, [length, setValue, type]);

  const handleFocus = useCallback((index: number) => {
    // Select all text on focus for easy replacement
    inputRefs.current[index]?.select();
  }, []);

  return (
    <div className={cn('flex items-center gap-2 justify-center', className)}>
      {Array.from({ length }).map((_, index) => (
        <Input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode={type === 'numeric' ? 'numeric' : 'text'}
          maxLength={1}
          value={values[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          className={cn(
            'w-11 h-13 text-center text-lg font-bold font-mono rounded-xl transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'bg-white/60 dark:bg-white/5',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30 text-red-700 dark:text-red-400'
              : 'border-gray-300 dark:border-white/15 focus:border-[#0d9488] focus:ring-[#0d9488]/30 text-gray-900 dark:text-white',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={`Digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
        />
      ))}
    </div>
  );
}
