'use client';

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Icon from './Icon';
import { cx } from './cx';

interface FieldProps {
    /** Visible label above the field. */
    label: string;
    /** Help text under the field. */
    hint?: string;
    /** Error text. Replaces the hint and marks the field invalid. */
    error?: string;
    className?: string;
}

type InputFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { multiline?: false };
type TextareaFieldProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { multiline: true };

export type TextFieldProps = InputFieldProps | TextareaFieldProps;

export default function TextField(props: TextFieldProps) {
    const autoId = useId();
    const { label, hint, error, className, id: givenId } = props;
    const id = givenId ?? autoId;
    const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
    const controlProps = {
        id,
        className: 'lk-field__control',
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
    };

    let control;
    if (props.multiline) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { label: _l, hint: _h, error: _e, className: _c, multiline: _m, ...rest } = props;
        control = <textarea {...rest} {...controlProps} />;
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { label: _l, hint: _h, error: _e, className: _c, multiline: _m, ...rest } = props;
        control = <input {...rest} {...controlProps} />;
    }

    return (
        <div className={cx('lk-field', error && 'lk-field--error', className)}>
            <label className="lk-field__label" htmlFor={id}>{label}</label>
            {control}
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
