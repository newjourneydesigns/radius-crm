'use client';

import type { QuestionResponseKey } from '../../lib/circle-leader-toolkit/dynamic-question-response-keys';

// Shared renderer + option helpers for the admin-configured dynamic questions.
// Used by the real event summary form (EventFormClient) and the onboarding
// practice form (OnboardingClient) so both render leader questions identically.

export type DynamicQuestionOption = {
  label: string;
  value: string;
  followup_label?: string;
  followup_required?: boolean;
};

export type DynamicQuestion = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: 'text' | 'textarea' | 'dropdown' | 'multiselect' | 'checkbox' | 'radio';
  options: Array<string | DynamicQuestionOption>;
  required: boolean;
  response_key?: QuestionResponseKey | null;
  show_when_did_not_meet: boolean;
  show_when_attended: boolean;
};

export type DynamicValue = string | string[] | boolean | null;

export function dynamicValueToString(value: DynamicValue | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : '';
  return typeof value === 'string' ? value : '';
}

export function getQuestionOptions(question: DynamicQuestion): DynamicQuestionOption[] {
  return (question.options || []).map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option
  );
}

export function getSelectedOption(
  question: DynamicQuestion,
  value: DynamicValue | undefined
): DynamicQuestionOption | null {
  if (typeof value !== 'string') return null;
  return getQuestionOptions(question).find((option) => option.value === value) ?? null;
}

export function getSelectedOptions(
  question: DynamicQuestion,
  value: DynamicValue | undefined
): DynamicQuestionOption[] {
  const options = getQuestionOptions(question);
  if (Array.isArray(value)) return options.filter((option) => value.includes(option.value));
  if (typeof value === 'string') {
    const selected = options.find((option) => option.value === value);
    return selected ? [selected] : [];
  }
  return [];
}

export function optionFollowupKey(questionId: string, optionValue: string): string {
  return `${questionId}::${optionValue}`;
}

export function AutoGrowTextarea({
  value,
  onChange,
  rows = 3,
  className = 'cs-textarea',
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  className?: string;
  id?: string;
}) {
  // Grown by CSS, not JS. The wrapper mirrors the current value into an
  // invisible ::after that shares the textarea's grid cell, so the cell — and
  // the textarea stretched into it — is always exactly as tall as the text.
  //
  // The JS version measured scrollHeight, which meant collapsing the field to
  // `height: auto` on every keystroke. That momentarily shortened the whole
  // document, so the page had to be scrolled back into place afterwards. On iOS
  // the round trip left the document with a stale scroll extent: the page
  // rendered in full but stopped scrolling partway down, the rest of the form
  // and the fixed submit bar could only be glimpsed by dragging against the
  // rubber band, and nothing down there was tappable until a reload. Sizing in
  // layout instead never touches the page height or the scroll position.
  return (
    <div className="cs-autogrow" data-replicated-value={value}>
      <textarea
        id={id}
        rows={rows}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function DynamicQuestionField({
  question,
  value,
  getFollowupText,
  onFollowupTextChange,
  onChange,
}: {
  question: DynamicQuestion;
  value: DynamicValue | undefined;
  getFollowupText?: (optionValue: string) => string;
  onFollowupTextChange?: (optionValue: string, text: string) => void;
  onChange: (v: DynamicValue) => void;
}) {
  const opts = getQuestionOptions(question);
  const selectedOptions = getSelectedOptions(question, value);
  const followupOptions = selectedOptions.filter(
    (option) => !!(option.followup_label || option.followup_required)
  );

  function renderFollowups() {
    if (!onFollowupTextChange || followupOptions.length === 0) return null;
    return (
      <div className="mt-3 space-y-3">
        {followupOptions.map((option) => (
          <div key={option.value}>
            <label className="cs-label">
              {option.followup_label}
              {option.followup_required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <AutoGrowTextarea
              value={getFollowupText?.(option.value) || ''}
              onChange={(text) => onFollowupTextChange(option.value, text)}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label className="cs-label">
        {question.label}
        {question.required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {question.help_text && <p className="cs-help -mt-1 mb-2">{question.help_text}</p>}

      {question.field_type === 'text' && (
        <input
          type="text"
          className="cs-input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {question.field_type === 'textarea' && (
        <AutoGrowTextarea
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v)}
        />
      )}
      {question.field_type === 'dropdown' && (
        <select
          className="cs-select"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {question.field_type === 'dropdown' && renderFollowups()}
      {question.field_type === 'radio' && (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                className="cs-radio"
                name={question.id}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
      {question.field_type === 'radio' && renderFollowups()}
      {question.field_type === 'multiselect' && (
        <div className="space-y-1.5">
          {opts.map((o) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="cs-check"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                  }
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
      {question.field_type === 'multiselect' && renderFollowups()}
      {question.field_type === 'checkbox' &&
        (opts.length > 0 ? (
          <div className="space-y-1.5">
            {opts.map((o) => {
              const arr: string[] = Array.isArray(value) ? value : [];
              const checked = arr.includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="cs-check"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                    }
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="cs-check"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>Yes</span>
          </label>
        ))}
      {question.field_type === 'checkbox' && opts.length > 0 && renderFollowups()}
    </div>
  );
}
