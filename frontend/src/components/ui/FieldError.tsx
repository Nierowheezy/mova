// src/components/ui/FieldError.tsx
// Inline validation message rendered under a form field. Mounted only when a
// message exists so empty space doesn't shift layout.
const FieldError = ({ message, id }: { message?: string; id?: string }) => {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-current opacity-70" />
            {message}
        </p>
    );
};

export default FieldError;