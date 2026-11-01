import { useId, useRef } from 'react';
import { buttonClasses } from './Button';

/** An accessible "choose image" button. Calls onFile(file) with the chosen JPEG, PNG or WebP. */
export default function FileButton({ children, onFile, disabled, variant = 'outline', size = 'md' }) {
  const id = useId();
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ''; // allow choosing the same file again
        }}
      />
      <label htmlFor={id} className={`${buttonClasses({ variant, size })} cursor-pointer has-[:focus-visible]:ring-2 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
        {children}
      </label>
    </>
  );
}
