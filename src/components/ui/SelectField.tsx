'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import Icon from './Icon';
import { cx } from './cx';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
    /** Visible label above the field. */
    label: string;
    /** Help text under the field. */
    hint?: string;
    /** Error text. Replaces the hint and marks the field invalid. */
    error?: string;
    /** First, empty choice, e.g. "Choose your library". */
    placeholder?: string;
    options: ReadonlyArray<string | { value: string; label: string }>;
    className?: string;
}

/** A native select with the TextField label, hint and error. Not in the locked system; it follows TextField. */
export default function SelectField({ label, hint, error, placeholder, options, className, id: givenId, ...rest }: SelectFieldProps) {
    const autoId = useId();
    const id = givenId ?? autoId;
    const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;

    return (
        <div className={cx('lk-field', error && 'lk-field--error', className)}>
            <label className="lk-field__label" htmlFor={id}>{label}</label>
            <select
                {...rest}
                id={id}
                className="lk-field__control lk-field__select"
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
            >
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {options.map((o) => {
                    const opt = typeof o === 'string' ? { value: o, label: o } : o;
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                })}
            </select>
            {error ? (
                <p className="lk-field__error" id={`${id}-err`}>
                    <Icon name="alert" size={20} />
                    {error}
                </p>
            ) : hint ? (
                <p className="lk-field__hint" id={`${id}-hint`}>{hint}</p>
            ) : null}
        </div>
    );
}
