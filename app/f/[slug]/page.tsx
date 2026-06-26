'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import type { BoardForm, FormField } from '../../../lib/supabase';
import { Check, AlertCircle } from 'lucide-react';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const fieldCls =
  'w-full rounded-lg border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-base text-white placeholder-slate-500 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500';
const errorCls = 'border-red-500 focus:ring-red-500';

const compressImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_PX = 1200;
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', 0.82);
    };
    img.onerror = reject;
    img.src = url;
  });

export default function PublicFormPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<BoardForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdCardUrl, setCreatedCardUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const [imageUploadErrors, setImageUploadErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('board_forms')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();
        if (err || !data) {
          setError('This form is not accepting submissions right now.');
          return;
        }
        setForm(data);
        const initial: Record<string, string> = {};
        for (const field of data.fields as FormField[]) initial[field.id] = '';
        setValues(initial);
      } catch {
        setError('Failed to load form.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const setVal = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const handleImageSelect = async (fieldId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageUploadErrors(prev => ({ ...prev, [fieldId]: 'Please select an image file.' }));
      return;
    }
    setUploadingImage(prev => ({ ...prev, [fieldId]: true }));
    setImageUploadErrors(prev => ({ ...prev, [fieldId]: '' }));
    setVal(fieldId, '');
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('image', compressed, 'screenshot.jpg');
      const res = await fetch('/api/forms/upload-screenshot', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      setVal(fieldId, result.url);
    } catch {
      setImageUploadErrors(prev => ({ ...prev, [fieldId]: 'Upload failed. Please try again.' }));
    } finally {
      setUploadingImage(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const validate = (): boolean => {
    if (!form) return false;
    const errors: Record<string, string> = {};
    for (const field of form.fields) {
      // Hidden assignee is applied server-side — skip it.
      if (field.maps_to === 'assignee' && field.assignee_visible === false) continue;
      const val = values[field.id]?.trim() || '';
      if (field.required && !val) {
        errors[field.id] = field.type === 'image' ? `${field.label} is required` : `${field.label} is required`;
      } else if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[field.id] = 'Please enter a valid email address';
      } else if (field.type === 'url' && val && !/^https?:\/\/.+/.test(val)) {
        errors[field.id] = 'Please enter a valid URL (starting with http:// or https://)';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !validate()) return;
    if (Object.values(uploadingImage).some(Boolean)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: form.id, data: values }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Submission failed');
        return;
      }
      if (result.cardId && result.boardId) {
        setCreatedCardUrl(`/boards/${result.boardId}?card=${result.cardId}`);
      }
      setSubmitted(true);
    } catch {
      setError('Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setCreatedCardUrl(null);
    setError(null);
    setFieldErrors({});
    if (form) {
      const initial: Record<string, string> = {};
      for (const field of form.fields) initial[field.id] = '';
      setValues(initial);
    }
  };

  const renderField = (field: FormField) => {
    if (field.type === 'image') {
      const uploaded = values[field.id];
      const uploading = uploadingImage[field.id];
      const imgError = imageUploadErrors[field.id];
      const hasError = !!fieldErrors[field.id];
      return (
        <div>
          {uploaded ? (
            <div className="mb-2 space-y-2">
              <img src={uploaded} alt="Uploaded screenshot" className="max-h-48 w-full rounded-lg border border-slate-600 object-contain bg-slate-900" />
              <button
                type="button"
                onClick={() => setVal(field.id, '')}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                Remove &amp; upload different image
              </button>
            </div>
          ) : (
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
                hasError ? 'border-red-500 bg-red-500/5' : 'border-slate-600 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/50'
              } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(field.id, f); e.target.value = ''; }}
              />
              {uploading ? (
                <>
                  <div className="h-8 w-8 rounded-full border-2 border-slate-500 border-t-white animate-spin" />
                  <span className="text-sm text-slate-400">Uploading…</span>
                </>
              ) : (
                <>
                  <svg className="h-8 w-8 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm font-medium text-slate-300">Click to upload a screenshot</span>
                  <span className="text-xs text-slate-500">PNG, JPG, WebP — compressed automatically</span>
                </>
              )}
            </label>
          )}
          {imgError && <p className="mt-1.5 text-xs text-red-400">{imgError}</p>}
        </div>
      );
    }

    const cls = `${fieldCls} ${fieldErrors[field.id] ? errorCls : ''}`;

    if (field.maps_to === 'assignee') {
      return (
        <select className={cls} value={values[field.id] || ''} onChange={(e) => setVal(field.id, e.target.value)}>
          <option value="">{field.placeholder || 'Select assignee…'}</option>
          {(field.assignee_options || []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      );
    }

    if (field.maps_to === 'priority') {
      return (
        <select className={cls} value={values[field.id] || ''} onChange={(e) => setVal(field.id, e.target.value)}>
          <option value="">{field.placeholder || 'Select priority…'}</option>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.maps_to === 'due_date' || field.type === 'date') {
      return (
        <input
          type="date"
          className={cls}
          value={values[field.id] || ''}
          onChange={(e) => setVal(field.id, e.target.value)}
        />
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          className={`${cls} resize-y`}
          rows={4}
          value={values[field.id] || ''}
          onChange={(e) => setVal(field.id, e.target.value)}
          placeholder={field.placeholder || ''}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select className={cls} value={values[field.id] || ''} onChange={(e) => setVal(field.id, e.target.value)}>
          <option value="">{field.placeholder || 'Select an option…'}</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={cls}
        type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'}
        value={values[field.id] || ''}
        onChange={(e) => setVal(field.id, e.target.value)}
        placeholder={field.placeholder || ''}
      />
    );
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#0f1117] px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        {loading ? (
          <div className="rounded-2xl border border-zinc-700 bg-brand-dark p-8">
            <div className="h-6 w-1/2 animate-pulse rounded bg-slate-700" />
            <div className="mt-6 space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-700" />
                  <div className="h-10 animate-pulse rounded-lg bg-slate-700" />
                </div>
              ))}
            </div>
          </div>
        ) : error && !form ? (
          <div className="rounded-2xl border border-zinc-700 bg-brand-dark px-6 py-14 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-400" strokeWidth={1.6} />
            <p className="mt-4 text-sm text-slate-300">{error}</p>
          </div>
        ) : submitted ? (
          <div className="rounded-2xl border border-zinc-700 bg-brand-dark px-6 py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-green-400">
              <Check className="h-8 w-8" strokeWidth={2} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-white">Submitted!</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
              Your response has been recorded.
              {createdCardUrl && (
                <>
                  {' '}
                  <a href={createdCardUrl} className="font-medium text-slate-300 hover:text-white hover:underline">
                    View card →
                  </a>
                </>
              )}
            </p>
            <button
              onClick={handleReset}
              className="mt-6 rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              Submit another response
            </button>
          </div>
        ) : (
          form && (
            <>
              <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-brand-dark shadow-card-glass">
                <div className="border-b border-zinc-700 px-6 pb-5 pt-7 sm:px-8">
                  <h1 className="text-2xl font-bold tracking-tight text-white">{form.title}</h1>
                  {form.description && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{form.description}</p>}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
                  {form.fields.map((field) => {
                    // Skip hidden assignee, and visible assignee with no members configured.
                    if (field.maps_to === 'assignee') {
                      if (field.assignee_visible === false) return null;
                      if (!field.assignee_options?.length) return null;
                    }
                    return (
                      <div key={field.id}>
                        <label className="mb-2 block text-sm font-medium text-slate-200">
                          {field.label}
                          {field.required && <span className="ml-1 text-red-400">*</span>}
                        </label>
                        {renderField(field)}
                        {fieldErrors[field.id] && <p className="mt-1.5 text-xs text-red-400">{fieldErrors[field.id]}</p>}
                      </div>
                    );
                  })}

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.8} /> {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || Object.values(uploadingImage).some(Boolean)}
                    className="w-full rounded-lg bg-btn-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : Object.values(uploadingImage).some(Boolean) ? 'Uploading image…' : 'Submit'}
                  </button>
                </form>
              </div>
              <p className="mt-5 text-center text-xs text-slate-600">Powered by Radius</p>
            </>
          )
        )}
      </div>
    </div>
  );
}
