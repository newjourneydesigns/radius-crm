'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Brush, Eraser, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import getStroke from 'perfect-freehand';
import type { NotebookInk, NotebookInkStroke } from '../../lib/supabase';

const LOGICAL_WIDTH = 1100;
const MIN_HEIGHT = 1400;
const GROW_ZONE = 200;
const GROW_BY = 600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const MAX_INK_BYTES = 1_000_000;

type Tool = 'pen' | 'eraser';
type Point = [number, number, number];
type Viewport = { scale: number; translateY: number };

interface NotebookInkCanvasProps {
  pageId: string;
  ink: NotebookInk | null;
  onChange: (ink: NotebookInk) => void;
}

function makeEmptyInk(viewportHeight = MIN_HEIGHT): NotebookInk {
  return {
    version: 1,
    logicalWidth: LOGICAL_WIDTH,
    contentHeight: Math.max(MIN_HEIGHT, Math.ceil(viewportHeight)),
    strokes: [],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function strokeToPath(points: Point[], size: number) {
  if (!points.length) return '';
  const outline = getStroke(points, {
    size,
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: false,
  });
  if (!outline.length) return '';

  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...outline[0], 'Q'] as Array<string | number>,
  );
  d.push('Z');
  return d.join(' ');
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitStroke(stroke: NotebookInkStroke, point: Point, eraserRadius: number) {
  const threshold = stroke.size + eraserRadius;
  if (stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    return Math.hypot(point[0] - x, point[1] - y) <= threshold;
  }
  for (let i = 1; i < stroke.points.length; i += 1) {
    const [ax, ay] = stroke.points[i - 1];
    const [bx, by] = stroke.points[i];
    if (distanceToSegment(point[0], point[1], ax, ay, bx, by) <= threshold) return true;
  }
  return false;
}

function removeDuplicatePoints(points: Point[], threshold = 0.25) {
  if (points.length <= 2) return points;
  const keep: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = keep[keep.length - 1];
    if (Math.hypot(points[i][0] - previous[0], points[i][1] - previous[1]) >= threshold) {
      keep.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  const previous = keep[keep.length - 1];
  if (last !== previous) keep.push(last);
  return keep;
}

function getInkByteSize(ink: NotebookInk) {
  return new Blob([JSON.stringify(ink)]).size;
}

export default function NotebookInkCanvas({ pageId, ink, onChange }: NotebookInkCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointersRef = useRef(new Map<number, Point>());
  const strokePointerRef = useRef<number | null>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const pinchRef = useRef<{ distance: number; scale: number; centerY: number; translateY: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [draftInk, setDraftInk] = useState<NotebookInk>(() => ink ?? makeEmptyInk());
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#f8fafc');
  const [size, setSize] = useState(8);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, translateY: 0 });
  const [pencilSeen, setPencilSeen] = useState(false);
  const [pencilOnly, setPencilOnly] = useState(false);
  const [undoStack, setUndoStack] = useState<NotebookInk[]>([]);
  const [redoStack, setRedoStack] = useState<NotebookInk[]>([]);
  const [payloadWarning, setPayloadWarning] = useState(false);

  useEffect(() => {
    setDraftInk(ink ?? makeEmptyInk(viewportRef.current?.clientHeight));
    setUndoStack([]);
    setRedoStack([]);
    clearCanvas();
  }, [pageId, ink]);

  const paths = useMemo(
    () => draftInk.strokes.map(stroke => ({ ...stroke, path: strokeToPath(stroke.points, stroke.size) })),
    [draftInk.strokes],
  );

  const clampTranslate = useCallback((scale: number, translateY: number) => {
    const viewportHeight = viewportRef.current?.clientHeight ?? 0;
    const stageHeight = (stageRef.current?.offsetHeight ?? draftInk.contentHeight) * scale;
    const min = Math.min(0, viewportHeight - stageHeight - 80);
    return clamp(translateY, min, 80);
  }, [draftInk.contentHeight]);

  const updateViewport = useCallback((next: Viewport) => {
    const scale = clamp(next.scale, MIN_ZOOM, MAX_ZOOM);
    setViewport({ scale, translateY: clampTranslate(scale, next.translateY) });
  }, [clampTranslate]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const drawInProgress = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (canvas.width !== draftInk.logicalWidth || canvas.height !== draftInk.contentHeight) {
      canvas.width = draftInk.logicalWidth;
      canvas.height = draftInk.contentHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const points = currentStrokeRef.current;
    if (!points.length) return;
    const path = strokeToPath(points, size);
    if (!path) return;
    ctx.fillStyle = color;
    ctx.fill(new Path2D(path));
  }, [color, draftInk.contentHeight, draftInk.logicalWidth, size]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(drawInProgress);
  }, [drawInProgress]);

  const pointFromEvent = useCallback((event: React.PointerEvent | PointerEvent): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0, 0.5];
    const x = clamp(((event.clientX - rect.left) / rect.width) * draftInk.logicalWidth, 0, draftInk.logicalWidth);
    const y = clamp(((event.clientY - rect.top) / rect.height) * draftInk.contentHeight, 0, draftInk.contentHeight);
    const pressure = event.pointerType === 'mouse' ? 0.5 : clamp(Math.pow(event.pressure || 0.5, 0.5), 0.05, 1);
    return [x, y, pressure];
  }, [draftInk.contentHeight, draftInk.logicalWidth]);

  const commitInk = useCallback((nextInk: NotebookInk) => {
    setDraftInk(nextInk);
    setPayloadWarning(getInkByteSize(nextInk) > MAX_INK_BYTES);
    onChange(nextInk);
  }, [onChange]);

  const pushHistory = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-24), draftInk]);
    setRedoStack([]);
  }, [draftInk]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    activePointersRef.current.set(event.pointerId, point);

    if (event.pointerType === 'pen') {
      setPencilSeen(true);
      setPencilOnly(true);
    }

    if (activePointersRef.current.size >= 2) {
      currentStrokeRef.current = [];
      strokePointerRef.current = null;
      clearCanvas();
      const points = Array.from(activePointersRef.current.values());
      pinchRef.current = {
        distance: Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]),
        scale: viewport.scale,
        centerY: event.clientY,
        translateY: viewport.translateY,
      };
      return;
    }

    if (pencilOnly && event.pointerType === 'touch') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokePointerRef.current = event.pointerId;

    if (tool === 'eraser') {
      deletedIdsRef.current = new Set();
      eraseAt(point);
      return;
    }

    currentStrokeRef.current = [point];
    scheduleDraw();
  };

  const eraseAt = (point: Point) => {
    for (let i = draftInk.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = draftInk.strokes[i];
      if (!deletedIdsRef.current.has(stroke.id) && hitStroke(stroke, point, 14)) {
        deletedIdsRef.current.add(stroke.id);
        break;
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    activePointersRef.current.set(event.pointerId, point);

    if (activePointersRef.current.size >= 2 && pinchRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const distance = Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
      const nextScale = clamp(pinchRef.current.scale * (distance / Math.max(1, pinchRef.current.distance)), MIN_ZOOM, MAX_ZOOM);
      updateViewport({
        scale: nextScale,
        translateY: pinchRef.current.translateY + (event.clientY - pinchRef.current.centerY),
      });
      return;
    }

    if (strokePointerRef.current !== event.pointerId) return;
    if (tool === 'eraser') {
      eraseAt(point);
      return;
    }
    currentStrokeRef.current.push(point);
    scheduleDraw();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;

    if (strokePointerRef.current !== event.pointerId) return;
    strokePointerRef.current = null;

    if (tool === 'eraser') {
      if (deletedIdsRef.current.size) {
        pushHistory();
        commitInk({
          ...draftInk,
          strokes: draftInk.strokes.filter(stroke => !deletedIdsRef.current.has(stroke.id)),
        });
      }
      deletedIdsRef.current = new Set();
      return;
    }

    const points = removeDuplicatePoints(currentStrokeRef.current);
    currentStrokeRef.current = [];
    clearCanvas();
    if (points.length < 2) return;

    pushHistory();
    const maxY = Math.max(...points.map(p => p[1]));
    const contentHeight = maxY > draftInk.contentHeight - GROW_ZONE
      ? draftInk.contentHeight + GROW_BY
      : draftInk.contentHeight;
    commitInk({
      ...draftInk,
      contentHeight,
      strokes: [
        ...draftInk.strokes,
        {
          id: crypto.randomUUID(),
          mode: 'pen',
          color,
          size,
          points,
        },
      ],
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -0.08 : 0.08;
      updateViewport({ scale: viewport.scale + direction, translateY: viewport.translateY });
      return;
    }
    event.preventDefault();
    updateViewport({ scale: viewport.scale, translateY: viewport.translateY - event.deltaY });
  };

  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, draftInk]);
    commitInk(previous);
  };

  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, draftInk]);
    commitInk(next);
  };

  const clear = () => {
    if (!draftInk.strokes.length) return;
    if (!window.confirm('Clear all ink from this page?')) return;
    pushHistory();
    commitInk({ ...draftInk, strokes: [] });
  };

  const colors = [
    { name: 'White', value: '#f8fafc' },
    { name: 'Gray', value: '#94a3b8' },
    { name: 'Black', value: '#111827' },
    { name: 'Indigo', value: '#818cf8' },
    { name: 'Blue', value: '#38bdf8' },
    { name: 'Teal', value: '#2dd4bf' },
    { name: 'Green', value: '#34d399' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Orange', value: '#fb923c' },
    { name: 'Red', value: '#f87171' },
    { name: 'Pink', value: '#f472b6' },
    { name: 'Violet', value: '#a78bfa' },
  ];
  const sizes = [
    { label: 'S', value: 5 },
    { label: 'M', value: 8 },
    { label: 'L', value: 13 },
  ];

  return (
    <div className="flex min-h-[560px] flex-1 flex-col rounded-lg border border-white/[0.08] bg-[#0b0d13] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#111421] px-3 py-2">
        <div className="flex rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          <button type="button" onClick={() => setTool('pen')} className={`p-2 rounded ${tool === 'pen' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Pen">
            <Brush className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Stroke eraser">
            <Eraser className="h-4 w-4" />
          </button>
        </div>

        <div className="flex max-w-[360px] flex-wrap items-center gap-1">
          {colors.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                color === c.value ? 'border-white ring-2 ring-indigo-400/70' : 'border-white/20'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
              aria-label={`${c.name} ink`}
            />
          ))}
        </div>

        <div className="flex rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          {sizes.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => setSize(option.value)}
              className={`h-8 min-w-8 rounded px-2 text-xs font-semibold ${size === option.value ? 'bg-white text-[#111421]' : 'text-gray-400 hover:text-white'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          <button type="button" onClick={undo} disabled={!undoStack.length} className="p-2 rounded text-gray-400 hover:text-white disabled:opacity-30" title="Undo">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={redo} disabled={!redoStack.length} className="p-2 rounded text-gray-400 hover:text-white disabled:opacity-30" title="Redo">
            <RotateCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={clear} disabled={!draftInk.strokes.length} className="p-2 rounded text-gray-400 hover:text-red-300 disabled:opacity-30" title="Clear ink">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {(pencilSeen || pencilOnly) && (
            <button
              type="button"
              onClick={() => setPencilOnly(v => !v)}
              className={`rounded-full px-3 py-1.5 text-xs ${pencilOnly ? 'bg-indigo-500/20 text-indigo-200' : 'bg-white/[0.06] text-gray-400'}`}
            >
              Pencil only
            </button>
          )}
          {payloadWarning && <span className="text-xs text-amber-300">Large ink page</span>}
          <button type="button" onClick={() => updateViewport({ scale: viewport.scale - 0.1, translateY: viewport.translateY })} className="p-2 rounded text-gray-400 hover:text-white" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-gray-500">{Math.round(viewport.scale * 100)}%</span>
          <button type="button" onClick={() => updateViewport({ scale: viewport.scale + 0.1, translateY: viewport.translateY })} className="p-2 rounded text-gray-400 hover:text-white" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-[#090b10]"
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="absolute left-1/2 top-0 w-full max-w-[1100px] -translate-x-1/2 py-4">
          <div
            ref={stageRef}
            className="relative mx-auto bg-[#151821] shadow-2xl shadow-black/40"
            style={{
              aspectRatio: `${draftInk.logicalWidth} / ${draftInk.contentHeight}`,
              transform: `translate3d(0, ${viewport.translateY}px, 0) scale(${viewport.scale})`,
              transformOrigin: 'top center',
            }}
          >
            <svg
              viewBox={`0 0 ${draftInk.logicalWidth} ${draftInk.contentHeight}`}
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Notebook ink page"
            >
              {paths.map(stroke => (
                <path key={stroke.id} d={stroke.path} fill={stroke.color} />
              ))}
            </svg>
            <canvas
              ref={canvasRef}
              width={draftInk.logicalWidth}
              height={draftInk.contentHeight}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
